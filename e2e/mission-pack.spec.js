import { test, expect } from '@playwright/test';

test.describe('Mission Packs & Scenario Packaging (.simuloran.json)', () => {
  test('opens Mission Pack modal, switches tabs, loads builtin scenario, and exports current configuration', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 1. Locate and click Mission Packs button in Navbar
    const missionBtn = page.getByRole('button', { name: /Mission Packs/i }).first();
    await expect(missionBtn).toBeVisible();
    await missionBtn.click();

    // 2. Verify modal appears with role="dialog"
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.locator('#mission-pack-modal-title')).toContainText('SIMULORAN Mission Packs');

    // 3. Verify Built-in Scenarios tab
    await expect(modal.locator('text=Korea 2021 Flight Testbed')).toBeVisible();
    await expect(modal.locator('text=English Channel Dover TSS')).toBeVisible();

    // 4. Test Export Scenario Tab
    const exportTabBtn = modal.getByRole('button', { name: /Export Scenario/i });
    await exportTabBtn.click();

    const codePreview = modal.locator('pre');
    await expect(codePreview).toBeVisible();
    const jsonText = await codePreview.textContent();
    expect(jsonText).toContain('"version": 1');
    expect(jsonText).toContain('"chain"');
    expect(jsonText).toContain('"environment"');
    expect(jsonText).toContain('"physics"');

    const downloadBtn = modal.getByRole('button', { name: /Download .simuloran.json/i });
    await expect(downloadBtn).toBeVisible();

    // 5. Test Import Tab
    const importTabBtn = modal.getByRole('button', { name: /Import File/i });
    await importTabBtn.click();
    await expect(modal.locator('text=Drag and drop a')).toBeVisible();

    // 6. Test Loading Built-in Scenario
    const builtinTabBtn = modal.getByRole('button', { name: /Built-in Scenarios/i });
    await builtinTabBtn.click();

    const loadDoverBtn = modal.getByTestId('load-mission-dover-tss-corridor');
    await expect(loadDoverBtn).toBeVisible();
    await loadDoverBtn.click();

    // Verify success banner and modal auto-closing
    await expect(modal.locator('text=Successfully loaded Mission Pack')).toBeVisible();
    await expect(modal).not.toBeVisible({ timeout: 4000 });
  });
});
