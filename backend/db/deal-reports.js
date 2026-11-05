const { randomUUID } = require('node:crypto');
const db = require('./database');

// Los reportes aportan señales para revisión; nunca cambian la oferta por sí solos.
db.exec(`
  CREATE TABLE IF NOT EXISTS deal_reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
    deal_id TEXT NOT NULL,
    title TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('expired', 'incorrect_price')),
    note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 300),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS deal_reports_pending_unique
    ON deal_reports(user_id, deal_id, reason) WHERE status = 'pending';
  CREATE INDEX IF NOT EXISTS deal_reports_user_time ON deal_reports(user_id, created_at);
  CREATE INDEX IF NOT EXISTS deal_reports_status ON deal_reports(status, created_at);
  CREATE TABLE IF NOT EXISTS account_known_deals (
    user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
    deal_id TEXT NOT NULL,
    title TEXT NOT NULL,
    seen_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, deal_id)
  );
`);

const columns = 'id, deal_id AS dealId, title, reason, note, status, created_at AS createdAt, resolved_at AS resolvedAt';
const REASONS = new Set(['expired', 'incorrect_price']);
const FINAL_STATUSES = new Set(['resolved', 'dismissed']);
const WINDOW_MS = 60 * 60 * 1000;

function reportError(status, message, retryAfter) {
  return Object.assign(new Error(message), { status, retryAfter });
}

function validateReport(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !REASONS.has(body.reason)) {
    throw reportError(400, 'Selecciona oferta vencida o precio incorrecto');
  }
  if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 300)) {
    throw reportError(400, 'La nota debe ser texto de hasta 300 caracteres');
  }
  return { reason: body.reason, note: (body.note || '').trim() };
}

// Se registra sólo después de autorizar el detalle, sin aceptar títulos del cliente.
function recordKnownDeal(userId, deal, now = Date.now()) {
  if (!userId) return;
  db.prepare(`INSERT INTO account_known_deals (user_id, deal_id, title, seen_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, deal_id) DO UPDATE SET title = excluded.title, seen_at = excluded.seen_at`).run(userId, deal.id, deal.title, now);
}

function knownDeal(userId, id, now = Date.now()) {
  return db.prepare('SELECT deal_id AS id, title, seen_at AS seenAt FROM account_known_deals WHERE user_id = ? AND deal_id = ? AND seen_at >= ?').get(userId, id, now - 30 * 86400000) || null;
}

function createReport(userId, deal, body, now = Date.now()) {
  const { reason, note } = validateReport(body);
  return db.transaction(() => {
    const existing = db.prepare(`SELECT ${columns} FROM deal_reports WHERE user_id = ? AND deal_id = ? AND reason = ? AND status = 'pending'`).get(userId, deal.id, reason);
    if (existing) return { report: existing, duplicate: true };
    const recent = db.prepare('SELECT COUNT(*) AS count, MIN(created_at) AS oldest FROM deal_reports WHERE user_id = ? AND created_at > ?').get(userId, now - WINDOW_MS);
    if (recent.count >= 5) {
      throw reportError(429, 'Puedes enviar hasta 5 reportes por hora. Inténtalo más tarde.', Math.max(1, Math.ceil((recent.oldest + WINDOW_MS - now) / 1000)));
    }
    const id = randomUUID();
    db.prepare('INSERT INTO deal_reports (id, user_id, deal_id, title, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, userId, deal.id, deal.title, reason, note, now);
    return { report: db.prepare(`SELECT ${columns} FROM deal_reports WHERE id = ?`).get(id), duplicate: false };
  });
}

function pendingReports() {
  return db.prepare(`SELECT ${columns} FROM deal_reports WHERE status = 'pending' ORDER BY created_at DESC, id`).all();
}

function pendingCount() {
  return db.prepare("SELECT COUNT(*) AS count FROM deal_reports WHERE status = 'pending'").get().count;
}

function resolveReport(id, status, now = Date.now()) {
  if (!FINAL_STATUSES.has(status)) throw reportError(400, 'El estado debe ser resolved o dismissed');
  return db.transaction(() => {
    const report = db.prepare(`SELECT ${columns} FROM deal_reports WHERE id = ?`).get(id);
    if (!report) throw reportError(404, 'Reporte no encontrado');
    if (report.status !== 'pending' && report.status !== status) throw reportError(409, 'El reporte ya fue atendido con otro estado');
    if (report.status === 'pending') db.prepare('UPDATE deal_reports SET status = ?, resolved_at = ? WHERE id = ?').run(status, now, id);
    return db.prepare(`SELECT ${columns} FROM deal_reports WHERE id = ?`).get(id);
  });
}

module.exports = { createReport, validateReport, recordKnownDeal, knownDeal, pendingReports, pendingCount, resolveReport };
