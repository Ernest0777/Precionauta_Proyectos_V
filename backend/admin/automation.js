const db = require('../db/database');
const moderation = require('./moderation');
const crypto = require('node:crypto');

const FRESH_MS = 5 * 60 * 1000;
db.exec(`CREATE TABLE IF NOT EXISTS automation_runs (id INTEGER PRIMARY KEY, at TEXT NOT NULL, evaluated INTEGER NOT NULL, manual_preserved INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS automation_events (id INTEGER PRIMARY KEY, at TEXT NOT NULL, deal_id TEXT NOT NULL, title TEXT, action TEXT NOT NULL, applied INTEGER NOT NULL, reasons TEXT NOT NULL, before_state TEXT, after_state TEXT, snapshot TEXT NOT NULL, fingerprint TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS automation_events_time ON automation_events(at);
CREATE TABLE IF NOT EXISTS automation_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);

function mode() { return db.prepare("SELECT value FROM automation_settings WHERE key='mode'").get()?.value || 'observation'; }
function setMode(value) {
  if (!['observation', 'automatic'].includes(value)) throw new Error('Modo inválido');
  db.prepare("INSERT INTO automation_settings(key,value) VALUES('mode',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(value);
  return value;
}
function evaluate(deals, { source, at = new Date() } = {}) {
  const stamp = new Date(at);
  if (!Number.isFinite(stamp.getTime())) throw new Error('Fecha inválida');
  const iso = stamp.toISOString();
  let manualPreserved = 0;
  for (const deal of deals) {
    if (!deal?.id) continue;
    const existing = moderation.decisions[deal.id];
    if (existing && existing.actor !== 'automatic') { manualPreserved++; continue; }
    const validated = new Date(deal.validatedAt).getTime();
    const fresh = source === 'mercadolibre' && deal.source === 'mercadolibre' && deal.validatedAt && Number.isFinite(validated) && validated <= stamp.getTime() && stamp.getTime() - validated <= FRESH_MS;
    const risk = moderation.risk(deal);
    let action; let reasons;
    const validPrices = Number.isFinite(deal.currentPrice) && Number.isFinite(deal.originalPrice) && Number.isFinite(deal.discount) && deal.currentPrice > 0 && deal.originalPrice > 0 && deal.discount >= 0 && deal.discount <= 100;
    const calculatedDiscount = validPrices ? Math.max(0, (deal.originalPrice - deal.currentPrice) / deal.originalPrice * 100) : NaN;
    const consistent = validPrices && Math.abs(calculatedDiscount - deal.discount) <= 0.2;
    if (!fresh || !validPrices || !consistent) {
      action = 'hold'; reasons = [!fresh ? 'No hay validación reciente de Mercado Libre' : 'Los precios o el descuento son incompletos o inconsistentes'];
    } else if (deal.stock === 0) {
      action = 'withdraw'; reasons = ['Mercado Libre confirmó inventario agotado'];
    } else if (deal.originalPriceConfirmed === false || (deal.discount === 0 && deal.originalPriceConfirmed !== true)) {
      action = 'hold'; reasons = ['Mercado Libre no confirmó el precio anterior'];
    } else if (deal.discount === 0 && deal.originalPrice <= deal.currentPrice) {
      action = 'withdraw'; reasons = ['Mercado Libre confirmó que el descuento desapareció'];
    } else if (risk.score >= 30 || deal.discount >= 80 || risk.reasons.length >= 2) {
      action = 'review'; reasons = risk.reasons.length ? risk.reasons : ['Riesgo elevado'];
    } else { action = 'publish'; reasons = ['Validación reciente y riesgo bajo']; }
    const target = { publish: 'published', review: 'review', withdraw: 'rejected' }[action];
    const before = existing ? { ...existing } : null;
    const apply = mode() === 'automatic' && target && (existing?.status !== target || !existing);
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ action, reasons, mode: mode(), price: deal.currentPrice, originalPrice: deal.originalPrice, stock: deal.stock })).digest('hex');
    const last = db.prepare('SELECT fingerprint FROM automation_events WHERE deal_id=? ORDER BY id DESC LIMIT 1').get(String(deal.id));
    if (last?.fingerprint === fingerprint && !apply) continue;
    const previousLog = moderation.log.slice();
    try {
      db.transaction(() => {
        const result = db.prepare('INSERT INTO automation_events(at,deal_id,title,action,applied,reasons,before_state,after_state,snapshot,fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?)').run(iso, String(deal.id), deal.title || '', action, apply ? 1 : 0, JSON.stringify(reasons), JSON.stringify(before), null, JSON.stringify(deal), fingerprint);
        if (apply) {
          moderation.setStatus(deal, target, 'automatic', { eventId: Number(result.lastInsertRowid), deferSave: true });
          db.prepare('UPDATE automation_events SET after_state=? WHERE id=?').run(JSON.stringify(moderation.decisions[deal.id]), result.lastInsertRowid);
        }
      });
    } catch (error) { moderation.reloadDecisions(); moderation.log = previousLog; throw error; }
    if (apply) moderation.save();
  }
  db.prepare('INSERT INTO automation_runs(at,evaluated,manual_preserved) VALUES(?,?,?)').run(iso, deals.length, manualPreserved);
  return getSummary();
}
function undo(id) {
  const row = db.prepare('SELECT * FROM automation_events WHERE id=?').get(Number(id));
  if (!row || !row.applied || row.undone) throw new Error('Acción no disponible para revertir');
  const current = moderation.decisions[row.deal_id];
  if (!current || current.actor !== 'automatic' || current.eventId !== row.id) throw new Error('La decisión cambió después de esta acción');
  const before = JSON.parse(row.before_state);
  const target = before?.status || 'published';
  const deal = JSON.parse(row.snapshot);
  const previousLog = moderation.log.slice();
  try {
    db.transaction(() => {
      moderation.setStatus(deal, target, 'manual', { deferSave: true });
      db.prepare('UPDATE automation_events SET undone=1 WHERE id=?').run(row.id);
      const now = new Date().toISOString();
      db.prepare('INSERT INTO automation_events(at,deal_id,title,action,applied,reasons,before_state,after_state,snapshot,fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?)').run(now,row.deal_id,row.title,'undo',1,JSON.stringify(['Reversión manual']),JSON.stringify(current),JSON.stringify(moderation.decisions[row.deal_id]),row.snapshot,`undo:${row.id}`);
    });
  } catch (error) { moderation.reloadDecisions(); moderation.log = previousLog; throw error; }
  moderation.save();
  return { id: row.id, status: target };
}
function getSummary(since) {
  let start = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (!Number.isFinite(start.getTime())) throw new Error('Fecha inválida');
  const iso = start.toISOString();
  const rows = db.prepare('SELECT * FROM automation_events WHERE at>=? ORDER BY id DESC LIMIT 200').all(iso);
  const totals = db.prepare('SELECT action, applied, COUNT(*) AS count FROM automation_events WHERE at>=? GROUP BY action, applied').all(iso);
  const runs = db.prepare('SELECT COALESCE(SUM(evaluated),0) evaluated, COALESCE(SUM(manual_preserved),0) manualPreserved, MAX(at) lastRunAt FROM automation_runs WHERE at>=?').get(iso);
  const summary = { evaluated: runs.evaluated, proposedPublish: 0, proposedReview: 0, proposedWithdraw: 0, published: 0, reviewed: 0, withdrawn: 0, manualPreserved: runs.manualPreserved };
  for (const row of totals) {
    const proposal = { publish: 'proposedPublish', review: 'proposedReview', withdraw: 'proposedWithdraw' }[row.action];
    const applied = { publish: 'published', review: 'reviewed', withdraw: 'withdrawn' }[row.action];
    // Propuestas no aplicadas y acciones aplicadas son categorías separadas.
    if (proposal && !row.applied) summary[proposal] += row.count;
    if (applied && row.applied) summary[applied] += row.count;
  }
  const events = rows.map(r => ({ id:r.id, at:r.at, dealId:r.deal_id, title:r.title, action:r.action, applied: Boolean(r.applied), undone: Boolean(r.undone), reasons:JSON.parse(r.reasons), before:JSON.parse(r.before_state), after:JSON.parse(r.after_state) }));
  const latest = db.prepare(`SELECT e.* FROM automation_events e
    JOIN (SELECT deal_id, MAX(id) id FROM automation_events GROUP BY deal_id) latest ON latest.id=e.id
    WHERE e.action IN ('review','hold') ORDER BY e.id DESC`).all();
  const outstanding = latest.filter(e => !moderation.decisions[e.deal_id] || moderation.decisions[e.deal_id].actor === 'automatic');
  const pending = outstanding.slice(0, 200).map(e => ({ id:e.deal_id, title:e.title, reasons:JSON.parse(e.reasons), risk:moderation.risk(JSON.parse(e.snapshot)) }));
  const eventCount = db.prepare('SELECT COUNT(*) AS count FROM automation_events WHERE at>=?').get(iso).count;
  return { mode:mode(), lastRunAt: db.prepare('SELECT MAX(at) at FROM automation_runs').get().at, summary, events, eventsTruncated: eventCount > events.length, pending, pendingCount: outstanding.length };
}
module.exports = { evaluate, getSummary, setMode, undo, mode };
