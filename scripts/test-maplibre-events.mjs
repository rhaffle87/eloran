import { chromium } from '@playwright/test';
import { createServer } from 'vite';

async function run() {
  const server = await createServer({
    server: { port: 5173 },
  });
  await server.listen();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__LORAN_E2E__ = true;
    sessionStorage.setItem('loran_offline_radar', 'true');
  });

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.startsWith('[MAP_EVENT]')) {
      console.log(text);
    }
  });

  console.log('--- NAVIGATING TO /eloran (INITIAL LOAD) ---');

  await page.addInitScript(() => {
    window.__LORAN_E2E__ = true;
    sessionStorage.setItem('loran_offline_radar', 'true');
    const logs = [];
    window.__eventLogs = logs;
    const t0 = performance.now();

    const interval = setInterval(() => {
      const map = window.__maplibreInstance;
      if (map) {
        clearInterval(interval);
        function logEv(name) {
          const dt = (performance.now() - t0).toFixed(2);
          const entry = `[MAP_EVENT] [INITIAL] +${dt}ms: ${name} (loaded=${map.isStyleLoaded()})`;
          console.log(entry);
        }
        map.on('style.load', () => logEv('style.load'));
        map.on('styledata', () => logEv('styledata'));
        map.on('load', () => logEv('load'));
        map.on('idle', () => logEv('idle'));
      }
    }, 1);
  });

  await page.goto('http://localhost:5173/eloran');
  await page.waitForFunction(() => Boolean(window.__maplibreInstance));
  await page.waitForTimeout(1000);

  console.log('\n--- TESTING (B) FULL-REPLACE setStyle ---');
  await page.evaluate(async () => {
    const map = window.__maplibreInstance;
    const t0 = performance.now();

    function logEv(name, extra = '') {
      const dt = (performance.now() - t0).toFixed(2);
      console.log(`[MAP_EVENT] [FULL-REPLACE] +${dt}ms: ${name} (loaded=${map.isStyleLoaded()}) ${extra}`);
    }

    const onStyleLoad = () => logEv('style.load');
    const onStyleData = () => logEv('styledata');
    const onIdle = () => logEv('idle');

    map.on('style.load', onStyleLoad);
    map.on('styledata', onStyleData);
    map.on('idle', onIdle);

    logEv('BEFORE setStyle({ diff: false })');
    map.setStyle({
      version: 8,
      sources: {},
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#112233' } }]
    }, { diff: false });
    logEv('AFTER setStyle synchronous return');

    await new Promise((res) => map.once('idle', res));
    logEv('PROMISE IDLE RESOLVED');

    map.off('style.load', onStyleLoad);
    map.off('styledata', onStyleData);
    map.off('idle', onIdle);
  });

  console.log('\n--- TESTING (C) DIFFED setStyle ---');
  await page.evaluate(async () => {
    const map = window.__maplibreInstance;
    const t0 = performance.now();

    function logEv(name, extra = '') {
      const dt = (performance.now() - t0).toFixed(2);
      console.log(`[MAP_EVENT] [DIFFED] +${dt}ms: ${name} (loaded=${map.isStyleLoaded()}) ${extra}`);
    }

    const onStyleLoad = () => logEv('style.load');
    const onStyleData = () => logEv('styledata');
    const onIdle = () => logEv('idle');

    map.on('style.load', onStyleLoad);
    map.on('styledata', onStyleData);
    map.on('idle', onIdle);

    logEv('BEFORE setStyle({ diff: true })');
    map.setStyle({
      version: 8,
      sources: {},
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#445566' } }]
    }, { diff: true });
    logEv('AFTER setStyle synchronous return');

    await new Promise((res) => map.once('idle', res));
    logEv('PROMISE IDLE RESOLVED');

    map.off('style.load', onStyleLoad);
    map.off('styledata', onStyleData);
    map.off('idle', onIdle);
  });

  await browser.close();
  await server.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
