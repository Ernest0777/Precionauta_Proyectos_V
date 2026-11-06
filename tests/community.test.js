const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

test('community votes and account activity authorize access and persist isolated signals', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precionauta-community-'));
  process.env.PRECIONAUTA_DB = path.join(dir, 'test.db');
  process.env.FRONTEND_URL = 'http://localhost:4173';
  process.env.NODE_ENV = 'test';
  const configFile = require.resolve('../backend/config/config');
  require.cache[configFile] = { id: configFile, filename: configFile, loaded: true, exports: { server: {} } };
  const deals = Array.from({ length: 10 }, (_, i) => ({ id: `deal-${i}`, title: `Audífonos ${i}`, category: 'tecnologia', currentPrice: 80, originalPrice: 100, source: 'demo' }));
  const hidden = new Set();
  for (const [file, exports] of [
    ['../backend/api/deal-fetcher', { fetchAllDeals: async () => deals, findDealById: (catalog, id) => catalog.find(deal => deal.id === id) }],
    ['../backend/admin/moderation', { applyPublic: catalog => catalog.filter(deal => !hidden.has(deal.id)) }],
  ]) {
    const filename = require.resolve(file);
    require.cache[filename] = { id: filename, filename, loaded: true, exports };
  }
  const db = require('../backend/db/database');
  const community = require('../backend/db/community');
  const account = require('../backend/account');
  const express = require('express');
  const app = express();
  app.use(express.json(), account.attachSession);
  app.use('/api', require('../backend/api/community-routes'));
  app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('precionauta-community-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const tokens = {};
  for (const id of ['one', 'two', 'plus', 'limit']) {
    db.prepare('INSERT INTO account_users (id,email,name,password_hash,password_salt,plan_id,created_at) VALUES (?,?,?,?,?,?,?)').run(id, `${id}@example.test`, id, 'unused', 'unused', id === 'plus' ? 'plus' : 'free', Date.now());
    const token = crypto.randomBytes(32).toString('hex');
    tokens[id] = token;
    db.prepare('INSERT INTO account_sessions VALUES (?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'), id, Date.now() + 3600000);
  }
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (route, { method = 'GET', user, body, origin = 'http://localhost:4173', expectedOwner = user || 'visitor' } = {}) => {
    const response = await fetch(base + route, { method, headers: {
      'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}),
      ...(expectedOwner === null ? {} : { 'X-Account-Id': expectedOwner }),
      ...(user ? { Cookie: `precionauta_session=${tokens[user]}` } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }).catch(error => { throw error.cause || error; });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const votes = id => `/community/deals/${id}/votes`;

  await t.test('votes are unique, reversible, private and authenticated for both account tiers', async () => {
    assert.equal((await request(votes('deal-0'), { method: 'POST', body: { value: 1 } })).status, 401);
    assert.equal((await request(votes('deal-0'), { method: 'POST', user: 'one', origin: 'https://evil.invalid', body: { value: 1 } })).status, 403);
    assert.equal((await request(votes('deal-0'), { method: 'POST', user: 'one', origin: null, body: { value: 1 } })).status, 403);
    for (const value of [null, '1', 2, {}, true]) assert.equal((await request(votes('deal-0'), { method: 'POST', user: 'one', body: { value } })).status, 400);
    for (let i = 0; i < 3; i++) {
      const saved = await request(votes('deal-0'), { method: 'POST', user: 'one', body: { value: 1, userId: 'two' } });
      assert.deepEqual(saved.body.data, { up: 1, down: 0, total: 1, mine: 1 });
    }
    assert.deepEqual((await request(votes('deal-0'), { user: 'two' })).body.data, { up: 1, down: 0, total: 1, mine: null });
    assert.deepEqual((await request(votes('deal-0'), { method: 'POST', user: 'plus', body: { value: -1 } })).body.data, { up: 1, down: 1, total: 2, mine: -1 });
    assert.deepEqual((await request(votes('deal-0'), { method: 'POST', user: 'one', body: { value: -1 } })).body.data, { up: 0, down: 2, total: 2, mine: -1 });
    const anonymous = await request(votes('deal-0'));
    assert.equal(anonymous.body.data.mine, null);
    assert.equal(anonymous.headers.get('cache-control'), 'private, no-store');
    assert.doesNotMatch(JSON.stringify(anonymous.body), /user_id|userId|email|example/);
    assert.deepEqual((await request(votes('deal-0'), { method: 'POST', user: 'one', body: { value: 0 } })).body.data, { up: 0, down: 1, total: 1, mine: null });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM community_vote_changes WHERE user_id = ?').get('one').n, 3, 'identical retries do not spend change quota');
  });

  await t.test('catalog preview, moderation and delayed offers cannot be bypassed by ID', async () => {
    assert.equal((await request(votes('missing'))).status, 404);
    assert.equal((await request(votes('deal-7'))).status, 404);
    assert.equal((await request(votes('deal-7'), { user: 'one' })).status, 200);
    hidden.add('deal-5');
    assert.equal((await request(votes('deal-5'), { user: 'plus' })).status, 404);
    hidden.delete('deal-5');
    deals[9].source = 'mercadolibre';
    const history = require('../backend/db/price-history');
    history.record([deals[0]], Date.now() - 86400000);
    history.record([deals[9]], Date.now());
    assert.equal((await request(votes('deal-9'), { user: 'one' })).status, 403);
    assert.equal((await request(votes('deal-9'), { method: 'POST', user: 'one', body: { value: 1 } })).status, 403);
    assert.equal((await request(votes('deal-9'), { user: 'plus' })).status, 200);
  });

  await t.test('shared-cookie account changes reject stale-tab reads and mutations without exposing or modifying another account', async () => {
    community.recordActivity('two', { type: 'search', query: 'private two' });
    const originalActivity = community.activity('two');
    const originalVotes = community.voteSummary('deal-2', 'two');
    for (const expectedOwner of ['one', 'visitor', null]) {
      for (const method of ['GET', 'POST', 'DELETE']) {
        const result = await request('/community/activity', { method, user: 'two', expectedOwner, ...(method === 'POST' ? { body: { type: 'search', query: 'stale one' } } : {}) });
        assert.equal(result.status, 409);
        assert.doesNotMatch(JSON.stringify(result.body), /private two|example.test|"two"|user_id|userId/);
      }
      const vote = await request(votes('deal-2'), { method: 'POST', user: 'two', expectedOwner, body: { value: 1 } });
      assert.equal(vote.status, 409);
      if (expectedOwner !== null) assert.equal((await request(votes('deal-2'), { user: 'two', expectedOwner })).status, 409);
    }
    assert.deepEqual(community.activity('two'), originalActivity);
    assert.deepEqual(community.voteSummary('deal-2', 'two'), originalVotes);
    assert.equal((await request(votes('deal-2'), { expectedOwner: 'one' })).status, 409);
    assert.equal((await request(votes('deal-2'), { expectedOwner: null })).status, 200, 'public vote previews allow clients without an expected owner');
    community.clearActivity('two');
  });

  await t.test('vote limits persist across module reload and expire on the rolling window', () => {
    const now = Date.now();
    for (let i = 0; i < 30; i++) community.setVote('limit', 'deal-1', i % 2 ? -1 : 1, now + i);
    delete require.cache[require.resolve('../backend/db/community')];
    const reloaded = require('../backend/db/community');
    assert.throws(() => reloaded.setVote('limit', 'deal-2', 1, now + 31), error => error.status === 429 && error.retryAfter > 0);
    assert.equal(reloaded.setVote('limit', 'deal-1', -1, now + 32).mine, -1);
    assert.equal(reloaded.setVote('two', 'deal-1', 1, now + 32).mine, 1);
    assert.equal(reloaded.setVote('limit', 'deal-2', 1, now + 900001).mine, 1);
  });

  await t.test('activity is private, validated and uses server product metadata', async () => {
    const activity = '/community/activity';
    for (const method of ['GET', 'POST', 'DELETE']) assert.equal((await request(activity, { method, body: method === 'POST' ? { type: 'search', query: 'audifonos' } : undefined })).status, 401);
    for (const method of ['POST', 'DELETE']) assert.equal((await request(activity, { method, user: 'one', origin: 'https://evil.invalid', body: method === 'POST' ? { type: 'search', query: 'audifonos' } : undefined })).status, 403);
    for (const body of [{ type: 'unknown' }, { type: 'search', query: 'ab' }, { type: 'search', query: 'a'.repeat(61) }, { type: 'category', slug: 'bad' }, { type: 'onboarding', slug: '__proto__' }, { type: 'store', store: 'Inventada' }]) assert.equal((await request(activity, { method: 'POST', user: 'one', body })).status, 400);
    assert.equal((await request(activity, { method: 'POST', user: 'one', body: { type: 'view', id: 'missing' } })).status, 404);
    assert.equal((await request(activity, { method: 'POST', user: 'one', body: { type: 'view', id: 'deal-9' } })).status, 403);
    const body = { type: 'view', id: 'deal-0', name: 'FAKE', slug: 'moda', store: 'FAKE', currentPrice: 1, userId: 'two' };
    const first = await request(activity, { method: 'POST', user: 'one', body });
    assert.deepEqual(first.body.data.event, { type: 'view', id: 'deal-0', name: 'Audífonos 0', slug: 'tecnologia', store: 'Mercado Libre', t: first.body.data.event.t });
    assert.equal((await request(activity, { method: 'POST', user: 'one', body })).body.data.duplicate, true);
    for (const body of [{ type: 'search', query: ' audifonos   sony ' }, { type: 'category', slug: 'hogar' }, { type: 'onboarding', slug: 'tecnologia' }, { type: 'store', store: 'Mercado Libre' }, { type: 'save', id: 'deal-0' }, { type: 'alert', id: 'deal-0' }]) assert.equal((await request(activity, { method: 'POST', user: 'one', body })).status, 200);
    const stored = (await request(activity, { user: 'one' })).body.data;
    assert.equal(stored.length, 7);
    assert.equal(stored[1].query, 'audifonos sony');
    assert.deepEqual((await request(activity, { user: 'two' })).body.data, []);
    assert.equal((await request(activity, { method: 'DELETE', user: 'two' })).status, 200);
    assert.equal((await request(activity, { user: 'one' })).body.data.length, 7);
    assert.equal((await request(activity, { method: 'DELETE', user: 'one' })).status, 200);
    assert.deepEqual((await request(activity, { user: 'one' })).body.data, []);
  });

  await t.test('activity keeps the latest 300 per account, dedupes across intervening signals and persists', () => {
    const now = Date.now();
    community.recordActivity('one', { type: 'search', query: 'audifonos' }, now);
    community.recordActivity('one', { type: 'category', slug: 'hogar' }, now + 1);
    assert.equal(community.recordActivity('one', { type: 'search', query: 'audifonos' }, now + 2).duplicate, true);
    assert.equal(community.recordActivity('two', { type: 'search', query: 'audifonos' }, now + 2).duplicate, false);
    for (let i = 0; i < 305; i++) community.recordActivity('one', { type: 'search', query: `consulta ${i}` }, now + 10 + i);
    assert.equal(community.activity('one').length, 300);
    assert.equal(community.activity('one')[0].query, 'consulta 5');
    assert.equal(community.activity('two').length, 1);
    delete require.cache[require.resolve('../backend/db/community')];
    assert.equal(require('../backend/db/community').activity('one').length, 300);
  });
});

test('recommender ignores legacy globals and discards late reads and writes after account changes', async t => {
  const original = { document: global.document, localStorage: global.localStorage, fetch: global.fetch };
  global.document = new EventTarget();
  global.localStorage = { getItem: () => JSON.stringify([{ type: 'search', query: 'legacy', t: Date.now() }]) };
  let state = { user: null, available: true };
  let refreshes = 0;
  const adapter = { accountState: () => state, refreshAccount: async () => { refreshes++; }, accountReady: Promise.resolve(), API_BASE: 'http://test/api', ACCOUNT_CHANGED_EVENT: 'account-changed' };
  global.__communityTestAccount = adapter;
  const calls = [];
  let read = [];
  let write = null;
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const method = options.method || 'GET';
    const data = await (method === 'GET' ? (typeof read === 'function' ? read() : read) : method === 'DELETE' ? [] : write ? write(JSON.parse(options.body)) : { event: { ...JSON.parse(options.body), t: Date.now() }, duplicate: false });
    return { ok: true, json: async () => ({ success: true, data }) };
  };
  t.after(() => {
    Object.assign(global, original);
    delete global.__communityTestAccount;
  });
  const source = fs.readFileSync(path.resolve('frontend/js/utils/recommender.js'), 'utf8')
    .replace(/import \{ CATEGORIES \} from .*?;/, 'const CATEGORIES = [{slug:"tecnologia", label:"Tecnología"},{slug:"hogar",label:"Hogar"}];')
    .replace(/import \{ accountReady, accountState, refreshAccount, API_BASE, ACCOUNT_CHANGED_EVENT \} from .*?;/, 'const { accountReady, accountState, refreshAccount, API_BASE, ACCOUNT_CHANGED_EVENT } = globalThis.__communityTestAccount;');
  const recommender = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  await recommender.activityReady;
  assert.equal(recommender.buildProfile().isEmpty, true);
  await recommender.track('search', { query: 'audifonos' });
  assert.equal(calls.length, 0, 'visitors never submit personal activity');
  const accountChanged = (id) => {
    state = { user: id ? { id } : null, available: true };
    document.dispatchEvent(new Event('account-changed'));
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  let finishOld;
  read = () => new Promise(resolve => { finishOld = resolve; });
  accountChanged('one');
  assert.equal(recommender.buildProfile().isEmpty, true, 'popular fallback during loading');
  read = [{ type: 'search', query: 'cafetera', t: Date.now() }];
  accountChanged('two');
  await settle();
  assert.deepEqual(recommender.getRecentSearches(), ['cafetera']);
  finishOld([{ type: 'search', query: 'private one', t: Date.now() }]);
  await settle();
  assert.deepEqual(recommender.getRecentSearches(), ['cafetera'], 'late first-account response never enters the second account');
  let finishWrite;
  write = signal => new Promise(resolve => { finishWrite = () => resolve({ event: { ...signal, t: Date.now() }, duplicate: false }); });
  const pending = recommender.track('search', { query: 'private two' });
  await settle();
  accountChanged(null);
  finishWrite();
  await pending;
  assert.equal(recommender.buildProfile().isEmpty, true, 'logout empties the profile and ignores old writes');
  read = [];
  write = null;
  accountChanged('three');
  await settle();
  await recommender.track('search', { query: 'audifonos' });
  const products = [
    { id: 'headphones', categorySlug: 'tecnologia', store: 'Mercado Libre', name: 'Audífonos Sony', currentPrice: 90, previousPrice: 100 },
    { id: 'coffee', categorySlug: 'hogar', store: 'Mercado Libre', name: 'Cafetera', currentPrice: 80, previousPrice: 100 },
  ];
  const suggestions = recommender.recommend(products);
  assert.equal(suggestions[0].product.id, 'headphones');
  assert.match(suggestions[0].reason, /audifonos/);
  await recommender.track('view', { product: { id: 'headphones', name: 'FORGED', currentPrice: 1 } });
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { type: 'view', id: 'headphones' });
  assert.equal(calls.at(-1).options.credentials, 'include');
  assert.equal(calls.at(-1).options.headers['X-Account-Id'], 'three');
  assert.equal(await recommender.clearActivity(), true);
  assert.equal(calls.at(-1).options.headers['X-Account-Id'], 'three');
  assert.equal(recommender.buildProfile().isEmpty, true);
  for (const status of [401, 409]) {
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: false, status, json: async () => ({ success: false, error: 'La sesión cambió.' }) };
    };
    const before = calls.length;
    assert.equal(await recommender.track('search', { query: 'stale three' }), null);
    assert.equal(calls.length, before + 1, 'stale actions are discarded without retry');
    assert.equal(calls.at(-1).options.headers['X-Account-Id'], 'three');
    assert.equal(recommender.buildProfile().isEmpty, true);
  }
  assert.equal(refreshes, 2, 'authentication mismatch refreshes the actual cookie session');
});
