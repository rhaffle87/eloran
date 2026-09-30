import { test, expect } from '@playwright/test';

test.describe('HUD Map Uniformity & Canonical Loran Pulse Verification', () => {
  test('HUD Map: Tactical toolbar has no dead right margin and scale control is themed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/eloran');
    await page.waitForLoadState('domcontentloaded');

    // 1. Tactical Toolbar positioning with sidebar open
    const toolbar = page.locator('div.backdrop-blur-md:has-text("+Receiver")');
    await expect(toolbar).toBeVisible();

    const toolbarBox = await toolbar.boundingBox();
    const sidebarContainer = page.locator('[data-testid="sidebar-container"]');
    const sidebarBox = await sidebarContainer.boundingBox();

    expect(toolbarBox).toBeTruthy();
    expect(sidebarBox).toBeTruthy();

    // Distance between right edge of toolbar and left edge of sidebar should be compact (~16px), not ~60px
    const gapToSidebar = sidebarBox.x - (toolbarBox.x + toolbarBox.width);
    expect(gapToSidebar).toBeLessThanOrEqual(24);
    expect(gapToSidebar).toBeGreaterThanOrEqual(8);

    // 2. MapLibre scale control is themed (not plain white/black)
    const scaleControl = page.locator('.maplibregl-ctrl-scale');
    await expect(scaleControl).toBeVisible();

    const scaleComputed = await scaleControl.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        fontFamily: style.fontFamily,
        borderBottomStyle: style.borderBottomStyle,
        borderBottomWidth: style.borderBottomWidth,
      };
    });
    expect(scaleComputed.fontFamily).toContain('mono');

    // 3. Station Symbols Legend is positioned right above the scale bar
    const legendContainer = page.locator('div.absolute.bottom-12');
    await expect(legendContainer).toBeVisible();

    const legendBox = await legendContainer.boundingBox();
    const scaleBox = await scaleControl.boundingBox();

    expect(legendBox).toBeTruthy();
    expect(scaleBox).toBeTruthy();

    // The legend should float directly above the scale bar without a 50px dead gap
    const gapBetweenLegendAndScale = scaleBox.y - (legendBox.y + legendBox.height);
    expect(gapBetweenLegendAndScale).toBeLessThanOrEqual(30);
    expect(gapBetweenLegendAndScale).toBeGreaterThanOrEqual(0);

    // Capture HUD screenshot in current theme
    await page.screenshot({ path: 'test-results/hud_spacing_verification.png' });

    // Toggle theme to dark and capture dark mode HUD
    const themeBtn = page.locator('button[title*="theme" i], button[aria-label*="theme" i]').first();
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/hud_spacing_dark_verification.png' });
    }
  });

  test('Waveforms: Canonical Loran-C pulse envelope + carrier wave, 300 µs zoom, and uncompressed SVG export', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto('/waveforms');
    await page.waitForLoadState('domcontentloaded');

    // 1. Dual-trace: Pulse envelope (red) and Pulse wave (cyan)
    const cyanWave = page.locator('polyline[stroke="#06b6d4"], polyline[stroke="#0284c7"]');
    await expect(cyanWave).toBeVisible();

    const redEnvelope = page.locator('polyline[stroke="#ef4444"], polyline[stroke="#dc2626"]');
    await expect(redEnvelope).toBeVisible();

    // 2. Click "300 µs (1-Pulse Zoom)" preset
    const zoomBtn = page.locator('button:has-text("300 µs (1-Pulse Zoom)")');
    await expect(zoomBtn).toBeVisible();
    await zoomBtn.click();

    // Check time axis labels have updated to microseconds
    await expect(page.locator('text=300 µs').first()).toBeVisible();

    // Capture zoomed pulse screenshot matching Image 4
    await page.screenshot({ path: 'test-results/loran_pulse_canonical_zoom.png' });

    // 3. Test Export SVG download
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button:has-text("Export SVG")').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('loran-pulse-trace');
    expect(download.suggestedFilename()).toContain('.svg');

    // Read exported SVG content to verify uncompressed attributes
    const path = await download.path();
    const fs = await import('fs');
    const svgText = fs.readFileSync(path, 'utf8');

    // Verify uncompressed SVG properties
    expect(svgText).toContain('viewBox="0 0 1200 560"');
    expect(svgText).toContain('width="1200"');
    expect(svgText).toContain('height="560"');
    expect(svgText).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svgText).toContain('Pulse Envelope E(t)');
    expect(svgText).toContain('Pulse Wave (100 kHz)');
    expect(svgText).toContain('USCG Specification COMDTINST M16562.4A');
  });
});
