const fs = require('fs');
const path = require('path');

// SQLite incluido en Node 22+ (sin dependencias). Node avisa que es
// "experimental" la primera vez; ese aviso no afecta el funcionamiento.
const { DatabaseSync } = require('node:sqlite');

// backend/data/ está fuera de git: aquí vive el historial real, no es caché.
const FILE = process.env.PRECIONAUTA_DB || path.join(__dirname, '..', 'data', 'precionauta.db');
fs.mkdirSync(path.dirname(FILE), { recursive: true });

const db = new DatabaseSync(FILE);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS account_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    plan_id TEXT NOT NULL DEFAULT 'free' CHECK (plan_id IN ('free', 'plus')),
    plan_period TEXT,
    plan_since INTEGER,
    saved_ids TEXT NOT NULL DEFAULT '[]',
    alert_ids TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS account_alert_targets (
    user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
    deal_id TEXT NOT NULL,
    target_cents INTEGER NOT NULL CHECK (target_cents > 0),
    PRIMARY KEY (user_id, deal_id)
  );
  CREATE TABLE IF NOT EXISTS account_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS account_sessions_expiry ON account_sessions(expires_at);

  -- Un renglón cada vez que vemos un precio nuevo (o cada 6 h si no cambia).
  CREATE TABLE IF NOT EXISTS prices (
    deal_id        TEXT    NOT NULL,
    price          REAL    NOT NULL,
    original_price REAL,
    at             INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS prices_by_deal ON prices (deal_id, at);

  -- Cada clic en "Ver oferta" (pasa por /go/:id antes de ir a la tienda).
  CREATE TABLE IF NOT EXISTS clicks (
    deal_id  TEXT    NOT NULL,
    title    TEXT,
    category TEXT,
    source   TEXT,
    at       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS clicks_by_time ON clicks (at);

  -- Navegador <-> chat de Telegram. El código lo genera el navegador.
  CREATE TABLE IF NOT EXISTS telegram_links (
    code      TEXT PRIMARY KEY,
    chat_id   TEXT,
    name      TEXT,
    extreme   INTEGER NOT NULL DEFAULT 1,
    linked_at INTEGER
  );

  -- Ofertas que cada navegador sigue ("Avisarme si baja más").
  CREATE TABLE IF NOT EXISTS alert_subs (
    code       TEXT NOT NULL,
    deal_id    TEXT NOT NULL,
    last_price REAL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (code, deal_id)
  );

  -- Datos sueltos de la base (p. ej. cuándo empezamos a guardar precios).
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Ofertas de 80%+ ya anunciadas, para no repetir el aviso.
  CREATE TABLE IF NOT EXISTS extreme_notified (
    deal_id TEXT PRIMARY KEY,
    at      INTEGER NOT NULL
  );
`);

// Migración aditiva: las cuentas existentes quedan pendientes de verificación.
if (!db.prepare('PRAGMA table_info(account_users)').all().some((column) => column.name === 'email_verified_at')) {
  db.exec('ALTER TABLE account_users ADD COLUMN email_verified_at INTEGER');
}
db.exec(`CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
); CREATE INDEX IF NOT EXISTS email_verification_user ON email_verification_tokens(user_id);`);

// Migración aditiva: los vínculos antiguos permanecen sin propietario y no envían avisos.
if (!db.prepare('PRAGMA table_info(telegram_links)').all().some((column) => column.name === 'user_id')) {
  db.exec('ALTER TABLE telegram_links ADD COLUMN user_id TEXT REFERENCES account_users(id)');
}

// Varias escrituras en una sola transacción (mucho más rápido en SQLite).
db.transaction = (fn) => {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};

module.exports = db;
