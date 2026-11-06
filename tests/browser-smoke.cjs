// Optional browser verification: requires Playwright in NODE_PATH. Uses isolated fixtures only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');

async function main() {
  const out = path.resolve('.playwright-cli');
  fs.mkdirSync(out, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(out, 'account-qa-'));
  process.env.PRECIONAUTA_DB = path.join(dataDir, 'test.db');
  process.env.PRECIONAUTA_MODERATION_FILE = path.join(dataDir, 'moderation.json');
  process.env.NODE_ENV = 'test';
  const front = express();
  front.use(express.static(path.resolve('frontend')));
  const frontend = front.listen(0, '127.0.0.1');
  await new Promise(resolve => frontend.once('listening', resolve));
  const origin = `http://127.0.0.1:${frontend.address().port}`;
  process.env.FRONTEND_URL = origin;
  process.env.RESEND_API_KEY = 're_test_isolated_fixture';
  process.env.RECOVERY_FROM = 'Precionauta <test@example.test>';
  let recoveryMail;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url) === 'https://api.resend.com/emails') {
      recoveryMail = JSON.parse(options.body);
      return new Response(JSON.stringify({ id: 'test-message' }), { status: 200 });
    }
    return originalFetch(url, options);
  };
  const configFile = require.resolve('../backend/config/config');
  require.cache[configFile] = { id: configFile, filename: configFile, loaded: true, exports: {
    mercadoLibre: { apiBase: 'https://example.invalid' }, admin: { password: 'QA-local-admin', secret: 'qa-local-isolated-secret' }, telegram: {}, affiliate: {},
    server: { port: 0, env: 'test' }, discountRange: { min: 20, max: 99 },
  } };
  const fetcher = require('../backend/api/deal-fetcher');
  const history = require('../backend/db/price-history');
  const db = require('../backend/db/database');
  const now = Date.now();
  const deals = Array.from({ length: 7 }, (_, i) => ({
    id: `qa-${i}`, title: `Audífonos de prueba ${i}`, category: 'tecnologia', source: 'mercadolibre',
    currentPrice: i === 1 ? 90 : 100 + i, originalPrice: 500, discount: i === 1 ? 82 : 80 - i / 5, savings: i === 1 ? 410 : 400 - i,
    permalink: 'https://www.mercadolibre.com.mx/p/qa', thumbnail: origin + (i === 1 ? '/assets/favicon.svg' : '/qa-missing-image.png'),
    pictures: [origin + (i === 1 ? '/assets/favicon.svg' : '/qa-missing-image.png')], specs: [{ label: 'Tipo', value: 'Prueba' }],
    validatedAt: new Date().toISOString(), description: 'Producto controlado para verificar la interfaz.',
  }));
  deals[0].availability = 'unavailable';
  deals[0].stock = 0;
  history.record(deals.slice(0, 6), now - 50 * 86400000);
  history.record(deals.slice(0, 6).map(deal => ({ ...deal, currentPrice: deal.currentPrice + 20 })), now - 2 * 86400000);
  history.record(deals.slice(0, 6), now - 86400000);
  history.record(deals.slice(6), now - 1000);
  fetcher.fetchAllDeals = async () => deals;
  fetcher.refresh = async () => { fetcher.cache.lastUpdated = new Date(); return deals; };
  fetcher.cache = { ...fetcher.cache, deals, validatedDeals: deals, lastUpdated: new Date(), source: 'mercadolibre' };
  const automation = require('../backend/admin/automation');
  automation.evaluate(deals, { source: 'mercadolibre', at: new Date() });
  const backend = require('../backend/server').listen(0, '127.0.0.1');
  await new Promise(resolve => backend.once('listening', resolve));
  const api = `http://127.0.0.1:${backend.address().port}/api`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.PRECIONAUTA_QA_BROWSER || 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript(({ api }) => {
      window.PRECIONAUTA_API = api;
      localStorage.setItem('precionauta:onboarded', '1');
      localStorage.setItem('precionauta:plan', JSON.stringify({ id: 'plus' }));
    }, { api });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/index.html');
    await page.locator('#catalogGrid .product-card').first().waitFor();
    assert.equal(await page.locator('#catalogGrid .product-card').count(), 6, 'visitor sees six offers');
    await page.locator('#catalogGrid [data-save-toggle]').first().click();
    await page.locator('#authModal.is-open [data-auth-panel="register"]:not([hidden])').waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('precionauta:saved-offers') || '[]').length), 0, 'visitor cannot save locally');
    await page.keyboard.press('Escape');
    await page.goto(origin + '/temporada.html?temporada=hot-sale');
    assert.equal(await page.locator('#minGrid .product-card, #strongGrid .product-card').count(), 0, 'visitor has no season offers');
    await page.locator('[data-register]').first().click();
    await page.locator('#authModal.is-open').waitFor();
    await page.goto(origin + '/producto.html?id=qa-6');
    await page.getByRole('heading', { name: 'Hay más ofertas para ti' }).waitFor();
    assert.equal(await page.locator('#productDetail .price-panel').count(), 0, 'out-of-preview detail reveals no other product');
    await page.goto(origin + '/planes.html');
    await page.locator('.plan-card').last().waitFor();
    assert.equal(await page.locator('.plan-card').count(), 2);
    assert.match(await page.locator('#plan-plus').locator('..').innerText(), /79/);
    await page.locator('[data-period="anual"]').click();
    assert.match(await page.locator('#plan-plus').locator('..').innerText(), /790/);
    await page.screenshot({ path: path.join(out, 'planes-desktop.png'), fullPage: true });
    await page.locator('[data-checkout="plus"]').click();
    await page.locator('#authModal.is-open').waitFor();
    assert.equal(await page.locator('dialog[open]').count(), 0, 'visitor cannot activate Plus using forged localStorage');
    await page.locator('[data-auth-tab="register"]').click();
    const form = page.locator('[data-auth-panel="register"]');
    await form.locator('[name="name"]').fill('Ana de prueba');
    await form.locator('[name="email"]').fill('ana-qa@example.test');
    await form.locator('[name="password"]').fill('Una contraseña de prueba 123');
    await form.locator('[name="password2"]').fill('Una contraseña de prueba 123');
    await Promise.all([page.waitForNavigation(), form.locator('[type="submit"]').click()]);
    await page.locator('.plan-card').last().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Mi perfil', exact: true }).first().count(), 1);

    await page.goto(origin + '/perfil.html');
    await page.locator('#profileMember:not([hidden])').waitFor();
    assert.equal(await page.locator('#profileEmailStatus').innerText(), 'Correo pendiente de verificación');
    await Promise.all([
      page.waitForResponse(res => res.url().endsWith('/api/account/email/request') && res.status() === 202),
      page.locator('#profileVerifyEmail').click(),
    ]);
    const verificationToken = recoveryMail.text.match(/verificar-correo\.html#token=([a-f0-9]+)/)[1];
    await page.goto(origin + '/verificar-correo.html#token=' + verificationToken);
    await Promise.all([
      page.waitForResponse(res => res.url().endsWith('/api/account/email/confirm') && res.status() === 200),
      page.locator('#verify-form button').click(),
    ]);
    assert.equal(new URL(page.url()).hash, '');
    await page.goto(origin + '/perfil.html');
    await page.waitForFunction(() => document.getElementById('profileEmailStatus')?.textContent === 'Correo verificado');
    assert.equal(await page.locator('#profileVerifyEmail').isVisible(), false);

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(origin + '/perfil.html');
      await page.locator('#profileMember:not([hidden])').waitFor();
      await page.locator('#siteHeader .brand').click();
      await page.waitForURL(origin + '/index.html#inicio', { timeout: 4000 });
      await page.goto(origin + '/perfil.html');
      await page.locator('#profileMember:not([hidden])').waitFor();
      if (width < 1024) await page.locator('#mobileMenuToggle').click();
      const navigation = width < 1024 ? page.locator('#mobileMenuPanel') : page.locator('.nav-bar__links');
      await navigation.getByText('Ofertas', { exact: true }).click();
      await page.waitForURL(origin + '/index.html#catalogo', { timeout: 4000 });
      await page.locator('#catalogGrid .product-card').first().waitFor();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.goto(origin + '/index.html');
    await page.locator('#catalogGrid .product-card').first().waitFor();
    assert.equal(await page.locator('.stay-connected, #subscribeForm').count(), 0);
    for (const width of [1280, 1366, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const before = await page.locator('#siteHeader').boundingBox();
      const searchBox = await page.locator('#search-container').boundingBox();
      assert.ok(searchBox.width < width * .5, 'desktop search stays compact');
      await page.locator('#search-container input').focus();
      const after = await page.locator('#siteHeader').boundingBox();
      assert.equal(after.height, before.height, 'focus must not shift the header');
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-category-menu-trigger]').click();
    await page.locator('#categoryMenu .mega-preview__photo').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const photo = document.querySelector('#categoryMenu .mega-preview__photo');
      return photo?.complete && photo.naturalWidth > 0 && photo.src.endsWith('/assets/favicon.svg');
    });
    await page.locator('#categoryMenu').screenshot({ path: path.join(out, 'categorias-foto.png') });
    await page.keyboard.press('Escape');
    const search = page.locator('#search-container input');
    await search.fill('Audífonos');
    await page.waitForFunction(() => [...document.querySelectorAll('.discovery-suggestion__photo')].some(photo => photo.complete && photo.naturalWidth > 0 && photo.src.endsWith('/assets/favicon.svg')));
    await page.locator('#discoverySuggestions').screenshot({ path: path.join(out, 'buscador-fotos.png') });
    await search.fill('');
    await page.keyboard.press('Escape');
    await search.blur();
    await Promise.all([
      page.waitForResponse(res => res.url().endsWith('/api/account/library') && res.request().method() === 'PATCH' && res.status() === 200),
      page.locator('#catalogGrid .product-card [data-save-toggle]').first().click(),
    ]);
    await page.goto(origin + '/perfil.html');
    await page.locator('#profileMember:not([hidden])').waitFor();
    assert.equal(await page.locator('#profileSavedCount').innerText(), '1', 'card action persists through incremental library API');
    await page.goto(origin + '/producto.html?id=qa-0');
    await page.locator('#reportToggle').click();
    await page.locator('#reportReason').selectOption('incorrect_price');
    await page.locator('#reportNote').fill('La tienda muestra otro precio de prueba.');
    await Promise.all([
      page.waitForResponse(res => res.url().endsWith('/api/deals/qa-0/reports') && res.status() === 201),
      page.locator('#dealReportForm [type="submit"]').click(),
    ]);
    assert.match(await page.locator('#reportFeedback').innerText(), /Recibimos tu reporte/);
    const votes = page.locator('#communityVotes');
    await votes.locator('[data-vote="1"]:not([disabled])').click();
    await page.waitForFunction(() => document.querySelector('[data-vote="1"]')?.getAttribute('aria-pressed') === 'true');
    assert.equal(await votes.locator('[data-vote-up]').innerText(), '1');
    await votes.locator('[data-vote="-1"]').click();
    await page.waitForFunction(() => document.querySelector('[data-vote="-1"]')?.getAttribute('aria-pressed') === 'true');
    assert.equal(await votes.locator('[data-vote-up]').innerText(), '0');
    assert.equal(await votes.locator('[data-vote-down]').innerText(), '1');
    await votes.locator('[data-vote="-1"]').click();
    await page.waitForFunction(() => document.querySelector('[data-vote-down]')?.textContent === '0');
    await page.waitForFunction(async api => {
      const owner = (await import('/js/utils/account.js')).accountState().user?.id;
      const result = await fetch(api + '/community/activity', { credentials: 'include', headers: { 'X-Account-Id': owner } }).then(r => r.json());
      return result.data?.some(e => e.type === 'view' && e.id === 'qa-0');
    }, api);
    await page.locator('[data-history-coverage]').waitFor();
    const priceChart = page.locator('#priceChart .price-chart__svg');
    await priceChart.scrollIntoViewIfNeeded();
    const chartBox = await priceChart.boundingBox();
    await page.mouse.move(chartBox.x + chartBox.width * .25, chartBox.y + chartBox.height * .5);
    await page.locator('[data-chart-tooltip]:not([hidden])').waitFor();
    assert.match(await page.locator('[data-chart-price]').innerText(), /120\.00/);
    assert.match(await page.locator('[data-chart-observed]').innerText(), /Observado/);
    await page.mouse.move(chartBox.x + chartBox.width * .75, chartBox.y + chartBox.height * .5);
    assert.match(await page.locator('[data-chart-price]').innerText(), /100\.00/);
    await priceChart.focus();
    await page.keyboard.press('Home');
    assert.match(await priceChart.getAttribute('aria-valuetext'), /120\.00/);
    await page.keyboard.press('End');
    assert.match(await priceChart.getAttribute('aria-valuetext'), /100\.00/);
    await page.locator('#priceChart').screenshot({ path: path.join(out, 'historial-tooltip.png') });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-chart-tooltip]').isVisible(), false);
    await page.setViewportSize({ width: 390, height: 844 });
    await priceChart.scrollIntoViewIfNeeded();
    await priceChart.evaluate(svg => {
      const rect = svg.getBoundingClientRect();
      svg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: rect.x + rect.width * .98, clientY: rect.y + rect.height * .5 }));
    });
    const tooltipBox = await page.locator('[data-chart-tooltip]').boundingBox();
    assert.ok(tooltipBox.x >= 0 && tooltipBox.x + tooltipBox.width <= 391, 'touch tooltip stays inside the mobile viewport');
    await page.locator('#priceChart').screenshot({ path: path.join(out, 'historial-tooltip-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await Promise.all([page.waitForResponse(res => res.url().endsWith('/api/account/library') && res.request().method() === 'PATCH'), page.locator('#alertToggle').click()]);
    await page.locator('[data-alerts-trigger]').first().click();
    const targetEditor = page.locator('[data-target-form="qa-0"]');
    await targetEditor.locator('..').locator('summary').click();
    await targetEditor.locator('[name="targetPrice"]').fill('75.50');
    await targetEditor.locator('[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('[data-target-form="qa-0"] input')?.value === '75.5');
    await page.screenshot({ path: path.join(out, 'alerta-objetivo.png'), fullPage: true });
    await page.goto(origin + '/producto.html?id=qa-0');
    await page.locator('#restockControl [data-restock-toggle]').click();
    await page.getByRole('button', { name: 'Quitar aviso de reposición', exact: true }).waitFor();
    await page.waitForFunction(async api => {
      const state = (await import('/js/utils/account.js')).accountState();
      return state.restockIds?.includes('qa-0');
    }, api);
    const combinedQuota = await page.evaluate(async api => {
      const headers = { 'Content-Type': 'application/json' };
      const add = ids => fetch(api + '/account/library', { method: 'PATCH', credentials: 'include', headers, body: JSON.stringify({ alertAdd: ids }) });
      const allowed = await add(['qa-1']);
      const blocked = await add(['qa-2']);
      await fetch(api + '/account/library', { method: 'PATCH', credentials: 'include', headers, body: JSON.stringify({ alertRemove: ['qa-1'] }) });
      return [allowed.status, blocked.status];
    }, api);
    assert.deepEqual(combinedQuota, [200, 403], 'free price and restock alerts share three slots');
    const returnedAt = Date.now();
    deals[0] = { ...deals[0], availability: 'available', stock: 5, validatedAt: new Date(returnedAt).toISOString() };
    const tracked = require('../backend/db/tracked-products');
    tracked.remember([deals[0]], { source: 'mercadolibre', at: returnedAt });
    const restock = require('../backend/db/restock');
    assert.equal(restock.observe([deals[0]], { source: 'mercadolibre', at: returnedAt }).length, 1);
    assert.equal(restock.observe([deals[0]], { source: 'mercadolibre', at: returnedAt + 1 }).length, 0, 'restock event is deduplicated');
    await page.goto(origin + '/perfil.html#reposiciones');
    await page.locator('[data-restock-read]').first().waitFor();
    await page.locator('[data-restock-read]').first().click();
    await page.getByText('Notificaciones · 0 sin leer', { exact: true }).waitFor();
    await page.locator('[data-restock-remove="qa-0"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-restock-remove="qa-0"]'));
    const normalAt = Date.now();
    const normalPrice = { ...deals[0], currentPrice: 500, originalPrice: 500, originalPriceConfirmed: true, discount: 0, savings: 0, validatedAt: new Date(normalAt).toISOString() };
    tracked.remember([normalPrice], { source: 'mercadolibre', at: normalAt });
    history.record([normalPrice], normalAt);
    const removedDeal = deals.shift();
    await page.goto(origin + '/producto.html?id=qa-0');
    await page.getByRole('heading', { name: 'Audífonos de prueba 0', exact: true }).waitFor();
    assert.match(await page.locator('.price-panel__current').innerText(), /500/);
    await page.locator('[data-history-coverage]').waitFor();
    const redirect = await page.request.get(api.replace(/\/api$/, '') + '/go/qa-0', { maxRedirects: 0 });
    assert.equal(redirect.status(), 302, 'owner can open a freshly available tracked product outside the deals catalog');
    const photoPng = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 40;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#dc1455'; ctx.fillRect(0, 0, 40, 40);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.route('**/api/share/qa-0/image', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(photoPng, 'base64') }));
    const downloadWithPhoto = page.waitForEvent('download');
    await page.locator('#downloadShareCard').click();
    const card = await downloadWithPhoto;
    const cardPath = path.join(out, 'tarjeta-compartir.png');
    await card.saveAs(cardPath);
    const png = fs.readFileSync(cardPath);
    assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
    assert.match(card.suggestedFilename(), /qa-0.*\.png$/);
    await page.unroute('**/api/share/qa-0/image');
    await page.route('**/api/share/qa-0/image', route => route.fulfill({ status: 503 }));
    const downloadWithoutPhoto = page.waitForEvent('download');
    await page.locator('#downloadShareCard').click();
    await (await downloadWithoutPhoto).saveAs(path.join(out, 'tarjeta-compartir-sin-foto.png'));
    await page.unroute('**/api/share/qa-0/image');
    const discountedAgainAt = Date.now();
    removedDeal.validatedAt = new Date(discountedAgainAt).toISOString();
    deals.unshift(removedDeal);
    history.record([removedDeal], discountedAgainAt);
    tracked.remember([removedDeal], { source: 'mercadolibre', at: discountedAgainAt });
    assert.ok(history.series('qa-0').some(row => row.price === 500), 'normal-price observation survives a later discount');

    await page.goto(origin + '/producto.html?id=qa-0');
    await page.locator('.gallery [data-product-image]').first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.gallery [data-product-image]')].some(img => img.dataset.imageFailed === 'true'));
    await page.goto(origin + '/temporada.html?temporada=hot-sale');
    await page.waitForFunction(() => document.getElementById('seasonAccess')?.textContent.includes('3 ofertas'));
    assert.equal(await page.locator('#minGrid .product-card, #strongGrid .product-card').count(), 3);

    await page.goto(origin + '/perfil.html');
    await page.locator('#profileMember:not([hidden])').waitFor();
    await page.locator('#profileForm [name="name"]').fill('Ana María');
    await page.locator('#profileForm [name="address"]').fill('Dirección de prueba');
    await page.locator('#profileForm [type="submit"]').click();
    await page.getByText('Tus datos se guardaron.', { exact: true }).waitFor();
    await page.reload();
    await page.locator('#profileMember:not([hidden])').waitFor();
    assert.equal(await page.locator('#profileForm [name="name"]').inputValue(), 'Ana María');

    await page.goto(origin + '/planes.html');
    await page.locator('[data-checkout="plus"]').waitFor();
    await page.route('**/api/account/plan', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Demostración desactivada para esta prueba.' }) }));
    await page.locator('[data-checkout="plus"]').click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
      const card = await page.locator('dialog[open] .pay-card__front').evaluate(el => ({ background: getComputedStyle(el).backgroundImage, color: getComputedStyle(el).color }));
      assert.match(card.background, /linear-gradient/);
      assert.equal(card.color, 'rgb(23, 23, 23)', 'yellow card keeps dark type in both themes');
    }
    await page.locator('dialog[open] .pay-card').screenshot({ path: path.join(out, 'tarjeta-amarilla.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('dialog[open] .pay-card').screenshot({ path: path.join(out, 'tarjeta-amarilla-mobile.png') });
    const numberFits = await page.locator('dialog[open] .pay-card__number').evaluate(el => el.scrollWidth <= el.clientWidth);
    assert.equal(numberFits, true, 'card number fits on mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.locator('dialog[open] [data-pay]').click();
    await page.locator('[data-checkout-error]:visible').waitFor();
    assert.match(await page.locator('[data-checkout-error]').innerText(), /desactivada/);
    assert.equal(await page.getByText('Plus activado en tu cuenta.', { exact: false }).count(), 0);
    await page.locator('dialog[open] [data-checkout-close]').first().click();
    await page.unroute('**/api/account/plan');
    await page.locator('[data-checkout="plus"]').click();
    await page.locator('dialog[open] [data-pay]').click();
    await page.getByText('Plus activado en tu cuenta.', { exact: true }).waitFor();
    await page.locator('dialog[open] [data-checkout-close]').click();
    const witness = await context.newPage();
    await witness.goto(origin + '/index.html');
    await witness.waitForFunction(() => document.querySelectorAll('#catalogGrid .product-card').length === 7);
    await page.evaluate(async () => { await (await import('/js/utils/account.js')).logoutAccount(); });
    await witness.waitForFunction(async () => !(await import('/js/utils/account.js')).accountState().user && document.querySelectorAll('#catalogGrid .product-card').length === 6);
    assert.equal(await witness.locator('#catalogGrid [data-product-id="qa-6"]').count(), 0, 'a tab loses Plus prices immediately after another tab logs out');
    await page.evaluate(async () => { await (await import('/js/utils/account.js')).loginAccount({ email: 'ana-qa@example.test', password: 'Una contraseña de prueba 123' }); });
    await witness.waitForFunction(() => document.querySelectorAll('#catalogGrid .product-card').length === 7);
    await witness.close();
    await page.goto(origin + '/temporada.html?temporada=hot-sale');
    await page.waitForFunction(() => document.getElementById('seasonAccess')?.textContent.includes('Acceso Plus'));
    assert.equal(await page.locator('#minGrid .product-card, #strongGrid .product-card').count(), 7);

    // Exercise persistent library and downgrade without exposing credentials outside this fixture.
    await page.evaluate(async api => {
      const response = await fetch(api + '/account/library', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ savedIds: ['qa-0'], alertIds: ['qa-0', 'qa-1', 'qa-2', 'qa-3', 'qa-4'] }) });
      if (!response.ok) throw new Error('Could not seed account library');
    }, api);
    await page.goto(origin + '/planes.html');
    await page.locator('[data-downgrade]').click();
    await page.locator('[data-checkout="plus"]').waitFor();
    await page.goto(origin + '/perfil.html');
    await page.locator('#profileMember:not([hidden])').waitFor();
    assert.equal(await page.locator('#profileSavedCount').innerText(), '1');
    assert.equal(await page.locator('#profileAlertCount').innerText(), '3');
    assert.match(await page.locator('#profilePaused').innerText(), /2 alertas/);
    await page.screenshot({ path: path.join(out, 'perfil-desktop.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ['perfil.html', 'planes.html', 'temporada.html?temporada=hot-sale', 'producto.html?id=qa-0', 'index.html']) {
      await page.goto(origin + '/' + route);
      await page.waitForLoadState('networkidle');
      const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(width.content <= width.viewport + 1, `mobile overflow at ${route}: ${JSON.stringify(width)}`);
      await page.screenshot({ path: path.join(out, route.split('.')[0] + '-mobile.png'), fullPage: true });
    }
    await page.evaluate(() => localStorage.setItem('precionauta:theme', 'dark'));
    await page.goto(origin + '/perfil.html');
    await page.locator('#profileMember:not([hidden])').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.screenshot({ path: path.join(out, 'perfil-dark-mobile.png'), fullPage: true });
    await page.goto(origin + '/perfil.html');
    await page.locator('#profileLogout').click();
    await page.waitForURL('**/index.html');
    await page.goto(origin + '/perfil.html');
    await page.locator('#profileGuest:not([hidden])').waitFor();
    await page.locator('#profileGuest [data-auth-open]').focus();
    await page.keyboard.press('Enter');
    await page.locator('#authModal.is-open').waitFor();
    assert.equal(await page.locator('#authModal .auth-recovery-link').getAttribute('href'), 'recuperar.html');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#authModal').getAttribute('aria-hidden'), 'true');
    await page.goto(origin + '/recuperar.html');
    await page.locator('#email').fill('ana-qa@example.test');
    await Promise.all([page.waitForResponse(res => res.url().endsWith('/api/account/password/request') && res.status() === 202), page.locator('#request-form [type="submit"]').click()]);
    assert.ok(recoveryMail?.text.includes('#token='), 'recovery email is captured by the isolated sender');
    const token = recoveryMail.text.match(/#token=([a-f0-9]+)/)[1];
    await page.goto(origin + '/recuperar.html#token=' + token);
    await page.locator('#password').fill('Mi nueva contraseña segura 456');
    await page.locator('#confirm-password').fill('Mi nueva contraseña segura 456');
    await Promise.all([page.waitForResponse(res => res.url().endsWith('/api/account/password/reset') && res.status() === 200), page.locator('#reset-form [type="submit"]').click()]);
    assert.equal(new URL(page.url()).hash, '', 'reset token removed from address bar');
    await page.screenshot({ path: path.join(out, 'recuperacion.png'), fullPage: true });
    await page.evaluate(async () => {
      const account = await import('/js/utils/account.js');
      await account.loginAccount({ email: 'ana-qa@example.test', password: 'Mi nueva contraseña segura 456' });
    });
    await page.goto(origin + '/producto.html?id=qa-0');
    await page.getByText('Puedes cambiar tu voto o pulsarlo de nuevo para retirarlo.').waitFor();
    const previousOwner = await page.evaluate(async () => (await import('/js/utils/account.js')).accountState().user.id);
    const sibling = await context.newPage();
    await sibling.goto(origin + '/perfil.html');
    const otherOwner = await sibling.evaluate(async api => {
      const res = await fetch(api + '/account/register', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Otra cuenta', email: 'bea-qa@example.test', password: 'Otra contraseña segura 789' }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      return body.data.user.id;
    }, api);
    const staleActivityStatus = await page.evaluate(async ({ api, previousOwner }) => {
      const response = await fetch(api + '/community/activity', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Account-Id': previousOwner }, body: JSON.stringify({ type: 'search', query: 'stale-identity-qa' }) });
      return response.status;
    }, { api, previousOwner });
    assert.equal(staleActivityStatus, 409, 'stale activity owner is rejected');
    await Promise.all([
      page.waitForResponse(res => res.url().endsWith('/community/deals/qa-0/votes') && res.request().method() === 'POST' && res.status() === 409),
      page.locator('[data-vote="1"]').click(),
    ]);
    await page.waitForFunction(async id => (await import('/js/utils/account.js')).accountState().user?.id === id, otherOwner);
    assert.equal(require('../backend/db/community').voteSummary('qa-0', otherOwner).mine, null, 'stale tab cannot vote as a different account');
    // Reloading detail for the new account can legitimately record a fresh view.
    assert.equal(require('../backend/db/community').activity(otherOwner).some(event => event.query === 'stale-identity-qa'), false, 'stale activity does not populate the other account');
    await sibling.evaluate(async () => { await (await import('/js/utils/account.js')).logoutAccount(); });
    await page.waitForFunction(async () => !(await import('/js/utils/account.js')).accountState().user);
    await sibling.close();
    const adminPage = await context.newPage();
    adminPage.on('pageerror', error => errors.push(error.message));
    await adminPage.route('**/api/admin/overview', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Fallo de prueba del resumen' }) }), { times: 1 });
    await adminPage.goto(api.replace(/\/api$/, '') + '/admin/#moderacion');
    await adminPage.locator('#loginPassword').fill('QA-local-admin');
    await adminPage.locator('#loginForm [type="submit"]').click();
    await adminPage.waitForLoadState('networkidle');
    assert.equal(await adminPage.evaluate(() => localStorage.getItem('precionauta-admin:last-summary')), null, 'failed overview does not mark unseen activity as read');
    await adminPage.reload();
    await adminPage.locator('[data-automation-summary]').waitFor();
    assert.equal(new URL(adminPage.url()).hash, '#resumen', 'login opens the activity summary');
    assert.match(await adminPage.locator('[data-automation-summary]').innerText(), /En observación/);
    assert.equal(automation.getSummary().summary.reviewed, 0, 'observation has no applied reviews');
    await adminPage.locator('[data-report-status="resolved"]').click();
    await adminPage.waitForFunction(() => document.querySelector('.automation-report-queue')?.textContent.includes('No hay reportes pendientes'));
    await adminPage.locator('[data-automation-mode="automatic"]').click();
    await adminPage.locator('[data-automation-mode="observation"]').waitFor();
    await adminPage.locator('[data-automation-run]').click();
    await adminPage.waitForFunction(() => [...document.querySelectorAll('.automation-stats dd')][2]?.textContent !== '0');
    const reviewEvent = automation.getSummary().events.find(e => e.applied && e.action === 'review');
    assert.ok(reviewEvent, 'automatic mode applies a review');
    const historyPanel = adminPage.locator('.automation-history').filter({ has: adminPage.locator('summary', { hasText: 'Actividad y motivos' }) });
    await historyPanel.locator('summary').click();
    await adminPage.locator(`[data-automation-undo="${reviewEvent.id}"]`).click();
    await adminPage.waitForFunction(id => !document.querySelector(`[data-automation-undo="${id}"]`), reviewEvent.id);
    assert.equal(require('../backend/admin/moderation').decisions[reviewEvent.dealId].actor, 'manual');
    await adminPage.locator('[data-automation-mode="observation"]').click();
    await adminPage.locator('[data-automation-mode="automatic"]').waitFor();
    await adminPage.screenshot({ path: path.join(out, 'moderador-resumen.png'), fullPage: true });
    await adminPage.setViewportSize({ width: 390, height: 844 });
    assert.ok(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'moderation summary fits mobile');
    await adminPage.screenshot({ path: path.join(out, 'moderador-resumen-mobile.png'), fullPage: true });
    await adminPage.reload();
    await adminPage.locator('[data-automation-summary]').waitFor();
    assert.match(await adminPage.locator('[data-automation-summary]').innerText(), /Desde tu última entrada en este navegador/i);
    await adminPage.close();
    assert.deepEqual(errors, [], 'no uncaught browser errors');
    console.log('Browser PASS: pricing, auth, images, profile, season, checkout, downgrade, email, reports, moderation observation/automatic/undo/entry summary, mobile.');
    fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({ passed: true, errors, screenshots: ['planes-desktop.png', 'perfil-desktop.png', 'perfil-mobile.png', 'planes-mobile.png', 'temporada-mobile.png', 'producto-mobile.png', 'index-mobile.png'] }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => backend.close(resolve));
    await new Promise(resolve => frontend.close(resolve));
    db.close();
    global.fetch = originalFetch;
    if (path.dirname(path.resolve(dataDir)) !== out) throw new Error('Unsafe fixture cleanup target');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
