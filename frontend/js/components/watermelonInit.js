/**
 * Watermelon UI - inicialización para Precionauta (index.html).
 *
 * Aquí solo vive la barra de búsqueda del header. Las pestañas de categoría
 * se montan desde main.js, que es dueño del estado del catálogo, y ya no hay
 * toast por cada cambio de pestaña (interrumpía sin decir nada nuevo).
 */

import { MorphingDiscoveryBar } from "./morphingDiscoveryBar.js";
import { PRODUCTS, CATALOG_LOADED, CATALOG_CHANGED_EVENT } from "../data/products.js";
import { CATEGORIES } from "../data/categories.js";
import { icon, CATEGORY_ICON_BY_SLUG } from "../utils/icons.js";
import { formatPriceMXN } from "../utils/format.js";
import { discountOf } from "../utils/catalogStats.js";
import { getRecentSearches, recommend } from "../utils/recommender.js";

const CATEGORY_LABEL_BY_SLUG = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.label]));

function toSuggestion(p) {
  return {
    label: p.name,
    meta: `${formatPriceMXN(p.currentPrice)} · ${p.store}`,
    badge: `−${discountOf(p)}%`,
    href: `producto.html?id=${encodeURIComponent(p.id)}`,
    tone: p.categorySlug,
    image: p.image,
    images: p.images,
    iconHtml: icon(CATEGORY_ICON_BY_SLUG[p.categorySlug] ?? "tag", { size: 18 }),
  };
}

/** Buscador vacío: búsquedas recientes + 3 recomendaciones del perfil local. */
function emptySuggestions() {
  const recent = getRecentSearches().map((q) => ({ label: q, iconHtml: icon("clock", { size: 16 }) }));
  const picks = recommend(PRODUCTS, { limit: 3 }).map(({ product }) => toSuggestion(product));
  return [
    { head: "Tus búsquedas recientes", items: recent },
    { head: recent.length ? "Te puede interesar" : "Las caídas más fuertes de hoy", items: picks },
  ];
}

function buildSuggestions() {
  return PRODUCTS.map((p) => ({
    ...toSuggestion(p),
    keywords: `${p.store} ${CATEGORY_LABEL_BY_SLUG[p.categorySlug] ?? ""} ${p.description}`,
  }));
}

function initializeSearchBar() {
  const searchContainer = document.getElementById("search-container");
  if (!searchContainer) return;

  const searchBar = new MorphingDiscoveryBar("search-container", {
    placeholder: "Buscar productos, tiendas o categorías…",
    suggestions: buildSuggestions(),
    emptyProvider: emptySuggestions,
    onSearch: (query, { submit }) => {
      document.dispatchEvent(new CustomEvent("search-query", { detail: { query, submit } }));
    },
  });

  const refresh = () => {
    searchBar.setSuggestions(buildSuggestions());
    searchBar.results = [];
    if (!CATALOG_LOADED) {
      searchBar.suggestionsContainer.innerHTML = '<p role="status">Cargando ofertas…</p>';
      if (document.activeElement !== searchBar.input) searchBar.hideSuggestions();
      return;
    }
    if (document.activeElement !== searchBar.input) return;
    const query = searchBar.getValue();
    if (query.length >= searchBar.searchMinLength) {
      searchBar.updateSuggestions(query);
      searchBar.showSuggestions();
    } else if (!query) searchBar.showEmptyState();
  };
  refresh();
  document.addEventListener(CATALOG_CHANGED_EVENT, refresh);

  window.searchBar = searchBar;
  document.dispatchEvent(new CustomEvent("search-bar-ready"));
}

initializeSearchBar();
