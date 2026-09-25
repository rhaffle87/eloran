import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('docs/verification/screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function capture() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Inject E2E hook
  await page.addInitScript(() => {
    window.__LORAN_E2E__ = true;
  });

  console.log('1. Capturing /eloran from https://eloran-one.vercel.app ...');
  await page.goto('https://eloran-one.vercel.app/eloran', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const eloranShot = path.join(outDir, 'live_prod_eloran_alignment.png');
  await page.screenshot({ path: eloranShot });
  console.log(`Saved: ${eloranShot}`);

  console.log('2. Capturing /loran-c from https://eloran-one.vercel.app ...');
  await page.goto('https://eloran-one.vercel.app/loran-c', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const loranCShot = path.join(outDir, 'live_prod_loran_c_alignment.png');
  await page.screenshot({ path: loranCShot });
  console.log(`Saved: ${loranCShot}`);

  console.log('3. Capturing collinear scenario on live production ...');
  await page.goto('https://eloran-one.vercel.app/eloran', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const presetSelect = page.locator('#scenario-preset-select');
  await presetSelect.selectOption('high_gdop');
  await page.waitForTimeout(2500);
  const collinearShot = path.join(outDir, 'live_prod_collinear_alignment.png');
  await page.screenshot({ path: collinearShot });
  console.log(`Saved: ${collinearShot}`);

  await browser.close();
  console.log('All live production verification screenshots captured successfully!');
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
