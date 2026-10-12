const crypto = require('crypto');
const config = require('../config/config');

// Sesión del panel: token firmado con HMAC, sin base de datos.
// Sin ADMIN_SECRET la clave cambia en cada arranque (hay que volver a entrar).
const SECRET = config.admin.secret || crypto.randomBytes(32).toString('hex');
const TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

// Intentos fallidos por IP: 5 cada 15 minutos.
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const fails = new Map();

const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest();
const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

function isConfigured() {
  return Boolean(config.admin.password);
}

function isLockedOut(ip) {
  const entry = fails.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > FAIL_WINDOW_MS) {
    fails.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILS;
}

function recordFail(ip) {
  const entry = fails.get(ip);
  if (!entry || Date.now() - entry.first > FAIL_WINDOW_MS) fails.set(ip, { count: 1, first: Date.now() });
  else entry.count++;
}

// Compara hashes de igual largo para no filtrar la contraseña por tiempo de respuesta.
function checkPassword(password) {
  return crypto.timingSafeEqual(sha256(password), sha256(config.admin.password));
}

function issueToken() {
  const expiresAt = Date.now() + TTL_MS;
  const payload = String(expiresAt);
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

function verifyToken(token) {
  if (typeof token !== 'string') return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = sign(payload);
  if (expected.length !== signature.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;
  return Number(payload) > Date.now();
}

function login(req, res) {
  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Panel sin contraseña. Agrega ADMIN_PASSWORD en backend/.env y reinicia el servidor.',
    });
  }
  const ip = req.ip;
  if (isLockedOut(ip)) {
    return res.status(429).json({ success: false, error: 'Demasiados intentos. Espera 15 minutos.' });
  }
  if (!checkPassword(req.body?.password ?? '')) {
    recordFail(ip);
    return res.status(401).json({ success: false, error: 'Contraseña incorrecta.' });
  }
  fails.delete(ip);
  res.json({ success: true, ...issueToken() });
}

function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!verifyToken(token)) {
    return res.status(401).json({ success: false, error: 'Sesión vencida o inválida.' });
  }
  next();
}

module.exports = { login, requireAdmin, isConfigured };
