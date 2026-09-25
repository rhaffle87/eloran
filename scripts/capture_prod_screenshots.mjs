import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const targetDirs = [
  path.resolve(__dirname, '../docs/verification/screenshots'),
  'C:\\Users\\Rafli Alif\\.gemini\\antigravity-ide\\brain\\94ff8e05-3dc3-4226-ac33-52152326a313'
];

targetDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const viewports = [
  { name: '1280px', width: 1280, height: 800 },
  { name: '768px', width: 768, height: 1024 },
  { name: '390px', width: 390, height: 844 },
];

const routes = [
  { path: '/eloran', name: 'eloran' },
  { path: '/loran-c', name: 'loran-c' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const vp of viewports) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const url = `https://eloran-one.vercel.app${route.path}`;
      console.log(`Navigating to ${url} at ${vp.name}...`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 15000 });
      // Allow map tiles to settle
      await page.waitForTimeout(3000);

      const filename = `prod_${route.name}_${vp.name}.png`;
      const buffer = await page.screenshot({ fullPage: false });

      for (const dir of targetDirs) {
        const dest = path.join(dir, filename);
        fs.writeFileSync(dest, buffer);
        console.log(`Saved screenshot to ${dest}`);
      }

      await page.close();
    }
  }

  await browser.close();
  console.log('All screenshots captured successfully.');
})();
