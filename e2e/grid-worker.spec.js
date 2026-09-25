import { test, expect } from '@playwright/test';

test.describe('Web Worker Grid Computation & CSP Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__LORAN_E2E__ = true;
    });
  });

  test('successfully instantiates gridWorker and computes LOP contours off-thread without CSP error', async ({ page }) => {
    test.setTimeout(60000);
    const cspErrors = [];
    const consoleLogs = [];

    page.on('console', (msg) => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('violates') || text.includes('Content Security Policy') || text.includes('worker-src')) {
        cspErrors.push(text);
      }
    });

    page.on('pageerror', (err) => {
      consoleLogs.push('PAGE_ERROR: ' + err.message);
    });

    await page.goto('/loran-c', { waitUntil: 'domcontentloaded' });
    
    // Wait for MapLibre map and style to be fully ready
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      return map && map.isStyleLoaded();
    }, { timeout: 20000 });

    await page.click('button:has-text("Layers & Mesh")');
    await page.waitForTimeout(500);

    const generateBtn = page.locator('button:has-text("Generate LOP Contours")');
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // Wait for the worker to finish and populate the lops source or store
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      const src = map ? map.getSource('loran-lops-source') : null;
      const count = src?._data?.features?.length || src?.serialize?.()?.data?.features?.length || 0;
      return count > 0;
    }, { timeout: 30000 });

    const lopsInfo = await page.evaluate(() => {
      const map = window.__maplibreInstance;
      const src = map ? map.getSource('loran-lops-source') : null;
      return {
        hasSource: Boolean(src),
        featureCount: src?._data?.features?.length || src?.serialize?.()?.data?.features?.length || 0,
      };
    });

    console.log('LOPs Worker Verification Result:', JSON.stringify(lopsInfo, null, 2));

    expect(lopsInfo.hasSource).toBe(true);
    expect(lopsInfo.featureCount).toBeGreaterThan(0);
    expect(cspErrors, `CSP errors detected: ${cspErrors.join(' | ')}`).toHaveLength(0);
  });
});
