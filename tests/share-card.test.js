const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=', 'base64');

test('share image proxy authorizes known products and confines raster downloads', async t => {
  const restored = [];
  const stub = (file, exports) => {
    const id = require.resolve(file);
    restored.push([id, require.cache[id]]);
    require.cache[id] = { id, filename: id, loaded: true, exports };
  };
  const deals = Array.from({ length: 8 }, (_, i) => ({ id: `deal-${i}`, thumbnail: 'https://http2.mlstatic.com/photo.png', source: 'real' }));
  deals[1].locked = true;
  let calls = [];
  let payload = { data: png, headers: { 'content-type': 'image/png' } };
  stub('../backend/api/deal-fetcher', { fetchAllDeals: async () => deals });
  stub('../backend/admin/moderation', { applyPublic: items => items.filter(p => !p.hidden) });
  const tracked = { id: 'owned-product', thumbnail: 'https://http2.mlstatic.com/owned.png' };
  stub('../backend/db/tracked-products', {
    owned: userId => userId === 'owner' ? [tracked] : [],
    get: id => id === tracked.id ? tracked : null,
  });
  stub('../backend/api/access', {
    selectDealsForAccess: (items, access) => access.level === 'visitor' ? items.filter(p => !p.locked).slice(0, 6) : items,
    isLocked: p => p.locked,
  });
  stub('axios', { get: async (url, options) => { calls.push({ url, options }); return payload; } });
  const routerPath = require.resolve('../backend/api/share-routes');
  const router = require(routerPath);
  t.after(() => {
    delete require.cache[routerPath];
    for (const [id, value] of restored) { if (value) require.cache[id] = value; else delete require.cache[id]; }
  });
  const handler = router.stack.find(layer => layer.route?.path === '/share/:id/image').route.stack[0].handle;
  const request = async (id, level = 'visitor', query = {}, userId) => {
    const response = { statusCode: 200, headers: {}, set(name, value) { this.headers[name] = value; return this; },
      status(value) { this.statusCode = value; return this; }, type(value) { this.mime = value; return this; },
      send(value) { this.body = value; return this; }, json(value) { this.body = value; return this; } };
    await handler({ params: { id }, access: { level }, query, account: userId ? { id: userId } : null }, response, error => { throw error; });
    return response;
  };

  await t.test('URL whitelist and DNS reject credentials, lookalikes and private addresses', () => {
    assert.equal(router.allowedImageUrl('https://http2.mlstatic.com/a.jpg'), 'https://http2.mlstatic.com/a.jpg');
    for (const url of ['http://http2.mlstatic.com/a', 'https://mlstatic.com.evil.test/a', 'https://evilmlstatic.com/a',
      'https://user:pass@http2.mlstatic.com/a', 'https://http2.mlstatic.com:444/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'file:///a']) {
      assert.equal(router.allowedImageUrl(url), null, url);
    }
    for (const ip of ['127.0.0.1', '10.2.3.4', '172.16.0.1', '192.168.1.2', '169.254.169.254', '100.64.1.2', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) assert.equal(router.publicAddress(ip), false, ip);
    assert.equal(router.publicAddress('8.8.8.8'), true);
    assert.equal(router.publicAddress('2606:4700:4700::1111'), true);
  });

  await t.test('safe DNS lookup pins public results and refuses any private result', async () => {
    const dns = require('node:dns');
    const original = dns.lookup;
    try {
      dns.lookup = (_, options, callback) => callback(null, [{ address: '127.0.0.1', family: 4 }]);
      const privateError = await new Promise(resolve => router.safeLookup('http2.mlstatic.com', {}, error => resolve(error)));
      assert.match(privateError.message, /no permitida/);
      dns.lookup = (_, options, callback) => callback(null, [{ address: '8.8.8.8', family: 4 }]);
      const address = await new Promise((resolve, reject) => router.safeLookup('http2.mlstatic.com', {}, (error, ip) => error ? reject(error) : resolve(ip)));
      assert.equal(address, '8.8.8.8');
    } finally { dns.lookup = original; }
  });

  await t.test('visitor cannot widen its six products or fetch a locked/unknown image', async () => {
    for (const id of ['deal-1', 'deal-7', 'unknown']) assert.equal((await request(id, 'visitor', { url: 'http://127.0.0.1' })).statusCode, 401);
    assert.equal((await request('deal-1', 'free')).statusCode, 403);
    assert.equal((await request('unknown', 'free')).statusCode, 404);
    assert.equal(calls.length, 0);
    const response = await request('deal-0', 'visitor', { url: 'https://evil.test' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, png);
    assert.equal(response.mime, 'image/png');
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
    const download = calls[0];
    assert.equal(download.url, deals[0].thumbnail);
    assert.equal(download.options.maxRedirects, 0);
    assert.equal(download.options.timeout, 5000);
    assert.equal(download.options.maxContentLength, 5 * 1024 * 1024);
    assert.equal(download.options.proxy, false);
    assert.equal(download.options.httpsAgent.options.lookup, router.safeLookup);
  });

  await t.test('absent photos avoid fetch; invalid MIME, signatures and oversized photos fail closed', async () => {
    calls = [];
    deals[0].thumbnail = null;
    assert.equal((await request('deal-0')).statusCode, 404);
    assert.equal(calls.length, 0);
    deals[0].thumbnail = 'https://http2.mlstatic.com/a';
    for (const item of [
      { data: png, headers: { 'content-type': 'image/svg+xml' } },
      { data: Buffer.from('<html>not a raster</html>'), headers: { 'content-type': 'image/png' } },
      { data: png, headers: { 'content-type': 'image/png', 'content-length': router.MAX_IMAGE_BYTES + 1 } },
      { data: Buffer.alloc(router.MAX_IMAGE_BYTES + 1), headers: { 'content-type': 'image/png' } },
    ]) {
      payload = item;
      assert.equal((await request('deal-0')).statusCode, 502);
    }
    assert.equal(router.validRaster(Buffer.from('<svg><path/></svg>'), 'image/svg+xml'), false);
  });

  await t.test('tracked products remain private to their owner and obey moderation and delay', async () => {
    payload = { data: png, headers: { 'content-type': 'image/png' } };
    assert.equal((await request(tracked.id, 'visitor')).statusCode, 401);
    assert.equal((await request(tracked.id, 'free', {}, 'other')).statusCode, 404);
    assert.equal((await request(tracked.id, 'free', {}, 'owner')).statusCode, 200);
    tracked.locked = true;
    assert.equal((await request(tracked.id, 'free', {}, 'owner')).statusCode, 403);
    tracked.locked = false;
    tracked.hidden = true;
    assert.equal((await request(tracked.id, 'free', {}, 'owner')).statusCode, 404);
  });
});

test('share card keeps exact prices, bounded geometry and an honest downloadable fallback', async t => {
  const source = await fs.readFile(path.join(__dirname, '../frontend/js/utils/shareCard.js'), 'utf8');
  const format = await fs.readFile(path.join(__dirname, '../frontend/js/utils/format.js'), 'utf8');
  const categories = await fs.readFile(path.join(__dirname, '../frontend/js/data/categories.js'), 'utf8');
  const encode = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
  const code = source.replace("'./format.js'", JSON.stringify(encode(format))).replace("'../data/categories.js'", JSON.stringify(encode(categories)));
  const texts = [];
  const requests = [];
  let clicked = false;
  let downloaded = '';
  const ctx = { measureText: text => ({ width: Array.from(text).length * 10 }), fillText: text => texts.push(text),
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, drawImage() {} };
  const originals = Object.fromEntries(['window', 'document', 'fetch', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  setGlobal('window', { location: { href: 'https://precionauta.test/producto.html?id=old#gallery' }, PRECIONAUTA_API: 'https://api.precionauta.test/api' });
  setGlobal('document', { fonts: { ready: Promise.resolve() }, body: { append() {} }, createElement: tag => tag === 'canvas' ? {
    getContext: () => ctx, toBlob: callback => callback(new Blob([png], { type: 'image/png' })),
  } : { set download(value) { downloaded = value; }, click() { clicked = true; }, remove() {} } });
  setGlobal('fetch', async (url, options) => { requests.push({ url, options }); return { ok: false }; });
  setGlobal('navigator', { canShare: () => true, share: async () => { throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }); } });
  t.after(() => { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const card = await import(encode(code));
  const product = { id: 'MLM123', name: 'Cafetera profesional con molino', store: 'Mercado Libre', categorySlug: 'hogar', currentPrice: 124.9, previousPrice: 0 };
  const rect = card.containImage(1000, 200, { x: 20, y: 20, width: 400, height: 300 });
  assert.deepEqual(rect, { x: 20, y: 130, width: 400, height: 80 });
  const lines = card.wrapCardText(ctx, 'Una cafetera con un nombre extremadamente largo y muchos caracteres', 100, 3);
  assert.equal(lines.length, 3);
  assert.ok(lines.every(line => ctx.measureText(line).width <= 100));
  assert.ok(lines[2].endsWith('…'));
  assert.deepEqual(card.wrapCardText(ctx, 'Uno dos tres', 75), ['Uno dos', 'tres']);
  assert.equal(card.productShareUrl(product), 'https://precionauta.test/producto.html?id=MLM123');
  const result = await card.buildShareCard(product);
  assert.equal(result.blob.type, 'image/png');
  assert.ok(texts.includes('$124.90'));
  assert.ok(texts.includes('Imagen no disponible'));
  assert.ok(texts.includes('PRECIO OBSERVADO · MXN'));
  assert.ok(texts.includes(result.url));
  assert.equal(texts.some(text => text.includes('%')), false);
  assert.equal(requests[0].url, 'https://api.precionauta.test/api/share/MLM123/image');
  assert.equal(requests[0].options.credentials, 'include');
  await assert.rejects(card.buildShareCard({ ...product, currentPrice: NaN }), /precio/);
  await assert.rejects(card.buildShareCard({ ...product, locked: true }), /precio/);
  texts.length = 0;
  await card.downloadShareCard({ ...product, previousPrice: 200 });
  assert.equal(clicked, true);
  assert.equal(downloaded, 'precionauta-MLM123.png');
  assert.ok(texts.includes('−38%'));
  clicked = false;
  assert.deepEqual(await card.shareNativeCard(product), { status: 'cancelled' });
  assert.equal(clicked, false, 'Cancelling the native dialog must not start a second download');
});
