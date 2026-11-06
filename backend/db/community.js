const db = require('./database');

db.exec(`
  CREATE TABLE IF NOT EXISTS community_votes (
    user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
    deal_id TEXT NOT NULL,
    value INTEGER NOT NULL CHECK (value IN (-1, 1)),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, deal_id)
  );
  CREATE INDEX IF NOT EXISTS community_votes_deal ON community_votes(deal_id);
  CREATE TABLE IF NOT EXISTS community_vote_changes (
    user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS community_changes_user ON community_vote_changes(user_id, at);
  CREATE TABLE IF NOT EXISTS account_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
    fingerprint TEXT NOT NULL,
    payload TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS account_activity_owner ON account_activity(user_id, id);
`);

const WINDOW_MS = 15 * 60 * 1000;

function communityError(status, message, retryAfter) {
  return Object.assign(new Error(message), { status, retryAfter });
}

function voteSummary(dealId, userId) {
  const counts = db.prepare(`SELECT COALESCE(SUM(value = 1), 0) AS up,
    COALESCE(SUM(value = -1), 0) AS down, COUNT(*) AS total FROM community_votes WHERE deal_id = ?`).get(dealId);
  const mine = userId ? db.prepare('SELECT value FROM community_votes WHERE user_id = ? AND deal_id = ?').get(userId, dealId)?.value ?? null : null;
  return { ...counts, mine };
}

function setVote(userId, dealId, value, now = Date.now()) {
  if (![1, -1, 0].includes(value)) throw communityError(400, 'El voto debe ser 1, -1 o 0');
  return db.transaction(() => {
    const current = db.prepare('SELECT value FROM community_votes WHERE user_id = ? AND deal_id = ?').get(userId, dealId)?.value ?? 0;
    if (current === value) return voteSummary(dealId, userId);
    db.prepare('DELETE FROM community_vote_changes WHERE at <= ?').run(now - WINDOW_MS);
    const recent = db.prepare('SELECT COUNT(*) AS count, MIN(at) AS oldest FROM community_vote_changes WHERE user_id = ?').get(userId);
    if (recent.count >= 30) throw communityError(429, 'Puedes cambiar tus votos hasta 30 veces cada 15 minutos.', Math.max(1, Math.ceil((recent.oldest + WINDOW_MS - now) / 1000)));
    if (value === 0) db.prepare('DELETE FROM community_votes WHERE user_id = ? AND deal_id = ?').run(userId, dealId);
    else db.prepare(`INSERT INTO community_votes (user_id, deal_id, value, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, deal_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(userId, dealId, value, now);
    db.prepare('INSERT INTO community_vote_changes (user_id, at) VALUES (?, ?)').run(userId, now);
    return voteSummary(dealId, userId);
  });
}

function activity(userId) {
  return db.prepare('SELECT payload FROM account_activity WHERE user_id = ? ORDER BY id').all(userId).map(row => JSON.parse(row.payload));
}

// Los eventos ya llegan validados por el catálogo; el cliente no elige metadatos.
function recordActivity(userId, signal, now = Date.now()) {
  return db.transaction(() => {
    const fingerprint = JSON.stringify([signal.type, signal.id ?? null, signal.query ?? null, signal.slug ?? null, signal.store ?? null]);
    const previous = db.prepare('SELECT payload FROM account_activity WHERE user_id = ? AND fingerprint = ? AND at > ? ORDER BY id DESC LIMIT 1').get(userId, fingerprint, now - 60000);
    if (previous) return { event: JSON.parse(previous.payload), duplicate: true };
    const event = { ...signal, t: now };
    db.prepare('INSERT INTO account_activity (user_id, fingerprint, payload, at) VALUES (?, ?, ?, ?)').run(userId, fingerprint, JSON.stringify(event), now);
    db.prepare(`DELETE FROM account_activity WHERE user_id = ? AND id NOT IN
      (SELECT id FROM account_activity WHERE user_id = ? ORDER BY id DESC LIMIT 300)`).run(userId, userId);
    return { event, duplicate: false };
  });
}

function clearActivity(userId) {
  db.prepare('DELETE FROM account_activity WHERE user_id = ?').run(userId);
}

module.exports = { communityError, voteSummary, setVote, activity, recordActivity, clearActivity };
