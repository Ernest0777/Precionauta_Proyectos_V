const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('restock observations, combined quotas, ownership and delivery remain persistent', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precionauta-restock-'));
  process.env.PRECIONAUTA_DB = path.join(dir, 'test.db');
  process.env.NODE_ENV = 'test';
  const configFile = require.resolve('../backend/config/config');
  require.cache[configFile] = { id: configFile, filename: configFile, loaded: true, exports: {
    mercadoLibre: { apiBase: 'https://example.invalid' }, discountRange: { min: 20, max: 99 },
    server: {}, telegram: { token: 'fixture' }, affiliate: {}, admin: {},
  } };
  const fetcher = require('../backend/api/deal-fetcher');
  const db = require('../backend/db/database');
  const account = require('../backend/account');
  let restock = require('../backend/db/restock');
  const tracked = require('../backend/db/tracked-products');
  const history = require('../backend/db/price-history');
  const now = Date.now();
  let clock = now + 10000;
  const product = (id, stock = 0) => ({ id, title: `Product ${id}`, source: 'mercadolibre', category: 'tecnologia',
    currentPrice: 100, originalPrice: 200, discount: 50, stock, availability: stock === 0 ? 'unavailable' : 'available', validatedAt: now,
    permalink: 'https://example.invalid/item' });
  const a = product('MLM1001');
  const b = product('MLM1002');
  const c = product('MLM1003');
  const d = product('MLM1004');
  let catalog = [a, b, c, d];
  fetcher.fetchAllDeals = async () => catalog;
  history.record(catalog, now - 3 * 3600000);
  tracked.remember(catalog, { source: 'mercadolibre', at: now });
  function user(id, plan = 'free', alerts = []) {
    db.prepare('INSERT INTO account_users (id,email,name,password_hash,password_salt,plan_id,alert_ids,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, `${id}@example.test`, id, 'hash', 'salt', plan, JSON.stringify(alerts), now);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO account_sessions VALUES (?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'), id, now + 10000000);
    return `precionauta_session=${token}`;
  }
  const aliceCookie = user('alice', 'free', ['price1', 'price2']);
  const bobCookie = user('bob', 'plus');
  const express = require('express');
  const app = express();
  app.use(express.json(), account.attachSession);
  app.use('/api/account', require('../backend/api/restock-routes'), account.router);
  app.use('/api', require('../backend/api/routes'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, { method = 'GET', body, owner = 'alice', cookie = aliceCookie, origin = 'http://localhost:4173' } = {}) {
    const response = await fetch(base + route, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json',
      ...(owner == null ? {} : { 'X-Account-Id': owner }) }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(error => { throw error.cause || error; });
    return { status: response.status, ...(await response.json()) };
  }
  const observe = deals => { ++clock; return restock.observe(deals.map(deal => ({ ...deal, validatedAt: clock })), { source: 'mercadolibre', at: clock }); };

  await t.test('profile restock reads use existing snapshots without fetching the provider catalog', async () => {
    const fetchAllDeals = fetcher.fetchAllDeals;
    const cache = fetcher.cache;
    fetcher.fetchAllDeals = async () => { throw new Error('Profile reads must not fetch the catalog'); };
    fetcher.cache = { ...cache, deals: [], source: 'disk' };
    try {
      assert.deepEqual((await request('/api/account/restock')).data.subscriptions, []);
      restock.setSubscription('bob', b, true);
      tracked.grant('bob', b);
      let feed = await request('/api/account/restock', { owner: 'bob', cookie: bobCookie });
      assert.equal(feed.data.subscriptions[0].deal.title, b.title, 'owned persisted snapshots remain available');
      fetcher.cache.deals = [{ ...b, title: 'Cached catalog title' }];
      feed = await request('/api/account/restock', { owner: 'bob', cookie: bobCookie });
      assert.equal(feed.data.subscriptions[0].deal.title, 'Cached catalog title', 'disk snapshots can enrich subscriptions');
      assert.deepEqual((await request('/api/account/restock')).data.subscriptions, [], 'another account never inherits the subscription');
    } finally {
      restock.setSubscription('bob', b, false);
      fetcher.fetchAllDeals = fetchAllDeals;
      fetcher.cache = cache;
    }
  });

  await t.test('writes require origin and expected account; limits combine both alert types', async () => {
    assert.equal((await request('/api/account/restock')).status, 200);
    assert.equal((await request('/api/account/restock', { owner: null })).status, 409);
    assert.equal((await request('/api/account/restock', { owner: 'bob' })).status, 409);
    assert.equal((await request('/api/account/restock', { cookie: '' })).status, 401);
    assert.equal((await request(`/api/account/restock/${a.id}`, { method: 'PUT', body: { enabled: true }, origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await request(`/api/account/restock/${a.id}`, { method: 'PUT', body: { enabled: true } })).status, 200);
    assert.equal((await request(`/api/account/restock/${b.id}`, { method: 'PUT', body: { enabled: true } })).status, 403);
    assert.equal((await request('/api/account/library', { method: 'PATCH', body: { alertAdd: ['price3'] } })).status, 403);
    assert.equal((await request('/api/account/library', { method: 'PUT', body: { savedIds: [], alertIds: ['price1', 'price2', 'price3'] } })).status, 403);
    assert.equal((await request('/api/account/library', { method: 'PATCH', body: { alertRemove: ['price2'] }, owner: 'bob' })).status, 409);
    assert.equal((await request('/api/account/library', { method: 'PATCH', body: { savedAdd: ['MLM999999999'] } })).status, 404);
    assert.equal((await request('/api/account/library', { method: 'PUT', body: { savedIds: [], alertIds: [a.id, b.id], merge: true } })).status, 403);
    assert.equal((await request('/api/account/library', { method: 'PATCH', body: { alertAdd: ['MLM999999999'] }, owner: 'bob', cookie: bobCookie })).status, 404);
  });

  await t.test('only confirmed unavailable to available emits, including unknown gaps and restart', () => {
    assert.deepEqual(observe([{ ...a, availability: 'unknown', stock: undefined }]), []);
    const first = observe([{ ...a, stock: 4, availability: 'available', currentPrice: 123 }]);
    assert.equal(first.length, 1);
    assert.equal(first[0].price, 123);
    assert.equal(first[0].user_id, undefined);
    assert.deepEqual(observe([{ ...a, stock: 5, availability: 'available' }]), []);
    delete require.cache[require.resolve('../backend/db/restock')];
    restock = require('../backend/db/restock');
    assert.deepEqual(observe([{ ...a, stock: 5, availability: 'available' }]), []);
    assert.deepEqual(observe([a]), []);
    assert.deepEqual(observe([{ ...a, availability: 'unknown', currentPrice: 1 }]), []);
    const second = observe([{ ...a, stock: 1, availability: 'available', currentPrice: null }]);
    assert.equal(second.length, 1);
    assert.equal(second[0].price, null, 'unknown intervals never reuse an earlier price');
    assert.deepEqual(restock.observe([a, { ...a, stock: 1, availability: 'available' }], { source: 'demo', at: ++clock }), []);
  });

  await t.test('initial available state is silent and each later cycle emits once', () => {
    restock.setSubscription('bob', { ...b, stock: 1, availability: 'available' }, true);
    assert.deepEqual(observe([{ ...b, stock: 1, availability: 'available' }]), []);
    observe([b]);
    assert.equal(observe([{ ...b, stock: 1, availability: 'available' }]).length, 1);
    const old = clock;
    assert.deepEqual(restock.observe([b], { source: 'mercadolibre', at: old - 50 }), []);
    assert.deepEqual(observe([{ ...b, stock: 2, availability: 'available' }]), []);
  });

  await t.test('disk, missing and stale provider checks cannot create or alter a transition', () => {
    const isolated = product('MLM8999');
    restock.setSubscription('bob', { ...isolated, validatedAt: now - 600000 }, true);
    assert.deepEqual(observe([{ ...isolated, stock: 1, availability: 'available' }]), [], 'an old unavailable snapshot never arms a new subscription');
    observe([isolated]);
    assert.deepEqual(restock.observe([{ ...isolated, availability: 'available', stock: 1, validatedAt: ++clock }], { source: 'disk', at: clock }), []);
    assert.deepEqual(restock.observe([{ ...isolated, availability: 'available', stock: 1, validatedAt: undefined }], { source: 'mercadolibre', at: ++clock }), []);
    assert.deepEqual(restock.observe([{ ...isolated, availability: 'available', stock: 1, validatedAt: clock - 600001 }], { source: 'mercadolibre', at: clock }), []);
    assert.deepEqual(restock.observe([{ ...isolated, source: 'demo', availability: 'available', stock: 1, validatedAt: clock }], { source: 'mercadolibre', at: clock }), []);
    const at = ++clock;
    assert.equal(restock.observe([{ ...isolated, availability: 'available', stock: 1, validatedAt: new Date(at).toISOString() }], { source: 'mercadolibre', at: new Date(at) }).length, 1);
    restock.setSubscription('bob', isolated, false);
  });

  await t.test('downgrades preserve every subscription and pause excess against first price alerts', async () => {
    restock.setSubscription('bob', c, true);
    restock.setSubscription('bob', d, true);
    db.prepare("UPDATE account_users SET alert_ids = '[\"p1\",\"p2\"]', plan_id = 'free' WHERE id = 'bob'").run();
    assert.deepEqual(restock.subscriptions('bob').map(s => s.paused), [false, true, true]);
    const session = account.sessionData(db.prepare("SELECT * FROM account_users WHERE id = 'bob'").get());
    assert.deepEqual(session.restockIds, [b.id, c.id, d.id]);
    assert.deepEqual(session.pausedRestockIds, [c.id, d.id]);
    assert.ok(!restock.trackedIds().includes(c.id));
    assert.deepEqual(observe([{ ...c, stock: 1, availability: 'available' }]), []);
    restock.setSubscription('bob', b, false);
    assert.deepEqual(restock.subscriptions('bob').map(s => s.paused), [false, true]);
    db.prepare("UPDATE account_users SET plan_id = 'plus' WHERE id = 'bob'").run();
    assert.ok(restock.subscriptions('bob').every(s => !s.paused));
  });

  await t.test('read events, tracked fallback and hidden products remain account scoped', async () => {
    const feed = await request('/api/account/restock');
    assert.equal(feed.data.events.length, 2);
    const eventId = feed.data.events[0].id;
    assert.equal((await request(`/api/account/restock/events/${eventId}/read`, { method: 'POST', owner: 'bob', cookie: bobCookie })).status, 404);
    assert.equal((await request(`/api/account/restock/events/${eventId}/read`, { method: 'POST' })).data.unreadCount, 1);
    assert.equal((await request(`/api/account/restock/events/${eventId}/read`, { method: 'POST' })).data.unreadCount, 1);
    catalog = [];
    assert.equal((await request(`/api/product/${a.id}`)).status, 200);
    assert.equal((await request(`/api/deals/${a.id}/history`)).status, 200);
    assert.equal((await request(`/api/product/${b.id}`)).status, 404);
    assert.equal((await request(`/api/account/restock/${b.id}`, { method: 'PUT', body: { enabled: true } })).status, 404);
    assert.equal((await request('/api/account/tracked')).data[0].id, a.id);
    assert.equal((await request('/api/account/tracked', { owner: 'bob' })).status, 409);
    const moderation = require('../backend/admin/moderation');
    for (const decision of [{ status: 'rejected', actor: 'manual' }, { status: 'review' }]) {
      moderation.decisions[a.id] = decision;
      assert.equal((await request(`/api/product/${a.id}`)).status, 404);
      assert.equal((await request(`/api/deals/${a.id}/history`)).status, 404);
      assert.equal((await request('/api/account/tracked')).data.length, 0);
      assert.equal((await request('/api/account/library', { method: 'PATCH', body: { savedAdd: [a.id] } })).status, 404);
    }
    delete moderation.decisions[a.id];
    catalog = [{ ...b, id: 'MLM9000', source: 'demo' }];
    assert.equal((await request('/api/account/restock/MLM9000', { method: 'PUT', body: { enabled: true } })).status, 400);
    const locked = { ...b, id: 'MLM9001' };
    history.record([locked], now);
    catalog = [locked];
    assert.equal((await request(`/api/account/restock/${locked.id}`, { method: 'PUT', body: { enabled: true } })).status, 403);
    assert.equal((await request(`/api/account/restock/${a.id}`, { method: 'DELETE' })).status, 200);
  });

  await t.test('viewed detail authorizes a later subscription after leaving the catalog without granting other users access', async () => {
    const seen = product('MLM5000');
    catalog = [seen];
    history.record([seen], now - 3 * 3600000);
    tracked.remember([seen], { source: 'mercadolibre', at: now });
    assert.equal((await request(`/api/product/${seen.id}`, { owner: 'bob', cookie: bobCookie })).status, 200);
    assert.equal(tracked.hasAccess('bob', seen.id), true);
    assert.equal(tracked.owned('bob').some(deal => deal.id === seen.id), false);
    catalog = [];
    assert.equal((await request(`/api/product/${seen.id}`, { owner: 'bob', cookie: bobCookie })).status, 404, 'read fallback still requires an active saved or followed item');
    assert.equal((await request(`/api/account/restock/${seen.id}`, { method: 'PUT', body: { enabled: true } })).status, 404);
    assert.equal((await request(`/api/account/restock/${seen.id}`, { method: 'PUT', body: { enabled: true }, owner: 'bob', cookie: bobCookie })).status, 200);
    assert.equal((await request(`/api/account/restock/${seen.id}`, { method: 'DELETE', owner: 'bob', cookie: bobCookie })).status, 200);
    assert.equal((await request('/api/account/library', { method: 'PATCH', body: { savedAdd: [seen.id] }, owner: 'bob', cookie: bobCookie })).status, 200);
    assert.equal((await request('/api/account/library', { method: 'PATCH', body: { savedRemove: [seen.id] }, owner: 'bob', cookie: bobCookie })).status, 200);
  });

  await t.test('Telegram sends only linked opted-in Plus events once and rechecks a downgrade', async () => {
    const telegram = require('../backend/db/telegram');
    db.prepare("INSERT INTO telegram_links (code,chat_id,user_id) VALUES ('fixture-code','123','bob')").run();
    const originalFetch = global.fetch;
    const sent = [];
    let failNext = false;
    global.fetch = async (url, options) => {
      if (url.endsWith('/getUpdates')) return new Promise(() => {});
      if (url.endsWith('/sendMessage')) {
        sent.push(JSON.parse(options.body));
        if (failNext) {
          failNext = false;
          return { json: async () => ({ ok: false, description: 'Simulated Telegram failure' }) };
        }
      }
      return { json: async () => ({ ok: true, result: { username: 'fixture_bot' } }) };
    };
    try {
      await telegram.start();
      observe([c]);
      const events = observe([{ ...c, stock: 1, availability: 'available', currentPrice: 321 }]);
      await telegram.onRestockEvents(events);
      await telegram.onRestockEvents(events);
      assert.equal(sent.length, 1);
      assert.match(sent[0].text, /321/);
      observe([c]);
      const retryEvents = observe([{ ...c, stock: 1, availability: 'available' }]);
      failNext = true;
      await telegram.onRestockEvents(retryEvents);
      assert.equal(sent.length, 2);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM restock_telegram_sent').get().n, 1, 'failed delivery is not acknowledged');
      await Promise.all([telegram.onRestockEvents([]), telegram.onRestockEvents(retryEvents)]);
      assert.equal(sent.length, 3, 'the empty retry hook sends once after recovery');
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM restock_telegram_sent').get().n, 2);
      observe([c]);
      const later = observe([{ ...c, stock: 1, availability: 'available' }]);
      const pending = telegram.onRestockEvents(later);
      db.prepare("UPDATE account_users SET plan_id = 'free' WHERE id = 'bob'").run();
      await pending;
      assert.equal(sent.length, 3);
    } finally { global.fetch = originalFetch; }
  });

  await t.test('one hundred permanently failing Telegram deliveries cannot starve a newer event', async () => {
    user('queue-user', 'plus');
    restock.setSubscription('queue-user', d, true);
    db.prepare("INSERT INTO telegram_links (code,chat_id,user_id) VALUES ('queue-code','queue-chat','queue-user')").run();
    for (let i = 0; i < 101; i++) {
      db.prepare('INSERT INTO restock_events (id,user_id,deal_id,title,price,at) VALUES (?,?,?,?,?,?)')
        .run(`queue-${i}`, 'queue-user', d.id, i === 100 ? 'New deliverable event' : `Permanent failure ${i}`, 100, now + i);
    }
    const telegram = require('../backend/db/telegram');
    const originalFetch = global.fetch;
    const originalWarn = console.warn;
    let delivered = 0;
    global.fetch = async (url, options) => {
      assert.ok(url.endsWith('/sendMessage'));
      const body = JSON.parse(options.body);
      const ok = body.text.includes('New deliverable event');
      if (ok) delivered++;
      return { json: async () => ({ ok, description: 'Simulated permanent failure', result: {} }) };
    };
    console.warn = () => {};
    try {
      await telegram.onRestockEvents([]);
      assert.equal(delivered, 0, 'the first bounded batch contains the older failures');
      await telegram.onRestockEvents([]);
      assert.equal(delivered, 1, 'persisted attempt rotation gives the new event its next turn');
      assert.ok(db.prepare("SELECT 1 FROM restock_telegram_sent WHERE event_id='queue-100'").get());
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM restock_telegram_sent WHERE event_id LIKE 'queue-%'").get().n, 1);
    } finally { global.fetch = originalFetch; console.warn = originalWarn; }
  });
});
