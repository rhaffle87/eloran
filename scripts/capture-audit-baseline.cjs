const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'verification', 'screenshots');

const PAGES = [
  { key: 'home', path: '/' },
  { key: 'eloran', path: '/eloran' },
  { key: 'loran-c', path: '/loran-c' },
  { key: 'waveforms', path: '/waveforms' },
  { key: 'learn', path: '/learn' },
  { key: 'about', path: '/about' },
];

const THEMES = ['light', 'dark'];
const VIEWPORTS = [
  { width: 1280, height: 800, label: '1280px' },
  { width: 768, height: 1024, label: '768px' },
  { width: 390, height: 844, label: '390px' },
];

async function capture() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  console.log(`Starting Phase 0 baseline screenshot capture (36 combinations)...`);

  let count = 0;
  for (const theme of THEMES) {
    for (const pageInfo of PAGES) {
      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          storageState: {
            cookies: [],
            origins: [{
              origin: BASE_URL,
              localStorage: [
                { name: 'loran_theme', value: theme },
                { name: 'theme', value: theme }
              ]
            }]
          }
        });
        const page = await context.newPage();
        
        try {
          await page.goto(BASE_URL + pageInfo.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
          
          // Wait for map tiles, canvas, animations, and typography to settle
          await page.waitForTimeout(2000);
          
          const filename = `audit_baseline_${pageInfo.key}_${theme}_${vp.label}.png`;
          const filePath = path.join(OUT_DIR, filename);
          await page.screenshot({ path: filePath, fullPage: false });
          count++;
          console.log(`[${count}/36] Saved: ${filename}`);
        } catch (err) {
          console.error(`[ERROR] ${pageInfo.key} ${theme} ${vp.label}: ${err.message}`);
        } finally {
          await context.close();
        }
      }
    }
  }

  await browser.close();
  console.log(`Phase 0 capture completed: ${count} screenshots recorded in ${OUT_DIR}`);
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
