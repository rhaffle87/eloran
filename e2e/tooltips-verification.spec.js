import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Sidebar Tooltips & Decluttering Verification Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__LORAN_E2E__ = true;
      sessionStorage.setItem('loran_offline_radar', 'true');
    });
  });

  test('verify all 12 provenance items, accessible tooltips, and decluttered panels', async ({ page }) => {
    await page.goto('/eloran');
    await page.waitForLoadState('domcontentloaded');

    // -------------------------------------------------------------------------
    // 1. STATIONS TAB: Scenario Presets & Delete Station Accessibility
    // -------------------------------------------------------------------------
    const presetSelect = page.locator('#scenario-preset-select');
    await expect(presetSelect).toBeVisible();

    // Verify concise preset labels without ellipsis truncation
    const presetOptions = await presetSelect.locator('option').allTextContents();
    expect(presetOptions).toContain('Jakarta Maritime Testbed');
    expect(presetOptions).toContain('North Sea Chain (Historical)');
    expect(presetOptions).toContain('North China Sea Chain (GRI 7430)');
    expect(presetOptions).toContain('Korea-Yellow Sea Trial (2021)');
    expect(presetOptions).toContain('Poor Geometry (High GDOP)');
    expect(presetOptions).toContain('GNSS-Denied Resilience');

    // Verify Delete Station button has accessible aria-label (CR-06)
    const deleteBtn = page.locator('button[aria-label*="Delete station"]').first();
    await expect(deleteBtn).toBeVisible();

    // -------------------------------------------------------------------------
    // 2. CLOCKS TAB: Accessible Reset Button & Oscillator Descriptions
    // -------------------------------------------------------------------------
    const clocksTab = page.getByRole('button', { name: /Clocks/i });
    await clocksTab.click();
    await page.waitForTimeout(200);

    const clockResetBtn = page.locator('button[aria-label="Reset simulation time to 0 seconds"]');
    await expect(clockResetBtn).toBeVisible();

    // Verify oscillator info tooltips exist
    const clockTooltips = page.locator('span[role="tooltip"]');
    expect(await clockTooltips.count()).toBeGreaterThan(0);

    // -------------------------------------------------------------------------
    // 3. ASF TAB: ITU-R P.368, k_asf, Temporal Refractivity & Tier 2 Disclosure
    // -------------------------------------------------------------------------
    const asfTab = page.getByRole('button', { name: /^ASF$/i });
    await asfTab.click();
    await page.waitForTimeout(200);

    // Item 6: ITU-R P.368 GRWAVE Tooltip
    const iturTooltip = page.locator('span[role="tooltip"][aria-label*="ITU-R P.368"]').first();
    await expect(iturTooltip).toBeVisible();
    await iturTooltip.hover();
    await page.waitForTimeout(150);
    const iturPopup = page.locator('span[role="tooltip"] span.absolute').filter({ hasText: /ITU-R P\.368/i });
    await expect(iturPopup.first()).toBeVisible();

    // Item 9: Field Trial Benchmarks Tier 2 Disclosure
    const tier2Badge = page.locator('span[role="tooltip"][aria-label*="Tier 2 (Published Empirical Summary Statistics)"]').first();
    await expect(tier2Badge).toBeVisible();
    await tier2Badge.hover();
    await page.waitForTimeout(150);
    const tier2Popup = page.locator('span[role="tooltip"] span.absolute').filter({ hasText: /Tier 2 \(Published Empirical Summary Statistics\)/i });
    await expect(tier2Popup.first()).toBeVisible();

    // Switch to Temporal mode and verify Item 8
    const temporalBtn = page.getByRole('button', { name: /Temporal/i }).first();
    await temporalBtn.click();
    await page.waitForTimeout(200);

    const temporalTooltip = page.locator('span[role="tooltip"][aria-label*="Song & Son 2025"]').first();
    await expect(temporalTooltip).toBeVisible();
    await temporalTooltip.hover();
    await page.waitForTimeout(150);
    const temporalPopup = page.locator('span[role="tooltip"] span.absolute').filter({ hasText: /Smith & Weintraub 1953/i });
    await expect(temporalPopup.first()).toBeVisible();

    // Item 7: Empirical k_asf scaling factor caveat
    const empiricalBtn = page.getByRole('button', { name: /Empirical/i }).first();
    if (await empiricalBtn.isVisible()) {
      await empiricalBtn.click();
      await page.waitForTimeout(150);
      const kasfTooltip = page.locator('span[role="tooltip"][aria-label*="UNVERIFIED - Empirical k_asf"]').first();
      await expect(kasfTooltip).toBeVisible();
      await kasfTooltip.hover();
      await page.waitForTimeout(150);
      const kasfPopup = page.locator('span[role="tooltip"] span.absolute').filter({ hasText: /Heuristic linear conductivity deficit/i });
      await expect(kasfPopup.first()).toBeVisible();
    }

    // -------------------------------------------------------------------------
    // 4. FUSION TAB: Turf.js Great-Circle Segmentation Citation (Item 10)
    // -------------------------------------------------------------------------
    const fusionTab = page.getByRole('button', { name: /Fusion/i });
    await fusionTab.click();
    await page.waitForTimeout(200);

    const fusionTooltip = page.locator('span[role="tooltip"][aria-label*="Turf.js Great-Circle coastline segmentation"]').first();
    await expect(fusionTooltip).toBeVisible();
    await fusionTooltip.hover();
    await page.waitForTimeout(150);
    const fusionPopup = page.locator('span[role="tooltip"] span.absolute').filter({ hasText: /Natural Earth vector polygons/i });
    await expect(fusionPopup.first()).toBeVisible();

    // -------------------------------------------------------------------------
    // 5. LAYERS TAB: Dead Link Fix (/learn), Cycle Slip & Noise Tooltips
    // -------------------------------------------------------------------------
    const layersTab = page.getByRole('button', { name: /^Layers$/i });
    await layersTab.click();
    await page.waitForTimeout(200);

    // Item 1: Secondary Factor (SF) Toggle UNVERIFIED caveat tooltip
    const sfTooltipInitial = page.locator('span[role="tooltip"][aria-label*="discontinuous at 100 statute miles per USCG Handbook"]').first();
    await expect(sfTooltipInitial).toBeVisible();
    await sfTooltipInitial.hover();
    await page.waitForTimeout(150);
    const sfPopupInitial = page.locator('span[role="tooltip"] span.absolute').filter({ hasText: /discontinuous at 100 statute miles per USCG Handbook/i });
    await expect(sfPopupInitial.first()).toBeVisible();

    // Toggle SF ON to verify dynamic active tooltip
    const sfLabel = page.locator('label').filter({ hasText: /Secondary Factor \(SF\) Seawater Delay/i });
    if (await sfLabel.isVisible()) {
      await sfLabel.click();
      await page.waitForTimeout(150);
      const sfTooltipActive = page.locator('span[role="tooltip"][aria-label*="Secondary Factor is ON (UNVERIFIED empirical model"]').first();
      await expect(sfTooltipActive).toBeVisible();
    }

    // Verify /theory dead link was fixed to /learn (TB-02)
    const theoryLink = page.locator('a[href="/learn"]').filter({ hasText: /Theory & Docs/i });
    await expect(theoryLink).toBeVisible();
    const brokenLink = page.locator('a[href="/theory"]');
    expect(await brokenLink.count()).toBe(0);

    // Item 2: Carrier Cycle Slips Model Provenance Tooltip (Boyce 2006)
    const item2Tooltip = page.locator('span[role="tooltip"][aria-label*="Boyce Theoretical Rician Ratio (SOURCED, ILA 2006"]').first();
    await expect(item2Tooltip).toBeVisible();
    await item2Tooltip.hover();
    await page.waitForTimeout(150);
    const item2Popup = page.locator('span[role="tooltip"] span.absolute').filter({ hasText: /ILA 2006, Section II-D, Fig\. 9/i });
    await expect(item2Popup.first()).toBeVisible();

    // Item 3: TOA Measurement Noise Injection Tooltip (Rhee 2021 Table 3 / Lo 2008)
    const item3NoiseTooltip = page.locator('span[role="tooltip"][aria-label*="Rhee et al. 2021 Table 3"]').first();
    await expect(item3NoiseTooltip).toBeVisible();
    await item3NoiseTooltip.hover();
    await page.waitForTimeout(150);
    const item3Popup = page.locator('span[role="tooltip"] span.absolute').filter({ hasText: /Receiver scaling constant K \(SOURCED: Rhee et al\. 2021 \/ Lo 2008\)/i });
    await expect(item3Popup.first()).toBeVisible();

    // Item 4: Active Cycle Selection Model Dropdown Tooltip (Austron 28 µs & 42 µs Boyce Eq 5/6)
    const item4DropdownTooltip = page.locator('span[role="tooltip"][aria-label*="Austron New Empirical (28 µs) (SOURCED, Boyce Eq. 6)"]').first();
    await expect(item4DropdownTooltip).toBeVisible();
    await item4DropdownTooltip.hover();
    await page.waitForTimeout(150);
    const item4Popup = page.locator('span[role="tooltip"] span.absolute').filter({ hasText: /Austron Old Empirical \(42 µs\) \(SOURCED, Boyce Eq\. 5\)/i });
    await expect(item4Popup.first()).toBeVisible();

    // Item 5: Model Provenance Footer Tooltip (USCG, RTCM, and ITU-R specifications)
    const item5ProvenanceFooter = page.locator('span[role="tooltip"][aria-label*="USCG, RTCM, and ITU-R specifications"]').first();
    await expect(item5ProvenanceFooter).toBeVisible();
    await item5ProvenanceFooter.hover();
    await page.waitForTimeout(150);
    const item5Popup = page.locator('span[role="tooltip"] span.absolute').filter({ hasText: /All theoretical derivations and formulas are documented in Theory/i });
    await expect(item5Popup.first()).toBeVisible();

    // -------------------------------------------------------------------------
    // 6. CHAIN DESIGN MODE: Planning Thresholds Tooltip (Item 11, CR-04)
    // -------------------------------------------------------------------------
    const chainDesignBtn = page.getByRole('button', { name: /Chain Design/i }).first();
    await chainDesignBtn.click();
    await page.waitForTimeout(300);

    const thresholdTooltip = page.locator('span[role="tooltip"][aria-label*="Illustrative default, not a regulatory limit"]').first();
    await expect(thresholdTooltip).toBeVisible();
    await thresholdTooltip.hover();
    await page.waitForTimeout(150);
    const thresholdPopup = page.locator('span[role="tooltip"] span.absolute').filter({ hasText: /station licensing guidelines/i });
    await expect(thresholdPopup.first()).toBeVisible();

    // Capture screenshot of the decluttered sidebar
    const sidebar = page.locator('[data-testid="sidebar-content"]');
    await expect(sidebar).toBeVisible();
    await page.screenshot({ path: path.join('docs/verification/screenshots', 'sidebar_declutter_verified.png') });
  });

  test('verify CycleSelectionPanel clean UTF-8 rendering without mojibake (TB-01)', async ({ page }) => {
    await page.goto('/waveforms');
    await page.waitForLoadState('domcontentloaded');

    // Item 12: Verify SOURCED Model badge in CycleSelectionPanel
    const modelBadgeTooltip = page.locator('span[role="tooltip"][aria-label*="Sourced Excerpt: Boyce, Lo, Powell, & Enge"]').first();
    await expect(modelBadgeTooltip).toBeVisible();
    await modelBadgeTooltip.hover();
    await page.waitForTimeout(150);
    const modelBadgePopup = page.locator('span[role="tooltip"] span.absolute').filter({ hasText: /Historical Austron ECD variance/i });
    await expect(modelBadgePopup.first()).toBeVisible();

    // Verify clean unicode math formulas in CycleSelectionPanel
    const wrongCycleHeader = page.locator('text=P[Wrong Cycle] vs Total SNR (N · SNR)');
    await expect(wrongCycleHeader).toBeVisible();

    const totalSnrFormula = page.locator('text=Total SNR [dB] = 10 · log₁₀(N · SNR)');
    await expect(totalSnrFormula).toBeVisible();

    const szcText = page.locator('text=τ = 30 µs');
    await expect(szcText.first()).toBeVisible();

    const excursionWindow = page.locator('text=±5 µs');
    await expect(excursionWindow.first()).toBeVisible();

    const austronNewLegend = page.locator('text=Austron New (28 µs)');
    await expect(austronNewLegend.first()).toBeVisible();

    const austronOldLegend = page.locator('text=Austron Old (42 µs)');
    await expect(austronOldLegend.first()).toBeVisible();

    // Verify Boyce excerpt quote
    const boyceExcerpt = page.locator('blockquote');
    await expect(boyceExcerpt).toContainText('An offset in the time estimate of 5 µs would result in a wrong cycle selection');
    await expect(boyceExcerpt).toContainText('Ratio(30) ≤ Ratio(25) or Ratio(30) ≥ Ratio(35)');

    // Verify no mojibake corruption characters exist on the page
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Â·');
    expect(pageContent).not.toContain('Âµs');
    expect(pageContent).not.toContain('â‰¥');
    expect(pageContent).not.toContain('â‰¤');
    expect(pageContent).not.toContain('âˆš');
    expect(pageContent).not.toContain('Ï„');
    expect(pageContent).not.toContain('Ïƒ');
  });
});
