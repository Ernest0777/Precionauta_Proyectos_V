import { api } from "../api.js";
import { escapeHtml as esc, timeAgo, toast } from "../ui.js";
import { loadDeals } from "../store.js";

const VISIT_KEY = "precionauta-admin:last-summary";
let since;
let visitAt;
let firstVisit;

export function beginSummaryVisit() {
  visitAt = new Date().toISOString();
  let previous;
  try { previous = localStorage.getItem(VISIT_KEY); } catch {}
  const date = Date.parse(previous);
  firstVisit = !Number.isFinite(date) || date > Date.now();
  since = firstVisit ? new Date(Date.now() - 86400000).toISOString() : new Date(date).toISOString();
}

export async function loadAutomation() {
  if (!since) beginSummaryVisit();
  const [automation, reports] = await Promise.all([api.automation(since), api.userReports()]);
  return { automation, reports };
}

export function markSummarySeen() {
  // Sólo se avanza tras pintar la página completa, incluidas sus demás consultas.
  try { localStorage.setItem(VISIT_KEY, visitAt); } catch {}
}

const ACTIONS = { publish: "Publicar", review: "Enviar a revisión", withdraw: "Retirar", hold: "Esperar datos", manual: "Conservar decisión manual", undo: "Acción deshecha" };

export function automationMarkup({ automation: a, reports }) {
  const s = a.summary;
  const observing = a.mode === "observation";
  const counts = [
    ["Evaluaciones", s.evaluated], ["Publicadas", s.published], ["Enviadas a revisión", s.reviewed], ["Retiradas", s.withdrawn],
  ];
  return `<section class="card automation-summary" aria-labelledby="automation-title" data-automation-summary>
    <div class="card__head automation-summary__head">
      <div><p class="eyebrow">${firstVisit ? "Últimas 24 horas" : "Desde tu última entrada en este navegador"}</p>
        <h2 class="card__title" id="automation-title">Tu moderador automático</h2></div>
      <span class="pill">${observing ? "En observación" : "Automático activo"}</span>
    </div>
    <p class="page-sub">${observing ? "Registra propuestas; las nuevas evaluaciones no modifican la publicación." : "Aplica las reglas de moderación y conserva tus decisiones manuales."} Último análisis: ${a.lastRunAt ? timeAgo(a.lastRunAt) : "aún no hay uno"}.</p>
    <dl class="automation-stats">${counts.map(([label, n]) => `<div><dt>${label}</dt><dd class="tabular">${Number(n) || 0}</dd></div>`).join("")}</dl>
    <p class="automation-proposals" data-automation-proposals>Propuestas registradas: <strong>${s.proposedPublish || 0}</strong> publicar · <strong>${s.proposedReview || 0}</strong> revisar · <strong>${s.proposedWithdraw || 0}</strong> retirar. Decisiones manuales respetadas: <strong>${s.manualPreserved || 0}</strong>.</p>
    <div class="automation-controls">
      <button type="button" class="btn btn--ghost" data-automation-run>Analizar ahora</button>
      <button type="button" class="btn ${observing ? "btn--primary" : "btn--ghost"}" data-automation-mode="${observing ? "automatic" : "observation"}">${observing ? "Activar modo automático" : "Volver a observación"}</button>
      <a href="#moderacion" class="card__link">Abrir moderación</a>
    </div>
    <details class="automation-history" ${a.pending?.length ? "open" : ""}><summary>Necesitan tu revisión (${a.pendingCount || 0})</summary>
      ${a.pending?.length ? pendingList(a.pending.slice(0, 5)) + (a.pending.length > 5 ? `<details><summary>Ver otros ${a.pending.length - 5} casos</summary>${pendingList(a.pending.slice(5))}</details>` : "") : `<p class="empty">Sin casos pendientes del moderador automático.</p>`}
    </details>
    <details class="automation-history"><summary>Actividad y motivos (${a.events?.length || 0}${a.eventsTruncated ? "+" : ""})</summary>
      ${a.events?.length ? `<ol class="automation-events">${a.events.map(event => `<li>
        <div><strong>${esc(event.title || event.dealId)}</strong><p>${esc(ACTIONS[event.action] || event.action)} · ${event.undone ? "Revertido" : event.applied ? "Aplicado" : "Propuesta"} · ${timeAgo(event.at)}</p><p class="risk-reason">${(event.reasons || []).map(esc).join(" · ")}</p></div>
        ${event.applied && !event.undone && event.action !== "undo" ? `<button type="button" class="btn btn--ghost btn--sm" data-automation-undo="${esc(event.id)}">Deshacer</button>` : ""}
      </li>`).join("")}</ol>` : `<p class="empty">Aún no hay actividad en este periodo. El análisis se ejecuta con cada consulta nueva a Mercado Libre.</p>`}
    </details>
    <div class="automation-report-queue">
      <div class="card__head"><h3 class="card__title">Reportes de la comunidad</h3><span class="card__note">${reports.count || 0} pendientes</span></div>
      <p class="page-sub">Un reporte solicita revisión; no retira la oferta por sí solo.</p>
      ${reports.pending?.length ? `<ul class="automation-events">${reports.pending.map(report => `<li>
        <div><button class="card__link automation-report-title" type="button" data-open="${esc(report.dealId)}">${esc(report.title || report.dealId)}</button>
          <p>${report.reason === "expired" ? "Oferta vencida" : "Precio incorrecto"} · ${timeAgo(report.createdAt)}</p>${report.note ? `<p class="risk-reason">${esc(report.note)}</p>` : ""}</div>
        <div class="automation-report-actions"><button class="btn btn--ghost btn--sm" type="button" data-report-id="${esc(report.id)}" data-report-status="resolved">Marcar atendido</button><button class="btn btn--ghost btn--sm" type="button" data-report-id="${esc(report.id)}" data-report-status="dismissed">Descartar</button></div>
      </li>`).join("")}</ul>` : `<p class="empty">No hay reportes pendientes.</p>`}
    </div>
  </section>`;
}

function pendingList(deals) {
  return `<ul class="automation-events">${deals.map(deal => `<li><div><button class="card__link automation-report-title" type="button" data-open="${esc(deal.id)}">${esc(deal.title || deal.id)}</button><p class="risk-reason">${(deal.reasons || []).map(esc).join(" · ")}</p></div></li>`).join("")}</ul>`;
}

export function bindAutomation(root, rerender) {
  root.addEventListener("click", async event => {
    const button = event.target.closest("[data-automation-run], [data-automation-mode], [data-automation-undo], [data-report-status]");
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      if (button.hasAttribute("data-automation-run")) {
        await api.automationRun();
        toast("Análisis terminado. El resumen ya está actualizado.");
      } else if (button.dataset.automationMode) {
        await api.automationMode(button.dataset.automationMode);
        toast(button.dataset.automationMode === "automatic" ? "Modo automático activo para los siguientes análisis." : "Modo observación activo.");
      } else if (button.dataset.automationUndo) {
        await api.automationUndo(button.dataset.automationUndo);
        toast("Acción deshecha.");
      } else {
        await api.resolveReport(button.dataset.reportId, button.dataset.reportStatus);
        toast("Reporte actualizado.");
      }
      await loadDeals(true);
      await rerender();
    } catch (error) {
      toast(error.message);
    } finally { button.disabled = false; }
  });
}
