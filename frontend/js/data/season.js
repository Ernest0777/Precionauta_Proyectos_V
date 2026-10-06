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

/** @returns {{ phase: "before" | "live" | "after", ms: number }} */
export function getSeasonStatus(now = Date.now()) {
  const start = new Date(SEASON.start).getTime();
  const end = new Date(SEASON.end).getTime();
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
