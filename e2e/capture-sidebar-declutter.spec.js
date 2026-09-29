import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.resolve(process.cwd(), 'docs', 'verification', 'screenshots');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

test('capture decluttered sidebar panels across Loran-C and eLoran', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. Loran-C Display Panel (Dark Mode) - Click Layers tab
  await page.goto('/loran-c');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  });
  const layersTab = page.getByRole('button', { name: /^Layers$/i });
  await layersTab.click();
  await page.waitForTimeout(400);

  const sidebar = page.locator('[data-testid="sidebar-content"]');
  await expect(sidebar).toBeVisible();
  await sidebar.screenshot({ path: path.join(OUT_DIR, 'sidebar_loran_c_display_dark.png') });

  // 2. Loran-C Display Panel (Light Mode)
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');
  });
  await page.waitForTimeout(400);
  await sidebar.screenshot({ path: path.join(OUT_DIR, 'sidebar_loran_c_display_light.png') });
});
