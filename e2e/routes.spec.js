import { test, expect } from '@playwright/test';

const routes = [
  { path: '/', isMap: false, name: 'Home' },
  { path: '/loran-c', isMap: true, name: 'Loran-C' },
  { path: '/eloran', isMap: true, name: 'eLoran' },
  { path: '/waveforms', isMap: false, name: 'Waveforms' },
  { path: '/learn', isMap: false, name: 'Learn' },
  { path: '/about', isMap: false, name: 'About' },
  { path: '/unknown-route-test', isMap: false, name: 'Unknown Route' },
];

test.describe('LORAN LAB E2E Suite', () => {
  for (const route of routes) {
    test(`visit ${route.path} (${route.name}) - no ErrorBoundary, no exceptions, no CSP violations`, async ({ page }) => {
      const pageErrors = [];
      const cspViolations = [];

      page.on('pageerror', (err) => {
        pageErrors.push(err.message || String(err));
      });

      page.on('console', (msg) => {
        const text = msg.text();
        if (/violates the following Content Security Policy|Content-Security-Policy|blocked by CSP/i.test(text)) {
          cspViolations.push(text);
        }
      });

      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBeLessThan(400);

      // Allow microtasks and rendering to finish
      await page.waitForTimeout(1500);

      // Verify no runtime crashes
      expect(pageErrors, `Page errors on ${route.path}: ${pageErrors.join(' | ')}`).toHaveLength(0);

      // Verify no CSP violations triggered
      expect(cspViolations, `CSP violations on ${route.path}: ${cspViolations.join(' | ')}`).toHaveLength(0);

      // Verify ErrorBoundary did not catch any error
      const bodyText = await page.textContent('body');
      expect(bodyText).not.toContain('Simulation Subsystem Fault');
      expect(bodyText).not.toContain('ErrorBoundary');

      // Verify About page specific content when visiting /about
      if (route.path === '/about') {
        await expect(page.locator('h1')).toContainText('About LORAN LAB');
      }

      // Verify map canvas on map routes
      if (route.isMap) {
        const canvas = page.locator('canvas.maplibregl-canvas');
        await expect(canvas).toBeVisible({ timeout: 10000 });
      }
    });
  }

  test('map renders basemap tile or activates radar fallback on /eloran', async ({ page }) => {
    let tileResponseStatus = null;
    let tileUrl = null;

    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('basemaps.cartocdn.com') || url.includes('tile.openstreetmap.org')) {
        tileUrl = url;
        tileResponseStatus = res.status();
      }
    });

    await page.goto('/eloran', { waitUntil: 'networkidle' });

    const canvas = page.locator('canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Assert that either:
    // 1. A real tile was fetched and returned HTTP 200
    // 2. OR the Radar Canvas fallback was activated
    const isRadarActive = await page.evaluate(() => {
      const activeBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent.includes('Radar Canvas')
      );
      const notice = document.querySelector('[data-testid="radar-fallback-notice"]');
      const isRadarProvider = activeBtn && activeBtn.className.includes('bg-cyan-500/20');
      return Boolean(isRadarProvider || notice);
    });

    const isTileOk = tileResponseStatus === 200;

    expect(
      isTileOk || isRadarActive,
      `Expected either HTTP 200 tile (got status: ${tileResponseStatus}, url: ${tileUrl}) or radar fallback active (got: ${isRadarActive})`
    ).toBe(true);
  });
});
