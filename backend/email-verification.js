const crypto = require('node:crypto');
const express = require('express');
const database = require('./db/database');
const { checkOrigin, requireUser } = require('./account');
const digest = token => crypto.createHash('sha256').update(token).digest('hex');

function createEmailVerification(options = {}) {
  const db = options.db || database;
  const attempts = new Map();
  const settings = () => options.config || { apiKey: process.env.RESEND_API_KEY, from: process.env.RECOVERY_FROM, frontendUrl: process.env.FRONTEND_URL };
  const sendEmail = options.sendEmail || (async ({ to, url, config }) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.from, to: [to], subject: 'Verifica tu correo de Precionauta', text: `Abre este enlace para verificar tu correo. Caduca en 24 horas:\n\n${url}\n\nSi no creaste esta cuenta, ignora este mensaje.` })
    });
    if (!response.ok) throw new Error('Email delivery failed');
  });
  async function issueVerification(user) {
    const config = settings(); let frontend;
    try { frontend = new URL(config.frontendUrl); } catch { /* Missing configuration. */ }
    if (!config.apiKey || !config.from || !frontend || !['http:', 'https:'].includes(frontend.protocol) || frontend.username || frontend.password) return 'unavailable';
    const now = Date.now();
    for (const [id, item] of attempts) if (now - item.at >= 900000) attempts.delete(id);
    const item = attempts.get(user.id) || { at: now, count: 0 };
    if (item.count >= 5 || attempts.size >= 10000 && !attempts.has(user.id)) return 'limited';
    item.count++; attempts.set(user.id, item);
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = digest(token);
    db.transaction(() => {
      db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ? OR expires_at <= ?').run(user.id, now);
      db.prepare('INSERT INTO email_verification_tokens VALUES (?, ?, ?)').run(tokenHash, user.id, now + 86400000);
    });
    const url = new URL('verificar-correo.html', frontend.href.endsWith('/') ? frontend.href : frontend.href + '/');
    url.search = ''; url.hash = `token=${token}`;
    try { await sendEmail({ to: user.email, url: url.href, config }); }
    catch (error) { db.prepare('DELETE FROM email_verification_tokens WHERE token_hash = ?').run(tokenHash); throw error; }
    return 'sent';
  }
  const router = express.Router();
  router.use('/email', checkOrigin, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/email/request', requireUser, async (req, res, next) => {
    try {
      const result = await issueVerification(req.account);
      if (result === 'unavailable') return res.status(503).json({ success: false, error: 'La verificación no está disponible en este momento' });
      if (result === 'limited') { res.set('Retry-After', '900'); return res.status(429).json({ success: false, error: 'Demasiados intentos. Intenta en 15 minutos' }); }
      return res.status(202).json({ success: true, message: 'Te enviamos un enlace para verificar tu correo.' });
    } catch { return res.status(502).json({ success: false, error: 'No pudimos enviar el correo. Inténtalo de nuevo.' }); }
  });
  router.post('/email/confirm', (req, res, next) => {
    const token = req.body?.token;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({success:false,error:'El enlace no es válido o ha vencido'});
    try {
      const verified = db.transaction(() => {
        const row = db.prepare('SELECT user_id FROM email_verification_tokens WHERE token_hash = ? AND expires_at > ?').get(digest(token), Date.now());
        if (!row) return false;
        db.prepare('UPDATE account_users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(Date.now(), row.user_id);
        db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(row.user_id);
        return true;
      });
      if (!verified) return res.status(400).json({success:false,error:'El enlace no es válido o ha vencido'});
      return res.json({success:true,message:'Tu correo quedó verificado.'});
    } catch (error) { next(error); }
  });
  return { router, issueVerification };
}
const { router, issueVerification } = createEmailVerification();
module.exports = { router, issueVerification, createEmailVerification };
