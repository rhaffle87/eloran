import { test, expect } from '@playwright/test';
import fs from 'fs';

test.describe('Empirical Field Trial Validation E2E Suite', () => {
  test('verifies About page benchmark cards and AsfPanel trial validation integration', async ({ page }) => {
    test.setTimeout(90000);
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    // 1. Visit /about page
    await page.goto('/about');
    await page.waitForLoadState('networkidle');

    // Verify benchmark section heading
    const heading = page.getByRole('heading', { name: 'Empirical Field Trial Benchmarks (Phase 2 Part 2)' });
    await expect(heading).toBeVisible();

    // Verify Korea 2021 summary cards
    await expect(page.getByText('7 Locations').first()).toBeVisible();
    await expect(page.getByText('10.17 m', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('11.67 m', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('2.11 m', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/MAE: 1\.74 m/i).first()).toBeVisible();

    // Verify Korea table contains key sites
    await expect(page.getByRole('cell', { name: 'Dangjin' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Jeonju' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Incheon' }).first()).toBeVisible();

    // Verify tier disclosure badge
    await expect(page.getByText('Tier 2 SOURCED').first()).toBeVisible();

    // 2. Switch tab to Maoming 2025
    const maomingTab = page.getByRole('button', { name: /Maoming 2025 \(Inland\)/i }).first();
    await expect(maomingTab).toBeVisible();
    await maomingTab.click();
    await page.waitForTimeout(300);

    // Verify Maoming metrics
    await expect(page.getByText('417.2 m', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('43.1 m', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('89.7%', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Inland Geodesic Arc Distortion/i).first()).toBeVisible();

    // Capture screenshot of About page benchmark panel
    const outputDir = 'docs/verification/screenshots';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    await page.screenshot({ path: `${outputDir}/trial_validation_about.png`, fullPage: false });

    // 3. Visit /eloran and check AsfPanel integration
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

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
