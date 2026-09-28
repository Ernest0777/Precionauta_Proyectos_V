/**
 * Formatting and pricing math shared by every card and section.
 * Kept framework-free so it maps 1:1 onto a future React/Vite port.
 */

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

/** Formats a number as Mexican pesos, e.g. 1559 -> "$1,559". */
export function formatPriceMXN(amount) {
  return mxn.format(amount);
}

/**
 * Calcula el porcentaje de descuento entre el precio anterior y el actual.
 * Redondeado al entero mas cercano, como se muestra en la insignia de la tarjeta.
 * @param {number} previousPrice
 * @param {number} currentPrice
 * @returns {number} entero entre 0 y 100
 */
export function calculateDiscountPercent(previousPrice, currentPrice) {
  if (!previousPrice || previousPrice <= currentPrice) return 0;
  const ratio = (previousPrice - currentPrice) / previousPrice;
  return Math.round(ratio * 100);
}

/** Ahorro absoluto en pesos entre el precio anterior y el actual. */
export function calculateSavings(previousPrice, currentPrice) {
  return Math.max(previousPrice - currentPrice, 0);
}

/** "hace 2 h" / "hace 45 min" a partir de una fecha ISO. */
export function formatRelativeUpdated(isoTimestamp, now = new Date()) {
  const then = new Date(isoTimestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.max(Math.round(diffMs / 60000), 0);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.round(diffMin / 60);
  return `hace ${diffHours} h`;
}

const timeFormatter = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
});

/** "hoy a las 14:32", usado en la franja de confianza. */
export function formatCheckedAtLabel(now = new Date()) {
  return `hoy a las ${timeFormatter.format(now)}`;
}

/** Pluraliza una palabra simple en espanol dado un conteo. */
export function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

/** "Verificado hace 1 hora" / "hace 4 horas", a partir de un conteo entero de horas. */
export function formatHoursAgoLabel(hours) {
  if (!hours || hours <= 0) return "hace instantes";
  return `hace ${hours} ${pluralize(hours, "hora", "horas")}`;
}
