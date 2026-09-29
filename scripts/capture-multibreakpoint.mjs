import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = 'docs/verification/screenshots';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function runCapture() {
  console.log('Starting local Vite dev server programmatically...');
  const server = await createServer({
    server: { port: 5173 },
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = address.port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Vite server listening on ${baseUrl}`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const breakpoints = [
    { name: '360px', width: 360, height: 740 },
    { name: '768px', width: 768, height: 1024 },
    { name: '1440px', width: 1440, height: 900 },
  ];

  console.log('Capturing multi-breakpoint screenshots...');

  for (const bp of breakpoints) {
    await page.setViewportSize({ width: bp.width, height: bp.height });

    // 1. Home Page
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('nav', { state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `home_${bp.name}.png`),
      fullPage: false,
    });
    console.log(`✓ Captured home_${bp.name}.png`);

    // 2. Navbar component
    const nav = page.locator('nav');
    if (await nav.count() > 0) {
      await nav.screenshot({
        path: path.join(SCREENSHOT_DIR, `navbar_${bp.name}.png`),
      });
      console.log(`✓ Captured navbar_${bp.name}.png`);
    }

    // 3. About Page
    await page.goto(`${baseUrl}/about`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('nav', { state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `about_${bp.name}.png`),
      fullPage: false,
    });
    console.log(`✓ Captured about_${bp.name}.png`);
  }

  // 4. Tab Title Verification
  const titles = {};
  for (const route of ['/', '/loran-c', '/eloran', '/waveforms', '/learn', '/about']) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    titles[route] = await page.title();
  }
  console.log('Tab Titles Verified:', JSON.stringify(titles, null, 2));

  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'tab_titles.json'),
    JSON.stringify(titles, null, 2),
    'utf-8'
  );

  await browser.close();
  await server.close();
  console.log('Multi-breakpoint capture completed successfully.');
}

runCapture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
