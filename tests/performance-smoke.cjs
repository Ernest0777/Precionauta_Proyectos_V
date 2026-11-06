// Controlled latency: page controls must not wait for the unrelated catalog.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');

async function main() {
  const front = express();
  front.use(express.static(path.resolve('frontend'), { maxAge: 0 }));
  const frontend = front.listen(0, '127.0.0.1');
  await new Promise(resolve => frontend.once('listening', resolve));
  const origin = `http://127.0.0.1:${frontend.address().port}`;
  const backendApp = express();
  const calls = [];
  const timers = new Set();
  const delayed = (res, data, ms) => {
    const timer = setTimeout(() => { timers.delete(timer); if (!res.destroyed) res.json(data); }, ms);
    timers.add(timer);
  };
  const member = { user: { id: 'performance-user', name: 'Prueba de carga', email: 'perf@example.test' }, plan: { id: 'free' }, access: { level: 'free', historyDays: 30, alertLimit: 3, seasonLimit: 3, catalogLimit: null, delayMs: 7200000 }, savedIds: [], alertIds: [], pausedAlertIds: [], restockIds: [], pausedRestockIds: [], alertTargets: {} };
  const deal = { id: 'MLM900001', title: 'Producto de prueba', category: 'tecnologia', currentPrice: 80, originalPrice: 100, discount: 20, savings: 20, source: 'mercadolibre', validatedAt: new Date().toISOString(), firstSeenAt: null, pictures: [], specs: [] };
  backendApp.use((req, res) => {
    calls.push({ path: req.url, method: req.method, at: Date.now() });
    res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-Account-Id', 'Cache-Control': 'no-store' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.url === '/api/account/session') return delayed(res, { success: true, data: member }, 100);
    if (req.url === '/api/deals') return delayed(res, { success: true, data: [deal], source: 'mercadolibre', access: member.access }, 3500);
    if (req.url.startsWith('/api/deals?season=')) return res.json({ success: true, data: [deal] });
    if (req.url === '/api/telegram/status') return res.json({ success: true, data: { enabled: false } });
    if (req.url === '/api/account/restock') return res.json({ success: true, data: { subscriptions: [], events: [], unreadCount: 0 } });
    if (req.url === '/api/account/tracked' || req.url === '/api/community/activity') return res.json({ success: true, data: [] });
    return res.json({ success: true, data: [] });
  });
  const backend = backendApp.listen(0, '127.0.0.1');
  await new Promise(resolve => backend.once('listening', resolve));
  const api = `http://127.0.0.1:${backend.address().port}/api`;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
    await context.addInitScript(api => { window.PRECIONAUTA_API = api; localStorage.setItem('precionauta:onboarded', '1'); }, api);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const results = [];
    for (const route of ['perfil.html', 'planes.html', 'terminos.html', 'temporada.html?temporada=hot-sale', 'index.html']) {
      const start = Date.now();
      const firstCall = calls.length;
      await page.goto(origin + '/' + route, { waitUntil: 'commit' });
      if (route === 'perfil.html') await page.locator('#profileMember:not([hidden])').waitFor({ timeout: 2000 });
      if (route === 'planes.html') await page.locator('.plan-card').last().waitFor({ timeout: 2000 });
      if (route.startsWith('temporada')) await page.locator('#minGrid .product-card, #strongGrid .product-card').first().waitFor({ timeout: 2000 });
      await page.locator('#themeToggle').waitFor();
      const theme = await page.locator('html').getAttribute('data-theme');
      await page.locator('#themeToggle').click({ timeout: 2000 });
      await page.waitForFunction(theme => document.documentElement.dataset.theme !== theme, theme, { timeout: 2000 });
      const interactiveMs = Date.now() - start;
      assert.ok(interactiveMs < 2200, `${route} waits for the 3500ms catalog (${interactiveMs}ms)`);
      assert.ok(calls.slice(firstCall).filter(call => call.method === 'GET' && call.path === '/api/account/session').length <= 1, 'one initial account request per navigation');
      assert.ok(calls.slice(firstCall).filter(call => call.method === 'GET' && call.path === '/api/account/restock').length <= 1, 'restock initialization is deduplicated');
      assert.ok(calls.slice(firstCall).filter(call => call.method === 'GET' && call.path === '/api/account/tracked').length <= 1, 'tracked initialization is deduplicated');
      results.push({ route, interactiveMs });
      if (route === 'index.html') {
        const search = page.locator('#search-container input');
        await search.fill('Producto');
        await page.locator('#catalogGrid .product-card').first().waitFor({ timeout: 7000 });
        assert.equal(await search.inputValue(), 'Producto', 'catalog completion preserves input typed during loading');
      }
    }
    assert.deepEqual(errors, []);
    const out = path.resolve('.playwright-cli'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'performance-results.json'), JSON.stringify({ catalogDelayMs: 3500, results, errors }, null, 2));
    console.log(JSON.stringify({ catalogDelayMs: 3500, results }));
  } finally {
    if (browser) await browser.close();
    timers.forEach(clearTimeout);
    await new Promise(resolve => frontend.close(resolve));
    await new Promise(resolve => backend.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
