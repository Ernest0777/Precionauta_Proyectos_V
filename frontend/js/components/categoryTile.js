import { icon, CATEGORY_ICON_BY_SLUG } from "../utils/icons.js";

/**
 * Loseta del menú de categorías (sección bento, tarea "Crear menú de
 * categorías"). El conteo de ofertas es real: se calcula del catálogo,
 * nunca se escribe a mano.
 *
 * @param {{ slug: string, label: string, tileSize: "lg"|"sm", treatment: "solid"|"tint"|"outline" }} category
 * @param {number} offerCount
 */
export function renderCategoryTile(category, offerCount) {
  const iconName = CATEGORY_ICON_BY_SLUG[category.slug] ?? "tag";
  const offerLabel = offerCount === 1 ? "1 oferta" : `${offerCount} ofertas`;

  return `
    <button
      type="button"
      class="category-tile category-tile--${category.tileSize} category-tile--${category.treatment}"
      data-category-target="${category.slug}"
    >
      <span class="category-tile__icon">${icon(iconName, { size: category.tileSize === "lg" ? 34 : 24 })}</span>
      <span class="category-tile__label">${category.label}</span>
      <span class="category-tile__count">${offerLabel}</span>
    </button>
  `;
}
