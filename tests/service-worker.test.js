const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker() {
  const handlers = {};
  const fetched = [];
  const deleted = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../frontend/sw.js'), 'utf8'), {
    URL, Response,
    self: { location: { origin: 'https://shop.test' }, addEventListener: (type, handler) => { handlers[type] = handler; },
      clients: { claim: async () => {} } },
    caches: {
      open: async () => ({ put: async () => {} }),
      keys: async () => ['precionauta-v1', 'precionauta-v2', 'another-app-cache'],
      delete: async key => { deleted.push(key); },
    },
    fetch: async (request, options) => { fetched.push({ request, options }); return new Response('fixture'); },
  });
  const request = async (pathname, properties = {}) => {
    let response;
    handlers.fetch({ request: { url: `https://shop.test${pathname}`, method: 'GET', mode: 'cors', ...properties },
      respondWith: value => { response = value; } });
    return response ? await response : undefined;
  };
  return { handlers, fetched, deleted, request };
}

test('service worker revalidates page code while retaining normal image caching', async () => {
  const sw = worker();
  for (const pathname of ['/perfil.html', '/js/detail.js?v=2', '/css/base.css']) {
    await sw.request(pathname);
    assert.equal(sw.fetched.at(-1).options?.cache, 'no-cache', pathname);
  }
  await sw.request('/planes', { mode: 'navigate' });
  assert.equal(sw.fetched.at(-1).options?.cache, 'no-cache');
  await sw.request('/assets/photo.webp');
  assert.equal(sw.fetched.at(-1).options?.cache, undefined);
});

test('service worker leaves account APIs and foreign origins to the browser', async () => {
  const sw = worker();
  assert.equal(await sw.request('/api/account/session'), undefined);
  assert.equal(await sw.request('/api'), undefined);
  assert.equal(await sw.request('/js/app.js', { url: 'https://foreign.test/js/app.js' }), undefined);
  assert.equal(sw.fetched.length, 0);
});

test('service worker activation removes only obsolete Precionauta caches', async () => {
  const sw = worker();
  let activation;
  sw.handlers.activate({ waitUntil: value => { activation = value; } });
  await activation;
  assert.deepEqual(sw.deleted, ['precionauta-v1']);
});
