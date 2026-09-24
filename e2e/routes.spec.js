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
        if (/Content Security Policy|Content-Security-Policy/i.test(text)) {
          cspViolations.push(text);
        }
      });

      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBeLessThan(400);

      // Allow microtasks and rendering to finish
      await page.waitForTimeout(1500);

      // Verify no runtime crashes
      expect(pageErrors, `Page errors on ${route.path}: ${pageErrors.join(' | ')}`).toHaveLength(0);

      // Verify zero console messages containing "Content Security Policy"
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

  for (const mapPath of ['/eloran', '/loran-c']) {
    test(`${mapPath} receives HTTP 200 from real basemap tile host within 10s`, async ({ page }) => {
      let tile200Count = 0;
      let networkOffline = false;
      const cspViolations = [];

      page.on('console', (msg) => {
        const text = msg.text();
        if (/Content Security Policy|Content-Security-Policy/i.test(text)) {
          cspViolations.push(text);
        }
      });

      page.on('response', (res) => {
        const url = res.url();
        if (url.includes('basemaps.cartocdn.com') || url.includes('tile.openstreetmap.org')) {
          if (res.status() === 200) {
            tile200Count++;
          }
        }
      });

      page.on('requestfailed', (req) => {
        const url = req.url();
        if (url.includes('basemaps.cartocdn.com') || url.includes('tile.openstreetmap.org')) {
          const failure = req.failure();
          if (failure && /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/i.test(failure.errorText)) {
            networkOffline = true;
          }
        }
      });

      await page.goto(mapPath, { waitUntil: 'domcontentloaded' });
      const canvas = page.locator('canvas.maplibregl-canvas');
      await expect(canvas).toBeVisible({ timeout: 10000 });

      const startTime = Date.now();
      while (tile200Count === 0 && Date.now() - startTime < 10000) {
        if (networkOffline) break;
        await page.waitForTimeout(250);
      }

      if (tile200Count === 0 && networkOffline) {
        test.skip(true, 'skipped: offline');
      }

      expect(cspViolations, `CSP violations detected on ${mapPath}: ${cspViolations.join(' | ')}`).toHaveLength(0);
      expect(tile200Count, `Expected at least one HTTP 200 tile response on ${mapPath} within 10s`).toBeGreaterThan(0);
    });
  }

  test('offline fallback: activates Radar Canvas and shows dismissible notice when tile hosts fail', async ({ page }) => {
    const cspViolations = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (/Content Security Policy|Content-Security-Policy/i.test(text)) {
        cspViolations.push(text);
      }
    });

    // Abort all external tile requests to simulate 100% network failure
    await page.route('**/*cartocdn.com/**', (route) => route.abort('failed'));
    await page.route('**/*openstreetmap.org/**', (route) => route.abort('failed'));

    await page.goto('/eloran', { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Radar Canvas notice should become visible after >= 8 tile errors occur
    const notice = page.locator('[data-testid="radar-fallback-notice"]');
    await expect(notice).toBeVisible({ timeout: 10000 });
    await expect(notice).toContainText('Switched to offline Radar Canvas');

    // Dismiss notice
    const dismissBtn = notice.locator('button[aria-label="Dismiss notice"]');
    await dismissBtn.click();
    await expect(notice).not.toBeVisible();

    // Verify session storage remembered the offline preference
    const remembered = await page.evaluate(() => sessionStorage.getItem('loran_offline_radar'));
    expect(remembered).toBe('true');

    expect(cspViolations).toHaveLength(0);
  });
});
