import { chromium } from '@playwright/test';
import fs from 'node:fs';

const stage = process.argv.includes('--stage=pre') ? 'pre' : 'post';
console.log(`Running GDOP visual & numeric comparison for stage: ${stage}`);

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(() => {
    window.__LORAN_E2E__ = true;
  });

  const results = {};

  // --- 1. Loran-C ---
  {
    console.log('\nTesting /loran-c ...');
    const page = await context.newPage();
    page.on('console', msg => console.log('BROWSER:', msg.type(), msg.text()));
    page.on('pageerror', err => console.error('PAGE CRASH:', err));
    await page.goto('http://localhost:5173/loran-c', { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      const markers = document.querySelectorAll('.station-marker');
      return Boolean(map && markers.length >= 3);
    }, { timeout: 20000 });

    // Open Layers / Mesh tab
    const meshTab = page.locator('button').filter({ hasText: /Layers|Mesh/ }).first();
    await meshTab.waitFor({ state: 'visible' });
    await meshTab.click();
    await page.waitForTimeout(500);

    // Toggle on Live GDOP Coverage Overlay
    const toggleLabel = page.locator('label').filter({ hasText: /Live GDOP Coverage Overlay/ }).first();
    await toggleLabel.waitFor({ state: 'visible' });
    await toggleLabel.click();

    // Wait for GDOP heatmap layer to be mounted
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      return Boolean(map && map.getSource('loran-gdop-heatmap-source') && map.getLayer('loran-gdop-heatmap-layer'));
    }, { timeout: 20000 });

    // Generate LOP Contours
    const genBtn = page.locator('button:has-text("Generate LOP Contours")');
    await genBtn.waitFor({ state: 'visible' });
    await genBtn.click();

    // Wait for LOP contours source
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      const src = map ? map.getSource('loran-lops-source') : null;
      const count = src?._data?.features?.length || src?.serialize?.()?.data?.features?.length || 0;
      return count > 0;
    }, { timeout: 30000 });

    // Locate receiver marker
    const rxMarker = page.locator('.marker-receiver').first();
    await rxMarker.waitFor({ state: 'visible' });
    const box = await rxMarker.boundingBox();

    // Perform exact drag: 30px right, 20px down
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 10 });
    await page.mouse.up();

    // Settle
    await page.waitForTimeout(1000);

    // Read HDOP / TDOP from PNT telemetry card
    const hdopText = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('span')).find(s => s.innerText.trim() === 'HDOP / TDOP');
      if (!el || !el.parentElement) return null;
      const valSpan = el.parentElement.querySelector('span:nth-child(2)');
      return valSpan ? valSpan.innerText.trim() : null;
    });

    console.log(`Loran-C Post-Drag HDOP / TDOP: ${hdopText}`);

    const screenshotPath = `docs/verification/screenshots/loran_c_drag_${stage}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Saved screenshot to ${screenshotPath}`);

    results.loranc = { hdopText, screenshotPath };
    await page.close();
  }

  // --- 2. eLoran ---
  {
    console.log('\nTesting /eloran ...');
    const page = await context.newPage();
    page.on('console', msg => { if (msg.type() === 'error') console.log('PAGE ERR:', msg.text()); });
    page.on('pageerror', err => console.error('PAGE CRASH:', err));
    await page.goto('http://localhost:5173/eloran', { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      const markers = document.querySelectorAll('.station-marker');
      return Boolean(map && markers.length >= 3);
    }, { timeout: 20000 });

    // Open Layers / Mesh tab
    const meshTab = page.locator('button').filter({ hasText: /Layers|Mesh/ }).first();
    await meshTab.waitFor({ state: 'visible' });
    await meshTab.click();
    await page.waitForTimeout(500);

    // Toggle on Live GDOP Coverage Overlay
    const toggleLabel = page.locator('label').filter({ hasText: /Live GDOP Coverage Overlay/ }).first();
    await toggleLabel.waitFor({ state: 'visible' });
    await toggleLabel.click();

    // Wait for GDOP heatmap layer to be mounted
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      return Boolean(map && map.getSource('loran-gdop-heatmap-source') && map.getLayer('loran-gdop-heatmap-layer'));
    }, { timeout: 20000 });

    // Generate LOP Contours
    const genBtn = page.locator('button:has-text("Generate LOP Contours")');
    await genBtn.waitFor({ state: 'visible' });
    await genBtn.click();

    // Wait for LOP contours source
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      const src = map ? map.getSource('loran-lops-source') : null;
      const count = src?._data?.features?.length || src?.serialize?.()?.data?.features?.length || 0;
      return count > 0;
    }, { timeout: 30000 });

    // Locate receiver marker
    const rxMarker = page.locator('.marker-receiver').first();
    await rxMarker.waitFor({ state: 'visible' });
    const box = await rxMarker.boundingBox();

    // Perform exact drag: 30px left, 20px down
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2 + 20, { steps: 10 });
    await page.mouse.up();

    // Settle
    await page.waitForTimeout(1000);

    // Read HDOP / TDOP from PNT telemetry card
    const hdopText = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('span')).find(s => s.innerText.trim() === 'HDOP / TDOP');
      if (!el || !el.parentElement) return null;
      const valSpan = el.parentElement.querySelector('span:nth-child(2)');
      return valSpan ? valSpan.innerText.trim() : null;
    });

    console.log(`eLoran Post-Drag HDOP / TDOP: ${hdopText}`);

    const screenshotPath = `docs/verification/screenshots/eloran_drag_${stage}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Saved screenshot to ${screenshotPath}`);

    results.eloran = { hdopText, screenshotPath };
    await page.close();
  }

  await browser.close();

  fs.writeFileSync(`docs/verification/screenshots/results_${stage}.json`, JSON.stringify(results, null, 2));
  console.log(`Results written to docs/verification/screenshots/results_${stage}.json`);
}

run().catch((err) => {
  console.error('Error during execution:', err);
  process.exit(1);
});
