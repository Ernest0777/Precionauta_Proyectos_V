const db = require('./database');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Si el precio no cambia, un renglón cada 6 h basta para dibujar la gráfica.
const KEEPALIVE_MS = 6 * HOUR;
// Antes de esto no hay historial suficiente para juzgar el "precio anterior".
const MIN_DAYS_TO_JUDGE = 7;

const lastStmt = db.prepare('SELECT price, at FROM prices WHERE deal_id = ? ORDER BY at DESC LIMIT 1');
const insertStmt = db.prepare('INSERT INTO prices (deal_id, price, original_price, at) VALUES (?, ?, ?, ?)');
const seriesStmt = db.prepare('SELECT price, at FROM prices WHERE deal_id = ? AND at >= ? ORDER BY at');
const summaryStmt = db.prepare(`
  SELECT deal_id, MIN(price) AS min, MAX(price) AS max, COUNT(*) AS points, MIN(at) AS since
  FROM prices GROUP BY deal_id
`);

// Lo que llegó en la primera consulta ya estaba ahí antes de que empezáramos a
// guardar: no es "nuevo". Margen de 10 min por si esa consulta tardó.
const BASELINE_MARGIN_MS = 10 * 60 * 1000;

// La fecha de arranque se fija una sola vez (si se calculara con el registro más
// viejo, cualquier dato raro movería la referencia y todo parecería nuevo).
function trackingStartedAt() {
  const saved = db.prepare("SELECT value FROM meta WHERE key = 'tracking_started_at'").get();
  const earliest = db.prepare('SELECT MIN(at) AS at FROM prices').get().at;
  // Arrancar sin datos (o con demo) no inicia el seguimiento real.
  if (earliest == null) return null;
  const start = saved ? Math.max(Number(saved.value), earliest) : earliest;
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('tracking_started_at', ?)").run(String(start));
  return start;
}
let TRACKING_STARTED_AT = trackingStartedAt();

let summaryCache = null;

// Guarda el precio de cada oferta de una consulta a ML.
function record(deals, at = Date.now()) {
  let inserted = 0;
  db.transaction(() => {
    for (const deal of deals) {
      const last = lastStmt.get(deal.id);
      if (!last || last.price !== deal.currentPrice || at - last.at >= KEEPALIVE_MS) {
        insertStmt.run(deal.id, deal.currentPrice, deal.originalPrice ?? null, at);
        inserted++;
      }
    }
  });
  if (inserted && TRACKING_STARTED_AT == null) TRACKING_STARTED_AT = trackingStartedAt();
  summaryCache = null;
  return inserted;
}

function series(dealId, days = 90) {
  return seriesStmt.all(dealId, Date.now() - days * DAY);
}

// { [dealId]: { min, max, points, since } } de todas las ofertas, en una consulta.
function summaries() {
  if (!summaryCache) {
    summaryCache = new Map(summaryStmt.all().map((row) => [row.deal_id, row]));
  }
  return summaryCache;
}

function summaryOf(dealId) {
  return summaries().get(dealId) || null;
}

/**
 * Cuándo apareció la oferta por primera vez, o null si ya estaba desde el
 * principio. Con esto el plan Gratis ve las nuevas 2 h tarde y Plus al instante.
 */
function firstSeen(dealId) {
  const s = summaryOf(dealId);
  if (!s) return Date.now(); // todavía no se guarda: es de esta misma consulta
  return TRACKING_STARTED_AT != null && s.since - TRACKING_STARTED_AT > BASELINE_MARGIN_MS ? s.since : null;
}

// Lo que el historial dice de una oferta, en palabras (para la tienda y el panel).
function verdict(deal) {
  const s = summaryOf(deal.id);
  if (!s || s.points < 2) return { days: 0, lowest: false, inflated: false };
  const days = Math.floor((Date.now() - s.since) / DAY);
  const lowest = deal.currentPrice <= s.min;
  // El vendedor dice que antes costaba X, pero en una semana o más nunca lo vimos ni cerca.
  const inflated = days >= MIN_DAYS_TO_JUDGE && deal.originalPrice > s.max * 1.1;
  return { days, lowest, inflated, maxSeen: s.max, minSeen: s.min };
}

module.exports = { record, series, summaries, summaryOf, verdict, firstSeen };
