const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('alert targets belong to the account and filter only new price drops', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precionauta-target-'));
  process.env.PRECIONAUTA_DB = path.join(dir, 'test.db');
  process.env.NODE_ENV = 'test';
  const configFile = require.resolve('../backend/config/config');
  require.cache[configFile] = { id: configFile, filename: configFile, loaded: true, exports: { server: {}, telegram: {}, affiliate: {} } };
  const express = require('express');
  const db = require('../backend/db/database');
  const account = require('../backend/account');
  const { shouldNotifyPriceDrop } = require('../backend/db/telegram');
  const app = express();
  app.use(express.json(), account.attachSession);
  app.use('/api/account', account.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api/account`;
  let cookie = '';
  async function request(route, method = 'GET', body) {
    const response = await fetch(base + route, { method, headers: { Origin: 'http://localhost:4173', 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, ...(await response.json()) };
  }
  await request('/register', 'POST', { name: 'Ana', email: 'ana@example.test', password: 'correct horse battery' });
  const ana = cookie;
  await request('/library', 'PATCH', { alertAdd: ['one'] });
  for (const value of [0, -1, '10', NaN, 100000001, 1.001]) {
    // JSON cannot encode NaN; the server must reject an absent price as well.
    const result = await request('/alerts/one', 'PATCH', Number.isNaN(value) ? {} : { targetPrice: value });
    assert.equal(result.status, 400);
  }
  assert.equal((await request('/alerts/missing', 'PATCH', { targetPrice: 20 })).status, 404);
  assert.equal((await request('/alerts/one', 'PATCH', { targetPrice: 99.99 })).data.alertTargets.one, 99.99);
  cookie = '';
  await request('/register', 'POST', { name: 'Bea', email: 'bea@example.test', password: 'correct horse battery' });
  assert.equal((await request('/alerts/one', 'PATCH', { targetPrice: 1 })).status, 404);
  await request('/library', 'PATCH', { alertAdd: ['one'] });
  assert.deepEqual((await request('/session')).data.alertTargets, {});
  cookie = ana;
  assert.equal((await request('/session')).data.alertTargets.one, 99.99);
  await request('/plan', 'POST', { id: 'plus', period: 'mensual' });
  await request('/library', 'PATCH', { alertAdd: ['two', 'three', 'four'] });
  await request('/alerts/four', 'PATCH', { targetPrice: 50 });
  const downgraded = await request('/plan', 'POST', { id: 'free' });
  assert.deepEqual(downgraded.data.pausedAlertIds, ['four']);
  assert.equal((await request('/alerts/four', 'PATCH', { targetPrice: 45 })).data.alertTargets.four, 45);
  await request('/library', 'PATCH', { alertRemove: ['one'] });
  assert.equal((await request('/session')).data.alertTargets.one, undefined);
  await request('/library', 'PUT', { savedIds: [], alertIds: ['two', 'three'] });
  assert.deepEqual((await request('/session')).data.alertTargets, {});
  assert.equal(shouldNotifyPriceDrop(100, 91, 90), false);
  assert.equal(shouldNotifyPriceDrop(100, 90, 90), true);
  assert.equal(shouldNotifyPriceDrop(100, 89, 90), true);
  assert.equal(shouldNotifyPriceDrop(90, 90, 90), false);
  assert.equal(shouldNotifyPriceDrop(null, 90, null), false);
  assert.equal(shouldNotifyPriceDrop(100, 90, null), true);
  assert.equal(shouldNotifyPriceDrop(90, 100, null), false);
});
