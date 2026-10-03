import { test, expect } from '@playwright/test';
import fs from 'fs';

test.describe('Geodesic GIS Real Coastline ASF E2E Suite', () => {
  test('verifies Geodesic GIS toggle, coastline segmentation readout, and manual fallback', async ({ page }) => {
    test.setTimeout(90000);
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    await page.goto('/eloran');
    await page.waitForLoadState('domcontentloaded');

    // 1. Open ASF Tab in the sidebar
    const asfTab = page.getByRole('button', { name: 'ASF', exact: true });
    await expect(asfTab).toBeVisible();
    await asfTab.click();
    await page.waitForTimeout(300);

    const sidebar = page.locator('[data-testid="sidebar-content"]');
    await expect(sidebar).toBeVisible();

    // 2. Verify Geodesic GIS toggle button exists and is active by default
    const geoToggle = page.locator('[data-testid="asf-pathmode-geo"]');
    await expect(geoToggle).toBeVisible();
    await expect(geoToggle).toHaveAttribute('data-active', 'true');

    // 3. Verify specific metrics for default Rotterdam harbor approach baseline
    await expect(page.getByText('Northwest Europe — North Sea & English Channel')).toBeVisible();
    await expect(page.getByText(/Sylt-M \(6731M\) → R1-EuroportVessel \(434\.1 km\)/i)).toBeVisible();
    await expect(page.getByText(/Land: 159\.6 km \(36\.8%\)/i)).toBeVisible();
    await expect(page.getByText(/3 boundary crossings/i)).toBeVisible();
    await expect(page.getByText(/Calculated ASF: 116\.6 m \(0\.389 µs\)/i)).toBeVisible();

    // 4. Capture screenshot of the Geodesic GIS ASF panel
    const outputDir = 'docs/verification/screenshots';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    await sidebar.screenshot({ path: `${outputDir}/geo_asf_panel.png` });

    // 5. Toggle to Manual mode
    const manualToggle = page.locator('[data-testid="asf-pathmode-manual"]');
    await expect(manualToggle).toBeVisible();
    await manualToggle.click();
    await page.waitForTimeout(300);

    // Verify manual slider appears
    await expect(manualToggle).toHaveAttribute('data-active', 'true');
    await expect(page.getByText(/Manual Land Fraction/i).first()).toBeVisible();

    // 6. Switch back to Geodesic GIS mode
    await geoToggle.click();
    await page.waitForTimeout(300);
    await expect(geoToggle).toHaveAttribute('data-active', 'true');

    // 7. Switch preset to Bohai / Yellow Sea (China / Korea) to verify multi-segment mixed path
    // Open Stations Tab to switch preset
    const stationsTab = page.getByRole('button', { name: 'Stations', exact: true });
    if (await stationsTab.isVisible()) {
      await stationsTab.click();
      await page.waitForTimeout(300);
      const presetSelect = page.locator('#scenario-preset-select');
      if (await presetSelect.isVisible()) {
        await presetSelect.selectOption({ label: 'North China Sea Chain (GRI 7430)' });
        await page.waitForTimeout(400);

        // Switch back to ASF tab
        await asfTab.click();
        await page.waitForTimeout(300);

        // Verify Bohai region segmentation
        await expect(page.getByText('East Asia — Bohai & Yellow Sea (China / Korea)')).toBeVisible();
        await expect(page.getByText(/Rongcheng-M.*Cargo-Vessel-Bohai \(171\.2 km\)/i)).toBeVisible();
        await expect(page.getByText(/Land: 59\.7 km \(34\.9%\)/i)).toBeVisible();
        await expect(page.getByText(/Sea: 111\.6 km \(65\.1%\)/i)).toBeVisible();
        await expect(page.getByText(/1 boundary crossing/i)).toBeVisible();
        await expect(page.getByText(/Calculated ASF: 88\.5 m \(0\.295 µs\)/i)).toBeVisible();
        await expect(page.getByText(/LAND: 59\.7 km/i)).toBeVisible();
        await expect(page.getByText(/SEA: 111\.6 km/i)).toBeVisible();
      }
    }

    // Zero uncaught browser errors
    expect(pageErrors).toHaveLength(0);
  });
});
