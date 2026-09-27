const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'verification', 'screenshots');

const viewports = [
  { name: '1280px', width: 1280, height: 800 },
  { name: '768px', width: 768, height: 1024 },
  { name: '390px', width: 390, height: 844 },
];

async function capture() {
  const browser = await chromium.launch();

  for (const vp of viewports) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      
      // Set theme attribute in localStorage or route
      await page.goto('http://localhost:5173/eloran');
      await page.waitForSelector('.maplibregl-map');
      await page.waitForTimeout(500);

      // Align theme
      const currentTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'dark');
      if (currentTheme !== theme) {
        const themeBtn = page.locator('button[aria-label*="theme"]');
        if (await themeBtn.isVisible()) {
          await themeBtn.click();
          await page.waitForTimeout(400);
        } else {
          await page.evaluate((t) => {
            document.documentElement.setAttribute('data-theme', t);
            localStorage.setItem('theme', t);
          }, theme);
          await page.waitForTimeout(400);
        }
      }

      // Switch to Radar mode
      const radarBtn = page.locator('button[data-testid="basemap-radar"]');
      await radarBtn.click();
      await page.waitForTimeout(800);

      // Generate LOP Contours on 1280px to demonstrate composite layers on top of radar underlay
      if (vp.name === '1280px') {
        const meshTab = page.locator('button:has-text("Layers"), button:has-text("Mesh")');
        if (await meshTab.isVisible()) {
          await meshTab.click();
          await page.waitForTimeout(300);
          const genLops = page.locator('button:has-text("Generate LOP Contours")');
          if (await genLops.isVisible()) {
            await genLops.click();
            await page.waitForFunction(() => {
              const map = window.__maplibreInstance;
              return Boolean(map && map.getLayer('loran-lops-layer'));
            }, { timeout: 15000 }).catch(() => console.warn('LOP wait timeout on capture'));
          }
        }
      }

      const filename = `radar_after_${theme}_${vp.name}.png`;
      const filePath = path.join(OUT_DIR, filename);
      await page.screenshot({ path: filePath });
      console.log(`Saved: ${filename}`);

      await page.close();
    }
  }

  // Also capture declutter comparison: Radials ON vs OFF at 1280px dark
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto('http://localhost:5173/eloran');
    await page.waitForSelector('.maplibregl-map');
    await page.click('button[data-testid="basemap-radar"]');
    await page.waitForTimeout(500);

    // Default: radials OFF (cardinals only)
    await page.screenshot({ path: path.join(OUT_DIR, 'radar_declutter_radials_off.png') });
    console.log('Saved: radar_declutter_radials_off.png');

    // Toggle radials ON
    const radialsBtn = page.locator('button[data-testid="toggle-radar-radials"]');
    await radialsBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, 'radar_declutter_radials_on.png') });
    console.log('Saved: radar_declutter_radials_on.png');

    await page.close();
  }

  await browser.close();
}

capture().catch(console.error);
