// Reportes: un solo control de rango redibuja la gráfica, los indicadores y la bitácora.

import { api } from "../api.js";
import { loadDeals, store } from "../store.js";
import {
  STATUS,
  STATUS_ORDER,
  categoryName,
  escapeHtml,
  growBars,
  int,
  money,
  moneyCompact,
  pct,
  reducedMotion,
  runCounters,
  timeAgo,
} from "../ui.js";

const RANGES = {
  day: { label: "24 h", ms: 24 * 3600e3 },
  week: { label: "7 días", ms: 7 * 24 * 3600e3 },
  month: { label: "30 días", ms: 30 * 24 * 3600e3 },
  all: { label: "Todo", ms: Infinity },
};
const DONUT_COLORS = {
  review: "var(--color-ink-400)",
  published: "var(--color-ink-700)",
  featured: "var(--color-ink-900)",
  rejected: "var(--color-deal)",
};

let range = "week";
let data = null;
let root;

export async function renderReportes(el) {
  root = el;
  if (!root.dataset.ready) {
    root.innerHTML = shell();
    bind();
    root.dataset.ready = "1";
  }
  [data] = await Promise.all([api.reports(), loadDeals()]);
  draw();
}

function shell() {
  return `
    <div class="page-head" data-reveal style="--i:0">
      <div>
        <p class="eyebrow">Tienda · Métricas</p>
        <h1 class="page-title">Reportes</h1>
        <p class="page-sub">Cómo cambia el catálogo con cada consulta a Mercado Libre y qué decide el equipo.</p>
      </div>
      <div class="range" role="group" aria-label="Rango de fechas">
        ${Object.entries(RANGES)
          .map(([key, r]) => `<button class="chip" type="button" data-range="${key}" aria-pressed="${key === range}">${r.label}</button>`)
          .join("")}
      </div>
    </div>
    <div class="kpis" data-reveal style="--i:1" data-kpis></div>
    <div class="grid" style="margin-top:var(--space-4)">
      <article class="card span-8 wide-md" data-reveal style="--i:2">
        <div class="card__head">
          <h2 class="card__title">Ofertas por consulta</h2>
          <div class="legend"><span><i></i>Ofertas</span><span><i class="is-deal"></i>Descuento promedio</span></div>
        </div>
        <div data-chart></div>
      </article>
      <article class="card span-4" data-reveal style="--i:3">
        <div class="card__head"><h2 class="card__title">Estados</h2><span class="card__note">ahora</span></div>
        <div data-donut></div>
      </article>
      <article class="card span-12" data-reveal style="--i:4">
        <div class="card__head">
          <h2 class="card__title">Ofertas con más clics</h2>
          <span class="card__note">"Ver oferta" en la tienda · <span data-clicks-note></span></span>
        </div>
        <div data-clicks></div>
      </article>
      <article class="card span-7 wide-md" data-reveal style="--i:5">
        <div class="card__head"><h2 class="card__title">Categorías</h2><span class="card__note">ahora</span></div>
        <div data-categories></div>
      </article>
      <article class="card span-5" data-reveal style="--i:6">
        <div class="card__head"><h2 class="card__title">Actividad de moderación</h2><span class="card__note" data-log-note></span></div>
        <div data-log></div>
      </article>
    </div>
  `;
}

function bind() {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-range]");
    if (!btn || !data) return;
    range = btn.dataset.range;
    root.querySelectorAll("[data-range]").forEach((b) => b.setAttribute("aria-pressed", b === btn));
    draw();
  });
}

const inRange = (at) => Date.now() - new Date(at) <= RANGES[range].ms;

function draw() {
  const history = data.history.filter((h) => inRange(h.at));
  const log = data.log.filter((l) => inRange(l.at));
  const avg = (arr, key) => (arr.length ? arr.reduce((s, x) => s + x[key], 0) / arr.length : 0);
  const rejectedInRange = log.filter((l) => l.to === "rejected").length;
  const clicks = data.clicks.filter((c) => inRange(c.at));

  root.querySelector("[data-kpis]").innerHTML = `
    ${kpi("Clics a la tienda", clicks.length, "int", `${new Set(clicks.map((c) => c.deal_id)).size} ofertas distintas`)}
    ${kpi("Consultas a Mercado Libre", history.length, "int", `${RANGES[range].label}`)}
    ${kpi("Ofertas por consulta", avg(history, "total"), "int", history.length ? `máximo ${Math.max(...history.map((h) => h.total))}` : "sin datos")}
    ${kpi("Descuento promedio", avg(history, "avgDiscount"), "pct", history.length ? `${int(avg(history, "extreme"))} con 80%+ por consulta` : "sin datos")}
    ${kpi("Decisiones del equipo", log.length, "int", `${rejectedInRange} rechazadas`)}
  `;

  root.querySelector("[data-clicks]").innerHTML = topClicked(clicks);
  root.querySelector("[data-clicks-note]").textContent = RANGES[range].label;
  root.querySelector("[data-chart]").innerHTML = lineChart(history);
  root.querySelector("[data-donut]").innerHTML = donut();
  root.querySelector("[data-categories]").innerHTML = categoryTable();
  root.querySelector("[data-log-note]").textContent = RANGES[range].label;
  root.querySelector("[data-log]").innerHTML = log.length
    ? `<div class="log">${log
        .slice(0, 12)
        .map(
          (l) => `<div class="log__item">
            <span class="log__title">${escapeHtml(l.title)}</span>
            <span class="log__time">${timeAgo(l.at)}</span>
            <span class="log__move">${STATUS[l.from]?.label || l.from} → <strong>${STATUS[l.to]?.label || l.to}</strong></span>
          </div>`
        )
        .join("")}</div>`
    : `<p class="empty">Sin decisiones en este rango.</p>`;

  runCounters(root);
  growBars(root);
  animateDonut();
  animateLine();
}

function kpi(label, value, format, note) {
  return `<div class="kpi">
    <p class="kpi__label">${label}</p>
    <p class="kpi__value tabular" data-count="${value}" data-format="${format === "pct" ? "pct" : "int"}">0</p>
    <p class="kpi__delta">${escapeHtml(note)}</p>
  </div>`;
}

function lineChart(history) {
  if (history.length < 2) {
    return `<p class="empty">Aún no hay suficientes consultas en este rango.<br />El historial se llena solo: una foto cada vez que el servidor consulta Mercado Libre (cada 5 min).</p>`;
  }
  const W = 640;
  const H = 240;
  const pad = { t: 12, r: 40, b: 28, l: 36 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const t0 = new Date(history[0].at).getTime();
  const t1 = new Date(history[history.length - 1].at).getTime();
  const maxTotal = Math.max(10, ...history.map((h) => h.total)) * 1.15;
  const x = (at) => pad.l + ((new Date(at).getTime() - t0) / Math.max(1, t1 - t0)) * iw;
  const yTotal = (v) => pad.t + ih - (v / maxTotal) * ih;
  const yPct = (v) => pad.t + ih - (v / 100) * ih;

  const totalPts = history.map((h) => `${x(h.at).toFixed(1)},${yTotal(h.total).toFixed(1)}`);
  const pctPts = history.map((h) => `${x(h.at).toFixed(1)},${yPct(h.avgDiscount).toFixed(1)}`);
  const area = `M${totalPts[0]} L${totalPts.join(" L")} L${x(history[history.length - 1].at)},${pad.t + ih} L${pad.l},${pad.t + ih} Z`;

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const y = pad.t + ih - f * ih;
      return `<line class="chart__grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" />
        <text class="chart__axis" x="${pad.l - 8}" y="${y + 4}" text-anchor="end">${Math.round(f * maxTotal)}</text>
        <text class="chart__axis" x="${W - pad.r + 8}" y="${y + 4}">${f * 100}%</text>`;
    })
    .join("");

  const fmt = (at) =>
    new Date(at).toLocaleString("es-MX", t1 - t0 > 2 * 24 * 3600e3 ? { day: "numeric", month: "short" } : { hour: "2-digit", minute: "2-digit" });
  const ticks = [0, Math.floor(history.length / 2), history.length - 1]
    .map((i, k) => `<text class="chart__axis" x="${x(history[i].at)}" y="${H - 6}" text-anchor="${["start", "middle", "end"][k]}">${fmt(history[i].at)}</text>`)
    .join("");
  const last = history[history.length - 1];

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ofertas por consulta: de ${history[0].total} a ${last.total}; descuento promedio actual ${pct(last.avgDiscount, 1)}">
    ${grid}
    <path class="chart__area" d="${area}" />
    <polyline class="chart__line" data-line points="${totalPts.join(" ")}" />
    <polyline class="chart__line chart__line--deal" points="${pctPts.join(" ")}" />
    <circle class="chart__dot" r="4" cx="${x(last.at)}" cy="${yTotal(last.total)}" />
    ${ticks}
  </svg>`;
}

function animateLine() {
  const line = root.querySelector("[data-line]");
  if (!line || reducedMotion()) return;
  const len = line.getTotalLength();
  line.animate([{ strokeDasharray: `${len}`, strokeDashoffset: len }, { strokeDasharray: `${len}`, strokeDashoffset: 0 }], {
    duration: 1000,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  });
}

function donut() {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, store.deals.filter((d) => d.status === s).length]));
  const total = store.deals.length || 1;
  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const rings = STATUS_ORDER.map((s) => {
    const len = (counts[s] / total) * C;
    const ring = `<circle r="${R}" cx="75" cy="75" stroke="${DONUT_COLORS[s]}" data-dash="${len} ${C - len}" data-offset="${-offset}" stroke-dasharray="0 ${C}" stroke-dashoffset="0" />`;
    offset += len;
    return ring;
  }).join("");
  return `<div class="donut">
    <svg viewBox="0 0 150 150" role="img" aria-label="${STATUS_ORDER.map((s) => `${STATUS[s].label}: ${counts[s]}`).join(", ")}">
      <circle r="${R}" cx="75" cy="75" stroke="var(--color-surface-soft)" />${rings}
    </svg>
    <div class="stack">
      ${STATUS_ORDER.map(
        (s) => `<div class="status-row">
          <span class="status-row__name"><span class="status-dot" style="background:${DONUT_COLORS[s]}"></span>${STATUS[s].label}</span>
          <span class="tabular">${counts[s]} · ${pct((counts[s] / total) * 100)}</span>
        </div>`
      ).join("")}
    </div>
  </div>`;
}

function animateDonut() {
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      root.querySelectorAll("[data-dash]").forEach((c) => {
        c.setAttribute("stroke-dasharray", c.dataset.dash);
        c.setAttribute("stroke-dashoffset", c.dataset.offset);
      })
    )
  );
}

const SOURCE_NAMES = { web: "tarjeta", detalle: "detalle", telegram: "Telegram" };

function topClicked(clicks) {
  if (!clicks.length) {
    return `<p class="empty">Sin clics en este rango. Cada "Ver oferta" de la tienda pasa por el backend y se cuenta aquí.</p>`;
  }
  const byDeal = new Map();
  clicks.forEach((c) => {
    const row = byDeal.get(c.deal_id) || { title: c.title, category: c.category, count: 0, sources: {} };
    row.count++;
    row.sources[c.source || "web"] = (row.sources[c.source || "web"] || 0) + 1;
    byDeal.set(c.deal_id, row);
  });
  const rows = [...byDeal.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  const max = rows[0].count;
  return `<div class="stack">${rows
    .map(
      (r) => `<div class="status-row">
        <span class="status-row__name" style="min-width:0"><span class="deal-row__title" style="display:block">${escapeHtml(r.title)}</span></span>
        <span class="tabular card__note">${r.count} ${r.count === 1 ? "clic" : "clics"} · ${Object.entries(r.sources)
          .map(([s, n]) => `${SOURCE_NAMES[s] || s} ${n}`)
          .join(", ")}</span>
        <div class="bar status-row__bar"><div class="bar__fill" data-width="${(r.count / max) * 100}%"></div></div>
      </div>`
    )
    .join("")}</div>`;
}

function categoryTable() {
  const groups = {};
  store.deals.forEach((d) => {
    const g = (groups[d.category] ||= { count: 0, discount: 0, savings: 0, rejected: 0 });
    g.count++;
    g.discount += d.discount;
    g.savings += d.savings || 0;
    if (d.status === "rejected") g.rejected++;
  });
  const rows = Object.entries(groups).sort((a, b) => b[1].savings - a[1].savings);
  const maxSavings = Math.max(1, ...rows.map(([, g]) => g.savings));
  return `<div class="stack">${rows
    .map(
      ([slug, g]) => `<div class="status-row">
        <span class="status-row__name">${escapeHtml(categoryName(slug))}</span>
        <span class="tabular card__note">${g.count} ofertas · ${pct(g.discount / g.count)} prom. · ${moneyCompact(g.savings)} · ${g.rejected} rechazadas</span>
        <div class="bar status-row__bar"><div class="bar__fill" data-width="${(g.savings / maxSavings) * 100}%" title="${money(g.savings)} de ahorro"></div></div>
      </div>`
    )
    .join("")}</div>`;
}
