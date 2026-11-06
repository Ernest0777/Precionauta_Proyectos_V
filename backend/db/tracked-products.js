const db = require('./database');

db.exec(`CREATE TABLE IF NOT EXISTS tracked_products (
  deal_id TEXT PRIMARY KEY,
  snapshot TEXT,
  last_observed_at INTEGER,
  last_checked_at INTEGER NOT NULL DEFAULT 0,
  check_status TEXT NOT NULL DEFAULT 'unknown'
);
CREATE TABLE IF NOT EXISTS tracking_access (
  user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  deal_id TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,deal_id)
);`);

const select = db.prepare('SELECT * FROM tracked_products WHERE deal_id = ?');
const upsert = db.prepare(`INSERT INTO tracked_products (deal_id,snapshot,last_observed_at,last_checked_at,check_status)
  VALUES (?,?,?,?, 'ok') ON CONFLICT(deal_id) DO UPDATE SET snapshot=excluded.snapshot,
  last_observed_at=excluded.last_observed_at,last_checked_at=excluded.last_checked_at,check_status='ok'
  WHERE excluded.last_observed_at >= tracked_products.last_checked_at`);
const check = db.prepare(`INSERT INTO tracked_products (deal_id,last_checked_at,check_status) VALUES (?,?,?)
  ON CONFLICT(deal_id) DO UPDATE SET last_checked_at=excluded.last_checked_at,check_status=excluded.check_status
  WHERE excluded.last_checked_at >= tracked_products.last_checked_at`);
const access = db.prepare('SELECT 1 FROM tracking_access WHERE user_id = ? AND deal_id = ?');
const grantAccess = db.prepare(`INSERT INTO tracking_access (user_id,deal_id,granted_at) VALUES (?,?,?)
  ON CONFLICT(user_id,deal_id) DO UPDATE SET granted_at=excluded.granted_at`);

function availability(deal) {
  if (['available', 'unavailable', 'unknown'].includes(deal.availability)) return deal.availability;
  if (Number.isInteger(deal.stock) && deal.stock >= 0) return deal.stock > 0 ? 'available' : 'unavailable';
  return 'unknown';
}

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value.trim()) return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : Date.parse(value);
}

// Only fresh provider observations enter this registry; loading a disk/demo cache is not a check.
function remember(deals, { source, at = Date.now() } = {}) {
  at = timestamp(at);
  if (!Number.isFinite(at) || (source && source !== 'mercadolibre')) return;
  db.transaction(() => {
    for (const deal of deals) {
      if (!deal || deal.source !== 'mercadolibre') continue;
      if (typeof deal.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(deal.id)) continue;
      if (!Number.isFinite(deal.currentPrice) || deal.currentPrice <= 0) continue;
      const observedAt = timestamp(deal.validatedAt ?? deal.lastObservedAt);
      if (!Number.isFinite(observedAt) || observedAt > at || at - observedAt > 5 * 60 * 1000) continue;
      if (deal.validatedAt == null && select.get(deal.id)?.last_observed_at !== observedAt) continue;
      const snapshot = { ...deal, source: 'mercadolibre', availability: availability(deal) };
      if (snapshot.availability === 'unknown') delete snapshot.stock;
      // Reusing a snapshot must not make its provider observation newer.
      upsert.run(deal.id, JSON.stringify(snapshot), observedAt, observedAt);
    }
  });
}

function get(id) {
  const row = select.get(id);
  if (!row?.snapshot) return null;
  const snapshot = JSON.parse(row.snapshot);
  snapshot.lastObservedAt = row.last_observed_at;
  snapshot.lastCheckedAt = row.last_checked_at;
  snapshot.checkStatus = row.check_status;
  if (row.check_status !== 'ok') {
    snapshot.availability = 'unknown';
    delete snapshot.stock;
  }
  return snapshot;
}

function validId(id) {
  return typeof id === 'string' && (/^MLM\d+$/.test(id) || (/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id) && Boolean(get(id))));
}

// Callers grant this proof only after authorizing the current public catalog product.
function grant(userId, deal) {
  if (typeof userId !== 'string' || deal?.source !== 'mercadolibre' || typeof deal.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(deal.id)) return false;
  if (!db.prepare('SELECT 1 FROM account_users WHERE id = ?').get(userId)) return false;
  grantAccess.run(userId, deal.id, Date.now());
  return true;
}

function hasAccess(userId, dealId) {
  return typeof userId === 'string' && typeof dealId === 'string' && Boolean(access.get(userId, dealId));
}

function parseIds(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
  } catch { return []; }
}

function restock() {
  return require('./restock');
}

// Legacy lists alone are not authorization; an authorized detail or current accessible catalog is.
function reconcileAccess(deals) {
  const hasKnown = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='account_known_deals'").get();
  const known = hasKnown && db.prepare('SELECT 1 FROM account_known_deals WHERE user_id = ? AND deal_id = ?');
  let catalog;
  if (Array.isArray(deals)) {
    const moderation = require('../admin/moderation');
    const now = Date.now();
    catalog = new Map(moderation.applyPublic(deals).filter(deal => {
      const at = timestamp(deal.validatedAt);
      return deal.source === 'mercadolibre' && moderation.decisions[deal.id]?.status !== 'review'
        && Number.isFinite(at) && at <= now && now - at <= 5 * 60 * 1000;
    }).map(deal => [deal.id, deal]));
  }
  if (!known && !catalog) return 0;
  let granted = 0;
  for (const user of db.prepare('SELECT id,plan_id,saved_ids,alert_ids FROM account_users').all()) {
    const subscriptions = restock().subscriptions(user.id).filter(sub => !sub.paused).map(sub => sub.dealId);
    const candidates = new Set([...parseIds(user.saved_ids), ...parseIds(user.alert_ids), ...subscriptions]);
    for (const id of candidates) {
      if (hasAccess(user.id, id)) continue;
      const deal = catalog?.get(id);
      const publicAccess = deal && !require('../api/access').isLocked(deal, require('../account').accessOf(user));
      if ((known?.get(user.id, id) || publicAccess) && grant(user.id, deal || { id, source: 'mercadolibre' })) granted++;
    }
  }
  return granted;
}

function authorized(userId, id) {
  if (!hasAccess(userId, id)) return null;
  const decision = require('../admin/moderation').decisions[id];
  if (decision?.status === 'review' || (decision?.status === 'rejected' && decision.actor !== 'automatic')) return null;
  return get(id);
}

function owned(userId) {
  const user = db.prepare('SELECT saved_ids,alert_ids FROM account_users WHERE id = ?').get(userId);
  if (!user) return [];
  reconcileAccess();
  const ids = new Set([...parseIds(user.saved_ids), ...parseIds(user.alert_ids), ...restock().subscriptions(userId).map(sub => sub.dealId)]);
  return [...ids].map(id => authorized(userId, id)).filter(Boolean);
}

function ids() {
  reconcileAccess();
  const result = new Set();
  for (const user of db.prepare('SELECT id,saved_ids,alert_ids FROM account_users').all()) {
    const subscriptions = restock().subscriptions(user.id).filter(sub => !sub.paused).map(sub => sub.dealId);
    for (const id of [...parseIds(user.saved_ids), ...parseIds(user.alert_ids), ...subscriptions]) {
      if (hasAccess(user.id, id)) result.add(id);
    }
  }
  return [...result].filter(id => typeof id === 'string' && /^MLM\d+$/.test(id));
}

function due(limit = 60) {
  const cutoff = Date.now() - 5 * 60 * 1000;
  return ids().map(id => ({ id, row: select.get(id) }))
    .filter(({ row }) => !row || row.last_checked_at <= cutoff)
    .sort((a, b) => (a.row?.last_checked_at || 0) - (b.row?.last_checked_at || 0) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ id, row }) => ({ id, category: row?.snapshot ? JSON.parse(row.snapshot).category : 'seguimiento' }));
}

function markChecked(id, { at = Date.now(), status = 'unknown' } = {}) {
  at = timestamp(at);
  if (typeof id !== 'string' || !/^MLM\d+$/.test(id) || !Number.isFinite(at)) return;
  check.run(id, at, status === 'failed' ? 'failed' : 'unknown');
}

module.exports = { remember, get, owned, ids, due, markChecked, validId, grant, hasAccess, authorized, reconcileAccess };
