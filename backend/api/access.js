const priceHistory = require('../db/price-history');

const SEASONS = new Set(['buen-fin-2026', 'hot-sale', 'prime-day', 'black-friday', 'cyber-monday', 'navidad', 'liquidaciones-enero']);

function isLocked(deal, access) {
  if (deal.source === 'demo') return false;
  const since = priceHistory.firstSeen(deal.id);
  return Boolean(access.delayMs && since != null && Date.now() - since < access.delayMs);
}

function publicDeal(deal, access) {
  const seen = deal.source === 'demo' ? null : priceHistory.firstSeen(deal.id);
  const firstSeenAt = seen == null ? null : new Date(seen).toISOString();
  if (isLocked(deal, access)) {
    return { id: deal.id, category: deal.category, locked: true, firstSeenAt, availableAt: new Date(seen + access.delayMs).toISOString() };
  }
  // El resumen se calcula con la misma ventana que la serie; nunca revela precios antiguos de Plus.
  const points = access.historyDays ? priceHistory.series(deal.id, access.historyDays) : [];
  const history = points.length ? {
    min: Math.min(...points.map(p => p.price)), max: Math.max(...points.map(p => p.price)), points: points.length,
    since: new Date(points[0].at), days: Math.min(access.historyDays, Math.floor((Date.now() - points[0].at) / 86400000)),
    lowest: deal.currentPrice <= Math.min(...points.map(p => p.price)),
  } : null;
  return { ...deal, locked: false, firstSeenAt, history };
}

module.exports = { SEASONS, isLocked, publicDeal };
