const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precionauta-auto-'));
process.env.PRECIONAUTA_DB = path.join(dir, 'test.db');
process.env.PRECIONAUTA_MODERATION_FILE = path.join(dir, 'moderation.json');
const automation = require('../backend/admin/automation');
const moderation = require('../backend/admin/moderation');
const deal = (id, extra = {}) => ({ id, title: id, source: 'mercadolibre', validatedAt: new Date().toISOString(), currentPrice: 80, originalPrice: 100, discount: 20, seller: { officialStore: true }, offersCount: 2, ...extra });
test('observation proposes without changing visibility, automatic applies and undo preserves manual decisions', () => {
  const d = deal('one', { stock: 0 });
  automation.evaluate([d], { source: 'mercadolibre', at: new Date() });
  assert.equal(moderation.decisions.one, undefined);
  assert.equal(automation.getSummary().summary.proposedWithdraw, 1);
  automation.setMode('automatic');
  automation.evaluate([d], { source: 'mercadolibre', at: new Date() });
  assert.equal(moderation.decisions.one.status, 'rejected');
  const event = automation.getSummary().events.find(e => e.dealId === 'one' && e.applied);
  automation.undo(event.id);
  assert.equal(moderation.decisions.one.actor, 'manual');
  automation.evaluate([d], { source: 'mercadolibre', at: new Date() });
  assert.notEqual(moderation.decisions.one.status, 'rejected');
});
test('stale and demo data never cause automatic withdrawal', () => {
  for (const d of [deal('stale', { stock: 0, validatedAt: '2000-01-01' }), deal('demo', { stock: 0, source: 'demo' }), deal('missing', { stock: 0, validatedAt: null })]) automation.evaluate([d], { source: 'mercadolibre', at: new Date() });
  assert.equal(moderation.decisions.stale, undefined);
  assert.equal(moderation.decisions.demo, undefined);
  assert.equal(moderation.decisions.missing, undefined);
});
test('repeated input is deduplicated, review hides and manual changes prevent undo', () => {
  const d = deal('risky', { discount: 85, originalPrice: 1000, currentPrice: 150 });
  automation.evaluate([d], { source: 'mercadolibre', at: new Date() });
  assert.equal(moderation.decisions.risky.status, 'review');
  assert.deepEqual(moderation.applyPublic([d]), []);
  const event = automation.getSummary().events.find(e => e.dealId === d.id && e.applied);
  const count = automation.getSummary().events.filter(e => e.dealId === d.id).length;
  automation.evaluate([d], { source: 'mercadolibre', at: new Date() });
  assert.equal(automation.getSummary().events.filter(e => e.dealId === d.id).length, count);
  moderation.setStatus(d, 'featured');
  assert.throws(() => automation.undo(event.id), /cambió/);
  automation.evaluate([d], { source: 'mercadolibre', at: new Date() });
  assert.equal(moderation.decisions.risky.status, 'featured');
});
test('missing discount and cached source do not alter deals', () => {
  const missing = deal('no-discount', { stock: 0, discount: undefined });
  const cached = deal('cached', { stock: 0 });
  automation.evaluate([missing], { source: 'mercadolibre', at: new Date() });
  automation.evaluate([cached], { source: 'disk', at: new Date() });
  assert.equal(moderation.decisions[missing.id], undefined);
  assert.equal(moderation.decisions[cached.id], undefined);
});
test('only numeric zero stock withdraws; an old expiresAt does not mean expired', () => {
  const textual = deal('text-stock', { stock: '0' });
  const old = deal('old-expiry', { expiresAt: '2000-01-01' });
  automation.evaluate([textual, old], { source: 'mercadolibre', at: new Date() });
  assert.notEqual(moderation.decisions[textual.id]?.status, 'rejected');
  assert.notEqual(moderation.decisions[old.id]?.status, 'rejected');
});
test('mode and events survive module reload', () => {
  const before = automation.getSummary();
  delete require.cache[require.resolve('../backend/admin/automation')];
  const reloaded = require('../backend/admin/automation');
  assert.equal(reloaded.mode(), 'automatic');
  assert.deepEqual(reloaded.getSummary().events, before.events);
});
test('inconsistent or impossible price data is held', () => {
  for (const d of [deal('inconsistent', { currentPrice: 100, originalPrice: 100, discount: 20 }), deal('bad-math', { discount: 50 }), deal('negative', { discount: -1 }), deal('over', { discount: 101 })]) {
    automation.evaluate([d], { source: 'mercadolibre', at: new Date() });
    assert.equal(moderation.decisions[d.id], undefined);
    assert.equal(automation.getSummary().events.find(e => e.dealId === d.id).action, 'hold');
  }
});
test('summary distinguishes proposals and actions and marks reverted events', () => {
  const summary = automation.getSummary();
  const undone = summary.events.find(e => e.dealId === 'one' && e.action === 'withdraw' && e.applied);
  assert.equal(undone.undone, true);
  assert.equal(typeof summary.pendingCount, 'number');
  assert.equal(typeof summary.eventsTruncated, 'boolean');
  assert.equal(summary.summary.proposedWithdraw, 1);
  assert.equal(summary.summary.withdrawn, 1);
});
test('failed audit rolls back the decision and survives moderation reload', () => {
  const db = require('../backend/db/database');
  db.exec("CREATE TRIGGER fail_audit BEFORE UPDATE OF after_state ON automation_events BEGIN SELECT RAISE(ABORT, 'audit failed'); END");
  const d = deal('rollback');
  assert.throws(() => automation.evaluate([d], { source: 'mercadolibre', at: new Date() }), /audit failed/);
  db.exec('DROP TRIGGER fail_audit');
  assert.equal(moderation.decisions[d.id], undefined);
  const reloaded = new moderation.Moderation();
  assert.equal(reloaded.decisions[d.id], undefined);
});
test('failed undo audit leaves the automatic decision and event intact', () => {
  const db = require('../backend/db/database');
  const d = deal('undo-rollback', { stock: 0 });
  automation.evaluate([d], { source: 'mercadolibre', at: new Date() });
  const event = automation.getSummary().events.find(e => e.dealId === d.id && e.applied);
  db.exec("CREATE TRIGGER fail_undo BEFORE UPDATE OF undone ON automation_events BEGIN SELECT RAISE(ABORT, 'undo failed'); END");
  assert.throws(() => automation.undo(event.id), /undo failed/);
  db.exec('DROP TRIGGER fail_undo');
  assert.equal(moderation.decisions[d.id].actor, 'automatic');
  assert.equal(new moderation.Moderation().decisions[d.id].eventId, event.id);
  assert.equal(automation.getSummary().events.find(e => e.id === event.id).undone, false);
});
test('legacy JSON decisions migrate once and SQLite remains authoritative', () => {
  const { spawnSync } = require('node:child_process');
  const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'moderation-migrate-'));
  const file = path.join(isolated, 'moderation.json');
  fs.writeFileSync(file, JSON.stringify({ decisions: { old: { status: 'featured', at: '2025-01-01' } } }));
  const script = `const fs = require('fs'); const m = require('./backend/admin/moderation'); if(m.decisions.old.status !== 'featured') process.exit(2); fs.writeFileSync(process.env.PRECIONAUTA_MODERATION_FILE, JSON.stringify({decisions:{old:{status:'rejected'}}})); if(new m.Moderation().decisions.old.status !== 'featured') process.exit(3); fs.writeFileSync(process.env.PRECIONAUTA_MODERATION_FILE, '{'); if(new m.Moderation().decisions.old.status !== 'featured') process.exit(4);`;
  const result = spawnSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), env: { ...process.env, PRECIONAUTA_DB: path.join(isolated, 'db.sqlite'), PRECIONAUTA_MODERATION_FILE: file }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
test('formatted unconfirmed original prices hold, while explicit no discount or zero stock can withdraw', () => {
  const fetcher = require('../backend/api/deal-fetcher');
  for (const [index, original] of [undefined, null, 0, 40].entries()) {
    const product = { id: `unconfirmed-${index}`, name: 'Example' };
    const d = fetcher.formatDeal(product, { price: 50, original_price: original }, 2, 'test');
    automation.evaluate([d], { source: 'mercadolibre', at: new Date() });
    assert.equal(moderation.decisions[d.id], undefined);
    assert.equal(automation.getSummary().events.find(e => e.dealId === d.id).action, 'hold');
  }
  const ended = fetcher.formatDeal({ id: 'confirmed-ended', name: 'Ended' }, { price: 50, original_price: 50 }, 2, 'test');
  automation.evaluate([ended], { source: 'mercadolibre', at: new Date() });
  assert.equal(moderation.decisions[ended.id].status, 'rejected');
  const out = fetcher.formatDeal({ id: 'confirmed-out', name: 'Out' }, { price: 50, available_quantity: 0 }, 1, 'test');
  automation.evaluate([out], { source: 'mercadolibre', at: new Date() });
  assert.equal(moderation.decisions[out.id].status, 'rejected');
});
