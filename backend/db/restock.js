const crypto = require('node:crypto');
const db = require('./database');

db.exec(`
  CREATE TABLE IF NOT EXISTS restock_subscriptions (
    user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
    deal_id TEXT NOT NULL, created_at INTEGER NOT NULL,
    last_known INTEGER, observed_at INTEGER,
    PRIMARY KEY(user_id, deal_id)
  );
  CREATE TABLE IF NOT EXISTS restock_events (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
    deal_id TEXT NOT NULL, title TEXT NOT NULL, price REAL, at INTEGER NOT NULL, read_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS restock_events_user ON restock_events(user_id, at);
  CREATE TABLE IF NOT EXISTS restock_telegram_sent (
    event_id TEXT NOT NULL REFERENCES restock_events(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL, PRIMARY KEY(event_id, chat_id)
  );
  CREATE TABLE IF NOT EXISTS restock_telegram_attempts (
    event_id TEXT NOT NULL REFERENCES restock_events(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL, last_attempt_at INTEGER NOT NULL,
    PRIMARY KEY(event_id, chat_id)
  );
`);

const userOf = id => db.prepare('SELECT * FROM account_users WHERE id = ?').get(id);
const rowsOf = id => db.prepare('SELECT * FROM restock_subscriptions WHERE user_id = ? ORDER BY created_at, rowid').all(id);
const publicEvent = row => ({ id: row.id, dealId: row.deal_id, title: row.title, price: row.price, at: row.at, readAt: row.read_at });
const timestamp = value => value instanceof Date ? value.getTime() : typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
function checkedAt(deal, at) {
  const checked = timestamp(deal.lastCheckedAt ?? deal.validatedAt);
  return deal.source === 'mercadolibre' && Number.isFinite(checked) && checked <= at && at - checked <= 300000 ? checked : null;
}

function subscriptions(userId) {
  const user = userOf(userId);
  if (!user) return [];
  const capacity = user.plan_id === 'plus' ? Infinity : Math.max(0, 3 - JSON.parse(user.alert_ids).length);
  return rowsOf(userId).map((row, index) => ({ dealId: row.deal_id, createdAt: row.created_at, paused: index >= capacity }));
}

function trackedIds() {
  const ids = new Set();
  for (const { user_id } of db.prepare('SELECT DISTINCT user_id FROM restock_subscriptions').all()) {
    for (const sub of subscriptions(user_id)) if (!sub.paused) ids.add(sub.dealId);
  }
  return [...ids];
}

function stockOf(deal) {
  if (deal.availability === 'unknown' || deal.checkStatus === 'failed' || deal.checkStatus === 'unknown') return null;
  if (deal.availability === 'unavailable') return 0;
  if (deal.availability === 'available') return 1;
  return Number.isFinite(deal.stock) && deal.stock >= 0 ? (deal.stock > 0 ? 1 : 0) : null;
}

function canAddPriceAlerts(user, nextIds) {
  if (user.plan_id === 'plus') return true;
  const oldIds = JSON.parse(user.alert_ids);
  if (!nextIds.some(id => !oldIds.includes(id))) return true;
  return nextIds.length + rowsOf(user.id).length <= 3;
}

function setSubscription(userId, deal, enabled) {
  return db.transaction(() => {
    const user = userOf(userId);
    if (!user) throw Object.assign(new Error('Inicia sesión para continuar'), { status: 401 });
    if (!enabled) {
      db.prepare('DELETE FROM restock_subscriptions WHERE user_id = ? AND deal_id = ?').run(userId, deal.id);
      return;
    }
    if (rowsOf(userId).some(row => row.deal_id === deal.id)) return;
    if (deal.source === 'demo') throw Object.assign(new Error('Los productos de demostración no generan avisos reales'), { status: 400 });
    if (user.plan_id !== 'plus' && JSON.parse(user.alert_ids).length + rowsOf(userId).length >= 3) {
      throw Object.assign(new Error('Gratis permite 3 avisos en total entre precio y reposición. Conservamos los anteriores en pausa'), { status: 403 });
    }
    const at = Date.now();
    const checked = checkedAt(deal, at);
    db.prepare('INSERT INTO restock_subscriptions (user_id, deal_id, created_at, last_known, observed_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId, deal.id, at, checked == null ? null : stockOf(deal), checked);
  });
}

function observe(deals, { source, at = Date.now() } = {}) {
  at = timestamp(at);
  if (source !== 'mercadolibre' || !Number.isFinite(at)) return [];
  return db.transaction(() => {
    const events = [];
    for (const deal of deals) {
      if (!deal?.id) continue;
      const observedAt = checkedAt(deal, at);
      if (observedAt == null) continue;
      const stock = stockOf(deal);
      for (const row of db.prepare('SELECT * FROM restock_subscriptions WHERE deal_id = ?').all(deal.id)) {
        if (row.observed_at != null && observedAt <= row.observed_at) continue;
        const active = subscriptions(row.user_id).some(sub => sub.dealId === deal.id && !sub.paused);
        if (stock === 1 && row.last_known === 0 && active) {
          const event = { id: crypto.randomUUID(), deal_id: deal.id, title: String(deal.title || 'Producto'),
            price: Number.isFinite(deal.currentPrice) && deal.currentPrice > 0 ? deal.currentPrice : null, at: observedAt, read_at: null };
          db.prepare('INSERT INTO restock_events (id,user_id,deal_id,title,price,at) VALUES (?,?,?,?,?,?)')
            .run(event.id, row.user_id, event.deal_id, event.title, event.price, event.at);
          events.push(publicEvent(event));
        }
        db.prepare('UPDATE restock_subscriptions SET last_known = COALESCE(?,last_known), observed_at = ? WHERE user_id = ? AND deal_id = ?')
          .run(stock, observedAt, row.user_id, deal.id);
      }
    }
    return events;
  });
}

function events(userId) {
  return db.prepare('SELECT * FROM restock_events WHERE user_id = ? ORDER BY at DESC, rowid DESC LIMIT 100').all(userId).map(publicEvent);
}
const unreadCount = userId => db.prepare('SELECT COUNT(*) AS count FROM restock_events WHERE user_id = ? AND read_at IS NULL').get(userId).count;
function markRead(userId, id) {
  return db.prepare('UPDATE restock_events SET read_at = COALESCE(read_at,?) WHERE user_id = ? AND id = ?').run(Date.now(), userId, id).changes > 0;
}

module.exports = { subscriptions, trackedIds, setSubscription, canAddPriceAlerts, observe, events, unreadCount, markRead };
