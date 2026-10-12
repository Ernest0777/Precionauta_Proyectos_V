import { icon, CATEGORY_ICON_BY_SLUG } from "../utils/icons.js";
import { formatAge, formatWait } from "../utils/plan.js";
import {
  formatPriceMXN,
  formatPriceHTML,
  calculateDiscountPercent,
  calculateSavings,
  formatHoursAgoLabel,
} from "../utils/format.js";

/**
 * Renderiza una tarjeta de producto (tarea "Crear diseño de tarjeta de
 * producto"). `variant: "featured"` produce la loseta grande del catálogo
 * (primer producto), con el dato de validación contra mínimo histórico.
 *
 * @param {object} product - un item de data/products.js
 * @param {string} categoryLabel - etiqueta legible de la categoría
 * @param {{ variant?: "standard" | "featured", saved?: boolean, alerted?: boolean, showSaveButton?: boolean, reason?: string }} [opts]
 */
export function renderProductCard(product, categoryLabel, opts = {}) {
  const { variant = "standard", saved = false, alerted = false, showSaveButton = true, reason = "" } = opts;
  const isFeatured = variant === "featured";

  const discountPercent = calculateDiscountPercent(
    product.previousPrice,
    product.currentPrice
  );
  const savings = calculateSavings(product.previousPrice, product.currentPrice);
  const categoryIconName = CATEGORY_ICON_BY_SLUG[product.categorySlug] ?? "tag";

  const belowHistoricMinPercent =
    isFeatured && product.historicMinPrice
      ? calculateDiscountPercent(product.historicMinPrice, product.currentPrice)
      : 0;

  return `
    <article
      class="product-card ${isFeatured ? "product-card--featured" : ""}"
      data-product-id="${product.id}"
      data-category="${product.categorySlug}"
      data-tone="${product.categorySlug}"
    >
      <div class="product-card__media product-card__media--${product.categorySlug} ${product.image ? "has-photo" : ""}">
        ${
          product.image
            ? ""
            : `<span class="product-card__watermark" aria-hidden="true">
                 ${icon(categoryIconName, { size: isFeatured ? 300 : 200 })}
               </span>`
        }
        <a
          href="producto.html?id=${encodeURIComponent(product.id)}"
          class="product-card__media-link"
          aria-label="Ver detalle de ${escapeAttr(product.name)}"
        >
          ${
            product.image
              ? `<img class="product-card__photo" src="${escapeAttr(product.image)}" alt="" loading="lazy" decoding="async" />`
              : `<div class="product-card__glyph" aria-hidden="true">
                   ${icon(categoryIconName, { size: isFeatured ? 56 : 40 })}
                 </div>`
          }
        </a>

        ${
          showSaveButton
            ? `<div class="product-card__actions">
                 <button
                   type="button"
                   class="icon-button product-card__action product-card__bell ${alerted ? "is-on" : ""}"
                   data-alert-toggle
                   aria-pressed="${alerted}"
                   aria-label="Avisarme si baja ${escapeAttr(product.name)}"
                 >
                   ${icon("bell", { size: 17 })}
                 </button>
                 <button
                   type="button"
                   class="icon-button product-card__action product-card__save ${saved ? "is-saved" : ""}"
                   data-save-toggle
                   aria-pressed="${saved}"
                   aria-label="Guardar ${escapeAttr(product.name)}"
                 >
                   ${icon("heart", { size: 18 })}
                 </button>
               </div>`
            : ""
        }

        <span class="chip chip--store">${product.storeCode}</span>

        ${
          product.pinned
            ? `<span class="chip chip--flame chip--pinned">${icon("sparkle", { size: 14 })} Destacada</span>`
            : isFeatured
              ? `<span class="chip chip--flame">${icon("flame", { size: 14 })} Oferta más caliente</span>`
              : product.isNew
                ? `<span class="chip chip--flame chip--new">${icon("lightning", { size: 14 })} Nueva · la ves antes por Plus</span>`
                : ""
        }

        <span
          class="badge badge--discount"
          aria-label="Descuento del ${discountPercent} por ciento"
        >
          -${discountPercent}%
        </span>
      </div>

      <div class="product-card__body">
        ${reason ? `<p class="product-card__reason">${icon("sparkle", { size: 13 })} ${escapeHtml(reason)}</p>` : ""}
        <p class="product-card__category">${categoryLabel}</p>
        <h3 class="product-card__name">
          <a href="producto.html?id=${encodeURIComponent(product.id)}">${escapeHtml(product.name)}</a>
        </h3>

        <div class="product-card__prices">
          <span class="price-old tabular-nums">${formatPriceMXN(product.previousPrice)}</span>
          <span class="price-new tabular-nums" aria-label="Precio actual ${formatPriceMXN(product.currentPrice)}">${formatPriceHTML(product.currentPrice)}</span>
        </div>

        <span class="chip chip--savings">Ahorras ${formatPriceMXN(savings)}</span>

        ${
          isFeatured && belowHistoricMinPercent > 0
            ? `<p class="product-card__proof">
                 ${icon("shieldCheck", { size: 16 })}
                 ${belowHistoricMinPercent}% por debajo de su precio mínimo histórico
               </p>`
            : product.lowestSeen
              ? `<p class="product-card__proof">
                   ${icon("shieldCheck", { size: 16 })}
                   El precio más bajo que hemos visto en ${product.historyDays} ${product.historyDays === 1 ? "día" : "días"}
                 </p>`
              : ""
        }

        <div class="product-card__footer">
          <span class="product-card__verified">
            ${icon("checkCircle", { size: 15 })}
            Verificado ${formatHoursAgoLabel(product.checkedHoursAgo)}
          </span>

          <a
            class="btn btn--cta"
            href="${product.storeUrl}"
            target="_blank"
            rel="noopener sponsored"
          >
            Ver oferta
            <span class="btn__icon-circle">${icon("arrowRight", { size: 14 })}</span>
          </a>
        </div>
      </div>
    </article>
  `;
}

/**
 * Adelanto bloqueado (plan Gratis): una oferta que apareció hace menos de 2 h.
 * Muestra lo justo para antojar (categoría, descuento, cuánto falta) pero no
 * el nombre ni el precio: con eso cualquiera la buscaría directo en la tienda.
 */
export function renderLockedCard(product, categoryLabel) {
  const discountPercent = calculateDiscountPercent(product.previousPrice, product.currentPrice);
  const categoryIconName = CATEGORY_ICON_BY_SLUG[product.categorySlug] ?? "tag";
  const age = formatAge(Date.now() - product.firstSeenAt);
  const wait = formatWait(product.unlocksAt - Date.now());
  return `
    <article class="product-card product-card--locked" data-product-id="${product.id}" data-unlocks-at="${product.unlocksAt}" data-tone="${product.categorySlug}">
      <div class="product-card__media product-card__media--${product.categorySlug} ${product.image ? "has-photo" : ""}">
        ${
          product.image
            ? `<img class="product-card__photo product-card__photo--blurred" src="${escapeAttr(product.image)}" alt="" loading="lazy" decoding="async" />`
            : `<div class="product-card__glyph" aria-hidden="true">${icon(categoryIconName, { size: 40 })}</div>`
        }
        <span class="locked-card__lock" aria-hidden="true">${icon("lock", { size: 22 })}</span>
        <span class="chip chip--store">${product.storeCode}</span>
        <span class="badge badge--discount" aria-label="Descuento del ${discountPercent} por ciento">-${discountPercent}%</span>
      </div>
      <div class="product-card__body">
        <p class="product-card__category">${categoryLabel}</p>
        <h3 class="product-card__name">Oferta nueva ${age}</h3>
        <p class="locked-card__text">
          <strong>Plus la ve ahora.</strong>
          <span>En Gratis se libera en <span class="tabular-nums" data-unlock-wait>${wait}</span>.</span>
        </p>
        <div class="product-card__footer">
          <a class="btn btn--cta" href="planes.html">
            Verla con Plus
            <span class="btn__icon-circle">${icon("arrowRight", { size: 14 })}</span>
          </a>
        </div>
      </div>
    </article>
  `;
}

/** Loader de tarjeta mientras se "carga" el catálogo (estado de carga real, no un spinner genérico). */
export function renderProductCardSkeleton() {
  return `
    <div class="product-card product-card--skeleton" aria-hidden="true">
      <div class="product-card__media"></div>
      <div class="product-card__body">
        <div class="skeleton-line skeleton-line--xs"></div>
        <div class="skeleton-line skeleton-line--lg"></div>
        <div class="skeleton-line skeleton-line--md"></div>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
