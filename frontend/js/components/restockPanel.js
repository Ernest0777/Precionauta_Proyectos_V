import { accountState } from "../utils/account.js";
import { restockState, setRestock, readRestockEvent, refreshRestock, RESTOCK_CHANGED_EVENT } from "../utils/restock.js";

const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const link = id => `producto.html?id=${encodeURIComponent(id)}`;
const money = value => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);

export function availabilityLabel(deal) {
  if (!deal || (deal.checkStatus && deal.checkStatus !== "ok")) return "Disponibilidad por confirmar";
  if (deal.availability === "unavailable" || deal.stock === 0) return "Agotado en la última consulta";
  if (deal.availability === "available" || deal.stock > 0) return "Disponible en la última consulta";
  return "Disponibilidad por confirmar";
}

export function bindRestockPanel(root, { product = null } = {}) {
  if (!root) return;
  let busy = false;
  let feedback = "";
  const paint = () => {
    const data = restockState();
    if (product) {
      const enabled = accountState().restockIds?.includes(product.id);
      const paused = accountState().pausedRestockIds?.includes(product.id);
      root.innerHTML = `<h2>Disponibilidad y reposición</h2><p>${availabilityLabel(product)}</p>
        <button class="btn btn--outline" type="button" data-restock-toggle aria-pressed="${Boolean(enabled)}" ${busy ? "disabled" : ""}>${enabled ? "Quitar aviso de reposición" : "Avisarme cuando vuelva"}</button>
        <p>${paused ? "Aviso conservado en pausa por el límite de tu cuenta." : "Te avisamos dentro de tu cuenta cuando confirmemos que pasó de agotado a disponible. Los datos desconocidos no generan avisos."}</p>
        <a href="perfil.html#reposiciones">Ver mis avisos y productos en seguimiento</a>
        <p role="status" aria-live="polite">${esc(feedback || data.error)}</p>`;
      return;
    }
    root.innerHTML = `<h2>Reposiciones y seguimiento</h2>
      <p>Gratis comparte 3 alertas activas entre precio y reposición. Plus puede recibir reposiciones por Telegram si está vinculado.</p>
      ${accountState().unverifiedTrackingIds?.length ? `<p>Conservamos ${accountState().unverifiedTrackingIds.length} productos anteriores que aún no pudimos verificar. Abrirlos desde el catálogo permite autorizar su seguimiento; sus guardados no se han eliminado.</p>` : ""}
      <h3>Avisos de reposición</h3>
      ${data.subscriptions.length ? `<ul class="restock-list">${data.subscriptions.map(sub => `<li><div><a href="${link(sub.dealId)}">${esc(sub.deal?.title || sub.dealId)}</a><p>${sub.paused ? "En pausa" : availabilityLabel(sub.deal)}</p></div><button class="btn btn--outline" type="button" data-restock-remove="${esc(sub.dealId)}" ${busy ? "disabled" : ""}>Quitar</button></li>`).join("")}</ul>` : "<p>Aún no sigues ninguna reposición. Activa un aviso desde el detalle de un producto.</p>"}
      <h3>Notificaciones · ${data.unreadCount} sin leer</h3>
      ${data.events.length ? `<ul class="restock-list">${data.events.map(event => `<li><div><a href="${link(event.dealId)}">${esc(event.title)}</a><p>Disponible de nuevo${Number.isFinite(event.price) ? ` · ${money(event.price)} observado` : ""} · ${new Date(event.at).toLocaleString("es-MX")}</p></div>${event.readAt ? "<span>Leído</span>" : `<button class="btn btn--outline" type="button" data-restock-read="${esc(event.id)}" ${busy ? "disabled" : ""}>Marcar leído</button>`}</li>`).join("")}</ul>` : "<p>Las reposiciones confirmadas aparecerán aquí.</p>"}
      <h3>Productos en seguimiento</h3><p>Seguimos consultando tus guardados y productos con avisos aunque termine su descuento.</p>
      ${data.tracked.length ? `<ul class="restock-list">${data.tracked.map(deal => `<li><div><a href="${link(deal.id)}">${esc(deal.title || "Oferta nueva pendiente de liberar")}</a><p>${availabilityLabel(deal)}${Number.isFinite(deal.currentPrice) ? ` · ${money(deal.currentPrice)} observado` : ""}</p></div></li>`).join("")}</ul>` : "<p>Los productos aparecerán después de su primera consulta al proveedor.</p>"}
      <button class="btn btn--outline" type="button" data-restock-refresh ${busy ? "disabled" : ""}>Actualizar mis avisos</button>
      <p role="status" aria-live="polite">${esc(feedback || data.error)}</p>`;
  };
  root.addEventListener("click", async event => {
    const button = event.target.closest("[data-restock-toggle], [data-restock-remove], [data-restock-read], [data-restock-refresh]");
    if (!button || busy) return;
    if (!accountState().user) {
      document.dispatchEvent(new CustomEvent("auth-requested", { detail: { mode: "register" } }));
      return;
    }
    busy = true;
    feedback = "Guardando…";
    paint();
    try {
      if (button.hasAttribute("data-restock-toggle")) await setRestock(product.id, !accountState().restockIds?.includes(product.id));
      else if (button.dataset.restockRemove) await setRestock(button.dataset.restockRemove, false);
      else if (button.dataset.restockRead) await readRestockEvent(button.dataset.restockRead);
      else await refreshRestock();
      feedback = "Tus avisos están actualizados.";
    } catch (error) { feedback = error.message; }
    finally { busy = false; paint(); }
  });
  document.addEventListener(RESTOCK_CHANGED_EVENT, paint);
  paint();
}
