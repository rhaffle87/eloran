import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetDirs = [
  path.resolve(__dirname, '../docs/verification/screenshots'),
  'C:\\Users\\Rafli Alif\\.gemini\\antigravity-ide\\brain\\94ff8e05-3dc3-4226-ac33-52152326a313\\screenshots',
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

const pages = [
  { name: 'home', path: '/' },
  { name: 'eloran', path: '/eloran' },
  { name: 'loran-c', path: '/loran-c' },
  { name: 'waveforms', path: '/waveforms' },
  { name: 'learn', path: '/learn' },
  { name: 'about', path: '/about' },
];

const themes = ['dark', 'light'];
const BASE = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  let count = 0;

  for (const theme of themes) {
    for (const vp of viewports) {
      for (const p of pages) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          storageState: {
            cookies: [],
            origins: [{
              origin: BASE,
              localStorage: [
                { name: 'loran_theme', value: theme },
                { name: 'theme', value: theme },
              ],
            }],
          },
        });

        const page = await context.newPage();
        const url = `${BASE}${p.path}`;
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.evaluate((t) => {
            localStorage.setItem('loran_theme', t);
            localStorage.setItem('theme', t);
            document.documentElement.setAttribute('data-theme', t);
            if (t === 'dark') {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          }, theme);

          // Allow UI, animations, charts, or maps to settle
          if (p.path === '/eloran' || p.path === '/loran-c') {
            await page.waitForTimeout(2500);
          } else {
            await page.waitForTimeout(1000);
          }

          const filename = `${p.name}_${theme}_${vp.name}.png`;
          const buffer = await page.screenshot({ fullPage: false });

          for (const dir of targetDirs) {
            const dest = path.join(dir, filename);
            fs.writeFileSync(dest, buffer);
          }
          count++;
          console.log(`[${count}/36] Saved ${filename}`);
        } catch (err) {
          console.error(`Failed ${p.name} ${theme} ${vp.name}:`, err.message);
        } finally {
          await context.close();
        }
      }
    }
  }

  await browser.close();
  console.log(`Done! Captured ${count} screenshots.`);
})();
