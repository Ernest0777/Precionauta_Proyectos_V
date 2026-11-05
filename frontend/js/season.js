/** Temporadas: calendario editorial, acceso por cuenta y ofertas por evento. */
import { PRODUCTS, API_BASE, normalizeDeal } from "./data/products.js";
import { accountReady, accountState } from "./utils/account.js";
import { CATEGORIES } from "./data/categories.js";
import { SEASONS, getSeason, getSeasonStatus, splitDuration, selectSeasonProducts, partitionSeasonProducts } from "./data/season.js";
import { renderProductCard } from "./components/productCard.js";
import { bindHeaderMenus } from "./components/headerMenus.js";
import { discountOf } from "./utils/catalogStats.js";
import { icon } from "./utils/icons.js";
import {
  loadSavedIds,
  loadAlertIds,
  bindCardActions,
  renderSavingsSummary,
  bindHeaderScrollShadow,
  bindMobileMenu,
  bindThemeToggle,
  bindAuthModal,
  observeReveal,
} from "./shared.js";

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.label]));
const SEASON = getSeason(new URLSearchParams(location.search).get("temporada"));
const CHECKLIST_KEY = `precionauta:checklist:${SEASON.slug}`;

const CHECKLIST = [
  { id: "historial", title: "Revisa el historial de precio", body: "Si el precio subió las semanas previas, el «descuento» puede ser inflado. En cada oferta verás su mínimo y máximo." },
  { id: "alertas", title: "Activa alertas desde ahora", body: "Guarda tus productos y activa la campana para seguir sus cambios de precio durante la temporada." },
  { id: "comparar", title: "Compara entre tiendas", body: "El mismo producto puede estar más barato en Amazon, Mercado Libre o Liverpool." },
  { id: "msi", title: "Meses sin intereses con calma", body: "Suma lo que ya pagas al mes antes de agregar otro plazo. La calculadora de cada oferta te da el monto mensual." },
  { id: "envio", title: "Cuenta el envío y la devolución", body: "Un precio bajo con envío caro o sin devolución puede salir más caro." },
  { id: "vendedor", title: "Revisa al vendedor", body: "En marketplaces, verifica calificación y que sea vendedor oficial o con buen historial." },
];

function renderGrid(el, products) {
  if (!el) return;
  const saved = loadSavedIds();
  const alerts = loadAlertIds();
  el.innerHTML = products.length ? products
    .map((p) =>
      renderProductCard(p, CATEGORY_LABEL[p.categorySlug], { saved: saved.has(p.id), alerted: alerts.has(p.id) })
    )
    .join("") : '<p class="season-empty">Sin ofertas en esta sección por ahora.</p>';
  observeReveal(el, ".product-card");
}

function renderCountdown() {
  const status = getSeasonStatus(Date.now(), SEASON);
  const label = document.getElementById("countdownLabel");
  const note = document.getElementById("countdownNote");
  const grid = document.querySelector(".countdown__grid");
  grid.hidden = status.phase === "unannounced" || status.phase === "after";
  const { days, hours, minutes } = splitDuration(status.ms);

  const values = { days, hours, minutes };
  document.querySelectorAll("[data-unit]").forEach((el) => {
    el.textContent = String(values[el.dataset.unit]).padStart(2, "0");
  });

  const start = new Date(SEASON.start);
  const end = new Date(SEASON.end);
  const fmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" });
  if (status.phase === "unannounced") {
    label.textContent = "Fechas no anunciadas";
    note.textContent = `${SEASON.period} · ${SEASON.note}`;
  } else if (status.phase === "before") {
    label.textContent = SEASON.estimated ? "Cuenta regresiva estimada" : "Faltan";
    note.textContent = `Del ${fmt.format(start)} al ${fmt.format(end)}${SEASON.estimated ? " · fecha estimada, se confirma cada año" : ""}`;
  } else if (status.phase === "live") {
    label.textContent = SEASON.estimated ? "Período estimado · termina en" : "¡Ya empezó! Termina en";
    note.textContent = `Hasta el ${fmt.format(end)}${SEASON.estimated ? " · fecha estimada, no confirmada" : ""}`;
  } else {
    label.textContent = "Terminó";
    note.textContent = SEASON.estimated ? "El período estimado terminó; consulta las fechas oficiales del evento." : "El evento terminó. Revisa la vigencia de cada oferta en la tienda.";
  }
}

function loadChecklist() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHECKLIST_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function renderChecklist() {
  const list = document.getElementById("checklist");
  if (!list) return;
  const done = loadChecklist();
  list.innerHTML = CHECKLIST.map(
    (item) => `
      <li>
        <label class="check-item">
          <input type="checkbox" value="${item.id}" ${done.has(item.id) ? "checked" : ""} />
          <span class="check-item__box" aria-hidden="true">${icon("checkCircle", { size: 18 })}</span>
          <span class="check-item__text"><strong>${item.title}</strong><span>${item.body}</span></span>
        </label>
      </li>`
  ).join("");

  list.addEventListener("change", () => {
    const ids = [...list.querySelectorAll("input:checked")].map((i) => i.value);
    try {
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(ids));
    } catch {
      /* no se guarda, pero sigue marcado en pantalla */
    }
  });
}

function renderCalendar() {
  const el = document.getElementById("seasonCalendar");
  if (!el) return;
  el.innerHTML = SEASONS.map(
    (c) => `
      <li class="season-calendar__item ${c.slug === SEASON.slug ? "is-current" : ""}">
        <span class="season-calendar__month">${icon("calendar", { size: 15 })} ${c.period}</span>
        <strong><a href="temporada.html?temporada=${encodeURIComponent(c.slug)}" ${c.slug === SEASON.slug ? 'aria-current="page"' : ""}>${c.name}</a></strong>
        <span>${c.note}</span>
      </li>`
  ).join("");
}

let seasonRequest = 0;
async function loadSeasonOffers() {
  const request = ++seasonRequest;
  await accountReady;
  const plus = accountState().access.level === "plus";
  const status = document.getElementById("seasonAccess");
  status.textContent = "Cargando ofertas de la temporada…";
  document.getElementById("minGrid").innerHTML = "";
  document.getElementById("strongGrid").innerHTML = "";
  let products = [];
  let demo = false;
  try {
    const res = await fetch(`${API_BASE}/deals?season=${encodeURIComponent(SEASON.slug)}`, { credentials: "include", signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error("season-unavailable");
    const payload = await res.json();
    if (!Array.isArray(payload.data)) throw new Error("season-invalid");
    products = payload.data.filter((row) => !row.locked).map((row, index) => normalizeDeal(row, index));
  } catch {
    // La muestra local nunca concede acceso Plus ni representa ofertas del evento.
    demo = true;
    products = PRODUCTS.filter((product) => !product.live);
  }
  if (request !== seasonRequest) return;
  products.sort((a, b) => discountOf(b) - discountOf(a));
  const selected = selectSeasonProducts(products, { plus, demo });
  const sections = partitionSeasonProducts(selected);
  renderGrid(document.getElementById("minGrid"), sections.atMin);
  renderGrid(document.getElementById("strongGrid"), sections.other);
  status.textContent = demo
    ? "Sin conexión al servicio de temporadas. Muestra de hasta 3 productos de demostración; no son ofertas confirmadas de este evento."
    : plus ? `${selected.length} ofertas del catálogo actual para comparar · Acceso Plus. No representan promociones oficiales de este evento.`
      : `Vista de hasta 3 ofertas por temporada (${selected.length} disponibles) del catálogo actual. No representan promociones oficiales del evento. Plus permite ver el catálogo completo.`;
  const upgrade = document.getElementById("seasonUpgrade");
  if (upgrade) upgrade.hidden = plus && !demo;
}

document.title = `${SEASON.name} · Temporadas - Precionauta`;
document.getElementById("seasonTitle").textContent = SEASON.name;
document.getElementById("seasonLead").textContent = SEASON.lead;
const selector = document.getElementById("seasonSelect");
selector.innerHTML = SEASONS.map((season) => `<option value="${season.slug}" ${season.slug === SEASON.slug ? "selected" : ""}>${season.name}</option>`).join("");
selector.addEventListener("change", () => {
  const url = new URL(location.href);
  url.searchParams.set("temporada", selector.value);
  location.assign(url);
});

const yearEl = document.getElementById("footerYear");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

renderCountdown();
setInterval(renderCountdown, 30_000);
loadSeasonOffers();
document.addEventListener("account-changed", loadSeasonOffers);
renderChecklist();
renderCalendar();
renderSavingsSummary(loadSavedIds());
bindHeaderMenus();
bindHeaderScrollShadow();
bindMobileMenu();
bindThemeToggle();
bindAuthModal();
bindCardActions(document.getElementById("minGrid"));
bindCardActions(document.getElementById("strongGrid"));
