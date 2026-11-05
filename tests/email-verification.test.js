const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-email-'));
process.env.PRECIONAUTA_DB = path.join(dir, 'test.db');
const { DatabaseSync } = require('node:sqlite');
const legacy = new DatabaseSync(process.env.PRECIONAUTA_DB);
legacy.exec(`CREATE TABLE account_users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
 plan_id TEXT NOT NULL DEFAULT 'free', plan_period TEXT, plan_since INTEGER,
 saved_ids TEXT NOT NULL DEFAULT '[]', alert_ids TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL)`);
legacy.close();
const db = require('../backend/db/database');
const { createEmailVerification } = require('../backend/email-verification');
const { sessionData } = require('../backend/account');
const config = { apiKey: 'test', from: 'test@example.com', frontendUrl: 'http://localhost:4173' };
const sent = [];
const service = createEmailVerification({ db, config, sendEmail: async m => sent.push(m) });
function post(router, url, body, account) {
  return new Promise((resolve, reject) => {
    const req = {method:'POST', url, originalUrl:url, body, account, protocol:'http', headers:{origin:'http://localhost:4173',host:'localhost'}, get(name){return this.headers[name.toLowerCase()];}};
    const res = {statusCode:200, set(){return this;}, status(n){this.statusCode=n;return this;}, json(body){resolve({status:this.statusCode,body});return this;}};
    router.handle(req,res,e=>reject(e || new Error('missing route')));
  });
}
test('verificación de correo: emisión, caducidad, reenvío y uso único', async () => {
  for (const id of ['u','v']) db.prepare('INSERT INTO account_users (id,email,name,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?)').run(id,`${id}@example.com`,id,'x','x',Date.now());
  const user = db.prepare('SELECT * FROM account_users WHERE id=?').get('u');
  try {
    assert.equal(user.email_verified_at, null);
    assert.equal(sessionData(user).user.emailVerified, false);
    const unavailable = createEmailVerification({db,config:{},sendEmail:async()=>{throw Error('unexpected');}});
    assert.equal((await post(unavailable.router,'/email/request',{},user)).status,503);
    const failed = createEmailVerification({db,config,sendEmail:async()=>{throw Error('provider failed');}});
    assert.equal((await post(failed.router,'/email/request',{},user)).status,502);
    assert.equal((await post(service.router,'/email/request',{},null)).status,401);
    let result = await post(service.router,'/email/request',{email:'v@example.com'},user);
    assert.equal(result.status,202); assert.equal(JSON.stringify(result).includes('token'),false); assert.equal(sent[0].to,user.email);
    let token = new URL(sent[0].url).hash.slice(7);
    await post(service.router,'/email/request',{},user);
    assert.equal((await post(service.router,'/email/confirm',{token},null)).status,400);
    token = new URL(sent[1].url).hash.slice(7);
    db.prepare('UPDATE email_verification_tokens SET expires_at=?').run(Date.now()-1);
    assert.equal((await post(service.router,'/email/confirm',{token},null)).status,400);
    await post(service.router,'/email/request',{},user); token = new URL(sent[2].url).hash.slice(7);
    const outcomes = await Promise.all([post(service.router,'/email/confirm',{token},null),post(service.router,'/email/confirm',{token},null)]);
    assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,400]);
    assert.ok(db.prepare('SELECT email_verified_at FROM account_users WHERE id=?').get('u').email_verified_at);
    assert.equal(sessionData(db.prepare('SELECT * FROM account_users WHERE id=?').get('u')).user.emailVerified, true);
    assert.equal(db.prepare('SELECT email_verified_at FROM account_users WHERE id=?').get('v').email_verified_at,null);
    await post(service.router,'/email/request',{},user); await post(service.router,'/email/request',{},user);
    assert.equal((await post(service.router,'/email/request',{},user)).status,429);
  } finally { db.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});
