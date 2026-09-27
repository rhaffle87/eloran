import { test, expect } from '@playwright/test';

test.describe('Radar Canvas Map Mode — Comprehensive Functional & Visual Verification', () => {
  test('manual selection: activates radar canvas underlay and renders markers, baselines, and LOP contours on top', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/eloran');
    await page.waitForSelector('.maplibregl-map');
    await page.waitForTimeout(500);

    // 1. Manually select Radar basemap
    const radarBtn = page.locator('button[data-testid="basemap-radar"]');
    await expect(radarBtn).toBeVisible();
    await expect(radarBtn).toHaveAttribute('title', /Offline Radar: Zero-network 2D navigation backdrop/);
    await radarBtn.click();
    await page.waitForTimeout(500);

    // 2. Verify canvas exists and is displayed
    const canvas = page.locator('canvas[data-testid="radar-backdrop-canvas"]');
    await expect(canvas).toBeVisible();

    // 3. Pixel assertion: verify the canvas actually painted non-empty pixels
    const pixelStats = await page.evaluate(() => {
      const el = document.querySelector('canvas[data-testid="radar-backdrop-canvas"]');
      if (!el) return { totalNonEmptyPixels: 0, sampleAlpha: 0 };
      const ctx = el.getContext('2d');
      const imgData = ctx.getImageData(0, 0, el.width, el.height);
      const data = imgData.data;
      let nonEmpty = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
          nonEmpty++;
        }
      }
      return {
        totalPixels: data.length / 4,
        totalNonEmptyPixels: nonEmpty,
        width: el.width,
        height: el.height,
      };
    });

    expect(pixelStats.totalNonEmptyPixels).toBeGreaterThan(1000);
    expect(pixelStats.width).toBeGreaterThan(0);
    expect(pixelStats.height).toBeGreaterThan(0);

    // 4. Verify DOM stacking: radar canvas underlay at z-index 0, map container at z-index 1 with transparent background
    const stacking = await page.evaluate(() => {
      const canvasEl = document.querySelector('canvas[data-testid="radar-backdrop-canvas"]');
      const mapContainerEl = document.querySelector('.maplibregl-map');
      return {
        canvasZIndex: window.getComputedStyle(canvasEl).zIndex,
        mapContainerZIndex: window.getComputedStyle(mapContainerEl).zIndex,
        mapBgColor: window.getComputedStyle(mapContainerEl).backgroundColor,
      };
    });

    expect(stacking.canvasZIndex).toBe('0');
    expect(stacking.mapContainerZIndex).toBe('1');
    expect(stacking.mapBgColor).toBe('rgba(0, 0, 0, 0)');

    // 5. Verify Station Markers are visible and positioned on top
    const markers = page.locator('.maplibregl-marker');
    await expect(markers.first()).toBeVisible();
    const markerCount = await markers.count();
    expect(markerCount).toBeGreaterThanOrEqual(4);

    // 6. Verify Baselines layer exists on the MapLibre map instance
    const hasBaselineLayer = await page.evaluate(() => {
      const map = window.__maplibreInstance;
      return map ? Boolean(map.getLayer('loran-baselines-layer')) : false;
    });
    expect(hasBaselineLayer).toBe(true);

    // 7. Verify LOP Contours can be generated and rendered on top of Radar canvas
    const meshTab = page.locator('button:has-text("Mesh")');
    await meshTab.click();
    await page.waitForTimeout(300);

    const generateLopsBtn = page.locator('button:has-text("Generate LOP Contours")');
    await generateLopsBtn.click();

    // Wait for worker calculation to finish and layer to be added
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      return Boolean(map && map.getLayer('loran-lops-layer'));
    }, { timeout: 25000 });

    const hasLopLayer = await page.evaluate(() => {
      const map = window.__maplibreInstance;
      return Boolean(map && map.getLayer('loran-lops-layer'));
    });
    expect(hasLopLayer).toBe(true);
  });

  test('declutter controls: toggles 30° radial bearing lines and graticule coordinate grid', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/eloran');
    await page.waitForSelector('.maplibregl-map');
    await page.waitForTimeout(500);

    // Switch to Radar mode
    await page.click('button[data-testid="basemap-radar"]');
    await page.waitForTimeout(300);

    // Verify radar controls pill is visible
    const controlsPill = page.locator('div[data-testid="radar-controls-pill"]');
    await expect(controlsPill).toBeVisible();

    // Radials default to OFF (cardinals only)
    const radialsBtn = page.locator('button[data-testid="toggle-radar-radials"]');
    await expect(radialsBtn).toContainText('OFF');

    // Toggle Radials to ON
    await radialsBtn.click();
    await expect(radialsBtn).toContainText('ON');
    await page.waitForTimeout(300);

    // Grid defaults to ON
    const gridBtn = page.locator('button[data-testid="toggle-radar-graticule"]');
    await expect(gridBtn).toContainText('ON');

    // Toggle Grid to OFF
    await gridBtn.click();
    await expect(gridBtn).toContainText('OFF');
    await page.waitForTimeout(300);

    // Verify canvas re-rendered without error
    const canvas = page.locator('canvas[data-testid="radar-backdrop-canvas"]');
    await expect(canvas).toBeVisible();
  });

  test('automatic fallback: triggers when tile network requests fail', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 1280, height: 800 });

    // Intercept only external tile endpoints, never localhost bundle assets
    await page.route(/https:\/\/(tiles\.openfreemap\.org|.*\.tile\.openstreetmap\.org)\/.*/, (route) => {
      route.abort();
    });

    await page.goto('/eloran');
    await page.waitForSelector('.maplibregl-map');
    await page.waitForTimeout(1000);

    // Initial OFM error auto-triggers fallback to OSM
    const notice = page.locator('div[data-testid="radar-fallback-notice"]');
    await expect(notice).toBeVisible({ timeout: 10000 });
    await expect(notice).toContainText(/OpenFreeMap unavailable/i);

    // Simulate OSM raster network unreachable to cascade into offline-radar
    await page.evaluate(() => {
      const map = window.__maplibreInstance;
      if (map) {
        map.fire('error', {
          error: { message: 'net::ERR_CONNECTION_REFUSED', status: 504 },
          sourceId: 'basemap-tiles',
        });
      }
    });

    // Fallback notice and radar canvas underlay must now be active
    const canvas = page.locator('canvas[data-testid="radar-backdrop-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 5000 });

    await expect(notice).toBeVisible({ timeout: 5000 });
    await expect(notice).toContainText(/offline Radar Canvas/i);

    // Dismiss notice
    const dismissBtn = notice.locator('button[aria-label="Dismiss notice"]');
    await dismissBtn.click();
    await expect(notice).not.toBeVisible();
  });

  test('switching back: user can cleanly transition from Radar back to online basemaps', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/eloran');
    await page.waitForSelector('.maplibregl-map');
    await page.waitForTimeout(500);

    // Switch to Radar
    await page.click('button[data-testid="basemap-radar"]');
    await page.waitForTimeout(300);
    const canvas = page.locator('canvas[data-testid="radar-backdrop-canvas"]');
    await expect(canvas).toBeVisible();

    // Switch back to OpenFreeMap
    await page.click('button:has-text("OpenFreeMap")');
    await page.waitForTimeout(1000);

    // Radar canvas should now be hidden (display: none)
    await expect(canvas).not.toBeVisible();

    // Controls pill should disappear
    const controlsPill = page.locator('div[data-testid="radar-controls-pill"]');
    await expect(controlsPill).not.toBeVisible();
  });
});
