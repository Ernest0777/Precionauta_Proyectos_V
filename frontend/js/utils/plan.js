/**
 * Reglas de cada plan, en un solo lugar.
 *
 * Gratis ve las ofertas nuevas 2 h después de que aparecen; Plus las ve en
 * tiempo real. Vive aparte de shared.js porque data/products.js lo necesita
 * al cargar (shared.js importa products.js, y al revés sería un ciclo).
 *
 * Ojo: hoy el plan se guarda solo en este navegador (checkout de demostración).
 * La restricción real llega con Stripe + inicio de sesión: el backend tendrá
 * que decidir qué ofertas manda según la cuenta.
 */
export const PLAN_STORAGE_KEY = "precionauta:plan";

/** Retraso con el que Gratis ve una oferta nueva. */
export const FREE_DELAY_MS = 2 * 60 * 60 * 1000;

/** Días de historial de precio que muestra Detalle. */
export const HISTORY_DAYS = { free: 30, plus: 365 };

export function currentPlanId() {
  try {
    const plan = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY));
    return plan?.id === "plus" ? "plus" : "free";
  } catch {
    return "free";
  }
}

/** "1 h 48 min" / "12 min" hasta que una oferta se libera para Gratis. */
export function formatWait(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** "hace 12 min" / "hace 1 h 5 min" desde que la vimos por primera vez. */
export function formatAge(ms) {
  return `hace ${formatWait(ms)}`;
}
