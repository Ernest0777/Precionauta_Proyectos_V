const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const source = await readFile(path.join(__dirname, '../frontend/js/data/season.js'), 'utf8');
  const { SEASONS, SEASON, getSeason, getSeasonStatus, splitDuration, selectSeasonProducts, partitionSeasonProducts } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(new Set(SEASONS.map((s) => s.slug)).size, SEASONS.length);
  assert.equal(getSeason('unknown').slug, SEASON.slug);
  assert.equal(getSeason('hot-sale').name, 'Hot Sale');
  for (const season of SEASONS.filter((s) => !s.start)) {
    assert.equal(getSeasonStatus(Date.now(), season).phase, 'unannounced');
    assert.match(season.note, /orientativ/);
  }
  assert.equal(getSeasonStatus(Date.parse(SEASON.start) - 1).phase, 'before');
  assert.equal(getSeasonStatus(Date.parse(SEASON.start)).phase, 'live');
  assert.equal(getSeasonStatus(Date.parse(SEASON.end) + 1).phase, 'after');
  assert.equal(SEASON.estimated, true);
  assert.deepEqual(splitDuration(90_060_000), { days: 1, hours: 1, minutes: 1 });
  const products = Array.from({ length: 8 }, (_, id) => ({ id: `p${id}`, currentPrice: 90, historicMinPrice: id % 2 ? 80 : 100 }));
  const input = [products[0], products[0], { id: 'locked', locked: true }, ...products.slice(1)];
  for (const options of [{}, { plus: false }, { plus: true, demo: true }]) {
    const selected = selectSeasonProducts(input, options);
    const { atMin, other } = partitionSeasonProducts(selected);
    assert.equal(selected.length, 3, 'Cupo total por evento');
    assert.equal(atMin.length + other.length, 3, 'No se multiplica por sección');
    assert.equal(new Set([...atMin, ...other].map((p) => p.id)).size, 3);
  }
  assert.equal(selectSeasonProducts(input, { plus: true }).length, 8);
  assert.equal(partitionSeasonProducts([{ id: 'no-history', currentPrice: 0, historicMinPrice: null }]).atMin.length, 0);
  console.log('season.test.js: calendario, fechas y límite por evento OK');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
