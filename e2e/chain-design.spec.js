import { test, expect } from '@playwright/test';

test.describe('Chain Design & Planning Mode E2E Suite', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('toggle between Simulation and Chain Design mode in Loran-C', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    await page.goto('/loran-c');
    await page.waitForLoadState('networkidle');

    // Switch to Chain Design mode via console tab button
    const designTabBtn = page.getByRole('button', { name: /Chain Design/i }).first();
    await expect(designTabBtn).toBeVisible();
    await designTabBtn.click();

    // Verify Chain Design panel header is displayed
    await expect(page.getByText('Chain Design & Planning')).toBeVisible();
    await expect(page.getByText(/GRI ≥/i)).toBeVisible();

    // Verify HUD reflects Chain Design mode
    await expect(page.getByText('CHAIN DESIGN:')).toBeVisible();
    await expect(page.getByText('PLANNING', { exact: true })).toBeVisible();

    // Click USCG 400-mi Golden Preset
    const uscgPresetBtn = page.getByRole('button', { name: /USCG 400-mi Golden/i });
    await expect(uscgPresetBtn).toBeVisible();
    await uscgPresetBtn.click();

    // Verify baseline distance & travel time: ~2,472 µs (worked example)
    await expect(page.getByText('2472 µs').first()).toBeVisible();
    await expect(page.getByText(/400 nmi/i).first()).toBeVisible();

    // Commit design to simulation
    const commitBtn = page.getByRole('button', { name: /Commit Design to Active Simulation/i });
    await expect(commitBtn).toBeVisible();
    await commitBtn.click();

    // Verify it automatically returns to Simulation Mode
    await expect(page.getByText('MODE:')).toBeVisible();
    expect(pageErrors).toHaveLength(0);
  });

  test('toggle between Simulation and Chain Design mode in eLoran', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    // Switch to Chain Design mode in eLoran
    const designTabBtn = page.getByRole('button', { name: /Chain Design/i }).first();
    await expect(designTabBtn).toBeVisible();
    await designTabBtn.click();

    // Verify Chain Design panel header
    await expect(page.getByText('Chain Design & Planning')).toBeVisible();

    // Return to Simulation Mode via console top switcher
    const simTabBtn = page.getByRole('button', { name: /Simulation/i }).first();
    await expect(simTabBtn).toBeVisible();
    await simTabBtn.click();

    // Verify eLoran precision suite tabs return
    await expect(page.getByRole('button', { name: /Clocks/i })).toBeVisible();
    expect(pageErrors).toHaveLength(0);
  });
});
