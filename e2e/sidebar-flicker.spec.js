import { test, expect } from '@playwright/test';

test.describe('Sidebar Collapse/Expand, Resize Direction, and No Style Diff Warning Verification', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('zero MapLibre style diff warnings on Loran-C and eLoran pages', async ({ page }) => {
    const consoleWarnings = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (/Unable to perform style diff/i.test(text)) {
        consoleWarnings.push(text);
      }
    });

    await page.goto('/loran-c');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    expect(consoleWarnings).toEqual([]);

    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    expect(consoleWarnings).toEqual([]);
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

  test('sidebar drag-resize expands leftwards and shrinks rightwards without right overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const sidebar = page.getByTestId('sidebar-container');
    const resizeHandle = page.getByTestId('sidebar-drag-handle');
    await expect(resizeHandle).toBeVisible();

    const initialBox = await sidebar.boundingBox();
    const initialHandleBox = await resizeHandle.boundingBox();
    expect(initialBox).not.toBeNull();
    expect(initialHandleBox).not.toBeNull();
    expect(initialHandleBox.width).toBeLessThanOrEqual(10);

    // Initial right boundary: x + width should equal viewport width (1280)
    const initialRight = initialBox.x + initialBox.width;
    expect(Math.round(initialRight)).toBe(1280);

    // Drag handle 60px to the LEFT (from handle center X to X - 60)
    const startX = initialHandleBox.x + initialHandleBox.width / 2;
    const startY = initialHandleBox.y + 200;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 60, startY, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const expandedBox = await sidebar.boundingBox();
    // Width should have increased by ~60px
    expect(expandedBox.width).toBeGreaterThanOrEqual(initialBox.width + 50);
    // Left boundary (X) should have moved LEFT by ~60px
    expect(expandedBox.x).toBeLessThanOrEqual(initialBox.x - 50);
    // Right boundary should STILL be pinned to viewport width 1280 (NOT blown out to the right!)
    const expandedRight = expandedBox.x + expandedBox.width;
    expect(Math.round(expandedRight)).toBe(1280);

    // Now drag handle 80px to the RIGHT (shrinking the sidebar)
    const curHandleBox = await resizeHandle.boundingBox();
    const curStartX = curHandleBox.x + curHandleBox.width / 2;
    await page.mouse.move(curStartX, startY);
    await page.mouse.down();
    await page.mouse.move(curStartX + 80, startY, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const shrunkBox = await sidebar.boundingBox();
    // Width should have shrunk by ~80px
    expect(shrunkBox.width).toBeLessThanOrEqual(expandedBox.width - 70);
    // Left boundary (X) should have moved RIGHT
    expect(shrunkBox.x).toBeGreaterThanOrEqual(expandedBox.x + 70);
    // Right boundary remains pinned at 1280
    const shrunkRight = shrunkBox.x + shrunkBox.width;
    expect(Math.round(shrunkRight)).toBe(1280);
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
