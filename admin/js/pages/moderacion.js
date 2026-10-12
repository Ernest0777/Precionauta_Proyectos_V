// Moderación: tablero de ofertas por estado. Se arrastra con el mouse, se mueve
// con Alt + flechas o con el menú "Mover" (táctil y teclado). Las vecinas se
// recorren con animación FLIP y cada movimiento se anuncia al lector de pantalla.

import { loadDeals, moveDeal, onChange, store } from "../store.js";
import { openDeal } from "../drawer.js";
import {
  STATUS,
  STATUS_ORDER,
  categoryName,
  countUp,
  escapeHtml,
  money,
  moneyHTML,
  moneyCompact,
  pct,
  reducedMotion,
  riskMeter,
  thumb,
} from "../ui.js";

const PAGE_SIZE = 30;
const FILTERS = {
  all: { label: "Todas", test: () => true },
  extreme: { label: "90%+", test: (d) => d.discount >= 90 },
  risky: { label: "Riesgo alto", test: (d) => d.risk.score >= 50 },
  unofficial: { label: "Sin tienda oficial", test: (d) => !d.seller?.officialStore },
};

const state = { filter: "all", category: "", query: "", limits: {} };
let root;
let board;
let openMenu = null;

const MENU_ICON = `<svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path d="M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128Zm56-12a12,12,0,1,0,12,12A12,12,0,0,0,196,116ZM60,116a12,12,0,1,0,12,12A12,12,0,0,0,60,116Z"/></svg>`;

export async function renderModeracion(el) {
  root = el;
  if (!root.dataset.ready) {
    root.innerHTML = shell();
    board = root.querySelector(".board");
    bind();
    root.dataset.ready = "1";
  }
  await loadDeals();
  fillCategories();
  draw({ animateCounts: true });
}

function shell() {
  return `
    <div class="page-head" data-reveal style="--i:0">
      <div>
        <p class="eyebrow">Tienda · Ofertas</p>
        <h1 class="page-title">Moderación</h1>
        <p class="page-sub">Arrastra una oferta para cambiar su estado, o usa <span class="kbd">Alt</span> + <span class="kbd">←</span> <span class="kbd">→</span> en una tarjeta enfocada.</p>
      </div>
    </div>

    <div class="toolbar" data-reveal style="--i:1">
      <div class="chips" role="group" aria-label="Filtro rápido">
        ${Object.entries(FILTERS)
          .map(([key, f]) => `<button class="chip" type="button" data-filter="${key}" aria-pressed="${key === state.filter}">${f.label}</button>`)
          .join("")}
      </div>
      <select class="select" data-category aria-label="Categoría"><option value="">Todas las categorías</option></select>
      <input class="search" type="search" placeholder="Buscar oferta o ID" aria-label="Buscar oferta" data-search />
      <span class="toolbar__total tabular" data-total></span>
    </div>

    <div class="board" data-reveal style="--i:2">
      ${STATUS_ORDER.map(
        (s) => `<section class="column" data-column="${s}" aria-labelledby="col-${s}">
          <header class="column__head">
            <h2 class="column__title" id="col-${s}"><span class="status-dot status-dot--${s}"></span>${STATUS[s].label}<span class="column__count tabular" data-col-count>0</span></h2>
            <p class="column__hint"><span class="tabular" data-col-savings>$0</span> de ahorro · ${STATUS[s].hint}</p>
          </header>
          <div class="column__body" data-col-body></div>
        </section>`
      ).join("")}
    </div>
  `;
}

function fillCategories() {
  const select = root.querySelector("[data-category]");
  const slugs = [...new Set(store.deals.map((d) => d.category))].sort();
  const current = select.value;
  select.innerHTML =
    `<option value="">Todas las categorías</option>` +
    slugs.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(categoryName(s))}</option>`).join("");
  select.value = current;
}

function visibleDeals() {
  const q = state.query.trim().toLowerCase();
  return store.deals.filter(
    (d) =>
      FILTERS[state.filter].test(d) &&
      (!state.category || d.category === state.category) &&
      (!q || d.title.toLowerCase().includes(q) || d.id.toLowerCase().includes(q))
  );
}

// "Por revisar" va por riesgo; las demás por descuento.
function sortFor(status) {
  return status === "review"
    ? (a, b) => b.risk.score - a.risk.score || b.discount - a.discount
    : (a, b) => b.discount - a.discount;
}

function card(d) {
  return `<article class="deal-card" draggable="true" tabindex="0" data-id="${escapeHtml(d.id)}"
      aria-label="${escapeHtml(d.title)}, ${pct(d.discount)} de descuento, riesgo ${d.risk.score}. Enter para abrir, Alt más flechas para mover.">
    <div class="deal-card__top">
      ${thumb(d)}
      <div style="min-width:0">
        <p class="deal-card__cat">${escapeHtml(categoryName(d.category))}</p>
        <h3 class="deal-card__title">${escapeHtml(d.title)}</h3>
      </div>
      <button class="icon-btn menu-btn" type="button" data-menu aria-haspopup="menu" aria-label="Mover ${escapeHtml(d.title)}">${MENU_ICON}</button>
    </div>
    <div class="deal-card__prices">
      <span class="price tabular">${moneyHTML(d.currentPrice)}</span>
      <span class="deal-card__old tabular">${money(d.originalPrice)}</span>
      <span class="badge-deal tabular" style="margin-left:auto">−${pct(d.discount)}</span>
    </div>
    <div class="deal-card__foot">
      <span>${d.seller?.officialStore ? "Tienda oficial" : "Vendedor independiente"}</span>
      ${riskMeter(d.risk)}
    </div>
  </article>`;
}

function draw({ animateCounts = false, landed = null } = {}) {
  const deals = visibleDeals();
  root.querySelector("[data-total]").textContent = `${deals.length} de ${store.deals.length} ofertas`;

  STATUS_ORDER.forEach((status) => {
    const col = board.querySelector(`[data-column="${status}"]`);
    const items = deals.filter((d) => d.status === status).sort(sortFor(status));
    const limit = state.limits[status] || PAGE_SIZE;
    const body = col.querySelector("[data-col-body]");

    body.innerHTML = items.length
      ? items.slice(0, limit).map(card).join("") +
        (items.length > limit
          ? `<button class="btn btn--ghost btn--sm column__more" type="button" data-more="${status}">Mostrar ${Math.min(PAGE_SIZE, items.length - limit)} más</button>`
          : "")
      : `<p class="empty">Sin ofertas aquí</p>`;

    const countEl = col.querySelector("[data-col-count]");
    const savingsEl = col.querySelector("[data-col-savings]");
    const savings = items.reduce((sum, d) => sum + (d.savings || 0), 0);
    if (animateCounts || landed) {
      countUp(countEl, items.length, (n) => String(Math.round(n)), 600);
      countUp(savingsEl, savings, moneyCompact, 600);
    } else {
      countEl.textContent = items.length;
      countEl.dataset.value = items.length;
      savingsEl.textContent = moneyCompact(savings);
      savingsEl.dataset.value = savings;
    }
  });

  if (landed) board.querySelector(`.deal-card[data-id="${CSS.escape(landed)}"]`)?.classList.add("is-landed");
}

// FLIP: guarda dónde estaba cada tarjeta, redibuja y anima desde ahí.
function flip(mutate) {
  const before = new Map();
  board.querySelectorAll(".deal-card").forEach((el) => before.set(el.dataset.id, el.getBoundingClientRect()));
  mutate();
  if (reducedMotion()) return;
  board.querySelectorAll(".deal-card").forEach((el) => {
    const prev = before.get(el.dataset.id);
    if (!prev) return;
    const next = el.getBoundingClientRect();
    const dx = prev.left - next.left;
    const dy = prev.top - next.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
      duration: 420,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    });
  });
}

function closeMenu() {
  openMenu?.remove();
  openMenu = null;
}

function showMenu(cardEl) {
  closeMenu();
  const deal = store.deals.find((d) => d.id === cardEl.dataset.id);
  const menu = document.createElement("div");
  menu.className = "move-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML =
    `<p class="move-menu__label">Mover a</p>` +
    STATUS_ORDER.filter((s) => s !== deal.status)
      .map((s) => `<button type="button" role="menuitem" data-move-to="${s}"><span class="status-dot status-dot--${s}"></span>${STATUS[s].label}</button>`)
      .join("") +
    `<button type="button" role="menuitem" data-open-detail>Ver detalle</button>`;
  cardEl.append(menu);
  openMenu = menu;
  menu.querySelector("button").focus();
}

function bind() {
  // Filtros
  root.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-filter]");
    if (chip) {
      state.filter = chip.dataset.filter;
      root.querySelectorAll("[data-filter]").forEach((c) => c.setAttribute("aria-pressed", c === chip));
      flip(() => draw());
      return;
    }
    const more = e.target.closest("[data-more]");
    if (more) {
      state.limits[more.dataset.more] = (state.limits[more.dataset.more] || PAGE_SIZE) + PAGE_SIZE;
      draw();
      return;
    }
    const menuBtn = e.target.closest("[data-menu]");
    if (menuBtn) {
      e.stopPropagation();
      const cardEl = menuBtn.closest(".deal-card");
      if (openMenu && openMenu.parentElement === cardEl) closeMenu();
      else showMenu(cardEl);
      return;
    }
    const moveTo = e.target.closest("[data-move-to]");
    if (moveTo) {
      const id = moveTo.closest(".deal-card").dataset.id;
      closeMenu();
      moveDeal(id, moveTo.dataset.moveTo);
      return;
    }
    const detail = e.target.closest("[data-open-detail]");
    if (detail) {
      const id = detail.closest(".deal-card").dataset.id;
      closeMenu();
      openDeal(id);
      return;
    }
    const cardEl = e.target.closest(".deal-card");
    if (cardEl && !e.target.closest(".move-menu")) openDeal(cardEl.dataset.id);
  });

  document.addEventListener("click", (e) => {
    if (openMenu && !e.target.closest(".move-menu")) closeMenu();
  });

  root.querySelector("[data-category]").addEventListener("change", (e) => {
    state.category = e.target.value;
    flip(() => draw());
  });

  let searchTimer;
  root.querySelector("[data-search]").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = e.target.value;
      draw();
    }, 150);
  });

  // Teclado
  root.addEventListener("keydown", (e) => {
    if (openMenu && e.key === "Escape") {
      const cardEl = openMenu.closest(".deal-card");
      closeMenu();
      cardEl.focus();
      return;
    }
    if (openMenu && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const items = [...openMenu.querySelectorAll("button")];
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
      return;
    }
    const cardEl = e.target.closest?.(".deal-card");
    if (!cardEl || e.target !== cardEl) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDeal(cardEl.dataset.id);
    }
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const deal = store.deals.find((d) => d.id === cardEl.dataset.id);
      const i = STATUS_ORDER.indexOf(deal.status) + (e.key === "ArrowRight" ? 1 : -1);
      if (i >= 0 && i < STATUS_ORDER.length) moveDeal(deal.id, STATUS_ORDER[i]);
    }
  });

  // Arrastrar y soltar
  let dragId = null;
  board.addEventListener("dragstart", (e) => {
    const cardEl = e.target.closest(".deal-card");
    if (!cardEl) return;
    closeMenu();
    dragId = cardEl.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
    requestAnimationFrame(() => cardEl.classList.add("is-dragging"));
  });
  board.addEventListener("dragend", (e) => {
    e.target.closest?.(".deal-card")?.classList.remove("is-dragging");
    board.querySelectorAll(".column.is-over").forEach((c) => c.classList.remove("is-over"));
    dragId = null;
  });
  board.addEventListener("dragover", (e) => {
    const col = e.target.closest(".column");
    if (!col || !dragId) return;
    e.preventDefault();
    board.querySelectorAll(".column.is-over").forEach((c) => c !== col && c.classList.remove("is-over"));
    col.classList.add("is-over");
  });
  board.addEventListener("dragleave", (e) => {
    const col = e.target.closest(".column");
    if (col && !col.contains(e.relatedTarget)) col.classList.remove("is-over");
  });
  board.addEventListener("drop", (e) => {
    const col = e.target.closest(".column");
    if (!col || !dragId) return;
    e.preventDefault();
    col.classList.remove("is-over");
    moveDeal(dragId, col.dataset.column);
  });

  // Cualquier cambio (tablero, panel lateral o deshacer) redibuja con FLIP.
  onChange((change) => {
    if (root.hidden || !board) return;
    if (change.type === "move") {
      const hadFocus = document.activeElement?.closest?.(".deal-card")?.dataset.id === change.id;
      flip(() => draw({ landed: change.id }));
      if (hadFocus) board.querySelector(`.deal-card[data-id="${CSS.escape(change.id)}"]`)?.focus({ preventScroll: false });
    } else if (change.type === "load") {
      fillCategories();
      draw({ animateCounts: true });
    }
  });
}
