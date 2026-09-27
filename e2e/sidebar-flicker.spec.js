import { test, expect } from '@playwright/test';

test.describe('Sidebar Collapse/Expand - No Flicker Verification', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('sidebar expands and collapses without flicker on Loran-C page', async ({ page }) => {
    await page.goto('/loran-c');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 1. Initial State: Sidebar container and content visible
    const sidebar = page.getByTestId('sidebar-container');
    const sidebarContent = page.getByTestId('sidebar-content');
    await expect(sidebar).toBeVisible();
    await expect(sidebarContent).toBeVisible();

    const initialBox = await sidebar.boundingBox();
    expect(initialBox.width).toBeGreaterThan(300);

    // 2. Collapse: Click collapse button
    const collapseBtn = page.getByTestId('sidebar-collapse-btn');
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await page.waitForTimeout(300); // Wait for CSS transition (220ms)

    // Container stays mounted (preventing MapLibre remount/flicker)
    await expect(sidebar).toBeAttached();

    // Width should collapse to 0
    const collapsedBox = await sidebar.boundingBox();
    expect(collapsedBox.width).toBeLessThan(10);

    // Expand button is now visible
    const expandBtn = page.getByTestId('sidebar-expand-btn');
    await expect(expandBtn).toBeVisible();

    // 3. Expand: Click expand button
    await expandBtn.click();
    await page.waitForTimeout(300);

    // Container and content restored to expanded width
    await expect(sidebar).toBeVisible();
    await expect(sidebarContent).toBeVisible();
    const expandedBox = await sidebar.boundingBox();
    expect(expandedBox.width).toBeGreaterThan(300);
  });

  test('sidebar drag-resize handle exists and is interactive', async ({ page }) => {
    await page.goto('/loran-c');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const resizeHandle = page.getByTestId('sidebar-drag-handle');
    await expect(resizeHandle).toBeVisible();

    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    expect(handleBox.width).toBeLessThanOrEqual(10);
  });

  test('sidebar state persists without flicker on eLoran page', async ({ page }) => {
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const sidebar = page.getByTestId('sidebar-container');
    const sidebarContent = page.getByTestId('sidebar-content');
    await expect(sidebar).toBeVisible();
    await expect(sidebarContent).toBeVisible();

    const box = await sidebar.boundingBox();
    expect(box.width).toBeGreaterThan(300);

    // Verify collapse button exists and collapses cleanly
    const collapseBtn = page.getByTestId('sidebar-collapse-btn');
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await page.waitForTimeout(300);

    const expandBtn = page.getByTestId('sidebar-expand-btn');
    await expect(expandBtn).toBeVisible();
  });
});

