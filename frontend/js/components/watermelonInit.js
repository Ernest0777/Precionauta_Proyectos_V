/**
 * Watermelon UI - inicialización para Precionauta (index.html).
 *
 * Aquí solo vive la barra de búsqueda del header. Las pestañas de categoría
 * se montan desde main.js, que es dueño del estado del catálogo, y ya no hay
 * toast por cada cambio de pestaña (interrumpía sin decir nada nuevo).
 */

import { MorphingDiscoveryBar } from "./morphingDiscoveryBar.js";
import { PRODUCTS } from "../data/products.js";
import { CATEGORIES } from "../data/categories.js";
import { icon, CATEGORY_ICON_BY_SLUG } from "../utils/icons.js";
import { formatPriceMXN } from "../utils/format.js";
import { discountOf } from "../utils/catalogStats.js";

const CATEGORY_LABEL_BY_SLUG = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.label]));

function buildSuggestions() {
  return PRODUCTS.map((p) => ({
    label: p.name,
    meta: `${formatPriceMXN(p.currentPrice)} · ${p.store}`,
    badge: `−${discountOf(p)}%`,
    href: `producto.html?id=${encodeURIComponent(p.id)}`,
    tone: p.categorySlug,
    iconHtml: icon(CATEGORY_ICON_BY_SLUG[p.categorySlug] ?? "tag", { size: 18 }),
    keywords: `${p.store} ${CATEGORY_LABEL_BY_SLUG[p.categorySlug] ?? ""} ${p.description}`,
  }));
}

function initializeSearchBar() {
  const searchContainer = document.getElementById("search-container");
  if (!searchContainer) return;

  const searchBar = new MorphingDiscoveryBar("search-container", {
    placeholder: "Buscar productos, tiendas o categorías…",
    suggestions: buildSuggestions(),
    onSearch: (query, { submit }) => {
      document.dispatchEvent(new CustomEvent("search-query", { detail: { query, submit } }));
    },
  });

  window.searchBar = searchBar;
  document.dispatchEvent(new CustomEvent("search-bar-ready"));
}

initializeSearchBar();
