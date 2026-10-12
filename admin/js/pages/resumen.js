// Resumen: el estado de la tienda de un vistazo.

import { api } from "../api.js";
import { loadDeals } from "../store.js";
import { openDeal } from "../drawer.js";
import {
  STATUS,
  STATUS_ORDER,
  categoryName,
  escapeHtml,
  greeting,
  growBars,
  money,
  pct,
  riskMeter,
  runCounters,
  sourceName,
  thumb,
  timeAgo,
  toast,
} from "../ui.js";

const REFRESH_ICON = `<svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path d="M224,48V96a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h28.69L182.06,73.37a79.56,79.56,0,0,0-56.13-23.43h-.45A79.52,79.52,0,0,0,69.59,72.71,8,8,0,0,1,58.41,61.27a96,96,0,0,1,135,.79L208,76.69V48a8,8,0,0,1,16,0ZM186.41,183.29a80,80,0,0,1-112.47-.66L59.31,168H88a8,8,0,0,0,0-16H40a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V179.31l14.63,14.63A95.43,95.43,0,0,0,130,222.06h.53a95.36,95.36,0,0,0,67.07-27.33,8,8,0,0,0-11.18-11.44Z"/></svg>`;

export async function renderResumen(root) {
  if (!root.dataset.ready) root.innerHTML = skeleton();
  const data = await api.overview();
  root.dataset.ready = "1";

  const { stats, statusCounts, bands, categories, atRisk, top, system } = data;
  const totalDeals = STATUS_ORDER.reduce((sum, s) => sum + statusCounts[s], 0);
  const maxBand = Math.max(1, ...bands.map((b) => b.count));
  const maxCat = Math.max(1, ...categories.map((c) => c.count));
  const reviewed = data.decided;
  const now = new Date();
  const date = now.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const isStale = system.lastUpdated && Date.now() - new Date(system.lastUpdated) > system.ttlMs;

  root.innerHTML = `
    <div class="page-head" data-reveal style="--i:0">
      <div>
        <p class="eyebrow">${escapeHtml(date)}</p>
        <h1 class="page-title">${greeting()}</h1>
        <p class="page-sub">Así está la tienda ahora mismo. Datos de ${escapeHtml(sourceName(system.source))}, ${timeAgo(system.lastUpdated)}.</p>
      </div>
      <div class="page-head__actions">
        <a class="btn btn--ghost" href="#reportes">Ver reportes</a>
        <button class="btn btn--primary" type="button" data-refresh>${REFRESH_ICON}<span>Consultar Mercado Libre</span></button>
      </div>
    </div>

    <div class="grid">
      <article class="card hero-card span-7 wide-md" data-reveal style="--i:1">
        <div>
          <p class="hero-card__label">Ahorro total publicado en la tienda</p>
          <p class="hero-card__value tabular" data-count="${stats.totalSavings}" data-format="money">$0</p>
        </div>
        <div>
          <div class="meter"><div class="meter__fill" data-width="${totalDeals ? (reviewed / totalDeals) * 100 : 0}%"></div></div>
          <p class="meter-caption"><span><strong class="tabular">${reviewed}</strong> de ${totalDeals} revisadas por el equipo</span><span>${statusCounts.review} por revisar</span></p>
        </div>
        <div class="hero-card__row">
          <div><p class="mini-stat__label">Ofertas visibles</p><p class="mini-stat__value tabular" data-count="${stats.total}">0</p></div>
          <div><p class="mini-stat__label">Descuento promedio</p><p class="mini-stat__value tabular" data-count="${stats.avgDiscount}" data-format="pct">0%</p></div>
          <div><p class="mini-stat__label">Descuento máximo</p><p class="mini-stat__value mini-stat__value--deal tabular" data-count="${stats.maxDiscount}" data-format="pct">0%</p></div>
        </div>
      </article>

      <article class="card span-5" data-reveal style="--i:2">
        <div class="card__head">
          <h2 class="card__title">Cola de moderación</h2>
          <a class="card__link" href="#moderacion">Abrir tablero</a>
        </div>
        <div class="stack">
          ${STATUS_ORDER.map(
            (s) => `<div class="status-row">
              <span class="status-row__name"><span class="status-dot status-dot--${s}"></span>${STATUS[s].label}</span>
              <span class="tabular" data-count="${statusCounts[s]}">0</span>
              <div class="bar status-row__bar"><div class="bar__fill ${s === "rejected" ? "bar__fill--deal" : s === "published" ? "bar__fill--muted" : ""}" data-width="${totalDeals ? (statusCounts[s] / totalDeals) * 100 : 0}%"></div></div>
            </div>`
          ).join("")}
        </div>
      </article>

      <article class="card span-4" data-reveal style="--i:3">
        <div class="card__head">
          <h2 class="card__title">Ofertas en riesgo</h2>
          <span class="card__note">${statusCounts.review} por revisar</span>
        </div>
        ${
          atRisk.length
            ? `<div class="stack">${atRisk
                .map(
                  (d) => `<button class="deal-row" type="button" data-open="${escapeHtml(d.id)}">
                    ${thumb(d)}
                    <span style="min-width:0">
                      <span class="deal-row__title" style="display:block">${escapeHtml(d.title)}</span>
                      <span class="risk-reason" style="display:block"><strong>${escapeHtml(d.risk.reasons[0] || "Revisar")}</strong></span>
                    </span>
                    <span class="deal-row__end">${riskMeter(d.risk)}</span>
                  </button>`
                )
                .join("")}</div>`
            : `<p class="empty">Nada por revisar. Todo en orden.</p>`
        }
      </article>

      <article class="card span-4" data-reveal style="--i:4">
        <div class="card__head">
          <h2 class="card__title">Descuentos publicados</h2>
          <span class="card__note">por rango</span>
        </div>
        <div class="columns" role="img" aria-label="${bands.map((b) => `${b.label}: ${b.count}`).join(", ")}">
          ${bands
            .map(
              (b) => `<div class="columns__col">
                <div class="columns__track">
                  <span class="columns__value tabular">${b.count}</span>
                  <div class="columns__bar ${b.min >= 80 ? "columns__bar--deal" : ""}" data-height="${(b.count / maxBand) * 85}%"></div>
                </div>
                <span class="columns__label">${b.label}</span>
              </div>`
            )
            .join("")}
        </div>
      </article>

      <article class="card span-4" data-reveal style="--i:5">
        <div class="card__head">
          <h2 class="card__title">Estado del sistema</h2>
          <span class="pill ${system.refreshing ? "pill--live" : ""}">${system.refreshing ? "Consultando" : isStale ? "Caché vieja" : "Al día"}</span>
        </div>
        <dl class="system-list">
          <div><dt>Fuente</dt><dd>${escapeHtml(sourceName(system.source))}</dd></div>
          <div><dt>Última consulta</dt><dd>${timeAgo(system.lastUpdated)}</dd></div>
          <div><dt>Se renueva cada</dt><dd>${Math.round(system.ttlMs / 60000)} min</dd></div>
          <div><dt>Rango publicado</dt><dd>${system.discountRange.min}–${system.discountRange.max}%</dd></div>
          <div><dt>Tiendas oficiales</dt><dd class="tabular">${pct(data.officialShare * 100)}</dd></div>
          <div><dt>Con envío gratis</dt><dd class="tabular">${pct(data.freeShippingShare * 100)}</dd></div>
          <div><dt>Clics a la tienda</dt><dd class="tabular">${data.clicks.today} hoy · ${data.clicks.week} en 7 días</dd></div>
          <div><dt>Enlace de afiliado ML</dt><dd>${data.affiliateOn ? "Activo" : "Sin configurar"}</dd></div>
          <div><dt>Bot de Telegram</dt><dd>${data.telegram.enabled ? `@${escapeHtml(data.telegram.botUsername)}` : "Apagado"}</dd></div>
        </dl>
      </article>

      <article class="card span-7 wide-md" data-reveal style="--i:6">
        <div class="card__head">
          <h2 class="card__title">Mejores ofertas visibles</h2>
          <a class="card__link" href="#moderacion">Ver todas</a>
        </div>
        <div class="stack">
          ${top
            .map(
              (d) => `<button class="deal-row" type="button" data-open="${escapeHtml(d.id)}">
                ${thumb(d)}
                <span style="min-width:0">
                  <span class="deal-row__title" style="display:block">${escapeHtml(d.title)}</span>
                  <span class="deal-row__meta" style="display:block">${escapeHtml(categoryName(d.category))} · ${STATUS[d.status].label}</span>
                </span>
                <span class="deal-row__end">
                  <span class="price tabular" style="display:block">${money(d.currentPrice)}</span>
                  <span class="badge-deal tabular">−${pct(d.discount)}</span>
                </span>
              </button>`
            )
            .join("")}
        </div>
      </article>

      <article class="card span-5" data-reveal style="--i:7">
        <div class="card__head">
          <h2 class="card__title">Por categoría</h2>
          <span class="card__note">ofertas · descuento promedio</span>
        </div>
        <div class="stack">
          ${categories
            .map(
              (c) => `<div class="status-row">
                <span class="status-row__name">${escapeHtml(categoryName(c.slug))}</span>
                <span class="tabular">${c.count} · ${pct(c.avgDiscount)}</span>
                <div class="bar status-row__bar"><div class="bar__fill" data-width="${(c.count / maxCat) * 100}%"></div></div>
              </div>`
            )
            .join("")}
        </div>
      </article>
    </div>
  `;

  runCounters(root);
  growBars(root);
}

function skeleton() {
  return `<div class="grid">
    <div class="skeleton span-7" style="grid-column:span 12;height:96px"></div>
    <div class="card skeleton span-7" style="height:240px"></div>
    <div class="card skeleton span-5" style="height:240px"></div>
  </div>`;
}

export function bindResumen(root, rerender) {
  root.addEventListener("click", async (e) => {
    const open = e.target.closest("[data-open]");
    if (open) {
      await loadDeals();
      openDeal(open.dataset.open);
      return;
    }
    const refresh = e.target.closest("[data-refresh]");
    if (refresh) {
      refresh.disabled = true;
      refresh.classList.add("is-spinning");
      refresh.querySelector("span").textContent = "Consultando…";
      try {
        const result = await api.refresh();
        await loadDeals(true);
        toast(`${result.total} ofertas de ${sourceName(result.source)} en ${(result.ms / 1000).toFixed(1)} s`);
      } catch (error) {
        toast(`No se pudo consultar: ${error.message}`);
      }
      rerender();
    }
  });
}
