const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-route-'));
process.env.PRECIONAUTA_DB = path.join(dir, 'test.db');
process.env.PRECIONAUTA_MODERATION_FILE = path.join(dir, 'moderation.json');
const router = require('../backend/api/admin-routes');
const fetcher = require('../backend/api/deal-fetcher');
const automation = require('../backend/admin/automation');
const handler = router.stack.find(layer => layer.route?.path === '/automation/run').route.stack[0].handle;

test('run refreshes first and reports failure when source did not refresh', async () => {
  const old = { refresh: fetcher.refresh, cache: fetcher.cache, evaluate: automation.evaluate, summary: automation.getSummary };
  try {
    let called = 0;
    fetcher.cache = { source: 'mercadolibre', lastUpdated: new Date(), deals: [] };
    fetcher.refresh = async () => [];
    automation.evaluate = () => { called++; };
    automation.getSummary = () => ({});
    let status = 200; let body;
    const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
    await handler({}, res, error => { throw error; });
    assert.equal(status, 503);
    assert.equal(body.success, false);
    assert.equal(called, 0);
    fetcher.refresh = async () => { fetcher.cache.lastUpdated = new Date(); fetcher.cache.validatedDeals = [{ id: 'fresh' }]; };
    automation.evaluate = (deals, options) => { called++; assert.equal(deals[0].id, 'fresh'); assert.equal(options.source, 'mercadolibre'); };
    await handler({}, res, error => { throw error; });
    assert.equal(body.success, true);
    assert.equal(called, 1);
  } finally { fetcher.refresh = old.refresh; fetcher.cache = old.cache; automation.evaluate = old.evaluate; automation.getSummary = old.summary; }
});
