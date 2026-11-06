const bindings = new WeakMap();
const money = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const dateTime = new Intl.DateTimeFormat("es-MX", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
let chartId = 0;

export function normalizePriceObservations(observations = []) {
  return observations.flatMap((row) => {
    if (!row || !["number", "string"].includes(typeof row.at) ||
        !["number", "string"].includes(typeof row.price)) return [];
    const at = typeof row.at === "number" ? row.at : Date.parse(row.at);
    const price = Number(row.price);
    return Number.isFinite(at) && Number.isFinite(new Date(at).getTime()) && Number.isFinite(price) && price > 0
      ? [{ at, price }] : [];
  }).sort((a, b) => a.at - b.at);
}

/** The recorded price remains in effect until the next observation, including repeated timestamps. */
export function priceObservationIndexAt(observations, at) {
  let low = 0;
  let high = observations.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (observations[middle].at <= at) low = middle + 1;
    else high = middle;
  }
  return observations.length ? Math.max(0, low - 1) : -1;
}

/** Bind after rendering. Returns cleanup; rebinding the same container also cleans up automatically. */
export function bindPriceChart(container, { observations = [], startAt, endAt } = {}) {
  bindings.get(container)?.();
  const plot = container?.querySelector(".price-chart__plot");
  const svg = plot?.querySelector(".price-chart__svg");
  const rows = normalizePriceObservations(observations);
  if (!svg || rows.length < 2) return () => {};
  const start = Number.isFinite(startAt) ? startAt : rows[0].at;
  const end = Math.max(Number.isFinite(endAt) ? endAt : Date.now(), start + 1);
  const min = Number(svg.dataset.priceMin);
  const max = Number(svg.dataset.priceMax);
  const left = Number(svg.dataset.plotLeft);
  const right = Number(svg.dataset.plotRight);
  const top = Number(svg.dataset.plotTop);
  const bottom = Number(svg.dataset.plotBottom);
  const viewWidth = svg.viewBox.baseVal.width;
  const cursor = svg.querySelector("[data-chart-cursor]");
  const guide = cursor.querySelector("line");
  const dot = cursor.querySelector("circle");
  const tooltip = plot.querySelector("[data-chart-tooltip]");
  const priceLabel = tooltip.querySelector("[data-chart-price]");
  const observedLabel = tooltip.querySelector("[data-chart-observed]");
  const hint = plot.querySelector("[data-chart-hint]");
  const announcement = plot.querySelector("[data-chart-announcement]");
  const id = `price-chart-${++chartId}`;
  hint.id = `${id}-hint`;
  tooltip.id = `${id}-tooltip`;
  svg.setAttribute("tabindex", "0");
  svg.setAttribute("role", "slider");
  svg.setAttribute("aria-label", "Explorar historial de precio");
  svg.setAttribute("aria-describedby", hint.id);
  svg.setAttribute("aria-orientation", "horizontal");
  svg.setAttribute("aria-valuemin", String(rows[0].at));
  svg.setAttribute("aria-valuemax", String(rows.at(-1).at));
  svg.setAttribute("aria-valuenow", String(rows.at(-1).at));
  svg.setAttribute("aria-valuetext", `${money.format(rows.at(-1).price)} MXN. Observado ${dateTime.format(rows.at(-1).at)}`);
  const controller = new AbortController();
  const { signal } = controller;
  let rect;
  let selected = -1;
  let visible = false;
  const hide = () => {
    cursor.hidden = true;
    cursor.setAttribute("visibility", "hidden");
    tooltip.hidden = true;
    visible = false;
  };
  function show(index, at, announce = false) {
    const row = rows[index];
    const ratio = Math.max(0, Math.min(1, (at - start) / (end - start)));
    const x = left + ratio * (right - left);
    const y = top + (1 - (row.price - min) / Math.max(max - min, 1)) * (bottom - top);
    guide.setAttribute("x1", x);
    guide.setAttribute("x2", x);
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y);
    plot.style.setProperty("--chart-x", `${x / viewWidth * 100}%`);
    if (index !== selected) {
      priceLabel.textContent = `${money.format(row.price)} MXN`;
      observedLabel.textContent = `Observado ${dateTime.format(row.at)}`;
      svg.setAttribute("aria-valuenow", String(row.at));
      svg.setAttribute("aria-valuetext", `${priceLabel.textContent}. ${observedLabel.textContent}`);
      selected = index;
    }
    cursor.hidden = false;
    cursor.removeAttribute("visibility");
    tooltip.hidden = false;
    visible = true;
    if (announce) announcement.textContent = `${priceLabel.textContent}. ${observedLabel.textContent}`;
  }
  function point(event, announce = false) {
    if (!plot.isConnected) return cleanup();
    // The SVG uses preserveAspectRatio="none", so client X scales directly into its viewBox.
    rect ||= svg.getBoundingClientRect();
    if (!rect.width) return;
    const x = (event.clientX - rect.left) / rect.width * viewWidth;
    const at = start + Math.max(0, Math.min(1, (x - left) / (right - left))) * (end - start);
    show(priceObservationIndexAt(rows, at), at, announce);
  }
  svg.addEventListener("pointerenter", (event) => { rect = svg.getBoundingClientRect(); point(event); }, { signal });
  svg.addEventListener("pointermove", (event) => point(event), { signal, passive: true });
  svg.addEventListener("pointerdown", (event) => { rect = svg.getBoundingClientRect(); point(event, event.pointerType !== "mouse"); }, { signal, passive: true });
  svg.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "mouse") point(event, true);
  }, { signal, passive: true });
  svg.addEventListener("pointerleave", (event) => { if (event.pointerType === "mouse") hide(); }, { signal });
  svg.addEventListener("pointercancel", hide, { signal });
  svg.addEventListener("focus", () => { if (!visible) show(rows.length - 1, rows.at(-1).at); }, { signal });
  svg.addEventListener("blur", hide, { signal });
  svg.addEventListener("keydown", (event) => {
    let index = selected < 0 ? rows.length - 1 : selected;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") index = Math.max(0, index - 1);
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") index = Math.min(rows.length - 1, index + 1);
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = rows.length - 1;
    else if (event.key === "Escape") { hide(); return; }
    else return;
    event.preventDefault();
    show(index, rows[index].at, true);
  }, { signal });
  const invalidateRect = () => { rect = undefined; };
  window.addEventListener("resize", invalidateRect, { signal, passive: true });
  window.addEventListener("scroll", invalidateRect, { signal, passive: true, capture: true });
  const resizeObserver = new ResizeObserver(invalidateRect);
  resizeObserver.observe(svg);
  const mutationObserver = new MutationObserver(() => {
    if (!container.contains(plot)) cleanup();
  });
  mutationObserver.observe(container, { childList: true });
  function cleanup() {
    controller.abort();
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    hide();
    if (bindings.get(container) === cleanup) bindings.delete(container);
  }
  bindings.set(container, cleanup);
  return cleanup;
}
