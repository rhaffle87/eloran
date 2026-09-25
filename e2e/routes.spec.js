import { test, expect } from '@playwright/test';

test.describe('LORAN LAB E2E Suite', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  const routes = [
    { path: '/', titlePart: 'Home' },
    { path: '/loran-c', titlePart: 'Loran-C' },
    { path: '/eloran', titlePart: 'eLoran' },
    { path: '/waveforms', titlePart: 'Waveforms' },
    { path: '/learn', titlePart: 'Learn' },
    { path: '/about', titlePart: 'About' },
    { path: '/unknown-route-test', titlePart: 'Unknown Route' },
  ];

  for (const { path: routePath, titlePart } of routes) {
    test(`visit ${routePath} (${titlePart}) - no ErrorBoundary, no exceptions, no CSP violations`, async ({ page }) => {
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

      await page.goto(routePath, { waitUntil: 'domcontentloaded' });

      // Ensure React mounted properly and no fallback ErrorBoundary was rendered
      const root = page.locator('#root');
      await expect(root).toBeVisible();
      const errorBoundaryNotice = page.locator('text=Simulator Error Encountered');
      await expect(errorBoundaryNotice).toHaveCount(0);

      // Verify page loaded without unhandled exceptions
      expect(pageErrors, `Page errors on ${routePath}: ${pageErrors.join(' | ')}`).toHaveLength(0);
      expect(cspViolations, `CSP violations on ${routePath}: ${cspViolations.join(' | ')}`).toHaveLength(0);
    });
  }

  for (const mapPath of ['/eloran', '/loran-c']) {
    test(`${mapPath} receives HTTP 200 from real basemap tile host within 10s and attaches map screenshot`, async ({ page }, testInfo) => {
      let tile200Count = 0;
      let networkOffline = false;
      const cspViolations = [];
      const observedExternalHosts = new Set();

      const isTileHost = (url) => (
        url.includes('openfreemap.org') ||
        url.includes('basemaps.cartocdn.com') ||
        url.includes('tile.openstreetmap.org')
      );

      page.on('console', (msg) => {
        const text = msg.text();
        if (/Content Security Policy|Content-Security-Policy/i.test(text)) {
          cspViolations.push(text);
        }
      });

      page.on('request', (req) => {
        try {
          const urlObj = new URL(req.url());
          if (urlObj.protocol.startsWith('http') && !urlObj.host.includes('localhost') && !urlObj.host.includes('127.0.0.1')) {
            observedExternalHosts.add(urlObj.host);
          }
        } catch {
          // ignore invalid URLs
        }
      });

      page.on('response', (res) => {
        const url = res.url();
        if (isTileHost(url) && res.status() === 200) {
          tile200Count++;
        }
      });

      page.on('requestfailed', (req) => {
        const url = req.url();
        if (isTileHost(url)) {
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

      // Assert that every external host requested is strictly within allowed CSP domains
      const allowedHosts = [
        'tiles.openfreemap.org',
        'fonts.googleapis.com',
        'fonts.gstatic.com',
        'tile.openstreetmap.org',
        'basemaps.cartocdn.com',
      ];
      for (const host of observedExternalHosts) {
        const isAllowed = allowedHosts.some((allowed) => host === allowed || host.endsWith('.' + allowed));
        expect(isAllowed, `Observed unexpected external host '${host}' on ${mapPath} not in allowed CSP hosts`).toBe(true);
      }

      expect(cspViolations, `CSP violations detected on ${mapPath}: ${cspViolations.join(' | ')}`).toHaveLength(0);
      expect(tile200Count, `Expected at least one HTTP 200 tile response on ${mapPath} within 10s`).toBeGreaterThan(0);

      // Wait a moment for tile rendering to settle, then capture screenshot artifact for watermark inspection
      await page.waitForTimeout(1000);
      const screenshot = await page.screenshot({ fullPage: false });
      await testInfo.attach(`rendered-map-${mapPath.replace('/', '')}`, {
        body: screenshot,
        contentType: 'image/png',
      });
    });
  }

  test('progressive fallback chain: falls back to OpenStreetMap raster when openfreemap.org is blocked', async ({ page }) => {
    const cspViolations = [];
    let osm200Count = 0;

    page.on('console', (msg) => {
      const text = msg.text();
      if (/Content Security Policy|Content-Security-Policy/i.test(text)) {
        cspViolations.push(text);
      }
    });

    page.on('response', (res) => {
      if (res.url().includes('tile.openstreetmap.org') && res.status() === 200) {
        osm200Count++;
      }
    });

    // Abort ONLY OpenFreeMap requests
    await page.route('**/*openfreemap.org/**', (route) => route.abort('failed'));

    await page.goto('/eloran', { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Fallback notice should appear indicating switch to OSM
    const notice = page.locator('[data-testid="radar-fallback-notice"]');
    await expect(notice).toBeVisible({ timeout: 10000 });
    await expect(notice).toContainText('Switched to OpenStreetMap fallback');

    // Wait for OSM tile response
    const start = Date.now();
    while (osm200Count === 0 && Date.now() - start < 8000) {
      await page.waitForTimeout(250);
    }
    expect(osm200Count, 'Expected at least one HTTP 200 response from OpenStreetMap fallback').toBeGreaterThan(0);
    expect(cspViolations).toHaveLength(0);
  });

  test('progressive fallback chain: falls back to offline Radar Canvas when all tile hosts are blocked', async ({ page }) => {
    const cspViolations = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (/Content Security Policy|Content-Security-Policy/i.test(text)) {
        cspViolations.push(text);
      }
    });

    // Abort all external tile requests to simulate 100% network failure
    await page.route('**/*openfreemap.org/**', (route) => route.abort('failed'));
    await page.route('**/*cartocdn.com/**', (route) => route.abort('failed'));
    await page.route('**/*openstreetmap.org/**', (route) => route.abort('failed'));

    await page.goto('/eloran', { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Radar Canvas notice should become visible after fallbacks fail
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
