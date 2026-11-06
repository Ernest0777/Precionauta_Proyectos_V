import { formatPriceMXN, calculateDiscountPercent } from './format.js';
import { CATEGORIES } from '../data/categories.js';

const WIDTH = 1200;
const HEIGHT = 630;
const INK = '#191919';
const CREAM = '#f8f5ed';
const YELLOW = '#f9df45';
const font = (size, weight = 600) => `${weight} ${size}px Inter, Arial, sans-serif`;

export function wrapCardText(context, value, maxWidth, maxLines = 3) {
  const words = String(value ?? '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && context.measureText(`${line} ${word}`).width <= maxWidth) {
      line += ` ${word}`;
      continue;
    }
    if (line) { lines.push(line); line = ''; }
    for (const char of Array.from(word)) {
      if (context.measureText(line + char).width > maxWidth && line) {
        lines.push(line.trimEnd());
        line = char.trimStart();
      } else line += char;
    }
  }
  if (line) lines.push(line.trimEnd());
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && context.measureText(last + '…').width > maxWidth) last = Array.from(last).slice(0, -1).join('');
    lines[maxLines - 1] = last.trimEnd() + '…';
  }
  return lines;
}

export function containImage(width, height, box) {
  const scale = Math.min(box.width / width, box.height / height);
  const w = width * scale;
  const h = height * scale;
  return { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h };
}

export function productShareUrl(product) {
  const url = new URL('producto.html', window.location.href);
  url.searchParams.set('id', product.id);
  url.hash = '';
  return url.href;
}

async function loadProductPhoto(id) {
  let objectUrl;
  try {
    const api = (window.PRECIONAUTA_API ?? 'http://localhost:3001/api').replace(/\/$/, '');
    const response = await fetch(`${api}/share/${encodeURIComponent(id)}/image`, {
      credentials: 'include', signal: AbortSignal.timeout(6000),
    });
    if (!response.ok || !/^image\/(?:png|jpeg|webp)(?:;|$)/i.test(response.headers.get('content-type') || '')) return null;
    const blob = await response.blob();
    if (blob.size > 5 * 1024 * 1024) return null;
    objectUrl = URL.createObjectURL(blob);
    const photo = new Image();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Imagen no disponible')), 5000);
      photo.onload = () => { clearTimeout(timer); resolve(); };
      photo.onerror = () => { clearTimeout(timer); reject(new Error('Imagen no disponible')); };
      photo.src = objectUrl;
    });
    return photo.naturalWidth && photo.naturalHeight ? photo : null;
  } catch { return null; }
  finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
}

function fittedText(context, text, x, y, width, size, weight = 600) {
  context.font = font(size, weight);
  const measured = context.measureText(text).width;
  if (measured > width) context.font = font(size * width / measured, weight);
  context.fillText(text, x, y);
}

/** Local composition uses only the authorized raster proxy, so the canvas stays exportable. */
export async function buildShareCard(product) {
  if (!product || product.locked || typeof product.id !== 'string' || !product.id ||
    !Number.isFinite(product.currentPrice) || product.currentPrice < 0) throw new Error('No hay un precio disponible para compartir.');
  await document.fonts?.ready;
  const photo = await loadProductPhoto(product.id);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no puede crear la imagen.');
  ctx.textBaseline = 'top';
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, WIDTH, 90);
  ctx.fillStyle = YELLOW;
  ctx.font = font(35, 800);
  ctx.fillText('Precionauta', 42, 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(18);
  ctx.fillText(product.live === false ? 'PRODUCTO DE DEMOSTRACIÓN' : 'BUENOS PRECIOS. A LA VISTA.', 800, 36);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(42, 122, 428, 390);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(42, 122, 428, 390);
  if (photo) {
    const rect = containImage(photo.naturalWidth, photo.naturalHeight, { x: 62, y: 142, width: 388, height: 350 });
    ctx.drawImage(photo, rect.x, rect.y, rect.width, rect.height);
  } else {
    ctx.strokeStyle = '#77746c';
    ctx.lineWidth = 4;
    ctx.strokeRect(221, 252, 70, 58);
    ctx.beginPath();
    ctx.moveTo(222, 300); ctx.lineTo(244, 278); ctx.lineTo(260, 293); ctx.lineTo(279, 270); ctx.lineTo(290, 285);
    ctx.stroke();
    ctx.fillStyle = '#66635c';
    ctx.font = font(19);
    ctx.textAlign = 'center';
    ctx.fillText('Imagen no disponible', 256, 334);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = INK;
  const category = CATEGORIES.find(c => c.slug === (product.categorySlug || product.category))?.label || 'Ofertas';
  fittedText(ctx, `${category.toUpperCase()}  /  ${product.store || 'Mercado Libre'}`, 512, 126, 644, 19, 700);
  ctx.font = font(43, 800);
  const title = wrapCardText(ctx, product.name || product.title || 'Producto', 644, 3);
  title.forEach((line, i) => ctx.fillText(line, 512, 169 + i * 50));
  ctx.font = font(18);
  ctx.fillText(product.live === false || product.source === 'demo' ? 'PRECIO DE DEMOSTRACIÓN' : 'PRECIO OBSERVADO · MXN', 512, 337);
  fittedText(ctx, formatPriceMXN(product.currentPrice), 512, 365, 644, 76, 800);

  const previous = product.previousPrice ?? product.originalPrice;
  const discount = Number.isFinite(previous) && previous > 0 && previous > product.currentPrice
    ? calculateDiscountPercent(previous, product.currentPrice) : 0;
  if (discount > 0) {
    ctx.fillStyle = YELLOW;
    ctx.fillRect(512, 458, 160, 42);
    ctx.strokeRect(512, 458, 160, 42);
    ctx.fillStyle = INK;
    ctx.font = font(22, 800);
    ctx.fillText(`−${discount}%`, 533, 467);
    fittedText(ctx, `Antes ${formatPriceMXN(previous)}`, 694, 470, 462, 19);
  }

  const observed = product.lastObservedAt ?? product.validatedAt ?? product.checkedAt ?? product.lastCheckedAt ?? product.updatedAt;
  const when = observed == null ? null : new Date(observed);
  ctx.fillStyle = INK;
  ctx.font = font(14, 500);
  const caption = when && Number.isFinite(when.getTime())
    ? `Observado ${when.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })} · Confirma precio y disponibilidad al abrir.`
    : 'Confirma el precio y la disponibilidad al abrir el enlace.';
  ctx.fillText(caption, 42, 534);
  const url = productShareUrl(product);
  ctx.fillRect(0, 568, WIDTH, 62);
  ctx.fillStyle = '#ffffff';
  fittedText(ctx, url, 42, 588, 1116, 20, 600);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('No pudimos crear la imagen.')), 'image/png'));
  return { blob, url };
}

function saveBlob(blob, id) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `precionauta-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    // Browsers need the object URL alive while they start the download.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

export async function downloadShareCard(product) {
  const result = await buildShareCard(product);
  saveBlob(result.blob, product.id);
  return result;
}

export async function shareNativeCard(product) {
  const result = await buildShareCard(product);
  const file = new File([result.blob], `precionauta-${product.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: product.name || product.title || 'Precionauta', url: result.url });
      return { status: 'shared' };
    } catch (error) {
      if (error.name === 'AbortError') return { status: 'cancelled' };
    }
  }
  saveBlob(result.blob, product.id);
  return { status: 'downloaded' };
}
