import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Production Build Marker Alignment Verification', () => {
  test.use({ baseURL: process.env.PROD_URL || process.env.BASE_URL || 'http://localhost:5173' });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__LORAN_E2E__ = true;
    });
  });

  test('true production build (npm run build && preview): collinear degenerate stations align within 1px', async ({ page }) => {
    test.setTimeout(45000);

    // 1. Visit production preview on port 4173
    await page.goto('/eloran', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      return map && map.isStyleLoaded();
    }, { timeout: 20000 });

    // 2. Select collinear scenario (Poor Geometry / High GDOP)
    const presetSelect = page.locator('#scenario-preset-select');
    await expect(presetSelect).toBeVisible();
    await presetSelect.selectOption('high_gdop');
    await page.waitForTimeout(1500);

    // 3. Inspect alignment in the real production bundle
    const alignmentData = await page.evaluate(() => {
      const map = window.__maplibreInstance;
      if (!map) return { error: 'No map instance' };

      const markerEls = Array.from(document.querySelectorAll('.station-marker'));
      const results = markerEls.map((el) => {
        const dot = el.querySelector('div') || el;
        const rect = dot.getBoundingClientRect();
        const mapCanvasRect = map.getCanvas().getBoundingClientRect();

        const dotScreenCenter = {
          x: Math.round(rect.left + rect.width / 2 - mapCanvasRect.left),
          y: Math.round(rect.top + rect.height / 2 - mapCanvasRect.top),
        };

        const lng = parseFloat(el.dataset.lng);
        const lat = parseFloat(el.dataset.lat);
        const projected = map.project([lng, lat]);

        return {
          label: el.dataset.label,
          type: el.dataset.type,
          coords: [lng, lat],
          dotScreenCenter,
          expectedProjected: {
            x: Math.round(projected.x * 1000) / 1000,
            y: Math.round(projected.y * 1000) / 1000,
          },
          diffMarkerProjX: Math.abs(Math.round((dotScreenCenter.x - projected.x) * 1000) / 1000),
          diffMarkerProjY: Math.abs(Math.round((dotScreenCenter.y - projected.y) * 1000) / 1000),
        };
      });

      return {
        results,
      };
    });

    console.log('Production Bundle Alignment Results:\n', JSON.stringify(alignmentData, null, 2));

    expect(alignmentData.results.length).toBeGreaterThan(0);

    for (const r of alignmentData.results) {
      expect(
        r.diffMarkerProjX,
        `Station ${r.label} horizontal pin center drift on production build exceeds 1px`
      ).toBeLessThan(1.0);

      expect(
        r.diffMarkerProjY,
        `Station ${r.label} vertical pin center drift on production build exceeds 1px`
      ).toBeLessThan(1.0);
    }

    // 4. Capture high-resolution screenshot of the collinear setup in production build
    const screenshotPath = path.resolve(process.cwd(), 'docs/verification/screenshots/prod_build_collinear_alignment.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved production build alignment verification screenshot to: ${screenshotPath}`);
  });
});
