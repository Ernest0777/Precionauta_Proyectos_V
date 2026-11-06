const express = require('express');
const axios = require('axios');
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');
const dealFetcher = require('./deal-fetcher');
const moderation = require('../admin/moderation');
const { isLocked, selectDealsForAccess } = require('./access');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const router = express.Router();

function allowedImageUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    if (!(url.hostname === 'mlstatic.com' || url.hostname.endsWith('.mlstatic.com'))) return null;
    return url.href;
  } catch { return null; }
}

function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  // Only global unicast IPv6; reject mapped IPv4, local, transition and documentation ranges.
  return net.isIP(address) === 6 && /^[23]/i.test(address) && !/^200[12]:/i.test(address) && !/^2001:(?:0*:|0?db8:)/i.test(address) && !/^3fff:/i.test(address);
}

function safeLookup(hostname, options, callback) {
  if (!allowedImageUrl(`https://${hostname}/`)) return callback(new Error('Host de imagen no permitido'));
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses?.length || addresses.some(entry => !publicAddress(entry.address))) return callback(new Error('Dirección de imagen no permitida'));
    const matching = options?.family ? addresses.filter(entry => entry.family === options.family) : addresses;
    if (!matching.length) return callback(new Error('Dirección de imagen no disponible'));
    if (options?.all) callback(null, matching);
    else callback(null, matching[0].address, matching[0].family);
  });
}

function validRaster(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.length > MAX_IMAGE_BYTES) return false;
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (mime === 'image/webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

async function fetchImage(url) {
  const safeUrl = allowedImageUrl(url);
  if (!safeUrl) throw new Error('Imagen no permitida');
  const agent = new https.Agent({ lookup: safeLookup });
  try {
    const response = await axios.get(safeUrl, {
      responseType: 'arraybuffer', timeout: 5000, signal: AbortSignal.timeout(5000),
      maxRedirects: 0, maxContentLength: MAX_IMAGE_BYTES, maxBodyLength: MAX_IMAGE_BYTES,
      httpsAgent: agent, proxy: false, validateStatus: status => status === 200,
      headers: { Accept: 'image/jpeg,image/png,image/webp' },
    });
    const mime = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const buffer = Buffer.from(response.data);
    if (Number(response.headers['content-length']) > MAX_IMAGE_BYTES || !validRaster(buffer, mime)) throw new Error('Imagen inválida');
    return { buffer, mime };
  } finally { agent.destroy(); }
}

router.get('/share/:id/image', async (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  try {
    const deals = moderation.applyPublic(await dealFetcher.fetchAllDeals());
    let deal = selectDealsForAccess(deals, req.access).find(item => item.id === req.params.id);
    // Only the owner can share a tracked snapshot that has left the public catalog.
    if (!deal && req.account?.id && !deals.some(item => item.id === req.params.id)) {
      const tracked = require('../db/tracked-products');
      if (tracked.owned(req.account.id).some(item => item.id === req.params.id)) {
        const snapshot = tracked.get(req.params.id);
        deal = snapshot && moderation.applyPublic([snapshot])[0];
      }
    }
    if (!deal) return res.status(req.access.level === 'visitor' ? 401 : 404).json({ success: false, error: 'Producto no disponible para compartir' });
    if (isLocked(deal, req.access)) return res.status(403).json({ success: false, error: 'Esta oferta todavía no está disponible en tu plan' });
    const candidates = [deal.thumbnail, ...(Array.isArray(deal.pictures) ? deal.pictures.map(p => typeof p === 'string' ? p : p?.secure_url || p?.url) : [])];
    const imageUrl = candidates.map(allowedImageUrl).find(Boolean);
    if (!imageUrl) return res.status(404).json({ success: false, error: 'Imagen no disponible' });
    try {
      const { buffer, mime } = await fetchImage(imageUrl);
      return res.type(mime).send(buffer);
    } catch {
      return res.status(502).json({ success: false, error: 'No se pudo cargar la imagen del producto' });
    }
  } catch (error) { next(error); }
});

module.exports = router;
module.exports.allowedImageUrl = allowedImageUrl;
module.exports.publicAddress = publicAddress;
module.exports.safeLookup = safeLookup;
module.exports.validRaster = validRaster;
module.exports.fetchImage = fetchImage;
module.exports.MAX_IMAGE_BYTES = MAX_IMAGE_BYTES;
