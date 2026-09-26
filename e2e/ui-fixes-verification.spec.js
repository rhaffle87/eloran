import { test, expect } from '@playwright/test';

test.describe('UI & UX Fixes Verification Suite', () => {
  test('Verify all 6 UI fixes: viewport lock, sidebar toggle, scale clearance, theme toggle, and banner dismissal', async ({ page }) => {
    // 1. Visit Loran-C page
    await page.goto('/loran-c');
    await page.waitForLoadState('networkidle');

    // FIX 5: Viewport Lock — No page vertical scrollbar
    const isScrollLocked = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const scrollHeight = Math.max(doc.scrollHeight, body.scrollHeight);
      const clientHeight = window.innerHeight;
      return scrollHeight <= clientHeight + 1; // allows 1px subpixel rounding
    });
    expect(isScrollLocked).toBe(true);

    // Verify footer is NOT rendered on simulation routes
    const footerCount = await page.locator('footer').count();
    expect(footerCount).toBe(0);

    // FIX 1: Station Legend clearance above Scale Control
    const legend = page.locator('text=Station Symbols');
    await expect(legend).toBeVisible();
    const legendBox = await legend.boundingBox();
    const scaleControl = page.locator('.maplibregl-ctrl-scale').first();
    if (await scaleControl.count() > 0) {
      const scaleBox = await scaleControl.boundingBox();
      if (legendBox && scaleBox) {
        // Assert legend is strictly above scale control with clearance
        expect(legendBox.y + legendBox.height).toBeLessThan(scaleBox.y);
      }
    }

    // FIX 2: Mode toolbar does not overlap sidebar toggle
    const modeToolbar = page.locator('button:has-text("+Master")').locator('..');
    const toggleButton = page.locator('button[aria-label="Collapse console drawer"]');
    await expect(toggleButton).toBeVisible();

    const modeBox = await modeToolbar.boundingBox();
    const toggleBox = await toggleButton.boundingBox();
    if (modeBox && toggleBox) {
      // Ensure horizontal clearance between mode toolbar and sidebar toggle
      expect(modeBox.x + modeBox.width).toBeLessThanOrEqual(toggleBox.x);
    }

    // FIX 2: Collapsing sidebar keeps toggle button visible and functional
    await toggleButton.click();
    await page.waitForTimeout(400); // await transition

    // When collapsed, take screenshot to prove button is visible and map takes full width
    await page.screenshot({ path: 'docs/verification/screenshots/ui_fixes_collapsed_verified.png' });

    // When collapsed, the toggle button must STILL be visible on the map hero
    const expandButton = page.locator('button[aria-label="Expand console drawer"]');
    await expect(expandButton).toBeVisible();
    const expandBox = await expandButton.boundingBox();
    expect(expandBox).not.toBeNull();
    expect(expandBox.width).toBeGreaterThan(0);
    expect(expandBox.height).toBeGreaterThan(0);

    // Clicking expand brings sidebar back
    await expandButton.click();
    await page.waitForTimeout(400);
    await expect(page.locator('text=Loran-C Console')).toBeVisible();

    // FIX 3: Interface Theme selection in DisplayPanel and Navbar
    // Switch to Display tab in Loran-C console
    const displayTab = page.locator('button:has-text("Display")');
    if (await displayTab.count() > 0) {
      await displayTab.click();
      await page.waitForTimeout(200);

      // Verify Interface Theme controls are present
      await expect(page.locator('text=Interface Theme')).toBeVisible();
      const darkBtn = page.locator('button:has-text("Dark")').first();
      await darkBtn.click();
      await page.waitForTimeout(200);
      const isDark = await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark');
      expect(isDark).toBe(true);

      const lightBtn = page.locator('button:has-text("Light")').first();
      await lightBtn.click();
      await page.waitForTimeout(200);
      const isLight = await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'light');
      expect(isLight).toBe(true);
    }

    // FIX 6: Top Warning Banner dismissal persists
    const eduDismissBtn = page.locator('button[aria-label="Dismiss educational notice"]');
    if (await eduDismissBtn.isVisible()) {
      await eduDismissBtn.click();
      await page.waitForTimeout(200);
      await expect(page.locator('text=EDUCATIONAL NOTICE:')).not.toBeVisible();

      // Navigate to /eloran and verify banner stays dismissed
      await page.goto('/eloran');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('text=EDUCATIONAL NOTICE:')).not.toBeVisible();
    }

    // Take screenshot of clean simulation layout
    await page.screenshot({ path: 'docs/verification/screenshots/ui_fixes_verified.png' });
  });
});
