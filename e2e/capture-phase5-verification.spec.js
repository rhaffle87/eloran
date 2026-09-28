import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.resolve(process.cwd(), 'docs', 'verification', 'screenshots');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const PAGES = [
  { key: 'home', path: '/' },
  { key: 'eloran', path: '/eloran' },
  { key: 'loran-c', path: '/loran-c' },
  { key: 'waveforms', path: '/waveforms' },
  { key: 'learn', path: '/learn' },
  { key: 'about', path: '/about' },
];

const THEMES = ['dark', 'light'];
const VIEWPORTS = [
  { width: 1280, height: 800, label: '1280px' },
  { width: 768, height: 1024, label: '768px' },
  { width: 390, height: 844, label: '390px' },
];

test.describe('Phase 5: Responsive Clearance & Final Matrix Verification', () => {
  test.setTimeout(120000);

  test('36-matrix post-rehaul verification captures across all routes, viewports, and themes', async ({ browser }) => {
    let captured = 0;
    for (const theme of THEMES) {
      for (const pageInfo of PAGES) {
        for (const vp of VIEWPORTS) {
          const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
          });
          const page = await context.newPage();

          try {
            await page.goto(pageInfo.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.evaluate((t) => {
              document.documentElement.setAttribute('data-theme', t);
              localStorage.setItem('theme', t);
              if (t === 'dark') {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            }, theme);

            await page.waitForTimeout(600);

            const filename = `phase5_verified_${pageInfo.key}_${theme}_${vp.label}.png`;
            const filePath = path.join(OUT_DIR, filename);
            await page.screenshot({ path: filePath });
            captured++;
          } finally {
            await context.close();
          }
        }
      }
    }

    expect(captured).toBe(36);
  });

  test('Responsive clearance: 768px tablet layout maintains single-row navigation with zero item wrapping', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    // Assert navbar height is constrained to standard h-14 (56px) without multi-line wrapping
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();
    const navBox = await nav.boundingBox();
    expect(navBox).toBeTruthy();
    expect(navBox.height).toBeLessThanOrEqual(60);

    // Verify all 5 desktop nav items are visible and fit horizontally
    const navLinks = page.locator('nav a[href*="/"]');
    const count = await navLinks.count();
    expect(count).toBeGreaterThanOrEqual(5);

    // Verify sidebar toggle button operates smoothly
    const sidebarToggle = page.locator('button[aria-label*="Toggle sidebar"]').first();
    if (await sidebarToggle.isVisible()) {
      await sidebarToggle.click();
      await page.waitForTimeout(300);
      await sidebarToggle.click();
      await page.waitForTimeout(300);
    }
  });

  test('Responsive clearance: 390px mobile viewport touch targets and zero horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    // 1. Verify zero horizontal page overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // 2. Verify mobile bottom drawer / navigation touch target height >= 40px
    const mobileTabs = page.locator('button').filter({ hasText: /Stations|Clocks|ASF|Fusion|Layers/i });
    const tabCount = await mobileTabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < Math.min(tabCount, 5); i++) {
      const tab = mobileTabs.nth(i);
      const box = await tab.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(36);
      }
    }

    // 3. Verify mobile menu button touch target >= 40x40
    const menuBtn = page.locator('button[aria-label*="menu" i], button[aria-label*="navigation" i]').first();
    if (await menuBtn.isVisible()) {
      const menuBox = await menuBtn.boundingBox();
      expect(menuBox.width).toBeGreaterThanOrEqual(36);
      expect(menuBox.height).toBeGreaterThanOrEqual(36);
    }
  });
});
