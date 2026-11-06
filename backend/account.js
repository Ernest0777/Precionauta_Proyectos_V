const crypto = require('node:crypto');
const { promisify } = require('node:util');
const express = require('express');
const db = require('./db/database');
const config = require('./config/config');
const restock = require('./db/restock');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'precionauta_session';
const SESSION_MS = 30 * 86400000;
const attempts = new Map();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (res, status, error) => res.status(status).json({ success: false, error });
const production = () => process.env.NODE_ENV === 'production';

function allowedOrigins() {
  const origins = new Set();
  for (const value of [process.env.FRONTEND_URL, config.server.publicUrl]) {
    if (value) { try { origins.add(new URL(value).origin); } catch { /* Invalid config grants no origin. */ } }
  }
  if (!production()) {
    origins.add('http://localhost:4173');
    origins.add('http://127.0.0.1:4173');
  }
  return origins;
}

function checkOrigin(req, res, next) {
  const origin = req.get('origin');
  const sameOrigin = `${req.protocol}://${req.get('host')}`;
  if (!origin || (origin !== sameOrigin && !allowedOrigins().has(origin))) return fail(res, 403, 'Origen de la solicitud no permitido');
  next();
}

function accessOf(user) {
  if (!user) return { level: 'visitor', historyDays: 0, alertLimit: 0, seasonLimit: 0, catalogLimit: 6, delayMs: 7200000 };
  if (user.plan_id === 'plus') return { level: 'plus', historyDays: 365, alertLimit: null, seasonLimit: null, catalogLimit: null, delayMs: 0 };
  return { level: 'free', historyDays: 30, alertLimit: 3, seasonLimit: 3, catalogLimit: null, delayMs: 7200000 };
}

function sessionData(user) {
  const access = accessOf(user);
  const alertIds = user ? JSON.parse(user.alert_ids) : [];
  return {
    user: user ? { id: user.id, name: user.name, email: user.email, address: user.address, emailVerified: Boolean(user.email_verified_at) } : null,
    plan: user?.plan_id === 'plus' ? { id: 'plus', period: user.plan_period, since: new Date(user.plan_since).toISOString() } : { id: 'free' },
    access,
    savedIds: user ? JSON.parse(user.saved_ids) : [],
    alertIds,
    alertTargets: user ? Object.fromEntries(db.prepare('SELECT deal_id, target_cents FROM account_alert_targets WHERE user_id = ?').all(user.id).map(row => [row.deal_id, row.target_cents / 100])) : {},
    pausedAlertIds: access.alertLimit == null ? [] : alertIds.slice(access.alertLimit),
    restockIds: user ? restock.subscriptions(user.id).map(sub => sub.dealId) : [],
    pausedRestockIds: user ? restock.subscriptions(user.id).filter(sub => sub.paused).map(sub => sub.dealId) : [],
    restockUnreadCount: user ? restock.unreadCount(user.id) : 0,
    unverifiedTrackingIds: user ? [...new Set([...JSON.parse(user.saved_ids), ...alertIds])].filter(id => !require('./db/tracked-products').hasAccess(user.id, id)) : [],
  };
}

function attachSession(req, res, next) {
  const token = (req.get('cookie') || '').split(';').map(p => p.trim()).find(p => p.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  req.accountTokenHash = token && /^[a-f0-9]{64}$/.test(token) ? hash(token) : null;
  req.account = req.accountTokenHash ? db.prepare(`SELECT u.* FROM account_sessions s JOIN account_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`).get(req.accountTokenHash, Date.now()) || null : null;
  req.access = accessOf(req.account);
  next();
}

function requireUser(req, res, next) {
  if (!req.account) return fail(res, 401, 'Inicia sesión para continuar');
  next();
}

function checkAccountOwner(req, res, next) {
  if (req.get('X-Account-Id') !== (req.account?.id || 'visitor')) return fail(res, 409, 'La sesión cambió. Actualiza tu cuenta e inténtalo de nuevo.');
  next();
}

function checkOptionalOwner(req, res, next) {
  return req.get('X-Account-Id') === undefined ? next() : checkAccountOwner(req, res, next);
}

function requirePlus(req, res, next) {
  if (!req.account) return fail(res, 401, 'Inicia sesión para continuar');
  if (req.account.plan_id !== 'plus') return fail(res, 403, 'Telegram requiere Plus');
  next();
}

function issueSession(req, res, user) {
  if (req.accountTokenHash) db.prepare('DELETE FROM account_sessions WHERE token_hash = ?').run(req.accountTokenHash);
  db.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').run(Date.now());
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO account_sessions VALUES (?, ?, ?)').run(hash(token), user.id, Date.now() + SESSION_MS);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: production(), path: '/', maxAge: SESSION_MS });
}

function rateLimit(req, res, next) {
  const now = Date.now();
  for (const [key, item] of attempts) if (now - item.at > 900000) attempts.delete(key);
  const keys = [[`ip:${req.ip}`, 30], [`email:${String(req.body?.email || '').toLowerCase().slice(0, 254)}`, 10]];
  if (attempts.size > 10000 || keys.some(([key, max]) => (attempts.get(key)?.count || 0) >= max)) {
    res.set('Retry-After', '900');
    return fail(res, 429, 'Demasiados intentos. Intenta en 15 minutos');
  }
  keys.forEach(([key]) => { const item = attempts.get(key) || { at: now, count: 0 }; item.count++; attempts.set(key, item); });
  next();
}

const router = express.Router();
router.get('/session', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ success: true, data: sessionData(req.account) }); });
router.use(checkOrigin);
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const emailOf = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = (email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validPassword = (password) => typeof password === 'string' && password.length >= 12 && password.length <= 128;

router.post('/register', rateLimit, asyncRoute(async (req, res) => {
  const { name, password } = req.body || {};
  const email = emailOf(req.body?.email);
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || !validEmail(email) || !validPassword(password)) return fail(res, 400, 'Nombre y correo válidos; contraseña de 12 a 128 caracteres');
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  const id = crypto.randomUUID();
  try {
    db.prepare('INSERT INTO account_users (id,email,name,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?)').run(id, email, name.trim(), derived.toString('hex'), salt, Date.now());
  } catch (error) {
    if (error.code?.includes('SQLITE_CONSTRAINT') || error.message.includes('UNIQUE constraint')) return fail(res, 409, 'No se pudo crear la cuenta con ese correo');
    throw error;
  }
  const user = db.prepare('SELECT * FROM account_users WHERE id = ?').get(id);
  issueSession(req, res, user);
  res.status(201).json({ success: true, data: sessionData(user) });
  // La entrega no debe impedir que la cuenta recién creada inicie sesión.
  Promise.resolve().then(() => require('./email-verification').issueVerification(user)).catch(() => {});
}));

router.post('/login', rateLimit, asyncRoute(async (req, res) => {
  const email = emailOf(req.body?.email);
  const password = req.body?.password;
  if (!validEmail(email) || !validPassword(password)) return fail(res, 400, 'Correo o contraseña inválidos');
  const user = db.prepare('SELECT * FROM account_users WHERE email = ?').get(email);
  const derived = await scrypt(password, user?.password_salt || '00000000000000000000000000000000', 64);
  if (!user || !crypto.timingSafeEqual(derived, Buffer.from(user.password_hash, 'hex'))) return fail(res, 401, 'Correo o contraseña incorrectos');
  const current = db.transaction(() => {
    const fresh = db.prepare('SELECT * FROM account_users WHERE id = ? AND password_hash = ? AND password_salt = ?').get(user.id, user.password_hash, user.password_salt);
    if (!fresh) return null;
    issueSession(req, res, fresh);
    return fresh;
  });
  if (!current) return fail(res, 401, 'Correo o contraseña incorrectos');
  res.json({ success: true, data: sessionData(current) });
}));

router.post('/logout', (req, res) => {
  if (req.accountTokenHash) db.prepare('DELETE FROM account_sessions WHERE token_hash = ?').run(req.accountTokenHash);
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: production(), path: '/' });
  res.json({ success: true, data: sessionData(null) });
});
router.use(requireUser, checkOptionalOwner);
const reply = (req, res) => res.json({ success: true, data: sessionData(db.prepare('SELECT * FROM account_users WHERE id = ?').get(req.account.id)) });

router.patch('/profile', (req, res) => {
  const name = req.body?.name ?? req.account.name;
  const address = req.body?.address ?? req.account.address;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || typeof address !== 'string' || address.length > 500) return fail(res, 400, 'Nombre o dirección inválidos');
  db.prepare('UPDATE account_users SET name = ?, address = ? WHERE id = ?').run(name.trim(), address.trim(), req.account.id);
  reply(req, res);
});

function idsOf(ids) {
  if (!Array.isArray(ids) || ids.length > 2000 || ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id))) return null;
  return [...new Set(ids)];
}

async function validateLibraryAdds(req, saved, alerts) {
  const current = db.prepare('SELECT * FROM account_users WHERE id = ?').get(req.account.id);
  const oldSaved = new Set(JSON.parse(current.saved_ids));
  const oldAlerts = new Set(JSON.parse(current.alert_ids));
  const ids = [...new Set([...saved.filter(id => !oldSaved.has(id)), ...alerts.filter(id => !oldAlerts.has(id))])];
  if (!ids.length) return { deals: [] };
  const tracked = require('./db/tracked-products');
  const { selectDealsForAccess, isLocked } = require('./api/access');
  const moderation = require('./admin/moderation');
  const catalog = selectDealsForAccess(moderation.applyPublic(await require('./api/deal-fetcher').fetchAllDeals()), accessOf(current));
  const known = new Map(catalog.map(deal => [deal.id, deal]));
  const deals = [];
  for (const id of ids) {
    const deal = known.get(id) || tracked.authorized(current.id, id);
    if (!deal) return { error: [404, 'Producto no encontrado'] };
    if (isLocked(deal, accessOf(current))) return { error: [403, 'Esta oferta estará disponible después de 2 horas'] };
    deals.push(deal);
  }
  return { deals };
}

router.patch('/library', asyncRoute(async (req, res) => {
  const fields = ['savedAdd', 'savedRemove', 'alertAdd', 'alertRemove'];
  const lists = fields.map(field => idsOf(req.body?.[field] === undefined ? [] : req.body[field]));
  if (lists.some(list => !list)) return fail(res, 400, 'Listas de guardados y alertas inválidas');
  const [savedAdd, savedRemove, alertAdd, alertRemove] = lists;
  const candidateAlerts = [...new Set([...JSON.parse(req.account.alert_ids).filter(id => !alertRemove.includes(id)), ...alertAdd.filter(id => !alertRemove.includes(id))])];
  if (!restock.canAddPriceAlerts(req.account, candidateAlerts)) return fail(res, 403, 'Gratis permite 3 avisos en total entre precio y reposición. Conservamos los anteriores en pausa');
  const validation = await validateLibraryAdds(req, savedAdd.filter(id => !savedRemove.includes(id)), alertAdd.filter(id => !alertRemove.includes(id)));
  if (validation.error) return fail(res, ...validation.error);
  const error = db.transaction(() => {
    const current = db.prepare('SELECT * FROM account_users WHERE id = ?').get(req.account.id);
    const oldSaved = JSON.parse(current.saved_ids);
    const oldAlerts = JSON.parse(current.alert_ids);
    const update = (old, add, remove) => {
      const removed = new Set(remove);
      return [...new Set([...old.filter(id => !removed.has(id)), ...add.filter(id => !removed.has(id))])];
    };
    const saved = update(oldSaved, savedAdd, savedRemove);
    const alerts = update(oldAlerts, alertAdd, alertRemove);
    if (saved.length > 2000 || alerts.length > 2000) return [400, 'La biblioteca es demasiado grande'];
    if (!restock.canAddPriceAlerts(current, alerts)) return [403, 'Gratis permite 3 avisos en total entre precio y reposición. Conservamos los anteriores en pausa'];
    db.prepare('UPDATE account_users SET saved_ids = ?, alert_ids = ? WHERE id = ?').run(JSON.stringify(saved), JSON.stringify(alerts), current.id);
    for (const deal of validation.deals) require('./db/tracked-products').grant(current.id, deal);
    const keep = new Set(alerts);
    for (const row of db.prepare('SELECT deal_id FROM account_alert_targets WHERE user_id = ?').all(current.id)) {
      if (!keep.has(row.deal_id)) db.prepare('DELETE FROM account_alert_targets WHERE user_id = ? AND deal_id = ?').run(current.id, row.deal_id);
    }
    for (const row of db.prepare('SELECT s.code, s.deal_id FROM alert_subs s JOIN telegram_links l ON l.code = s.code WHERE l.user_id = ?').all(current.id)) {
      if (!keep.has(row.deal_id)) db.prepare('DELETE FROM alert_subs WHERE code = ? AND deal_id = ?').run(row.code, row.deal_id);
    }
    return null;
  });
  if (error) return fail(res, ...error);
  reply(req, res);
}));

router.put('/library', asyncRoute(async (req, res) => {
  let saved = idsOf(req.body?.savedIds);
  let alerts = idsOf(req.body?.alertIds);
  if (!saved || !alerts || (req.body.merge !== undefined && typeof req.body.merge !== 'boolean')) return fail(res, 400, 'Listas de guardados y alertas inválidas');
  const current = JSON.parse(req.account.alert_ids);
  if (req.body.merge === true) {
    saved = [...new Set([...JSON.parse(req.account.saved_ids), ...saved])];
    alerts = [...new Set([...current, ...alerts])];
  }
  if (saved.length > 2000 || alerts.length > 2000) return fail(res, 400, 'La biblioteca es demasiado grande');
  if (!restock.canAddPriceAlerts(req.account, alerts)) return fail(res, 403, 'Gratis permite 3 avisos en total entre precio y reposición. Conservamos los anteriores en pausa');
  const validation = await validateLibraryAdds(req, saved, alerts);
  if (validation.error) return fail(res, ...validation.error);
  // Una alerta eliminada de la biblioteca tampoco puede seguir enviando por Telegram.
  const keep = new Set(alerts);
  const error = db.transaction(() => {
    const fresh = db.prepare('SELECT * FROM account_users WHERE id = ?').get(req.account.id);
    if (!restock.canAddPriceAlerts(fresh, alerts)) return [403, 'Gratis permite 3 avisos en total entre precio y reposición. Conservamos los anteriores en pausa'];
    db.prepare('UPDATE account_users SET saved_ids = ?, alert_ids = ? WHERE id = ?').run(JSON.stringify(saved), JSON.stringify(alerts), req.account.id);
    for (const deal of validation.deals) require('./db/tracked-products').grant(req.account.id, deal);
    for (const row of db.prepare('SELECT deal_id FROM account_alert_targets WHERE user_id = ?').all(req.account.id)) {
      if (!keep.has(row.deal_id)) db.prepare('DELETE FROM account_alert_targets WHERE user_id = ? AND deal_id = ?').run(req.account.id, row.deal_id);
    }
    for (const row of db.prepare('SELECT s.code, s.deal_id FROM alert_subs s JOIN telegram_links l ON l.code = s.code WHERE l.user_id = ?').all(req.account.id)) {
      if (!keep.has(row.deal_id)) db.prepare('DELETE FROM alert_subs WHERE code = ? AND deal_id = ?').run(row.code, row.deal_id);
    }
    return null;
  });
  if (error) return fail(res, ...error);
  reply(req, res);
}));

router.patch('/alerts/:id', (req, res) => {
  const target = req.body?.targetPrice;
  if (target !== null && (typeof target !== 'number' || !Number.isFinite(target) || target < 0.01 || target > 100000000 || Math.abs(target * 100 - Math.round(target * 100)) > 1e-7)) return fail(res, 400, 'Precio objetivo inválido');
  const missing = db.transaction(() => {
    const current = db.prepare('SELECT alert_ids FROM account_users WHERE id = ?').get(req.account.id);
    if (!JSON.parse(current.alert_ids).includes(req.params.id)) return true;
    if (target === null) db.prepare('DELETE FROM account_alert_targets WHERE user_id = ? AND deal_id = ?').run(req.account.id, req.params.id);
    else db.prepare('INSERT INTO account_alert_targets (user_id, deal_id, target_cents) VALUES (?, ?, ?) ON CONFLICT(user_id, deal_id) DO UPDATE SET target_cents = excluded.target_cents').run(req.account.id, req.params.id, Math.round(target * 100));
    return false;
  });
  if (missing) return fail(res, 404, 'Alerta no encontrada');
  reply(req, res);
});

router.post('/plan', (req, res) => {
  const { id, period } = req.body || {};
  if (!['free', 'plus'].includes(id) || (id === 'plus' && !['mensual', 'anual'].includes(period))) return fail(res, 400, 'Plan o periodo inválido');
  if (id === 'plus' && production() && process.env.ACCOUNT_DEMO_PLANS !== 'true') return fail(res, 403, 'La activación DEMO está deshabilitada en producción');
  db.prepare('UPDATE account_users SET plan_id = ?, plan_period = ?, plan_since = ? WHERE id = ?').run(id, id === 'plus' ? period : null, id === 'plus' ? Date.now() : null, req.account.id);
  reply(req, res);
});

module.exports = { router, allowedOrigins, checkOrigin, attachSession, accessOf, requireUser, requirePlus, sessionData, fail, idsOf, checkAccountOwner, checkOptionalOwner };
