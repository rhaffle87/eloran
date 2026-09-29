import { test, expect } from '@playwright/test';
import fs from 'fs';

test.describe('AsfPanel Tooltip Screenshots & Verification', () => {
  test('capture and verify tooltips in hover and keyboard-focus states', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    // Open ASF Tab
    const asfTab = page.getByRole('button', { name: 'ASF', exact: true });
    await asfTab.click();
    await page.waitForTimeout(300);

    const sidebar = page.locator('[data-testid="sidebar-content"]');
    await expect(sidebar).toBeVisible();

    const outputDir = 'docs/verification/screenshots';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Helper to hover, capture, focus, capture, and verify parity
    async function capturePair(tooltipLocator, baseName) {
      await expect(tooltipLocator).toBeVisible();

      // Hover
      await tooltipLocator.hover();
      await page.waitForTimeout(200);
      const hoverPopup = tooltipLocator.locator('span.absolute');
      await expect(hoverPopup).toBeVisible();
      const hoverText = await hoverPopup.innerText();
      await sidebar.screenshot({ path: `${outputDir}/${baseName}_hover.png` });

      // Focus
      await page.mouse.move(0, 0); // dismiss hover
      await page.waitForTimeout(200);
      await tooltipLocator.focus();
      await page.waitForTimeout(200);
      const focusPopup = tooltipLocator.locator('span.absolute');
      await expect(focusPopup).toBeVisible();
      const focusText = await focusPopup.innerText();
      await sidebar.screenshot({ path: `${outputDir}/${baseName}_focus.png` });

      // Parity assertion
      expect(focusText).toBe(hoverText);
      await page.keyboard.press('Escape'); // dismiss
      await page.evaluate(() => document.activeElement?.blur());
      await page.mouse.move(0, 0);
      await page.waitForTimeout(250);
    }

    // --- 1. Millington / GRWAVE Attenuation Standard Tooltip ---
    console.log('Capturing Millington GRWAVE Tooltip...');
    const grwaveTooltip = page.locator('span[role="tooltip"][aria-label*="ITU-R P.368"]').first();
    await capturePair(grwaveTooltip, 'asf_millington_grwave');

    // --- 1b. Millington Phase Delay Verification Tooltip ---
    console.log('Capturing Phase Delay Tooltip...');
    const phaseTooltip = page.locator('span[role="tooltip"][aria-label*="Phase delay directly feeds"]').first();
    await capturePair(phaseTooltip, 'asf_millington_phasedelay');

    // --- 2. Empirical Model (k_asf) Tooltip ---
    console.log('Capturing Empirical k_asf Tooltip...');
    const empiricalBtn = page.getByRole('button', { name: /Empirical Model \(k_asf\)/i });
    await empiricalBtn.click();
    await page.waitForTimeout(200);

    const kasfTooltip = page.locator('span[role="tooltip"][aria-label*="Heuristic linear conductivity deficit"]').first();
    await capturePair(kasfTooltip, 'asf_empirical_kasf');

    // --- 3. Formula Mode Tooltip (AST card) ---
    console.log('Capturing Formula Mode Tooltips...');
    const formulaModeBtn = page.getByRole('button', { name: /Formula/i });
    await formulaModeBtn.click();
    await page.waitForTimeout(200);

    const formulaAstTooltip = page.locator('span[role="tooltip"][aria-label*="land path delays"]').first();
    await capturePair(formulaAstTooltip, 'asf_formula_ast');

    // --- 4. Temporal Mode Tooltip (Drift calibration) ---
    console.log('Capturing Temporal Mode Tooltips...');
    const temporalModeBtn = page.getByRole('button', { name: /Temporal/i });
    await temporalModeBtn.click();
    await page.waitForTimeout(200);

    const temporalDriftTooltip = page.locator('span[role="tooltip"][aria-label*="12-day eLoran measurement campaign"]').first();
    await capturePair(temporalDriftTooltip, 'asf_temporal_drift');

    // Mode button tooltip in Temporal mode
    const temporalModeTooltip = page.locator('span[role="tooltip"][aria-label*="Atmospheric refractivity model with seasonal drift"]').first();
    await capturePair(temporalModeTooltip, 'asf_temporal_mode');

    console.log('All tooltips captured and verified identical between hover and focus states.');
  });
});
