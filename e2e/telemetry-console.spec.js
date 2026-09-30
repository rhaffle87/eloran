import { test, expect } from '@playwright/test';

test.describe('Tactical Telemetry Console & Live Feed E2E Suite', () => {
  test('verifies dockable telemetry console ribbon, expansion, sparkline, and activity feed', async ({ page }) => {
    // Navigate to /eloran
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    // Telemetry console must be present
    const consoleEl = page.locator('[data-testid="telemetry-console"]');
    await expect(consoleEl).toBeVisible();

    // Ribbon bar text verification
    await expect(consoleEl).toContainText('TACTICAL CONSOLE');
    await expect(consoleEl).toContainText(/NET: \d+\/\d+/);
    await expect(consoleEl).toContainText('RX:');
    await expect(consoleEl).toContainText('GDOP:');

    // Click ribbon to expand console
    await consoleEl.locator('text=EXPAND CONSOLE').click();

    // Verification of expanded sections
    await expect(consoleEl).toContainText('TELEMETRY & FIX');
    await expect(consoleEl).toContainText('UNCERTAINTY VARIANCE (σ²)');
    await expect(consoleEl).toContainText('OPERATIONAL ACTIVITY FEED');

    // Sparkline SVG verification
    const svg = consoleEl.locator('svg[aria-label*="Uncertainty sparkline chart"]');
    await expect(svg).toBeVisible();

    // Activity feed verification
    await expect(consoleEl).toContainText('SIMULORAN Tactical Core initialized');

    // Click to collapse
    await consoleEl.locator('text=COLLAPSE').click();
    await expect(consoleEl).toContainText('EXPAND CONSOLE');
  });
});
