const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

test('persistent deal reports validate requests, limit abuse and require admin resolution', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precionauta-reports-'));
  process.env.PRECIONAUTA_DB = path.join(dir, 'test.db');
  process.env.PRECIONAUTA_MODERATION_FILE = path.join(dir, 'moderation.json');
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_URL = 'http://localhost:4173';
  const configFile = require.resolve('../backend/config/config');
  require.cache[configFile] = { id: configFile, filename: configFile, loaded: true, exports: {
    admin: { password: 'test-admin-password', secret: 'test-secret' }, server: {},
  } };
  const deals = Array.from({ length: 8 }, (_, i) => ({ id: `deal-${i}`, title: `Producto ${i}`, currentPrice: 80, originalPrice: 100, source: 'demo' }));
  let catalog = deals;
  const fetcherFile = require.resolve('../backend/api/deal-fetcher');
  require.cache[fetcherFile] = { id: fetcherFile, filename: fetcherFile, loaded: true, exports: {
    fetchAllDeals: async () => catalog,
    findDealById: (catalog, id) => catalog.find(deal => deal.id === id),
  } };
  const db = require('../backend/db/database');
  const reports = require('../backend/db/deal-reports');
  const moderation = require('../backend/admin/moderation');
  const account = require('../backend/account');
  const auth = require('../backend/admin/auth');
  const { publicRouter, adminRouter } = require('../backend/api/report-routes');
  const express = require('express');
  const app = express();
  app.use(express.json(), account.attachSession);
  app.post('/api/admin/login', auth.login);
  app.use('/api/admin', adminRouter);
  app.use('/api', publicRouter);
  app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('precionauta-reports-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  for (const id of ['store-user', 'api-user', 'another-user']) {
    db.prepare('INSERT INTO account_users (id, email, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, `${id}@example.com`, id, 'unused', 'unused', Date.now());
  }
  const token = 'a'.repeat(64);
  db.prepare('INSERT INTO account_sessions VALUES (?, ?, ?)').run(crypto.createHash('sha256').update(token).digest('hex'), 'api-user', Date.now() + 3600000);
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, { method = 'GET', body, user = false, admin, origin = 'http://localhost:4173' } = {}) => {
    const response = await fetch(base + route, { method, headers: {
      'Content-Type': 'application/json', Origin: origin,
      ...(user ? { Cookie: `precionauta_session=${user === true ? token : user}` } : {}),
      ...(admin ? { Authorization: `Bearer ${admin}` } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }).catch(error => { throw error.cause || error; });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };

  await t.test('store persists idempotent pending reports and applies a rolling limit per user', () => {
    const now = Date.now();
    const first = reports.createReport('store-user', deals[0], { reason: 'expired', note: ' Agotado ' }, now);
    assert.equal(first.duplicate, false);
    assert.equal(first.report.note, 'Agotado');
    const duplicate = reports.createReport('store-user', deals[0], { reason: 'expired', note: 'otra nota' }, now + 1);
    assert.equal(duplicate.report.id, first.report.id);
    assert.equal(duplicate.report.note, 'Agotado');
    assert.equal(duplicate.duplicate, true);
    const secondReason = reports.createReport('store-user', deals[0], { reason: 'incorrect_price' }, now + 2);
    assert.notEqual(secondReason.report.id, first.report.id);
    for (let i = 1; i < 4; i++) reports.createReport('store-user', deals[i], { reason: 'expired' }, now + i + 2);
    assert.throws(() => reports.createReport('store-user', deals[4], { reason: 'expired' }, now + 10), error => error.status === 429 && error.retryAfter > 0);
    assert.equal(reports.createReport('store-user', deals[0], { reason: 'expired' }, now + 11).duplicate, true, 'retrying a pending report does not consume the limit');
    assert.equal(reports.createReport('another-user', deals[0], { reason: 'expired' }, now).duplicate, false);
    assert.equal(reports.createReport('store-user', deals[4], { reason: 'expired' }, now + 3600000).duplicate, false);
    delete require.cache[require.resolve('../backend/db/deal-reports')];
    const reloaded = require('../backend/db/deal-reports');
    assert.equal(reloaded.pendingReports().find(report => report.id === first.report.id).note, 'Agotado');
    assert.equal(reloaded.pendingCount(), 7);
    for (const note of [123, null, 'x'.repeat(301)]) assert.throws(() => reports.validateReport({ reason: 'expired', note }), error => error.status === 400);
    for (const body of [undefined, [], { reason: 'other' }, { reason: { value: 'expired' } }]) assert.throws(() => reports.validateReport(body), error => error.status === 400);
    assert.equal(moderation.applyPublic(deals).length, deals.length, 'reports cannot withdraw offers');
    assert.deepEqual(moderation.decisions, {});
  });

  await t.test('public endpoint verifies origin, session, known visible product and fields without leaking identity', async () => {
    const url = '/api/deals/deal-0/reports';
    assert.equal((await request(url, { method: 'POST', body: { reason: 'expired' } })).status, 401);
    assert.equal((await request(url, { method: 'POST', user: true, origin: 'https://evil.invalid', body: { reason: 'expired' } })).status, 403);
    for (const body of [{ reason: 'spam' }, { reason: 'expired', note: 123 }, { reason: 'expired', note: 'x'.repeat(301) }]) assert.equal((await request(url, { method: 'POST', user: true, body })).status, 400);
    assert.equal((await request('/api/deals/unknown/reports', { method: 'POST', user: true, body: { reason: 'expired' } })).status, 404);
    moderation.decisions['deal-7'] = { status: 'rejected', actor: 'manual' };
    assert.equal((await request('/api/deals/deal-7/reports', { method: 'POST', user: true, body: { reason: 'expired' } })).status, 404);
    delete moderation.decisions['deal-7'];
    deals[6].source = 'mercadolibre';
    const history = require('../backend/db/price-history');
    history.record([deals[0]], Date.now() - 86400000);
    history.record([deals[6]], Date.now());
    assert.equal((await request('/api/deals/deal-6/reports', { method: 'POST', user: true, body: { reason: 'expired' } })).status, 403);
    const created = await request(url, { method: 'POST', user: true, body: { reason: 'expired', note: 'No disponible' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.report.dealId, 'deal-0');
    assert.equal(created.body.data.pendingCount, 8);
    assert.equal(created.headers.get('cache-control'), 'private, no-store');
    assert.doesNotMatch(JSON.stringify(created.body), /@example|user_id|userId|email/);
    const duplicate = await request(url, { method: 'POST', user: true, body: { reason: 'expired' } });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.data.report.id, created.body.data.report.id);
    for (let i = 1; i < 5; i++) assert.equal((await request(`/api/deals/deal-${i}/reports`, { method: 'POST', user: true, body: { reason: 'expired' } })).status, 201);
    const limited = await request('/api/deals/deal-5/reports', { method: 'POST', user: true, body: { reason: 'expired' } });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
  });

  await t.test('admin queue and resolution require admin and preserve offer visibility', async () => {
    assert.equal((await request('/api/admin/user-reports')).status, 401);
    assert.equal((await request('/api/admin/user-reports', { user: true })).status, 401);
    const login = await request('/api/admin/login', { method: 'POST', body: { password: 'test-admin-password' } });
    const admin = login.body.token;
    assert.ok(admin);
    const queue = await request('/api/admin/user-reports', { admin });
    assert.equal(queue.status, 200);
    assert.equal(queue.body.data.count, queue.body.data.pending.length);
    const report = queue.body.data.pending[0];
    assert.equal((await request(`/api/admin/user-reports/${report.id}`, { method: 'PATCH', user: true, body: { status: 'resolved' } })).status, 401);
    assert.equal((await request(`/api/admin/user-reports/${report.id}`, { method: 'PATCH', admin, body: { status: 'pending' } })).status, 400);
    assert.equal((await request('/api/admin/user-reports/missing', { method: 'PATCH', admin, body: { status: 'resolved' } })).status, 404);
    const resolved = await request(`/api/admin/user-reports/${report.id}`, { method: 'PATCH', admin, body: { status: 'resolved' } });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.data.count, queue.body.data.count - 1);
    assert.equal(resolved.body.data.report.status, 'resolved');
    assert.ok(resolved.body.data.report.resolvedAt);
    assert.equal((await request(`/api/admin/user-reports/${report.id}`, { method: 'PATCH', admin, body: { status: 'resolved' } })).status, 200);
    assert.equal((await request(`/api/admin/user-reports/${report.id}`, { method: 'PATCH', admin, body: { status: 'dismissed' } })).status, 409);
    const other = reports.pendingReports()[0];
    assert.equal((await request(`/api/admin/user-reports/${other.id}`, { method: 'PATCH', admin, body: { status: 'dismissed' } })).body.data.report.status, 'dismissed');
    assert.equal(moderation.applyPublic(deals).length, deals.length);
    assert.deepEqual(moderation.decisions, {});
  });

  await t.test('a viewed offer can be reported after disappearing, only by the account that saw it', async () => {
    const oldDeal = deals[7];
    const viewedAt = Date.now();
    reports.recordKnownDeal(null, oldDeal);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM account_known_deals').get().count, 0);
    reports.recordKnownDeal('another-user', oldDeal, viewedAt);
    assert.deepEqual({ ...reports.knownDeal('another-user', oldDeal.id) }, { id: oldDeal.id, title: oldDeal.title, seenAt: viewedAt });
    assert.equal(reports.knownDeal('api-user', oldDeal.id), null);
    catalog = deals.filter(deal => deal.id !== oldDeal.id);
    const url = `/api/deals/${oldDeal.id}/reports`;
    assert.equal((await request(url, { method: 'POST', user: true, body: { reason: 'expired', title: 'client title' } })).status, 404);
    const otherToken = 'b'.repeat(64);
    db.prepare('INSERT INTO account_sessions VALUES (?, ?, ?)').run(crypto.createHash('sha256').update(otherToken).digest('hex'), 'another-user', Date.now() + 3600000);
    const created = await request(url, { method: 'POST', user: otherToken, body: { reason: 'expired', title: 'client title' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.report.title, oldDeal.title);
    assert.equal(reports.knownDeal('another-user', oldDeal.id, viewedAt + 31 * 86400000), null);
    delete require.cache[require.resolve('../backend/db/deal-reports')];
    assert.equal(require('../backend/db/deal-reports').knownDeal('another-user', oldDeal.id).title, oldDeal.title);
    assert.deepEqual(moderation.decisions, {});
  });
});
