// Ofertas compartidas entre el tablero, el panel lateral y el resumen.
// Los cambios de estado se ven al instante y se deshacen si el servidor falla.

import { api } from "./api.js";
import { STATUS, announce, toast } from "./ui.js";

export const store = { deals: null, lastUpdated: null };
const listeners = new Set();

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(change) {
  listeners.forEach((fn) => fn(change));
}

export async function loadDeals(force = false) {
  if (store.deals && !force) return store.deals;
  store.deals = await api.deals();
  store.lastUpdated = new Date();
  notify({ type: "load" });
  return store.deals;
}

export const findDeal = (id) => store.deals?.find((d) => d.id === id);

export async function moveDeal(id, status, { undoable = true } = {}) {
  const deal = findDeal(id);
  if (!deal || deal.status === status) return;
  const from = deal.status;
  const fromDecidedAt = deal.decidedAt;
  deal.status = status;
  deal.decidedAt = new Date().toISOString();
  notify({ type: "move", id, from, to: status });
  announce(`${deal.title} movida a ${STATUS[status].label}.`);

  try {
    await api.setStatus(id, status);
    if (undoable) {
      toast(`Movida a ${STATUS[status].label}`, { label: "Deshacer", run: () => moveDeal(id, from, { undoable: false }) });
    }
  } catch (error) {
    deal.status = from;
    deal.decidedAt = fromDecidedAt;
    notify({ type: "move", id, from: status, to: from });
    toast(`No se guardó: ${error.message}`);
  }
}
