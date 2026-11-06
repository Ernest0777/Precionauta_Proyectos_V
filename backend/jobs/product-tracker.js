const tracked = require('../db/tracked-products');
const history = require('../db/price-history');
const fetcher = require('../api/deal-fetcher');

const BATCH_SIZE = 60;
const CONCURRENCY = 4;
let inFlight = null;

function refresh() {
  if (!inFlight) inFlight = refreshBatch().finally(() => { inFlight = null; });
  return inFlight;
}

async function refreshBatch() {
  const products = tracked.due(BATCH_SIZE);
  const fresh = new Array(products.length);
  let next = 0;
  const worker = async () => {
    while (next < products.length) {
      const index = next++;
      const { id, category } = products[index];
      let deal;
      try {
        deal = await fetcher.buildDeal(id, category);
      } catch {
        tracked.markChecked(id, { status: 'failed' });
        continue;
      }
      if (!deal || deal.id !== id || deal.source !== 'mercadolibre' || !Number.isFinite(deal.currentPrice) || deal.currentPrice <= 0) {
        tracked.markChecked(id);
        continue;
      }
      tracked.remember([deal], { source: 'mercadolibre' });
      fresh[index] = deal;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, products.length) }, worker));
  const observations = fresh.filter(Boolean);
  history.record(observations);
  return observations;
}

// Importing this module never starts timers or provider requests.
module.exports = { refresh };
