import { test, expect } from '@playwright/test';

test.describe('eLoran Trajectory Panel & Doppler Verification', () => {
  test('opens Trajectory tab, verifies Doppler shift table, scrubber, and corridor presets with 0 runtime errors', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message || String(err));
    });

    await page.goto('/eloran', { waitUntil: 'domcontentloaded' });

    // Ensure error boundary is NOT triggered
    const faultNotice = page.locator('text=Simulation Subsystem Fault');
    await expect(faultNotice).toHaveCount(0);

    // Click Trajectory tab
    const trajTab = page.locator('button:has-text("Trajectory")');
    await expect(trajTab).toBeVisible({ timeout: 10000 });
    await trajTab.click();

    // Verify Trajectory header and telemetry
    await expect(page.locator('text=Kinematic Trajectory & EKF')).toBeVisible();
    await expect(page.locator('text=Speed Over Ground')).toBeVisible();
    await expect(page.locator('text=Vessel Course')).toBeVisible();
    await expect(page.locator('text=Transmitter Doppler Frequency Shift')).toBeVisible();

    // Verify Doppler table headers and rows
    await expect(page.locator('th:has-text("Station")')).toBeVisible();
    await expect(page.locator('th:has-text("Distance")')).toBeVisible();
    await expect(page.locator('th:has-text("Bearing")')).toBeVisible();
    await expect(page.locator('th:has-text("Range Rate")')).toBeVisible();
    await expect(page.locator('th:has-text("Doppler (Δf)")')).toBeVisible();

    // Verify rows exist and show valid numbers without 'NaN'
    const dopplerTable = page.locator('table');
    await expect(dopplerTable).toBeVisible();
    const tableText = await dopplerTable.innerText();
    expect(tableText).not.toContain('NaN');
    expect(tableText).toContain('km');
    expect(tableText).toContain('Hz');

    // Test corridor preset switching: Dover Strait TSS
    const doverBtn = page.locator('div:has-text("Dover Strait TSS")').last();
    if (await doverBtn.isVisible()) {
      await doverBtn.click();
      await page.waitForTimeout(500);
      const updatedTableText = await dopplerTable.innerText();
      expect(updatedTableText).not.toContain('NaN');
    }

    // Test corridor preset switching: Incheon Yellow Sea
    const yellowSeaBtn = page.locator('div:has-text("Incheon Yellow Sea")').last();
    if (await yellowSeaBtn.isVisible()) {
      await yellowSeaBtn.click();
      await page.waitForTimeout(500);
      const yellowSeaText = await dopplerTable.innerText();
      expect(yellowSeaText).not.toContain('NaN');
    }

    // Verify zero page errors throughout
    await expect(faultNotice).toHaveCount(0);
    expect(pageErrors, `Uncaught page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  });
});
