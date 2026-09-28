import { test, expect } from '@playwright/test';

test.describe('MapLibre setStyle & Overlay Layers Persistence Regression Suite', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.__LORAN_E2E__ = true;
    });
  });

  for (const path of ['/loran-c', '/eloran']) {
    test(`overlay layers persist across theme toggle and tile-failure fallback on ${path}`, async ({ page }) => {
      test.setTimeout(45000);
      const warnings = [];
      page.on('console', (msg) => {
        const text = msg.text();
        if (/Unable to perform style diff/i.test(text)) {
          warnings.push(text);
        }
      });

      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      await page.waitForSelector('.maplibregl-map');

      // Wait for map instance and initial baseline layer
      await page.waitForFunction(() => {
        const map = window.__maplibreInstance;
        return Boolean(map && map.isStyleLoaded && map.isStyleLoaded());
      }, { timeout: 20000 });

      // Step (a): Generate LOP contours and turn on GDOP overlay
      const layersTab = page.locator('button').filter({ hasText: /Layers|Mesh/ }).first();
      await layersTab.waitFor({ state: 'visible' });
      await layersTab.click();
      await page.waitForTimeout(300);

      // Turn on Live GDOP Coverage Overlay
      const gdopToggleLabel = page.locator('label').filter({ hasText: /Live GDOP Coverage Overlay/ }).first();
      await gdopToggleLabel.waitFor({ state: 'visible' });
      await gdopToggleLabel.click();

      // Generate LOP Contours
      const genBtn = page.locator('button:has-text("Generate LOP Contours")');
      await genBtn.waitFor({ state: 'visible' });
      await genBtn.click();

      // Wait for LOP contours, baseline, and GDOP heatmap layers to be added
      await page.waitForFunction(() => {
        const map = window.__maplibreInstance;
        return Boolean(
          map &&
          map.getSource('loran-lops-source') &&
          map.getLayer('loran-lops-layer') &&
          map.getSource('loran-baselines-source') &&
          map.getLayer('loran-baselines-layer') &&
          map.getSource('loran-gdop-heatmap-source') &&
          map.getLayer('loran-gdop-heatmap-layer')
        );
      }, { timeout: 30000 });

      // Verify baseline, LOP, and GDOP overlay layers exist
      let layersExist = await page.evaluate(() => {
        const map = window.__maplibreInstance;
        return {
          hasLopSource: Boolean(map.getSource('loran-lops-source')),
          hasLopLayer: Boolean(map.getLayer('loran-lops-layer')),
          hasBaselineSource: Boolean(map.getSource('loran-baselines-source')),
          hasBaselineLayer: Boolean(map.getLayer('loran-baselines-layer')),
          hasGdopSource: Boolean(map.getSource('loran-gdop-heatmap-source')),
          hasGdopLayer: Boolean(map.getLayer('loran-gdop-heatmap-layer')),
        };
      });
      expect(layersExist.hasLopSource).toBe(true);
      expect(layersExist.hasLopLayer).toBe(true);
      expect(layersExist.hasBaselineSource).toBe(true);
      expect(layersExist.hasBaselineLayer).toBe(true);
      expect(layersExist.hasGdopSource).toBe(true);
      expect(layersExist.hasGdopLayer).toBe(true);

      // Step (b): Toggle theme via the navbar
      const themeBtn = page.locator('button[aria-label*="theme"], button[title*="mode"]').first();
      await expect(themeBtn).toBeVisible();
      await themeBtn.click();

      // Wait for style update to settle
      await page.waitForFunction(() => {
        const map = window.__maplibreInstance;
        return Boolean(
          map &&
          map.isStyleLoaded &&
          map.isStyleLoaded() &&
          map.getSource('loran-lops-source') &&
          map.getLayer('loran-lops-layer') &&
          map.getSource('loran-baselines-source') &&
          map.getLayer('loran-baselines-layer') &&
          map.getSource('loran-gdop-heatmap-source') &&
          map.getLayer('loran-gdop-heatmap-layer')
        );
      }, { timeout: 15000 });

      layersExist = await page.evaluate(() => {
        const map = window.__maplibreInstance;
        return {
          hasLopSource: Boolean(map.getSource('loran-lops-source')),
          hasLopLayer: Boolean(map.getLayer('loran-lops-layer')),
          hasBaselineSource: Boolean(map.getSource('loran-baselines-source')),
          hasBaselineLayer: Boolean(map.getLayer('loran-baselines-layer')),
          hasGdopSource: Boolean(map.getSource('loran-gdop-heatmap-source')),
          hasGdopLayer: Boolean(map.getLayer('loran-gdop-heatmap-layer')),
        };
      });
      expect(layersExist.hasLopSource).toBe(true);
      expect(layersExist.hasLopLayer).toBe(true);
      expect(layersExist.hasBaselineSource).toBe(true);
      expect(layersExist.hasBaselineLayer).toBe(true);
      expect(layersExist.hasGdopSource).toBe(true);
      expect(layersExist.hasGdopLayer).toBe(true);
      expect(warnings).toHaveLength(0);

      // Step (c): Force tile-failure fallback
      await page.evaluate(() => {
        const map = window.__maplibreInstance;
        if (map) {
          map.fire('error', {
            error: { message: 'Failed to fetch vector tile', status: 500 },
            sourceId: 'openmaptiles',
          });
        }
      });

      // Wait for fallback to settle (OSM standard or offline radar)
      await page.waitForFunction(() => {
        const map = window.__maplibreInstance;
        return Boolean(
          map &&
          map.isStyleLoaded &&
          map.isStyleLoaded() &&
          map.getSource('loran-lops-source') &&
          map.getLayer('loran-lops-layer') &&
          map.getSource('loran-baselines-source') &&
          map.getLayer('loran-baselines-layer') &&
          map.getSource('loran-gdop-heatmap-source') &&
          map.getLayer('loran-gdop-heatmap-layer')
        );
      }, { timeout: 15000 });

      layersExist = await page.evaluate(() => {
        const map = window.__maplibreInstance;
        return {
          hasLopSource: Boolean(map.getSource('loran-lops-source')),
          hasLopLayer: Boolean(map.getLayer('loran-lops-layer')),
          hasBaselineSource: Boolean(map.getSource('loran-baselines-source')),
          hasBaselineLayer: Boolean(map.getLayer('loran-baselines-layer')),
          hasGdopSource: Boolean(map.getSource('loran-gdop-heatmap-source')),
          hasGdopLayer: Boolean(map.getLayer('loran-gdop-heatmap-layer')),
        };
      });
      expect(layersExist.hasLopSource).toBe(true);
      expect(layersExist.hasLopLayer).toBe(true);
      expect(layersExist.hasBaselineSource).toBe(true);
      expect(layersExist.hasBaselineLayer).toBe(true);
      expect(layersExist.hasGdopSource).toBe(true);
      expect(layersExist.hasGdopLayer).toBe(true);

      // Assert zero "Unable to perform style diff" warnings
      expect(warnings).toHaveLength(0);
    });
  }
});
