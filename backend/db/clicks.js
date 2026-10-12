const db = require('./database');
const config = require('../config/config');

const insertStmt = db.prepare('INSERT INTO clicks (deal_id, title, category, source, at) VALUES (?, ?, ?, ?, ?)');
const sinceStmt = db.prepare('SELECT deal_id, title, category, source, at FROM clicks WHERE at >= ? ORDER BY at');
const countSinceStmt = db.prepare('SELECT COUNT(*) AS n FROM clicks WHERE at >= ?');

function record(deal, source) {
  insertStmt.run(deal.id, deal.title, deal.category, source || null, Date.now());
}

function since(ms) {
  return sinceStmt.all(ms);
}

function countSince(ms) {
  return countSinceStmt.get(ms).n;
}

/**
 * Enlace a la tienda con nuestros parámetros de afiliado. Mercado Libre da
 * los parámetros al aprobar la cuenta de afiliados; van en MELI_AFFILIATE_PARAMS
 * (backend/.env). Sin ellos, el enlace va directo a la publicación.
 */
function affiliateUrl(permalink) {
  const params = config.affiliate.meliParams;
  if (!params) return permalink;
  const url = new URL(permalink);
  new URLSearchParams(params).forEach((value, key) => url.searchParams.set(key, value));
  return url.toString();
}

module.exports = { record, since, countSince, affiliateUrl };
