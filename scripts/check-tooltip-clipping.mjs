import { chromium } from '@playwright/test';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { window.__LORAN_E2E__ = true; });
  const page = await context.newPage();

  await page.goto('http://localhost:5173/eloran');
  await page.waitForSelector('.maplibregl-map');

  // Open ASF tab
  const asfTab = page.locator('button:has-text("ASF")').first();
  await asfTab.waitFor({ state: 'visible' });
  await asfTab.click();
  await page.waitForTimeout(500);

  // Find all InfoTooltips in the panel
  const tooltips = page.locator('[role="tooltip"]');
  const count = await tooltips.count();
  console.log(`Found ${count} InfoTooltips in ASF panel`);

  // Check all InfoTooltips across panel
  const results = [];
  for (let i = 0; i < Math.min(count, 8); i++) {
    const tt = tooltips.nth(i);
    await tt.hover();
    await page.waitForTimeout(150);

    const isClipped = await page.evaluate((idx) => {
      const all = document.querySelectorAll('[role="tooltip"]');
      const container = all[idx];
      const popup = container ? container.querySelector('span.absolute') : null;
      if (!popup) return { index: idx, found: false };
      const rect = popup.getBoundingClientRect();
      const scrollParent = popup.closest('.overflow-y-auto') || popup.closest('[data-testid="sidebar-content"]') || document.body;
      const parentRect = scrollParent.getBoundingClientRect();
      return {
        index: idx,
        found: true,
        popupRect: { top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), right: Math.round(rect.right) },
        parentRect: { top: Math.round(parentRect.top), bottom: Math.round(parentRect.bottom), left: Math.round(parentRect.left), right: Math.round(parentRect.right) },
        clippedTop: rect.top < parentRect.top,
        clippedBottom: rect.bottom > parentRect.bottom,
        clippedLeft: rect.left < parentRect.left,
        clippedRight: rect.right > parentRect.right,
      };
    }, i);
    results.push(isClipped);
  }

  console.log('Tooltip clipping audit results:\n' + JSON.stringify(results, null, 2));

  // Hover the first one at the right margin for the screenshot
  const targetTt = tooltips.first();
  await targetTt.hover();
  await page.waitForTimeout(200);

  const outPath = 'E:/Projects/simuloran/docs/verification/screenshots/tooltip_edge_check.png';
  await page.screenshot({ path: outPath });
  console.log('Screenshot saved to ' + outPath);

  await browser.close();
}

run().catch(console.error);
