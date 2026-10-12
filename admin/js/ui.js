// Utilidades compartidas: formato, animaciones de números y avisos.

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const mxnCents = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });

// Precio exacto: con centavos solo si los tiene (124.89 -> $124.89, 1559 -> $1,559).
export const money = (n) => {
  const cents = Math.round((n || 0) * 100);
  return cents % 100 === 0 ? mxn.format(cents / 100) : mxnCents.format(cents / 100);
};
// Precio grande: "$" y centavos pequeños y alzados, como en la tienda.
export const moneyHTML = (n) => {
  const [whole, cents] = money(n).replace("$", "").split(".");
  return `<span class="price-cur" aria-hidden="true">$</span>${whole}${cents ? `<span class="sr-only">.</span><span class="price-cents">${cents}</span>` : ""}`;
};
export const moneyCompact = (n) => `$${compact.format(n || 0)}`;
export const pct = (n, digits = 0) => `${(n || 0).toFixed(digits)}%`;
export const int = (n) => Math.round(n || 0).toLocaleString("es-MX");

export const STATUS = {
  review: { label: "Por revisar", hint: "Sigue visible hasta que alguien decida" },
  published: { label: "Publicada", hint: "Visible en la tienda" },
  featured: { label: "Destacada", hint: "Visible y primero en la tienda" },
  rejected: { label: "Rechazada", hint: "Oculta en la tienda" },
};
export const STATUS_ORDER = ["review", "published", "featured", "rejected"];

const CATEGORY_NAMES = {
  tecnologia: "Tecnología",
  hogar: "Hogar",
  moda: "Moda",
  deportes: "Deportes",
  juguetes: "Juguetes",
  autos: "Autos",
  supermercado: "Supermercado",
  busqueda: "Búsqueda",
};
export const categoryName = (slug) => CATEGORY_NAMES[slug] || slug || "Sin categoría";

const SOURCE_NAMES = {
  mercadolibre: "Mercado Libre en vivo",
  disk: "Última consulta guardada",
  demo: "Datos de demostración",
};
export const sourceName = (s) => SOURCE_NAMES[s] || "Sin datos";

export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function timeAgo(date) {
  if (!date) return "nunca";
  const s = Math.max(0, Math.round((Date.now() - new Date(date)) / 1000));
  if (s < 60) return "hace unos segundos";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

export function thumb(deal, className = "thumb") {
  if (deal.thumbnail) {
    return `<img class="${className}" src="${escapeHtml(deal.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`;
  }
  return `<span class="${className} thumb--empty" aria-hidden="true">${escapeHtml((deal.title || "?")[0])}</span>`;
}

export function riskMeter(risk) {
  const high = risk.score >= 50;
  return `<span class="risk ${high ? "risk--high" : ""}" title="Riesgo ${risk.score}/100">
    <span class="risk__bar"><span style="width:${risk.score}%"></span></span>${risk.score}
  </span>`;
}

// Sube un número de su valor anterior al nuevo (estilo contador de CRM).
export function countUp(el, to, format = int, duration = 900) {
  const from = Number(el.dataset.value || 0);
  el.dataset.value = to;
  if (reducedMotion() || from === to) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    // Enteros mientras sube (sin centavos parpadeando); el último cuadro es exacto.
    el.textContent = format(t < 1 ? Math.round(from + (to - from) * ease(t)) : to);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function runCounters(root) {
  root.querySelectorAll("[data-count]").forEach((el) => {
    const fmt = { money, moneyCompact, int, pct: (n) => pct(n, 1), pct0: (n) => pct(n) }[el.dataset.format || "int"];
    countUp(el, Number(el.dataset.count), fmt);
  });
}

// Barras: primero en 0 y en el siguiente frame a su ancho/alto, para que animen.
export function growBars(root) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      root.querySelectorAll("[data-width]").forEach((el) => (el.style.width = el.dataset.width));
      root.querySelectorAll("[data-height]").forEach((el) => (el.style.height = el.dataset.height));
    })
  );
}

export function announce(text) {
  const el = document.getElementById("announcer");
  el.textContent = "";
  setTimeout(() => (el.textContent = text), 50);
}

let toastTimer;
export function toast(text, action) {
  const el = document.getElementById("toast");
  clearTimeout(toastTimer);
  el.innerHTML = `<span>${escapeHtml(text)}</span>`;
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      el.hidden = true;
      action.run();
    });
    el.append(btn);
  }
  el.hidden = false;
  toastTimer = setTimeout(() => (el.hidden = true), action ? 6000 : 3200);
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}
