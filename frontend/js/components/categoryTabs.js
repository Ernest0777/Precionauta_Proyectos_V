import { ALL_CATEGORIES_SLUG } from "../data/categories.js";

/**
 * Franja compacta de categorías bajo la barra de navegación: acceso rápido
 * para filtrar el catálogo sin salir del scroll. Distinta, a propósito, del
 * menú de categorías en losetas (misma información, otra familia de layout).
 *
 * @param {Array<{slug: string, label: string}>} categories
 * @param {string} activeSlug
 */
export function renderCategoryTabs(categories, activeSlug = ALL_CATEGORIES_SLUG) {
  const tabs = [{ slug: ALL_CATEGORIES_SLUG, label: "Todas" }, ...categories];

  return tabs
    .map(({ slug, label }) => {
      const isActive = slug === activeSlug;
      return `
        <button
          type="button"
          class="category-tab ${isActive ? "is-active" : ""}"
          role="tab"
          aria-selected="${isActive}"
          data-category-target="${slug}"
        >
          ${label}
        </button>
      `;
    })
    .join("");
}
