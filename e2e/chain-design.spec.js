import { test, expect } from '@playwright/test';

test.describe('Chain Design & Planning Mode Comprehensive E2E Suite', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('toggle between Simulation and Chain Design mode in Loran-C and eLoran', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    // 1. Loran-C page
    await page.goto('/loran-c');
    await page.waitForLoadState('networkidle');

    const designTabBtn = page.getByRole('button', { name: /Chain Design/i }).first();
    await expect(designTabBtn).toBeVisible();
    await designTabBtn.click();

    // Verify Chain Design panel header and educational disclaimer
    await expect(page.getByText('Chain Design & Planning')).toBeVisible();
    await expect(page.getByText('Educational Simulator Disclaimer')).toBeVisible();

    // Verify HUD reflects Chain Design mode
    await expect(page.getByText('CHAIN DESIGN:')).toBeVisible();
    await expect(page.getByText('PLANNING', { exact: true })).toBeVisible();

    // Return to simulation mode
    const simTabBtn = page.getByRole('button', { name: /Simulation/i }).first();
    await expect(simTabBtn).toBeVisible();
    await simTabBtn.click();
    await expect(page.getByText('MODE:')).toBeVisible();

    // 2. eLoran page
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    const eLoranDesignBtn = page.getByRole('button', { name: /Chain Design/i }).first();
    await expect(eLoranDesignBtn).toBeVisible();
    await eLoranDesignBtn.click();

    await expect(page.getByText('Chain Design & Planning')).toBeVisible();
    await expect(page.getByText('Educational Simulator Disclaimer')).toBeVisible();

    const eLoranSimBtn = page.getByRole('button', { name: /Simulation/i }).first();
    await expect(eLoranSimBtn).toBeVisible();
    await eLoranSimBtn.click();

    await expect(page.getByRole('button', { name: /Clocks/i })).toBeVisible();
    expect(pageErrors).toHaveLength(0);
  });

  test('USCG 400-mile golden worked example matches theoretical baseline travel time and emission delay end-to-end', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    await page.goto('/loran-c');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Chain Design/i }).first().click();

    // Click USCG 400-mi preset
    const uscgPresetBtn = page.getByRole('button', { name: /USCG 400-mi/i });
    await expect(uscgPresetBtn).toBeVisible();
    await uscgPresetBtn.click();

    // Verify provenance badge
    await expect(page.getByText('Textbook Benchmark')).toBeVisible();

    // Verify baseline distance: 400 nmi
    await expect(page.getByText(/400 nmi/i).first()).toBeVisible();

    // Verify baseline travel time: 2,472 µs (USCG Handbook §2.B golden worked example)
    await expect(page.getByText('2472 µs').first()).toBeVisible();

    // Verify emission delay ED = Tb + CD = 2472 + 11000 = 13,472 µs
    await expect(page.getByText('13472 µs')).toBeVisible();

    // Feasibility status should be green/FEASIBLE
    await expect(page.getByText('Chain Feasible & Conflict-Free')).toBeVisible();

    expect(pageErrors).toHaveLength(0);
  });

  test('loads each preset correctly with appropriate provenance badges and station configurations', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    await page.goto('/loran-c');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Chain Design/i }).first().click();

    // 1. Jakarta Coastal Preset (Synthetic / Proposal)
    const jakartaBtn = page.getByRole('button', { name: /Jakarta Coastal/i });
    await expect(jakartaBtn).toBeVisible();
    await jakartaBtn.click();

    await expect(page.getByText('Synthetic / Proposal')).toBeVisible();
    await expect(page.getByText('Secondary Stations (3)')).toBeVisible();
    await expect(page.getByText('Chain Feasible & Conflict-Free')).toBeVisible();

    // 2. US East Coast 9960 Preset (Illustrative — unverified this session)
    const usEastBtn = page.getByRole('button', { name: /US East \(9960\)/i });
    await expect(usEastBtn).toBeVisible();
    await usEastBtn.click();

    await expect(page.getByText('Illustrative — unverified this session')).toBeVisible();
    await expect(page.getByText('Secondary Stations (4)')).toBeVisible(); // W, X, Y, Z
    await expect(page.getByText('Chain Feasible & Conflict-Free')).toBeVisible();

    // Verify historical coding delays: 11000, 25000, 39000, 54000
    await expect(page.locator('input[value="11000"]')).toBeVisible();
    await expect(page.locator('input[value="25000"]')).toBeVisible();
    await expect(page.locator('input[value="39000"]')).toBeVisible();
    await expect(page.locator('input[value="54000"]')).toBeVisible();

    expect(pageErrors).toHaveLength(0);
  });

  test('flags infeasible GRI and coding delay violations with specific warning banners', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    await page.goto('/loran-c');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Chain Design/i }).first().click();

    // Load USCG 400-mi preset
    await page.getByRole('button', { name: /USCG 400-mi/i }).click();
    await expect(page.getByText('Chain Feasible & Conflict-Free')).toBeVisible();

    // 1. Trigger GRI Too Short violation by setting GRI to 30,000 µs (min feasible is ~39,000 µs)
    const griInput = page.locator('input[type="number"]').first();
    await griInput.fill('30000');

    await expect(page.getByText('Timing Constraint Violation')).toBeVisible();
    await expect(page.getByText('[GRI_TOO_SHORT]')).toBeVisible();
    await expect(page.getByText(/shorter than minimum feasible interval/i)).toBeVisible();

    // Restore feasible GRI
    await griInput.fill('79900');
    await expect(page.getByText('Chain Feasible & Conflict-Free')).toBeVisible();

    // 2. Trigger Coding Delay Too Low violation by setting Secondary-W CD to 5,000 µs (< 10,000 µs)
    const cdInput = page.locator('input[value="11000"]').first();
    await cdInput.fill('5000');

    await expect(page.getByText('Timing Constraint Violation')).toBeVisible();
    await expect(page.getByText('[CODING_DELAY_TOO_LOW]')).toBeVisible();
    await expect(page.getByText(/below threshold of 10000 µs/i)).toBeVisible();

    expect(pageErrors).toHaveLength(0);
  });

  test('allows tuning configurable planning thresholds with real-time heuristic validation', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    await page.goto('/loran-c');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Chain Design/i }).first().click();

    // Verify Planning Thresholds card and disclaimer badge
    await expect(page.getByText('Planning Thresholds & Heuristics')).toBeVisible();
    await expect(page.getByText('Illustrative default, not a regulatory limit').first()).toBeVisible();

    // Load USCG 400-mi preset (Secondary-W CD = 11,000 µs)
    await page.getByRole('button', { name: /USCG 400-mi/i }).click();
    await expect(page.getByText('Chain Feasible & Conflict-Free')).toBeVisible();

    // Adjust Min Coding Delay planning threshold to 12,000 µs
    const minCdThresholdInput = page.getByTestId('chain-min-cd-input');
    await minCdThresholdInput.fill('12000');

    // Secondary-W with 11,000 µs now violates the 12,000 µs planning threshold
    await expect(page.getByText('Timing Constraint Violation')).toBeVisible();
    await expect(page.getByText('[CODING_DELAY_TOO_LOW]')).toBeVisible();
    await expect(page.getByText(/below threshold of 12000 µs/i)).toBeVisible();

    // Reset back to 10,000 µs
    await minCdThresholdInput.fill('10000');
    await expect(page.getByText('Chain Feasible & Conflict-Free')).toBeVisible();

    expect(pageErrors).toHaveLength(0);
  });

  test('Commit Design to Active Simulation workflow transfers stations and transitions mode', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

    await page.goto('/loran-c');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Chain Design/i }).first().click();

    // Load US East 9960 preset
    await page.getByRole('button', { name: /US East \(9960\)/i }).click();
    await expect(page.getByText('Chain Feasible & Conflict-Free')).toBeVisible();

    // Click Commit Design button
    const commitBtn = page.getByRole('button', { name: /Commit Design to Active Simulation/i });
    await expect(commitBtn).toBeEnabled();
    await commitBtn.click();

    // Should return to Simulation Mode
    await expect(page.getByText('MODE:')).toBeVisible();

    // Switch to Stations panel to verify stations were committed
    await page.getByRole('button', { name: /Stations/i }).first().click();
    await expect(page.getByText('Seneca NY')).toBeVisible();
    await expect(page.getByText('Caribou ME')).toBeVisible();

    expect(pageErrors).toHaveLength(0);
  });
});
