import { test, expect } from '@playwright/test';
import fs from 'fs';

test.describe('Empirical Field Trial Validation E2E Suite', () => {
  test('verifies About page benchmark summary, Theory page benchmark tables, and AsfPanel integration', async ({ page }) => {
    test.setTimeout(90000);
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    // 1. Visit /about page and verify streamlined summary card
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    const aboutHeading = page.getByRole('heading', { name: 'Empirical Field Trial Validation' });
    await expect(aboutHeading).toBeVisible();

    await expect(page.getByText('Tier 2 SOURCED').first()).toBeVisible();
    await expect(page.getByText(/7 Test Locations.*10\.17 m Measured 95% Accuracy/).first()).toBeVisible();

    const outputDir = 'docs/verification/screenshots';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    await aboutHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outputDir}/trial_validation_about.png`, fullPage: false });

    // 2. Click link to Theory page benchmarks
    const theoryLink = page.getByRole('link', { name: /Inspect Benchmark Data in Theory/i });
    await expect(theoryLink).toBeVisible();
    await theoryLink.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);

    // Verify Theory page benchmark section
    const learnHeading = page.getByRole('heading', { name: 'Empirical Field Trial Benchmarks', exact: true });
    await expect(learnHeading).toBeVisible();

    // Verify Korea 2021 summary cards
    await expect(page.getByText('7 Locations').first()).toBeVisible();
    await expect(page.getByText('10.17 m', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('11.67 m', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('9.03 m', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('2.11 m', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/MAE: 1\.74 m/i).first()).toBeVisible();
    await expect(page.getByText(/MAE: 1\.37 m/i).first()).toBeVisible();

    // Verify Korea table contains key sites and per-station header
    await expect(page.getByRole('cell', { name: 'Dangjin' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Jeonju' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Incheon' }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Per-Station (Table 3)' }).first()).toBeVisible();

    // Capture screenshot of Korea tab in Theory
    await learnHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outputDir}/trial_validation_korea.png`, fullPage: false });

    // Switch tab to Maoming 2025
    const maomingTab = page.getByRole('button', { name: /Maoming 2025 \(Inland\)/i }).first();
    await expect(maomingTab).toBeVisible();
    await maomingTab.click();
    await page.waitForTimeout(300);

    // Verify Maoming metrics
    await expect(page.getByText('417.2 m', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('43.1 m', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('89.7%', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Inland Geodesic Arc Distortion/i).first()).toBeVisible();

    // Capture screenshot of Maoming tab
    await page.screenshot({ path: `${outputDir}/trial_validation_maoming.png`, fullPage: false });

    // 3. Visit /eloran and check AsfPanel integration
    await page.goto('/eloran');
    await page.waitForLoadState('domcontentloaded');

    // Open ASF Tab in the sidebar
    const asfTab = page.getByRole('button', { name: 'ASF', exact: true });
    await expect(asfTab).toBeVisible();
    await asfTab.click();
    await page.waitForTimeout(300);

    // Find and expand the Field Trial Benchmarks section
    const benchmarkToggle = page.locator('[data-testid="toggle-validation-benchmarks"]');
    await expect(benchmarkToggle).toBeVisible();
    await benchmarkToggle.click();
    await page.waitForTimeout(300);

    // Verify TrialValidationPanel rendered inside AsfPanel
    await expect(page.getByText(/Load Korea Trial Preset/i)).toBeVisible();

    // Verify Korea card binds labels to exact values
    const koreaCard = page.locator('[data-testid="korea-benchmark-card"]');
    await expect(koreaCard).toBeVisible();
    await expect(koreaCard.locator('[data-testid="korea-measured-mean"]')).toHaveText(/10\.17m/);
    await expect(koreaCard.locator('[data-testid="korea-flat-simulated-mean"]')).toContainText('11.67m');
    await expect(koreaCard.locator('[data-testid="korea-flat-simulated-mean"]')).toContainText('MAE 1.74m');
    await expect(koreaCard.locator('[data-testid="korea-per-station-simulated-mean"]')).toContainText('9.03m');
    await expect(koreaCard.locator('[data-testid="korea-per-station-simulated-mean"]')).toContainText('MAE 1.37m');

    // Verify Maoming card binds labels and does not misattribute coastal / geo-ASF
    const maomingCard = page.locator('[data-testid="maoming-benchmark-card"]');
    await expect(maomingCard).toBeVisible();
    await expect(maomingCard.locator('[data-testid="maoming-shp-rmse"]')).toContainText('417.2 m RMSE');
    await expect(maomingCard.locator('[data-testid="maoming-epp-rmse"]')).toContainText('43.1 m RMSE');
    await expect(maomingCard.locator('[data-testid="maoming-attribution"]')).toContainText('Inland, Gao et al. 2025 (89.7% gain via ellipsoidal model)');
    await expect(maomingCard).not.toContainText('Coastal');
    await expect(maomingCard).not.toContainText('GIS ASF Corr');

    // Click "Load Korea Trial Preset"
    const loadPresetBtn = page.getByRole('button', { name: /Load Korea Trial Preset/i });
    await loadPresetBtn.click();
    await page.waitForTimeout(500);

    // Verify preset is active
    await expect(page.getByRole('button', { name: /Preset Active/i })).toBeVisible();

    // Capture screenshot of ASF panel with benchmark expanded
    const sidebar = page.locator('[data-testid="sidebar-content"]');
    if (await sidebar.isVisible()) {
      await sidebar.screenshot({ path: `${outputDir}/trial_validation_asf_sidebar.png` });
    }

    // Confirm no uncaught page errors
    expect(pageErrors).toEqual([]);
  });
});
