import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.resolve(process.cwd(), 'docs', 'verification', 'screenshots');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

test('capture Phase 3 verification screenshots across themes', async ({ page }) => {
  // 1. Dark Mode 1280px Sidebar
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/eloran');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  });
  await page.waitForTimeout(400);

  const sidebarDark = page.locator('[data-testid="sidebar-content"]');
  await expect(sidebarDark).toBeVisible();
  await sidebarDark.screenshot({ path: path.join(OUT_DIR, 'sidebar_after_dark_1280px.png') });

  // 2. Light Mode 1280px Sidebar
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');
  });
  await page.waitForTimeout(400);
  const sidebarLight = page.locator('[data-testid="sidebar-content"]');
  await sidebarLight.screenshot({ path: path.join(OUT_DIR, 'sidebar_after_light_1280px.png') });

  // 3. Tooltip Popover Hover State
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  });
  const asfTab = page.getByRole('button', { name: /^ASF$/i });
  await asfTab.click();
  await page.waitForTimeout(300);
  const iturTooltip = page.locator('span[role="tooltip"][aria-label*="ITU-R P.368"]').first();
  await expect(iturTooltip).toBeVisible();
  await iturTooltip.hover();
  await page.waitForTimeout(300);
  await sidebarDark.screenshot({ path: path.join(OUT_DIR, 'sidebar_tooltip_hover_1280px.png') });

  // 4. TrialValidationPanel in Light Mode (VI-01 verification)
  await page.goto('/about');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');
  });
  await page.waitForTimeout(400);
  const validationSection = page.locator('[data-testid="trial-validation-panel"]').first();
  if (await validationSection.isVisible()) {
    await validationSection.screenshot({ path: path.join(OUT_DIR, 'trial_validation_light_mode.png') });
  }

  // 5. Waveforms UTF-8 Clean Rendering
  await page.goto('/waveforms');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  });
  await page.waitForTimeout(400);
  const cyclePanel = page.locator('text=Loran Cycle Selection & Monte Carlo Simulator').locator('..').locator('..');
  if (await cyclePanel.isVisible()) {
    await cyclePanel.screenshot({ path: path.join(OUT_DIR, 'waveforms_utf8_clean.png') });
  }
});
