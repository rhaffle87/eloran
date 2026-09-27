import { test, expect } from '@playwright/test';
import fs from 'fs';

test.describe('Geodesic GIS Real Coastline ASF E2E Suite', () => {
  test('verifies Geodesic GIS toggle, coastline segmentation readout, and manual fallback', async ({ page }) => {
    test.setTimeout(60000);
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

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

    // 3. Verify real coastline metrics: Region name, Land vs Sea, Path Segments & Calculated ASF
    await expect(page.getByText('Indonesia — Sunda Strait & Jakarta Bay')).toBeVisible();
    await expect(page.getByText(/Path Segments/i)).toBeVisible();
    await expect(page.getByText(/Calculated ASF/i)).toBeVisible();
    await expect(page.getByText(/boundary crossing/i)).toBeVisible();

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
    await expect(page.getByText('Indonesia — Sunda Strait & Jakarta Bay')).toBeVisible();

    // Zero uncaught browser errors
    expect(pageErrors).toHaveLength(0);
  });
});
