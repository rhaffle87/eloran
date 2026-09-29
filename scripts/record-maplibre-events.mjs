import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const evidencePath = path.join(rootDir, 'docs', 'evidence', 'maplibre-events.txt');

async function run() {
  console.log('Starting Vite server for MapLibre event logging...');
  const server = await createServer({
    root: rootDir,
    server: { port: 5199 },
  });
  await server.listen();
  const port = server.config.server.port;
  console.log(`Vite server listening on port ${port}`);

  const logLines = [];
  function log(str) {
    console.log(str);
    logLines.push(str);
  }

  log('================================================================');
  log('MAPLIBRE EVENT LOG: (a) initial, (b) full-replace, (c) diffed');
  log('================================================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.startsWith('[MAP_EVENT]')) {
      log(text);
    }
  });

  log('\n--- (A) INITIAL LOAD ---');
  await page.addInitScript(() => {
    window.__SIMULORAN_E2E__ = true;
    window.__LORAN_E2E__ = true;
    sessionStorage.setItem('loran_offline_radar', 'true');
    const t0 = performance.now();

    const interval = setInterval(() => {
      const map = window.__maplibreInstance;
      if (map) {
        clearInterval(interval);
        function logEv(name) {
          const dt = (performance.now() - t0).toFixed(2);
          console.log(`[MAP_EVENT] [INITIAL] +${dt}ms: ${name} (isStyleLoaded=${map.isStyleLoaded()})`);
        }
        map.on('style.load', () => logEv('style.load'));
        map.on('styledata', () => logEv('styledata'));
        map.on('load', () => logEv('load'));
        map.on('idle', () => logEv('idle'));
      }
    }, 1);
  });

  await page.goto(`http://localhost:${port}/eloran`);
  await page.waitForFunction(() => Boolean(window.__maplibreInstance));
  await page.waitForTimeout(1500);

  log('\n--- (B) FULL-REPLACE setStyle ({ diff: false }) ---');
  await page.evaluate(async () => {
    const map = window.__maplibreInstance;
    const t0 = performance.now();

    function logEv(name, extra = '') {
      const dt = (performance.now() - t0).toFixed(2);
      console.log(`[MAP_EVENT] [FULL-REPLACE] +${dt}ms: ${name} (isStyleLoaded=${map.isStyleLoaded()}) ${extra}`);
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
      layers: [{ id: 'bg-full', type: 'background', paint: { 'background-color': '#112233' } }]
    }, { diff: false });
    logEv('AFTER setStyle synchronous return');

    await new Promise((res) => map.once('idle', res));
    logEv('IDLE RESOLVED');

    map.off('style.load', onStyleLoad);
    map.off('styledata', onStyleData);
    map.off('idle', onIdle);
  });

  await page.waitForTimeout(500);

  log('\n--- (C) DIFFED setStyle ({ diff: true }) ---');
  await page.evaluate(async () => {
    const map = window.__maplibreInstance;
    const t0 = performance.now();

    function logEv(name, extra = '') {
      const dt = (performance.now() - t0).toFixed(2);
      console.log(`[MAP_EVENT] [DIFFED] +${dt}ms: ${name} (isStyleLoaded=${map.isStyleLoaded()}) ${extra}`);
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
      layers: [{ id: 'bg-full', type: 'background', paint: { 'background-color': '#445566' } }]
    }, { diff: true });
    logEv('AFTER setStyle synchronous return');

    await new Promise((res) => map.once('idle', res));
    logEv('IDLE RESOLVED');

    map.off('style.load', onStyleLoad);
    map.off('styledata', onStyleData);
    map.off('idle', onIdle);
  });

  await page.waitForTimeout(500);

  log('================================================================');
  log('END OF MAPLIBRE EVENT LOG');
  log('================================================================');

  fs.writeFileSync(evidencePath, logLines.join('\n') + '\n', 'utf-8');
  console.log(`Saved event log to ${evidencePath}`);

  await browser.close();
  await server.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
