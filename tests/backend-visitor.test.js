const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('visitor preview stays within six unique unlocked deals across filters, details, stats and redirects', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precionauta-visitor-'));
  process.env.PRECIONAUTA_DB = path.join(dir, 'test.db');
  process.env.PRECIONAUTA_MODERATION_FILE = path.join(dir, 'moderation.json');
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_URL = 'http://localhost:4173';
  process.env.TELEGRAM_BOT_TOKEN = '';
  const configFile = require.resolve('../backend/config/config');
  require.cache[configFile] = { id: configFile, filename: configFile, loaded: true, exports: {
    mercadoLibre: { apiBase: 'https://example.invalid' }, admin: {}, telegram: {}, affiliate: {},
    server: { port: 0, env: 'test' }, discountRange: { min: 20, max: 99 },
  } };
  const meliFile = require.resolve('../backend/api/meli-client');
  require.cache[meliFile] = { id: meliFile, filename: meliFile, loaded: true, exports: new Proxy({}, { get: () => () => { throw new Error('No external provider calls allowed'); } }) };
  const fetcher = require('../backend/api/deal-fetcher');
  const history = require('../backend/db/price-history');
  const db = require('../backend/db/database');
  const old = Array.from({ length: 10 }, (_, i) => ({
    id: `preview-${i}`, title: `Product ${i}`, category: i < 6 ? (i % 2 ? 'hogar' : 'tecnologia') : 'fuera',
    currentPrice: 100 + i, originalPrice: 1000, discount: 30 + i * 5, savings: 900 - i,
    permalink: 'https://www.mercadolibre.com.mx/p/test', thumbnail: 'https://example.invalid/image.jpg',
  }));
  const fresh = { ...old[0], id: 'fresh-private', title: 'Hidden new title', currentPrice: 1, discount: 99 };
  const released = { ...old[9], id: 'two-hours-old' };
  const now = Date.now();
  history.record(old, now - 50 * 86400000);
  history.record(old, now - 86400000);
  history.record([released], now - 7201000);
  history.record([fresh], now - 1000);
  // A duplicate and a locked offer must not consume preview slots.
  const deals = [fresh, old[0], old[0], ...old.slice(1), released];
  fetcher.fetchAllDeals = async () => deals;
  const { selectDealsForAccess } = require('../backend/api/access');
  const { accessOf } = require('../backend/account');
  const expected = old.slice(0, 6).map(d => d.id);
  assert.deepEqual(selectDealsForAccess(deals, accessOf(null)).map(d => d.id), expected);
  assert.equal(selectDealsForAccess(deals, accessOf({ plan_id: 'free' })), deals);
  assert.equal(selectDealsForAccess(deals, accessOf({ plan_id: 'plus' })), deals);
  assert.deepEqual(selectDealsForAccess([fresh, released], accessOf(null)).map(d => d.id), [released.id]);
  const server = require('../backend/server').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => {
    server.close(); db.close();
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('precionauta-visitor-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const request = async (route, method = 'GET', body) => {
    const response = await fetch(base + route, { method, redirect: 'manual', headers: {
      Origin: 'http://localhost:4173', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}),
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: response.headers.get('content-type')?.includes('json') ? await response.json() : null };
  };
  let result = await request('/api/deals');
  assert.deepEqual(result.data.data.map(d => d.id), expected);
  assert.equal(result.data.total, 6);
  assert.equal(result.data.stats.total, 6);
  assert.equal(result.data.registrationRequired, true);
  assert.ok(result.data.data.every(d => !d.locked && d.history === null));
  assert.equal((await request('/api/stats')).data.data.total, 6);
  const reached = new Set();
  for (const category of ['tecnologia', 'hogar', 'fuera']) {
    for (const filter of [0, 40, 60, 99]) {
      result = await request(`/api/deals?category=${category}&filter=${filter}&search=Product%209`);
      const matches = old.slice(0, 6).filter(d => d.category === category && d.discount >= filter);
      assert.deepEqual(result.data.data.map(d => d.id), matches.map(d => d.id));
      assert.equal(result.data.stats.total, matches.length);
      result.data.data.forEach(d => reached.add(d.id));
    }
  }
  assert.deepEqual([...reached].sort(), [...expected].sort());
  for (const id of [...expected, 'preview-6', 'preview-9', fresh.id, 'unknown-id']) {
    const allowed = expected.includes(id);
    const detail = await request(`/api/product/${id}`);
    assert.equal(detail.status, allowed ? 200 : 401);
    assert.equal((await request(`/go/${id}`)).status, allowed ? 302 : 401);
    if (!allowed) {
      assert.deepEqual(Object.keys(detail.data).sort(), ['error', 'registrationRequired', 'success']);
      assert.equal(detail.data.registrationRequired, true);
      assert.match(detail.data.error, /gratis/i);
    }
  }
  for (const season of ['buen-fin-2026', 'hot-sale', 'prime-day']) {
    result = await request(`/api/deals?season=${season}&category=fuera`);
    assert.equal(result.status, 401);
    assert.equal(result.data.registrationRequired, true);
    assert.equal('data' in result.data, false);
  }
  assert.equal((await request('/api/deals/preview-0/history')).status, 401);
  assert.equal((await request('/api/account/library', 'PATCH', { savedAdd: ['preview-0'] })).status, 401);
  result = await request('/api/account/register', 'POST', { name: 'Preview user', email: 'preview@example.com', password: 'a secure preview password' });
  assert.equal(result.status, 201);
  assert.equal(result.data.data.access.catalogLimit, null);
  assert.equal(result.data.data.access.alertLimit, 3);
  assert.equal(result.data.data.access.historyDays, 30);
  result = await request('/api/deals');
  assert.equal(result.data.data.length, deals.length);
  assert.equal(result.data.registrationRequired, false);
  assert.equal(result.data.data.find(d => d.id === fresh.id).locked, true);
  assert.equal((await request('/api/product/preview-9')).status, 200);
  assert.equal((await request(`/api/product/${released.id}`)).status, 200);
  assert.equal((await request(`/api/product/${fresh.id}`)).status, 403);
  assert.equal((await request('/api/deals?season=hot-sale')).data.data.length, 3);
  const newOffers = [fresh, { ...fresh, id: 'fresh-second' }, { ...fresh, id: 'fresh-third' }];
  history.record(newOffers.slice(1), now - 1000);
  fetcher.fetchAllDeals = async () => [...newOffers, ...old];
  result = await request('/api/deals?season=hot-sale');
  assert.deepEqual(result.data.data.map(d => d.id), old.slice(0, 3).map(d => d.id));
  assert.ok(result.data.data.every(d => !d.locked));
  assert.equal(result.data.stats.total, 3);
  result = await request('/api/deals?season=hot-sale&category=tecnologia');
  assert.deepEqual(result.data.data.map(d => d.id), [old[0].id, old[2].id]);
  assert.deepEqual((await request('/api/deals?season=hot-sale&filter=45')).data.data, []);
  assert.deepEqual((await request('/api/deals?season=hot-sale&category=fuera')).data.data, []);
  fetcher.fetchAllDeals = async () => deals;
  await request('/api/account/plan', 'POST', { id: 'plus', period: 'mensual' });
  result = await request('/api/deals');
  assert.equal(result.data.data.length, deals.length);
  assert.equal(result.data.access.historyDays, 365);
  assert.equal(result.data.access.delayMs, 0);
  assert.equal(result.data.access.catalogLimit, null);
  assert.ok(result.data.data.every(d => !d.locked));
  assert.equal((await request(`/api/product/${fresh.id}`)).status, 200);
  assert.equal((await request('/api/deals?season=hot-sale')).data.data.length, deals.length);
});
