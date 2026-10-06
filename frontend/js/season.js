/** temporada.html - Buen Fin: cuenta regresiva, mínimos históricos, +50%, guía y calendario. */
import { PRODUCTS } from "./data/products.js";
import { CATEGORIES } from "./data/categories.js";
import { SEASON, getSeasonStatus, splitDuration } from "./data/season.js";
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
const CHECKLIST_KEY = `precionauta:checklist:${SEASON.slug}`;

const CHECKLIST = [
  { id: "historial", title: "Revisa el historial de precio", body: "Si el precio subió las semanas previas, el «descuento» puede ser inflado. En cada oferta verás su mínimo y máximo." },
  { id: "alertas", title: "Activa alertas desde ahora", body: "Con la campana te avisamos de cada producto; así comparas el precio del Buen Fin contra el de hoy." },
  { id: "comparar", title: "Compara entre tiendas", body: "El mismo producto puede estar más barato en Amazon, Mercado Libre o Liverpool." },
  { id: "msi", title: "Meses sin intereses con calma", body: "Suma lo que ya pagas al mes antes de agregar otro plazo. La calculadora de cada oferta te da el monto mensual." },
  { id: "envio", title: "Cuenta el envío y la devolución", body: "Un precio bajo con envío caro o sin devolución puede salir más caro." },
  { id: "vendedor", title: "Revisa al vendedor", body: "En marketplaces, verifica calificación y que sea vendedor oficial o con buen historial." },
];

const CALENDAR = [
  { month: "Enero", name: "Cuesta de enero y liquidaciones", note: "Ropa de temporada y electrónica que no se vendió en diciembre." },
  { month: "Mayo – junio", name: "Hot Sale", note: "Venta en línea organizada por la AMVO, sobre todo tecnología y moda." },
  { month: "Julio", name: "Prime Day", note: "Ofertas de Amazon para miembros Prime; otras tiendas suelen responder." },
  { month: "Noviembre", name: "Buen Fin", note: "El fin de semana largo de descuentos en tiendas físicas y en línea." },
  { month: "Noviembre", name: "Black Friday y Cyber Monday", note: "Cada vez más tiendas mexicanas se suman tras el Buen Fin." },
  { month: "Diciembre", name: "Navidad", note: "Juguetes y regalos; conviene comprar antes de la segunda quincena." },
];

function renderGrid(el, products) {
  if (!el) return;
  const saved = loadSavedIds();
  const alerts = loadAlertIds();
  el.innerHTML = products
    .map((p) =>
      renderProductCard(p, CATEGORY_LABEL[p.categorySlug], { saved: saved.has(p.id), alerted: alerts.has(p.id) })
    )
    .join("");
  observeReveal(el, ".product-card");
  bindCardActions(el);
}

function renderCountdown() {
  const status = getSeasonStatus();
  const label = document.getElementById("countdownLabel");
  const note = document.getElementById("countdownNote");
  const lead = document.getElementById("seasonLead");
  const { days, hours, minutes } = splitDuration(status.ms);

  const values = { days, hours, minutes };
  document.querySelectorAll("[data-unit]").forEach((el) => {
    el.textContent = String(values[el.dataset.unit]).padStart(2, "0");
  });

  const start = new Date(SEASON.start);
  const end = new Date(SEASON.end);
  const fmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" });
  if (status.phase === "before") {
    label.textContent = "Faltan";
    note.textContent = `Del ${fmt.format(start)} al ${fmt.format(end)}${SEASON.estimated ? " · fecha estimada, se confirma cada año" : ""}`;
  } else if (status.phase === "live") {
    label.textContent = "¡Ya empezó! Termina en";
    note.textContent = `Hasta el ${fmt.format(end)}`;
  } else {
    label.textContent = "Terminó";
    note.textContent = "Las ofertas de abajo siguen vigentes; vuelve el próximo año.";
    lead.textContent = "El Buen Fin terminó, pero seguimos verificando ofertas cada 4 horas.";
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
  el.innerHTML = CALENDAR.map(
    (c) => `
      <li class="season-calendar__item ${c.name === "Buen Fin" ? "is-current" : ""}">
        <span class="season-calendar__month">${icon("calendar", { size: 15 })} ${c.month}</span>
        <strong>${c.name}</strong>
        <span>${c.note}</span>
      </li>`
  ).join("");
}

const atMin = PRODUCTS.filter((p) => p.currentPrice <= p.historicMinPrice).sort((a, b) => discountOf(b) - discountOf(a));
const strong = PRODUCTS.filter((p) => discountOf(p) >= 50 && !atMin.slice(0, 8).includes(p)).sort((a, b) => discountOf(b) - discountOf(a));

const yearEl = document.getElementById("footerYear");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

renderCountdown();
setInterval(renderCountdown, 30_000);
renderGrid(document.getElementById("minGrid"), atMin.slice(0, 8));
renderGrid(document.getElementById("strongGrid"), strong.slice(0, 8));
renderChecklist();
renderCalendar();
renderSavingsSummary(loadSavedIds());
bindHeaderMenus();
bindHeaderScrollShadow();
bindMobileMenu();
bindThemeToggle();
bindAuthModal();
