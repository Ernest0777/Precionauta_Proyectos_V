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

  -- Ofertas de 80%+ ya anunciadas, para no repetir el aviso.
  CREATE TABLE IF NOT EXISTS extreme_notified (
    deal_id TEXT PRIMARY KEY,
    at      INTEGER NOT NULL
  );
`);

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
