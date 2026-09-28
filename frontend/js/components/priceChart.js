import { formatPriceMXN } from "../utils/format.js";

const WIDTH = 640;
const HEIGHT = 220;
const PAD_X = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

/**
 * Gráfico de historial de precio en SVG puro (sin librería de charts).
 * @param {Array<{day:number, price:number}>} points
 * @param {{ min: number, max: number, currentPrice: number }} range
 */
export function renderPriceChart(points, { min, max, currentPrice }) {
  const plotWidth = WIDTH - PAD_X * 2;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const lastDay = points[points.length - 1].day;

  const x = (day) => PAD_X + (day / lastDay) * plotWidth;
  const y = (price) => PAD_TOP + (1 - (price - min) / Math.max(max - min, 1)) * plotHeight;

  const linePoints = points.map((p) => `${x(p.day).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const areaPath = `M${x(0).toFixed(1)},${(PAD_TOP + plotHeight).toFixed(1)} L${linePoints} L${x(
    lastDay
  ).toFixed(1)},${(PAD_TOP + plotHeight).toFixed(1)} Z`;

  const lastPoint = points[points.length - 1];
  const minPoint = points.reduce((a, b) => (b.price < a.price ? b : a));

  return `
    <svg
      class="price-chart__svg"
      viewBox="0 0 ${WIDTH} ${HEIGHT}"
      role="img"
      aria-label="Historial de precio de los últimos 90 días, desde ${formatPriceMXN(
        max
      )} hasta el precio actual de ${formatPriceMXN(currentPrice)}"
      preserveAspectRatio="none"
    >
      <line x1="${PAD_X}" y1="${(PAD_TOP + plotHeight).toFixed(1)}" x2="${WIDTH - PAD_X}" y2="${(
    PAD_TOP + plotHeight
  ).toFixed(1)}" class="price-chart__axis" />

      <path d="${areaPath}" class="price-chart__area" />
      <polyline points="${linePoints}" class="price-chart__line" />

      <circle cx="${x(minPoint.day).toFixed(1)}" cy="${y(minPoint.price).toFixed(1)}" r="4" class="price-chart__dot price-chart__dot--min" />
      <circle cx="${x(lastPoint.day).toFixed(1)}" cy="${y(lastPoint.price).toFixed(1)}" r="5" class="price-chart__dot price-chart__dot--now" />

      <text x="${PAD_X}" y="${HEIGHT - 8}" class="price-chart__label">hace 90 días</text>
      <text x="${WIDTH - PAD_X}" y="${HEIGHT - 8}" text-anchor="end" class="price-chart__label">hoy</text>
    </svg>
  `;
}
