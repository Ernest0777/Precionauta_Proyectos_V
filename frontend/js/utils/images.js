const FALLBACK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><rect width="480" height="480" fill="#f3f0e8"/><g fill="none" stroke="#171717" stroke-width="8"><rect x="160" y="135" width="160" height="145" rx="4"/><path d="m163 255 47-48 38 35 30-29 40 42"/><circle cx="275" cy="175" r="13"/></g><text x="240" y="332" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#171717">Imagen no disponible</text></svg>';
export const IMAGE_FALLBACK = `data:image/svg+xml,${encodeURIComponent(FALLBACK_SVG)}`;

export function productImages(product) {
  const images = Array.isArray(product.images) ? product.images : [];
  return [...new Set([...images, product.image].filter((src) => typeof src === 'string' && src.trim()))];
}

/** Imagen decorativa junto al nombre del producto; comparte el respaldo de tarjetas y galería. */
export function renderProductImage(product, className = '') {
  const src = productImages(product)[0];
  if (!src) return '';
  const attr = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<img class="${attr(className)}" src="${attr(src)}" alt="" data-product-image data-image-label="${attr(product.name ?? product.label)}" loading="lazy" decoding="async" />`;
}

export function handleImageError(event) {
  const img = event.target;
  if (img?.tagName !== 'IMG' || !img.hasAttribute('data-product-image') || img.dataset.imageFailed) return;
  img.dataset.imageFailed = 'true';
  img.removeAttribute('srcset');
  img.alt = img.dataset.imageLabel ? `Imagen no disponible de ${img.dataset.imageLabel}` : 'Imagen no disponible';
  img.src = IMAGE_FALLBACK;
}

// Captura también imágenes insertadas después de cargar este módulo.
if (typeof document !== 'undefined') document.addEventListener('error', handleImageError, true);
