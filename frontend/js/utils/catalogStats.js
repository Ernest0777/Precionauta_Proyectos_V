import { PRODUCTS } from "../data/products.js";
import { CATEGORIES, ALL_CATEGORIES_SLUG } from "../data/categories.js";
import { calculateDiscountPercent } from "./format.js";

/**
 * Conteos y "mejor oferta" por categoría, derivados del catálogo real. Los
 * usan el menú de Categorías, las pestañas del catálogo y la cinta de
 * ofertas - nunca un número escrito a mano (las pestañas de Watermelon
 * traían 42/28/15... inventados).
 */

export function discountOf(product) {
  return calculateDiscountPercent(product.previousPrice, product.currentPrice);
}

function bestOf(products) {
  return products.reduce((best, p) => (!best || discountOf(p) > discountOf(best) ? p : best), null);
}

export function getAllStats() {
  const best = bestOf(PRODUCTS);
  return {
    slug: ALL_CATEGORIES_SLUG,
    label: "Todas las ofertas",
    count: PRODUCTS.length,
    bestProduct: best,
    bestDiscount: best ? discountOf(best) : 0,
  };
}

export function getCategoryStats() {
  return CATEGORIES.map((category) => {
    const products = PRODUCTS.filter((p) => p.categorySlug === category.slug);
    const best = bestOf(products);
    return {
      slug: category.slug,
      label: category.label,
      count: products.length,
      bestProduct: best,
      bestDiscount: best ? discountOf(best) : 0,
    };
  });
}

export function getStoreStats() {
  const counts = new Map();
  PRODUCTS.forEach((p) => counts.set(p.store, (counts.get(p.store) ?? 0) + 1));
  return [...counts.entries()].map(([store, count]) => ({ store, count }));
}

export function getProductsByDiscount() {
  return [...PRODUCTS].sort((a, b) => discountOf(b) - discountOf(a));
}
