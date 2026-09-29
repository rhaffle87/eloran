import { chromium } from '@playwright/test';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.addInitScript(() => {
    window.__LORAN_E2E__ = true;
    window.__instrumentation = {
      resizeCalls: 0,
      canvasWidthWrites: 0,
      canvasHeightWrites: 0,
    };

    // Instrument HTMLCanvasElement width/height setters
    const origWidthDesc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
    const origHeightDesc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');

    Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
      set(val) {
        window.__instrumentation.canvasWidthWrites++;
        return origWidthDesc.set.call(this, val);
      },
      get() {
        return origWidthDesc.get.call(this);
      },
    });

    Object.defineProperty(HTMLCanvasElement.prototype, 'height', {
      set(val) {
        window.__instrumentation.canvasHeightWrites++;
        return origHeightDesc.set.call(this, val);
      },
      get() {
        return origHeightDesc.get.call(this);
      },
    });
  });

  console.log('Navigating to /loran-c ...');
  await page.goto('http://localhost:5173/loran-c');
  await page.waitForSelector('.maplibregl-map');

  // Wait for map instance and instrument Map.prototype.resize
  await page.waitForFunction(() => Boolean(window.__maplibreInstance));
  await page.evaluate(() => {
    const map = window.__maplibreInstance;
    const origResize = map.resize.bind(map);
    map.resize = function (...args) {
      window.__instrumentation.resizeCalls++;
      return origResize(...args);
    };
  });

  // Reset counters before collapse transition
  await page.evaluate(() => {
    window.__instrumentation = {
      resizeCalls: 0,
      canvasWidthWrites: 0,
      canvasHeightWrites: 0,
    };
  });

  console.log('Clicking collapse button...');
  const collapseBtn = page.locator('[data-testid="sidebar-collapse-btn"]').first();
  await collapseBtn.click();

  // Wait 400ms for 220ms transition + 120ms debounce to settle
  await page.waitForTimeout(400);

  const collapseStats = await page.evaluate(() => ({ ...window.__instrumentation }));
  console.log('Stats during collapse:', JSON.stringify(collapseStats, null, 2));

  // Reset counters before expand transition
  await page.evaluate(() => {
    window.__instrumentation = {
      resizeCalls: 0,
      canvasWidthWrites: 0,
      canvasHeightWrites: 0,
    };
  });

  console.log('Clicking expand button...');
  const expandBtn = page.locator('[data-testid="sidebar-expand-btn"]').first();
  await expandBtn.click();

  await page.waitForTimeout(400);

  const expandStats = await page.evaluate(() => ({ ...window.__instrumentation }));
  console.log('Stats during expand:', JSON.stringify(expandStats, null, 2));

  await browser.close();
}

run().catch(console.error);
