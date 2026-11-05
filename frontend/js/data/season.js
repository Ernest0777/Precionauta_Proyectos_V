/**
 * Temporada de ofertas destacada (barra superior + temporada.html).
 * Las fechas oficiales del Buen Fin se anuncian cada año; mientras no se
 * confirmen, `estimated: true` hace que la interfaz diga "fecha estimada".
 */
export const SEASON = {
  slug: "buen-fin-2026",
  name: "Buen Fin 2026",
  start: "2026-11-13T00:00:00-06:00",
  end: "2026-11-16T23:59:59-06:00",
  estimated: true,
};

/** Períodos orientativos: no equivalen a fechas oficiales anunciadas. */
export const SEASONS = [
  { ...SEASON, period: "Noviembre", note: "Fechas estimadas; pendientes de confirmación oficial.", lead: "Prepara tus compras comparando el precio actual con los registros previos." },
  { slug: "hot-sale", name: "Hot Sale", period: "Mayo – junio", note: "Período orientativo. Fechas no anunciadas en este calendario.", lead: "Compara ofertas en línea y revisa el historial antes de decidir." },
  { slug: "prime-day", name: "Prime Day", period: "Julio", note: "Período orientativo. Fechas no anunciadas en este calendario.", lead: "Revisa los requisitos de membresía y el precio final en la tienda." },
  { slug: "black-friday", name: "Black Friday", period: "Noviembre", note: "Período orientativo. Fechas no anunciadas en este calendario.", lead: "Contrasta las rebajas anunciadas con los precios que hemos registrado." },
  { slug: "cyber-monday", name: "Cyber Monday", period: "Noviembre – diciembre", note: "Período orientativo. Fechas no anunciadas en este calendario.", lead: "Compara precios y costos de envío en las ofertas en línea." },
  { slug: "navidad", name: "Navidad", period: "Diciembre", note: "Temporada orientativa; cada tienda define sus promociones.", lead: "Planea regalos con tiempo y revisa las condiciones de entrega y devolución." },
  { slug: "liquidaciones-enero", name: "Liquidaciones de enero", period: "Enero", note: "Temporada orientativa; cada tienda define sus promociones.", lead: "Revisa si las liquidaciones representan una baja frente a los precios registrados." },
];

export function getSeason(slug) {
  return SEASONS.find((season) => season.slug === slug) ?? SEASONS[0];
}

/** @returns {{ phase: "before" | "live" | "after" | "unannounced", ms: number }} */
export function getSeasonStatus(now = Date.now(), season = SEASON) {
  const start = new Date(season.start).getTime();
  const end = new Date(season.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { phase: "unannounced", ms: 0 };
  if (now < start) return { phase: "before", ms: start - now };
  if (now <= end) return { phase: "live", ms: end - now };
  return { phase: "after", ms: 0 };
}

export function splitDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  };
}

/** Un único cupo por evento, compartido entre todas sus secciones. */
export function selectSeasonProducts(products, { plus = false, demo = false } = {}) {
  const seen = new Set();
  const unique = products.filter((product) => {
    if (!product || product.locked || !product.id || seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
  return plus && !demo ? unique : unique.slice(0, 3);
}

export function partitionSeasonProducts(products) {
  const atMin = products.filter((product) => Number.isFinite(product.historicMinPrice) && product.currentPrice <= product.historicMinPrice);
  const ids = new Set(atMin.map((product) => product.id));
  return { atMin, other: products.filter((product) => !ids.has(product.id)) };
}
