const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const originalScrypt = crypto.scrypt;
let gateLogin = false, resumeLogin, loginStarted;
const loginWaiting = new Promise(resolve => { loginStarted = resolve; });
crypto.scrypt = function(password, salt, length, callback) {
  if (gateLogin && password === 'old-secure-password') {
    return originalScrypt(password, salt, length, (error, result) => { resumeLogin = () => callback(error, result); loginStarted(); });
  }
  return originalScrypt(password, salt, length, callback);
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precionauta-recovery-'));
process.env.PRECIONAUTA_DB = path.join(dir, 'test.db');
const db = require('../backend/db/database');
const { createPasswordRecoveryRouter } = require('../backend/password-recovery');
const accountRouter = require('../backend/account').router;
crypto.scrypt = originalScrypt;
const sent = [];
const router = createPasswordRecoveryRouter({ db, config: { apiKey: 'test', from: 'test@example.com', frontendUrl: 'http://localhost:4173' }, sendEmail: async (message) => sent.push(message) });
test('password recovery flow', async (t) => {
  const post = (route, body, target = router) => new Promise((resolve, reject) => {
    const req = { method: 'POST', url: route, originalUrl: route, body, ip: '127.0.0.1', protocol: 'http', headers: { origin: 'http://localhost:4173', host: 'localhost' }, get(name) { return this.headers[name.toLowerCase()]; } };
    const res = { statusCode: 200, set() { return this; }, status(code) { this.statusCode = code; return this; }, cookie() { return this; }, json(data) { resolve({status:this.statusCode, body:data}); return this; } };
    target.handle(req, res, error => reject(error || new Error('Route not found')));
  });
  db.prepare('INSERT INTO account_users (id,email,name,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?)').run('u', 'user@example.com', 'User', 'old', 'old', Date.now());
  db.prepare('INSERT INTO account_sessions VALUES (?,?,?)').run('session', 'u', Date.now()+10000);
  try {
    await t.test('unrelated account routes pass through without an Origin', async () => {
      const req = { method: 'GET', url: '/session', originalUrl: '/session', headers: {}, get(name) { return this.headers[name.toLowerCase()]; } };
      await new Promise((resolve, reject) => router.handle(req, {}, error => error ? reject(error) : resolve()));
    });
    await t.test('missing configuration returns 503 without looking up accounts', async () => {
      const unavailable = createPasswordRecoveryRouter({ db, config: {}, sendEmail: async () => { throw new Error('unexpected send'); } });
      const existing = await post('/password/request', {email:'user@example.com'}, unavailable);
      const missing = await post('/password/request', {email:'missing@example.com'}, unavailable);
      assert.equal(existing.status, 503); assert.deepEqual(existing, missing);
    });
    await t.test('request responds without waiting for email delivery', async () => {
      let started = false;
      const slow = createPasswordRecoveryRouter({ db, config: {apiKey:'test', from:'test@example.com', frontendUrl:'http://localhost:4173'}, sendEmail: () => { started = true; return new Promise(() => {}); } });
      const missing = await post('/password/request', {email:'missing@example.com'}, slow);
      const existing = await Promise.race([post('/password/request', {email:'user@example.com'}, slow), new Promise(resolve => setTimeout(() => resolve(null), 200))]);
      assert.deepEqual(existing, missing); assert.equal(existing.status, 202); assert.equal(started, true);
    });
    await t.test('generic response and no token leak', async () => {
      const missing = await post('/password/request', {email:'missing@example.com'});
      const existing = await post('/password/request', {email:'user@example.com'});
      assert.deepEqual(existing, missing); assert.equal(existing.status, 202); assert.equal(sent.length, 1);
      assert.equal(JSON.stringify(existing).includes('token'), false);
    });
    let token = new URL(sent[0].url).hash.slice('#token='.length);
    await t.test('new request invalidates previous token', async () => {
      await post('/password/request', {email:'user@example.com'});
      assert.equal((await post('/password/reset', {token, password:'a-secure-password'})).status, 400);
      token = new URL(sent[1].url).hash.slice('#token='.length);
    });
    await t.test('expiry is enforced', async () => {
      db.prepare('UPDATE password_recovery_tokens SET expires_at = ?').run(Date.now()-1);
      assert.equal((await post('/password/reset', {token, password:'a-secure-password'})).status, 400);
      await post('/password/request', {email:'user@example.com'}); token = new URL(sent[2].url).hash.slice('#token='.length);
    });
    await t.test('single use, concurrency and session revocation', async () => {
      const outcomes = await Promise.all([post('/password/reset',{token,password:'a-secure-password'}),post('/password/reset',{token,password:'a-secure-password'})]);
      assert.deepEqual(outcomes.map(x=>x.status).sort(), [200,400]);
      assert.equal(db.prepare('SELECT count(*) n FROM account_sessions WHERE user_id = ?').get('u').n, 0);
      const user = db.prepare('SELECT password_hash,password_salt FROM account_users WHERE id = ?').get('u');
      assert.equal(crypto.scryptSync('a-secure-password', user.password_salt, 64).toString('hex'), user.password_hash);
      assert.equal((await post('/password/reset',{token,password:'a-secure-password'})).status,400);
      assert.equal((await post('/password/reset',{token:'f'.repeat(64),password:'a-secure-password'})).status,400);
    });
    await t.test('login started before reset cannot issue a session with the old password', async () => {
      const oldSalt = 'oldsalt';
      db.prepare('UPDATE account_users SET password_hash = ?, password_salt = ? WHERE id = ?').run(crypto.scryptSync('old-secure-password', oldSalt, 64).toString('hex'), oldSalt, 'u');
      await post('/password/request', {email:'user@example.com'});
      const latest = new URL(sent.at(-1).url).hash.slice('#token='.length);
      gateLogin = true;
      const login = post('/login', {email:'user@example.com', password:'old-secure-password'}, accountRouter);
      await loginWaiting;
      assert.equal((await post('/password/reset', {token:latest,password:'new-secure-password'})).status,200);
      resumeLogin();
      assert.equal((await login).status,401);
      assert.equal(db.prepare('SELECT count(*) n FROM account_sessions WHERE user_id = ?').get('u').n,0);
    });
    await t.test('rate limits repeated requests', async () => {
      let result; for(let i=0;i<12;i++) result=await post('/password/request',{email:'other@example.com'});
      assert.equal(result.status,429);
    });
  } finally { db.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});
