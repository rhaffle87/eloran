import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Comprehensive Functional QA & Priority Verification', () => {
  const screenshotsDir = path.resolve(process.cwd(), 'docs/verification/screenshots');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__LORAN_E2E__ = true;
    });
  });

  test.beforeAll(async () => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test('Priority 4 & 5: Hard-default LIGHT theme, Navbar theme toggle, and banner persistence', async ({ page }) => {
    // Clear storage to test first-visit behavior
    await page.goto('/eloran');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 1. Assert hard-default LIGHT theme
    const htmlTheme = await page.locator('html').getAttribute('data-theme');
    const htmlClass = await page.locator('html').getAttribute('class') || '';
    expect(htmlTheme).toBe('light');
    expect(htmlClass).not.toContain('dark');

    // 2. Educational notice banner is initially visible
    const banner = page.locator('div[role="region"][aria-label="Educational Disclaimer"]');
    await expect(banner).toBeVisible();

    // Dismiss banner
    const dismissBtn = banner.locator('button[aria-label="Dismiss educational notice"]');
    await dismissBtn.click();
    await expect(banner).toHaveCount(0);

    // Verify localStorage has saved dismissal
    const dismissedValue = await page.evaluate(() => localStorage.getItem('loran_edu_notice_dismissed'));
    expect(dismissedValue).toBe('true');

    // Navigate to another page and verify banner stays dismissed
    await page.goto('/loran-c', { waitUntil: 'domcontentloaded' });
    const bannerAfterNav = page.locator('div[role="region"][aria-label="Educational Disclaimer"]');
    await expect(bannerAfterNav).toHaveCount(0);

    // 3. Navbar theme toggle
    const themeBtn = page.locator('button[aria-label*="Switch to dark theme"], button[aria-label*="Switch to light theme"]');
    await expect(themeBtn).toBeVisible();

    // Capture Light Theme Screenshot
    await page.screenshot({ path: path.join(screenshotsDir, 'p4_navbar_light_theme.png') });

    // Toggle to Dark
    await themeBtn.click();
    await page.waitForTimeout(300);

    const darkTheme = await page.locator('html').getAttribute('data-theme');
    const darkClass = await page.locator('html').getAttribute('class') || '';
    expect(darkTheme).toBe('dark');
    expect(darkClass).toContain('dark');

    // Capture Dark Theme Screenshot
    await page.screenshot({ path: path.join(screenshotsDir, 'p4_navbar_dark_theme.png') });

    // Toggle back to Light
    await themeBtn.click();
    await page.waitForTimeout(300);
    const restoredTheme = await page.locator('html').getAttribute('data-theme');
    expect(restoredTheme).toBe('light');
  });

  test('Priority 2 & 3: Radar Canvas offline mode rendering & CARTO UX', async ({ page }) => {
    await page.goto('/eloran', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Switch to Radar Canvas
    const radarBtn = page.locator('button').filter({ hasText: /^Radar$/i });
    await expect(radarBtn).toBeVisible();
    await radarBtn.click();
    await page.waitForTimeout(1000);

    // Check radar canvas is rendered and visible
    const radarCanvas = page.locator('canvas[style*="z-index: 1"]');
    await expect(radarCanvas).toBeVisible();

    // Capture Radar Canvas Light Theme screenshot
    await page.screenshot({ path: path.join(screenshotsDir, 'p2_radar_canvas_light.png') });

    // Switch to dark theme to verify dark radar canvas rendering
    const themeBtn = page.locator('button[aria-label*="theme"]');
    await themeBtn.click();
    await page.waitForTimeout(600);

    // Capture Radar Canvas Dark Theme screenshot
    await page.screenshot({ path: path.join(screenshotsDir, 'p2_radar_canvas_dark.png') });

    // Priority 3: CARTO button click UX
    const cartoBtn = page.locator('button').filter({ hasText: /CARTO/i }).first();
    await expect(cartoBtn).toBeVisible();
    await cartoBtn.click();

    const btnText = (await cartoBtn.textContent()) || '';
    const isCartoKeyConfigured = !btnText.includes('🔒');

    if (!isCartoKeyConfigured) {
      // Unconfigured API key: verify non-blocking guidance banner appears and is dismissible
      const cartoNotice = page.locator('[data-testid="radar-fallback-notice"], div[role="status"]').filter({ hasText: /CARTO is an optional commercial basemap/i });
      await expect(cartoNotice).toBeVisible();

      const dismissCarto = cartoNotice.locator('button[aria-label="Dismiss notice"]');
      await dismissCarto.click();
      await expect(cartoNotice).not.toBeVisible();
    } else {
      // Configured API key: verify CARTO map layer is activated with proper attribution
      await page.waitForTimeout(1000);
      const attribution = page.locator('.maplibregl-ctrl-attrib');
      await expect(attribution).toContainText('CARTO');
    }
  });

  test('Priority 6: KaTeX math formulas render properly on Learn, About, and Waveforms', async ({ page }) => {
    // 1. Check /learn
    await page.goto('/learn', { waitUntil: 'domcontentloaded' });
    const katexLearn = page.locator('.katex');
    await expect(katexLearn.first()).toBeVisible({ timeout: 5000 });
    const learnCount = await katexLearn.count();
    expect(learnCount).toBeGreaterThanOrEqual(5);

    // Verify raw LaTeX strings like \frac are NOT visible as raw text
    const rawFracLearn = page.locator('text="\\frac"');
    await expect(rawFracLearn).toHaveCount(0);

    // Capture screenshot of Learn formulas
    await page.screenshot({ path: path.join(screenshotsDir, 'p6_katex_learn_formulas.png') });

    // 2. Check /waveforms
    await page.goto('/waveforms', { waitUntil: 'domcontentloaded' });
    const katexWaveforms = page.locator('.katex');
    await expect(katexWaveforms.first()).toBeVisible({ timeout: 5000 });
    const waveformsCount = await katexWaveforms.count();
    expect(waveformsCount).toBeGreaterThanOrEqual(3);

    const rawFracWaveforms = page.locator('text="\\frac"');
    await expect(rawFracWaveforms).toHaveCount(0);

    await page.screenshot({ path: path.join(screenshotsDir, 'p6_katex_waveforms_formulas.png') });

    // 3. Check /about
    await page.goto('/about', { waitUntil: 'domcontentloaded' });
    const katexAbout = page.locator('.katex');
    await expect(katexAbout.first()).toBeVisible({ timeout: 5000 });
    const aboutCount = await katexAbout.count();
    expect(aboutCount).toBeGreaterThanOrEqual(4);

    const rawDeltaAbout = page.locator('text="\\Delta"');
    await expect(rawDeltaAbout).toHaveCount(0);

    await page.screenshot({ path: path.join(screenshotsDir, 'p6_katex_about_formulas.png') });
  });

  test('Priority 7: System-wide interactive controls (Pan, Stations, Presets, Settings, Exports)', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    await page.goto('/eloran', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // 1. Tool mode buttons
    const panBtn = page.locator('button[aria-label*="Pan"], button:has-text("Pan")').first();
    if (await panBtn.isVisible()) {
      await panBtn.click();
    }

    const masterBtn = page.locator('button[aria-label*="Master"], button:has-text("+Master")').first();
    if (await masterBtn.isVisible()) {
      await masterBtn.click();
    }

    const secBtn = page.locator('button[aria-label*="Secondary"], button:has-text("+Secondary")').first();
    if (await secBtn.isVisible()) {
      await secBtn.click();
    }

    const rxBtn = page.locator('button[aria-label*="Receiver"], button:has-text("+Receiver")').first();
    if (await rxBtn.isVisible()) {
      await rxBtn.click();
    }

    // Switch back to pan
    if (await panBtn.isVisible()) {
      await panBtn.click();
    }

    // 2. Preset switcher
    const presetSelect = page.locator('#scenario-preset-select');
    await expect(presetSelect).toBeVisible();

    const presetsToTest = ['north_sea_historical', 'bohai_yellow_sea_active', 'high_gdop', 'gnss_denied', 'jakarta_baseline'];
    for (const preset of presetsToTest) {
      await presetSelect.selectOption(preset);
      await page.waitForTimeout(500);
      expect(pageErrors).toHaveLength(0);
    }

    // 3. Test Cycle Selection Monte Carlo on /waveforms
    await page.goto('/waveforms', { waitUntil: 'domcontentloaded' });
    const cycleTab = page.locator('button:has-text("Cycle Selection")');
    if (await cycleTab.isVisible()) {
      await cycleTab.click();
    }

    const runMonteCarloBtn = page.locator('button:has-text("Run 500-Run Monte Carlo"), button:has-text("Run Monte Carlo"), button:has-text("Simulate")').first();
    if (await runMonteCarloBtn.isVisible()) {
      await runMonteCarloBtn.click();
      await page.waitForTimeout(1000);
      expect(pageErrors).toHaveLength(0);
    }

    // 4. Test Export triggers on /eloran
    await page.goto('/eloran', { waitUntil: 'domcontentloaded' });
    const csvExportBtn = page.locator('button:has-text("CSV"), button:has-text("Export CSV")').first();
    if (await csvExportBtn.isVisible()) {
      await csvExportBtn.click().catch(() => {});
    }

    const geoJsonExportBtn = page.locator('button:has-text("GeoJSON"), button:has-text("Export GeoJSON")').first();
    if (await geoJsonExportBtn.isVisible()) {
      await geoJsonExportBtn.click().catch(() => {});
    }

    expect(pageErrors).toHaveLength(0);
  });
});
