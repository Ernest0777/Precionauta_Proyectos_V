// Panel lateral con el detalle de una oferta: entra desde la derecha.

import { findDeal, moveDeal, onChange } from "./store.js";
import { STATUS, STATUS_ORDER, categoryName, escapeHtml, money, moneyHTML, pct, timeAgo } from "./ui.js";

const drawer = document.getElementById("drawer");
const panel = drawer.querySelector(".drawer__panel");
const body = document.getElementById("drawerBody");
let currentId = null;
let returnFocus = null;

export function openDeal(id) {
  const deal = findDeal(id);
  if (!deal) return;
  currentId = id;
  returnFocus = document.activeElement;
  render(deal);
  drawer.classList.remove("is-closing");
  drawer.hidden = false;
  document.body.style.overflow = "hidden";
  panel.focus();
}

export function closeDrawer() {
  if (drawer.hidden) return;
  drawer.classList.add("is-closing");
  const done = () => {
    drawer.hidden = true;
    drawer.classList.remove("is-closing");
    document.body.style.overflow = "";
    currentId = null;
    returnFocus?.focus?.();
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) done();
  else panel.addEventListener("animationend", done, { once: true });
}

function render(deal) {
  const risk = deal.risk;
  body.innerHTML = `
    <div class="drawer__media">
      ${deal.thumbnail ? `<img src="${escapeHtml(deal.pictures?.[0] || deal.thumbnail)}" alt="" referrerpolicy="no-referrer" />` : `<span class="thumb--empty">Sin foto</span>`}
    </div>
    <div class="drawer__section">
      <p class="eyebrow">${escapeHtml(categoryName(deal.category))} · ${deal.seller?.officialStore ? "Tienda oficial" : "Vendedor independiente"}</p>
      <h2 class="drawer__title" id="drawerTitle">${escapeHtml(deal.title)}</h2>
      <div class="drawer__prices">
        <span class="drawer__price tabular">${moneyHTML(deal.currentPrice)}</span>
        <span class="deal-card__old tabular">${money(deal.originalPrice)}</span>
        <span class="badge-deal tabular">−${pct(deal.discount)}</span>
      </div>
      <p class="card__note">Ahorro de ${money(deal.savings)} · ${deal.offersCount || 1} ${deal.offersCount === 1 ? "vendedor" : "vendedores"}${deal.freeShipping ? " · Envío gratis" : ""}</p>
    </div>

    <div class="drawer__section">
      <h3>Estado</h3>
      <div class="status-picker" role="group" aria-label="Cambiar estado">
        ${STATUS_ORDER.map(
          (s) => `<button type="button" data-set-status="${s}" aria-pressed="${deal.status === s}">
            <span class="status-dot status-dot--${s}"></span>${STATUS[s].label}
          </button>`
        ).join("")}
      </div>
      <p class="card__note">${STATUS[deal.status].hint}${deal.decidedAt ? ` · decidido ${timeAgo(deal.decidedAt)}` : " · estado automático"}</p>
    </div>

    <div class="drawer__section">
      <h3>Riesgo ${risk.score}/100</h3>
      <div class="bar"><div class="bar__fill ${risk.score >= 50 ? "bar__fill--deal" : ""}" style="width:${risk.score}%"></div></div>
      ${
        risk.reasons.length
          ? `<ul class="reasons">${risk.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`
          : `<p class="card__note">Sin señales de riesgo.</p>`
      }
    </div>

    ${
      deal.specs?.length
        ? `<div class="drawer__section"><h3>Ficha</h3><dl class="system-list">${deal.specs
            .slice(0, 6)
            .map((s) => `<div><dt>${escapeHtml(s.label)}</dt><dd>${escapeHtml(s.value)}</dd></div>`)
            .join("")}</dl></div>`
        : ""
    }

    <div class="drawer__section">
      <h3>Datos</h3>
      <dl class="system-list">
        <div><dt>ID</dt><dd class="tabular">${escapeHtml(deal.id)}</dd></div>
        <div><dt>Validada</dt><dd>${timeAgo(deal.validatedAt)}</dd></div>
        <div><dt>Fuente</dt><dd>${escapeHtml(deal.source || "—")}</dd></div>
      </dl>
    </div>

    <a class="btn btn--ghost btn--block" href="${escapeHtml(deal.permalink)}" target="_blank" rel="noopener noreferrer">Ver en Mercado Libre</a>
  `;
}

drawer.addEventListener("click", (e) => {
  if (e.target.closest("[data-drawer-close]")) closeDrawer();
  const btn = e.target.closest("[data-set-status]");
  if (btn && currentId) moveDeal(currentId, btn.dataset.setStatus);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !drawer.hidden) closeDrawer();
  // Foco atrapado dentro del panel mientras está abierto.
  if (e.key === "Tab" && !drawer.hidden) {
    const items = [...panel.querySelectorAll("button, a[href]")];
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

onChange((change) => {
  if (change.type === "move" && change.id === currentId) {
    const deal = findDeal(currentId);
    const scroll = panel.scrollTop;
    render(deal);
    panel.scrollTop = scroll;
  }
});
