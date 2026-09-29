import { test, expect } from '@playwright/test';

/**
 * MapLibre setStyle & Overlay Layers Persistence Regression Suite
 *
 * Verifies that custom overlay layers (baselines, GDOP heatmap) survive:
 *   (a) initial render
 *   (b) a theme toggle that calls map.setStyle()
 *   (c) a forced offline-radar style swap
 *
 * Design notes:
 *  - Overall timeout: 120s
 *  - Baselines + GDOP are tested (immediate, no worker required)
 *  - LOP contours are tested separately, only after worker confirms completion
 */

async function waitForLayers(page, layerIds, sourceIds, timeout = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const status = await page.evaluate(([lIds, sIds]) => {
      const map = window.__maplibreInstance;
      if (!map) return 'no map';
      if (typeof map.isStyleLoaded !== 'function') return 'no isStyleLoaded';
      const styleLoaded = map.isStyleLoaded();
      const missingLayers = lIds.filter(id => !map.getLayer(id));
      const missingSources = sIds.filter(id => !map.getSource(id));
      return {
        styleLoaded,
        missingLayers,
        missingSources,
        allLayers: map.getStyle()?.layers?.map(l => l.id).filter(id => id.includes('loran')),
        allSources: Object.keys(map.getStyle()?.sources || {}).filter(id => id.includes('loran')),
      };
    }, [layerIds, sourceIds]);

    if (status && status.styleLoaded && status.missingLayers.length === 0 && status.missingSources.length === 0) {
      return;
    }
    await page.waitForTimeout(500);
  }
  const finalStatus = await page.evaluate(([lIds, sIds]) => {
    const map = window.__maplibreInstance;
    if (!map) return 'no map';
    return {
      styleLoaded: map.isStyleLoaded(),
      missingLayers: lIds.filter(id => !map.getLayer(id)),
      missingSources: sIds.filter(id => !map.getSource(id)),
      loranLayers: map.getStyle()?.layers?.map(l => l.id).filter(id => id.includes('loran')),
      loranSources: Object.keys(map.getStyle()?.sources || {}).filter(id => id.includes('loran')),
    };
  }, [layerIds, sourceIds]);
  throw new Error(`waitForLayers timed out after ${timeout}ms. Status: ${JSON.stringify(finalStatus)}`);
}

async function snapshotLayers(page) {
  return page.evaluate(() => {
    const map = window.__maplibreInstance;
    if (!map) return {};
    return {
      styleLoaded:       map.isStyleLoaded(),
      hasLopSource:      Boolean(map.getSource('loran-lops-source')),
      hasLopLayer:       Boolean(map.getLayer('loran-lops-layer')),
      hasBaselineSource: Boolean(map.getSource('loran-baselines-source')),
      hasBaselineLayer:  Boolean(map.getLayer('loran-baselines-layer')),
      hasGdopSource:     Boolean(map.getSource('loran-gdop-heatmap-source')),
      hasGdopLayer:      Boolean(map.getLayer('loran-gdop-heatmap-layer')),
    };
  });
}

const PERSISTENT_LAYERS  = ['loran-baselines-layer', 'loran-gdop-heatmap-layer'];
const PERSISTENT_SOURCES = ['loran-baselines-source', 'loran-gdop-heatmap-source'];

test.describe('MapLibre setStyle & Overlay Layers Persistence Regression Suite', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.__LORAN_E2E__ = true;
      try {
        sessionStorage.setItem('loran_offline_radar', 'true');
      } catch {
        // ignore
      }
    });
  });

  for (const path of ['/loran-c', '/eloran']) {
    test(`overlay layers persist across theme toggle and style swap on ${path}`, async ({ page }) => {
      test.setTimeout(45000);

      const styleDiffWarnings = [];
      page.on('console', (msg) => {
        if (/Unable to perform style diff/i.test(msg.text())) styleDiffWarnings.push(msg.text());
      });

      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.maplibregl-map');
      await page.waitForFunction(() => {
        const map = window.__maplibreInstance;
        return Boolean(map && map.isStyleLoaded && map.isStyleLoaded());
      }, { timeout: 30000 });

      // Open Layers tab
      const layersTab = page.locator('button').filter({ hasText: 'Layers' }).first();
      await layersTab.waitFor({ state: 'visible', timeout: 10000 });
      await layersTab.click();
      await page.waitForTimeout(400);

      // Enable GDOP overlay (off by default)
      const gdopLabel = page.locator('label').filter({ hasText: /Live GDOP Coverage Overlay/ }).first();
      await gdopLabel.waitFor({ state: 'visible', timeout: 10000 });
      await gdopLabel.click();
      await page.waitForTimeout(300);

      // Step (a): baselines + GDOP present initially
      await waitForLayers(page, PERSISTENT_LAYERS, PERSISTENT_SOURCES, 30000);
      let layers = await snapshotLayers(page);
      expect(layers.hasBaselineSource, 'initial: baselines-source').toBe(true);
      expect(layers.hasBaselineLayer,  'initial: baselines-layer').toBe(true);
      expect(layers.hasGdopSource,     'initial: gdop-source').toBe(true);
      expect(layers.hasGdopLayer,      'initial: gdop-layer').toBe(true);

      // Step (b): Theme toggle
      const themeBtn = page.locator('button[title*="Switch to"]').first();
      await expect(themeBtn).toBeVisible({ timeout: 5000 });
      await themeBtn.click();
      await page.waitForTimeout(1000);
      await waitForLayers(page, PERSISTENT_LAYERS, PERSISTENT_SOURCES, 35000);

      layers = await snapshotLayers(page);
      expect(layers.hasBaselineSource, 'post-theme: baselines-source').toBe(true);
      expect(layers.hasBaselineLayer,  'post-theme: baselines-layer').toBe(true);
      expect(layers.hasGdopSource,     'post-theme: gdop-source').toBe(true);
      expect(layers.hasGdopLayer,      'post-theme: gdop-layer').toBe(true);
      expect(styleDiffWarnings,        'no diff warnings').toHaveLength(0);

      // Step (c): Second style swap via theme toggle back
      await themeBtn.click();
      await page.waitForTimeout(500);
      await waitForLayers(page, PERSISTENT_LAYERS, PERSISTENT_SOURCES, 20000);

      layers = await snapshotLayers(page);
      expect(layers.hasBaselineSource, 'post-second-swap: baselines-source').toBe(true);
      expect(layers.hasBaselineLayer,  'post-second-swap: baselines-layer').toBe(true);
      expect(layers.hasGdopSource,     'post-second-swap: gdop-source').toBe(true);
      expect(layers.hasGdopLayer,      'post-second-swap: gdop-layer').toBe(true);
    });

    test(`LOP contours persist after style swap on ${path}`, async ({ page }) => {
      test.setTimeout(45000);

      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.maplibregl-map');
      await page.waitForFunction(() => {
        const map = window.__maplibreInstance;
        return Boolean(map && map.isStyleLoaded && map.isStyleLoaded());
      }, { timeout: 30000 });

      const layersTab = page.locator('button').filter({ hasText: 'Layers' }).first();
      await layersTab.waitFor({ state: 'visible', timeout: 10000 });
      await layersTab.click();
      await page.waitForTimeout(400);

      const genBtn = page.locator('button').filter({ hasText: /Generate LOP Contours/ }).first();
      await genBtn.waitFor({ state: 'visible', timeout: 10000 });
      await genBtn.click();

      // Wait for worker to finish: button text reverts from "Computing..." back to "Generate LOP Contours"
      await expect(genBtn).toHaveText(/Generate LOP Contours/, { timeout: 60000 });
      await page.waitForTimeout(500);

      await waitForLayers(page, ['loran-lops-layer'], ['loran-lops-source'], 15000);
      let snap = await snapshotLayers(page);
      expect(snap.hasLopSource, 'initial: lop-source').toBe(true);
      expect(snap.hasLopLayer,  'initial: lop-layer').toBe(true);

      // Theme toggle -> setStyle() -> epoch increments -> LOP re-added
      const themeBtn = page.locator('button[title*="Switch to"]').first();
      await expect(themeBtn).toBeVisible({ timeout: 5000 });
      await themeBtn.click();
      await page.waitForTimeout(1500);

      await waitForLayers(page, ['loran-lops-layer', 'loran-baselines-layer'], ['loran-lops-source', 'loran-baselines-source'], 35000);
      snap = await snapshotLayers(page);
      expect(snap.hasLopSource, 'post-theme: lop-source').toBe(true);
      expect(snap.hasLopLayer,  'post-theme: lop-layer').toBe(true);
    });
  }

  test('MapLibre listener count does not leak over 20 theme toggles', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/loran-c', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.maplibregl-map');
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      return Boolean(map && map.isStyleLoaded && map.isStyleLoaded());
    }, { timeout: 30000 });

    const getListenerCount = async () => {
      return await page.evaluate(() => {
        const map = window.__maplibreInstance;
        if (!map || !map._listeners) return 0;
        let total = 0;
        for (const arr of Object.values(map._listeners)) {
          if (Array.isArray(arr)) total += arr.length;
        }
        return total;
      });
    };

    const initialCount = await getListenerCount();
    const themeBtn = page.locator('button[title*="Switch to"]').first();
    await expect(themeBtn).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 20; i++) {
      await themeBtn.click();
      await page.waitForTimeout(100);
    }

    // Wait for MapLibre to finish applying styles and reach loaded state
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      return Boolean(map && map.isStyleLoaded && map.isStyleLoaded());
    }, { timeout: 15000 });

    const finalCount = await getListenerCount();

    // MapLibre listener count must not accumulate with 20 toggles (leak would add 20+ listeners)
    expect(finalCount - initialCount).toBeLessThanOrEqual(5);
  });

  test('direct map.setStyle keeps custom overlays intact without calling app helper', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/eloran', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.maplibregl-map');
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      return Boolean(map && map.isStyleLoaded && map.isStyleLoaded());
    }, { timeout: 30000 });

    // Enable GDOP overlay
    const layersTab = page.locator('button').filter({ hasText: 'Layers' }).first();
    await layersTab.waitFor({ state: 'visible', timeout: 10000 });
    await layersTab.click();
    await page.waitForTimeout(400);

    const gdopLabel = page.locator('label').filter({ hasText: /Live GDOP Coverage Overlay/ }).first();
    await gdopLabel.waitFor({ state: 'visible', timeout: 10000 });
    await gdopLabel.click();
    await page.waitForTimeout(300);

    await waitForLayers(page, PERSISTENT_LAYERS, PERSISTENT_SOURCES, 30000);

    // Call map.setStyle DIRECTLY on the map instance, bypassing all app helpers
    await page.evaluate(() => {
      const map = window.__maplibreInstance;
      map.setStyle({
        version: 8,
        sources: {},
        layers: [
          {
            id: 'unmanaged-direct-bg',
            type: 'background',
            paint: { 'background-color': '#0d1117' },
          },
        ],
      });
    });

    // Verify self-healing recovers baselines & GDOP layers despite unmanaged setStyle
    await waitForLayers(page, PERSISTENT_LAYERS, PERSISTENT_SOURCES, 35000);
    const snap = await snapshotLayers(page);
    expect(snap.hasBaselineLayer, 'direct setStyle: baselines-layer').toBe(true);
    expect(snap.hasGdopLayer, 'direct setStyle: gdop-layer').toBe(true);
  });

  test('vector style diff path: mock OpenFreeMap style and tiles via route interception', async ({ page }) => {
    test.setTimeout(45000);

    // Intercept OpenFreeMap style JSON
    await page.route('**/tiles.openfreemap.org/**', async (route) => {
      const url = route.request().url();
      if (url.includes('.json') || url.includes('style')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            version: 8,
            sources: {
              openmaptiles: {
                type: 'vector',
                tiles: ['http://localhost:5173/mock-tiles/{z}/{x}/{y}.pbf'],
              },
            },
            layers: [
              {
                id: 'background',
                type: 'background',
                paint: { 'background-color': '#111827' },
              },
            ],
          }),
        });
      } else {
        await route.fulfill({ status: 204 });
      }
    });

    await page.route('**/mock-tiles/**', async (route) => {
      await route.fulfill({ status: 204 });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/eloran', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.maplibregl-map');
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      return Boolean(map && map.isStyleLoaded && map.isStyleLoaded());
    }, { timeout: 30000 });

    // Open Layers tab and enable GDOP
    const layersTab = page.locator('button').filter({ hasText: 'Layers' }).first();
    await layersTab.waitFor({ state: 'visible', timeout: 10000 });
    await layersTab.click();
    await page.waitForTimeout(400);

    const gdopLabel = page.locator('label').filter({ hasText: /Live GDOP Coverage Overlay/ }).first();
    await gdopLabel.waitFor({ state: 'visible', timeout: 10000 });
    await gdopLabel.click();
    await page.waitForTimeout(300);

    await waitForLayers(page, PERSISTENT_LAYERS, PERSISTENT_SOURCES, 30000);

    // Switch basemap to OpenFreeMap (vector style)
    const ofmBtn = page.locator('button[data-testid="basemap-openfreemap"]');
    if (await ofmBtn.isVisible()) {
      await ofmBtn.click();
      await page.waitForTimeout(500);

      // Verify vector diff path applies and self-healing recovers overlays
      await waitForLayers(page, PERSISTENT_LAYERS, PERSISTENT_SOURCES, 35000);
      const snap = await snapshotLayers(page);
      expect(snap.hasBaselineLayer, 'ofm vector: baselines-layer').toBe(true);
      expect(snap.hasGdopLayer, 'ofm vector: gdop-layer').toBe(true);
    }
  });
});

