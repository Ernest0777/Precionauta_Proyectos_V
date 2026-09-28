/**
 * Genera una serie de precios de los últimos 90 días para el gráfico de
 * historial de Detalle. No hay datos reales todavía (ver PRODUCT.md), así
 * que la serie es un modelo determinista: mismo producto -> misma curva en
 * cada carga (semilla = su id), no un random distinto cada vez. Empieza
 * cerca de `historicMaxPrice`, atraviesa `historicMinPrice` en algún punto,
 * y siempre termina exactamente en `currentPrice` - el resto es relleno
 * visual, nunca un dato que la página presente como medido.
 */

const DAYS = 90;

/** PRNG determinista simple (mulberry32), sembrado con un string. */
export function seededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * @param {{ id: string, previousPrice: number, currentPrice: number, historicMinPrice: number, historicMaxPrice: number }} product
 * @returns {Array<{ day: number, price: number }>} 90 puntos, day 0 = hace 90 días, day 89 = hoy
 */
export function generatePriceHistory(product) {
  const rand = seededRandom(product.id);
  const { historicMinPrice: min, historicMaxPrice: max, previousPrice, currentPrice } = product;

  const dipDay = Math.floor(DAYS * (0.55 + rand() * 0.25)); // el mínimo histórico ocurre entre el 55% y el 80% de la serie
  const points = [];

  for (let day = 0; day < DAYS; day++) {
    let base;
    if (day < dipDay) {
      // De historicMax a previousPrice, con una pequeña ondulación.
      const t = day / Math.max(dipDay - 1, 1);
      base = max - (max - previousPrice) * t;
    } else if (day === dipDay) {
      base = min;
    } else {
      // Del mínimo histórico al precio actual (la caída que detectamos hoy).
      const t = (day - dipDay) / Math.max(DAYS - 1 - dipDay, 1);
      base = min + (currentPrice - min) * t;
    }

    const noise = (rand() - 0.5) * (max - min) * 0.03;
    const price = Math.round(Math.min(max, Math.max(min, base + noise)));
    points.push({ day, price });
  }

  points[points.length - 1] = { day: DAYS - 1, price: currentPrice };
  return points;
}
