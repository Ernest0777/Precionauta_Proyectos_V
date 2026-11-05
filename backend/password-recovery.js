const crypto = require('node:crypto');
const { promisify } = require('node:util');
const express = require('express');
const database = require('./db/database');
const { checkOrigin } = require('./account');
const scrypt = promisify(crypto.scrypt);
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
const invalid = res => res.status(400).json({ success: false, error: 'El enlace no es válido o ha vencido' });

function createPasswordRecoveryRouter(options = {}) {
  const db = options.db || database;
  db.exec(`CREATE TABLE IF NOT EXISTS password_recovery_tokens (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS password_recovery_user ON password_recovery_tokens(user_id);`);
  const attempts = new Map();
  const router = express.Router();
  router.use('/password', checkOrigin, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  function limit(req, res, next) {
    const now = Date.now();
    for (const [key, value] of attempts) if (now - value.at >= 900000) attempts.delete(key);
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0,254) : '';
    const keys = [[`ip:${req.ip}`, 30], ...(email ? [[`email:${email}`, 5]] : [])];
    if (attempts.size >= 10000 || keys.some(([key, max]) => (attempts.get(key)?.count || 0) >= max)) {
      res.set('Retry-After', '900'); return res.status(429).json({ success: false, error: 'Demasiados intentos. Intenta en 15 minutos' });
    }
    for (const [key] of keys) { const item = attempts.get(key) || { at: now, count: 0 }; item.count++; attempts.set(key, item); }
    next();
  }
  const settings = () => options.config || { apiKey: process.env.RESEND_API_KEY, from: process.env.RECOVERY_FROM, frontendUrl: process.env.FRONTEND_URL };
  const sendEmail = options.sendEmail || (async ({ to, url, config }) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.from, to: [to], subject: 'Recupera tu contraseña de Precionauta', text: `Abre este enlace para cambiar tu contraseña. Caduca en 30 minutos:\n\n${url}\n\nSi no solicitaste este cambio, ignora este mensaje.` })
    });
    if (!response.ok) throw new Error('Email delivery failed');
  });
  router.post('/password/request', limit, async (req, res, next) => {
    const config = settings(); let frontend;
    try { frontend = new URL(config.frontendUrl); } catch { /* Missing or invalid configuration. */ }
    if (!config.apiKey || !config.from || !frontend || !['http:', 'https:'].includes(frontend.protocol) || frontend.username || frontend.password) {
      return res.status(503).json({ success: false, error: 'La recuperación no está disponible en este momento' });
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, error: 'Ingresa un correo válido' });
    try {
      const user = db.prepare('SELECT id FROM account_users WHERE email = ?').get(email);
      if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        db.transaction(() => {
          db.prepare('DELETE FROM password_recovery_tokens WHERE user_id = ? OR expires_at <= ?').run(user.id, Date.now());
          db.prepare('INSERT INTO password_recovery_tokens VALUES (?, ?, ?)').run(digest(token), user.id, Date.now() + 1800000);
        });
        const url = new URL('recuperar.html', frontend.href.endsWith('/') ? frontend.href : frontend.href + '/');
        url.search = ''; url.hash = `token=${token}`;
        // Do not wait for delivery: provider latency must not reveal account existence.
        Promise.resolve().then(() => sendEmail({ to: email, url: url.href, config }))
          .catch(() => console.error('Password recovery email delivery failed')); 
      }
      res.status(202).json({ success: true, message: 'Si existe una cuenta con ese correo, recibirás instrucciones para recuperar tu contraseña.' });
    } catch (error) { next(error); }
  });
  router.post('/password/reset', limit, async (req, res, next) => {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return invalid(res);
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) return res.status(400).json({ success: false, error: 'La contraseña debe tener entre 12 y 128 caracteres' });
    const tokenHash = digest(token);
    try {
      if (!db.prepare('SELECT user_id FROM password_recovery_tokens WHERE token_hash = ? AND expires_at > ?').get(tokenHash, Date.now())) return invalid(res);
      const salt = crypto.randomBytes(16).toString('hex');
      const derived = await scrypt(password, salt, 64);
      const changed = db.transaction(() => {
        const row = db.prepare('SELECT user_id FROM password_recovery_tokens WHERE token_hash = ? AND expires_at > ?').get(tokenHash, Date.now());
        if (!row) return false;
        db.prepare('UPDATE account_users SET password_hash = ?, password_salt = ? WHERE id = ?').run(derived.toString('hex'), salt, row.user_id);
        db.prepare('DELETE FROM password_recovery_tokens WHERE user_id = ?').run(row.user_id);
        db.prepare('DELETE FROM account_sessions WHERE user_id = ?').run(row.user_id);
        return true;
      });
      if (!changed) return invalid(res);
      res.json({ success: true, message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
    } catch (error) { next(error); }
  });
  return router;
}
const router = createPasswordRecoveryRouter();
module.exports = { router, createPasswordRecoveryRouter };
