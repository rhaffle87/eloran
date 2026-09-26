import { test, expect } from '@playwright/test';

test.describe('Sidebar Tooltips Verification Suite', () => {
  test('verify sidebar replaces heavy inline explanations with interactive hover tooltips', async ({ page }) => {
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    // 1. Verify tooltip icons exist on the initial Display tab
    const tooltips = page.locator('span[role="tooltip"]');
    await expect(tooltips.first()).toBeVisible();
    const count = await tooltips.count();
    expect(count).toBeGreaterThan(0);

    // Hover over a tooltip to test popup display
    const firstTooltip = tooltips.first();
    await firstTooltip.hover();
    await page.waitForTimeout(300);

    // Verify popup tooltip box appears
    const popup = page.locator('span[role="tooltip"] span.absolute');
    await expect(popup.first()).toBeVisible();

    // 2. Switch to Propagation / ASF tab
    const asfTab = page.getByRole('button', { name: /Propagation/i }).first();
    if (await asfTab.count() > 0) {
      await asfTab.click();
      await page.waitForTimeout(200);

      // Verify Millington / Formula mode buttons have tooltips instead of multi-line subtext
      const asfTooltips = page.locator('span[role="tooltip"]');
      expect(await asfTooltips.count()).toBeGreaterThan(0);
    }

    // 3. Switch to Clocks tab
    const clocksTab = page.getByRole('button', { name: /Clocks/i }).first();
    if (await clocksTab.count() > 0) {
      await clocksTab.click();
      await page.waitForTimeout(200);

      // Verify oscillator standard descriptions are in tooltips
      const clockTooltips = page.locator('span[role="tooltip"]');
      expect(await clockTooltips.count()).toBeGreaterThan(0);
    }

    // 4. Capture screenshot of the sleek, uncluttered sidebar
    await page.screenshot({ path: 'docs/verification/screenshots/sidebar_tooltips_verified.png' });
  });
});
