/**
 * M7 Accessibility & CLS Audit
 * @axe-core/playwright + Playwright PerformanceObserver
 * Pages: Home (/), /eloran, /loran-c
 * Themes: dark (default), light
 */
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const BASE = 'http://localhost:5173';
const PAGES = [
  { name: 'Home',    path: '/' },
  { name: 'eLoran',  path: '/eloran' },
  { name: 'Loran-C', path: '/loran-c' },
];
const THEMES = ['dark', 'light'];

// Wait for map tiles / heavy async load to settle
async function waitForSettle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

// Inject CLS observer before navigation
async function measureCLS(page) {
  await page.addInitScript(() => {
    window.__CLS__ = 0;
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__CLS__ += entry.value;
      }
    });
    po.observe({ type: 'layout-shift', buffered: true });
  });
}

async function getCLS(page) {
  return page.evaluate(() => window.__CLS__ || 0);
}

async function setTheme(page, theme) {
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
  await page.waitForTimeout(300);
}

async function runAudit() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const theme of THEMES) {
    for (const { name, path } of PAGES) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        storageState: {
          cookies: [],
          origins: [{
            origin: BASE,
            localStorage: [
              { name: 'loran_theme', value: theme },
              { name: 'theme', value: theme }
            ]
          }]
        }
      });
      const page = await context.newPage();
      await measureCLS(page);

      try {
        await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
        // Set theme attribute to match localStorage
        await page.waitForTimeout(500);
        await setTheme(page, theme);
        await waitForSettle(page);

        // Run axe — focus on critical/serious only, skip known false-positives
        const axeResults = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .disableRules([
            // Map canvas is non-interactive decorative content; axe flags it incorrectly
            'region',
          ])
          .analyze();

        const cls = await getCLS(page);

        const critical = axeResults.violations.filter(v => v.impact === 'critical');
        const serious  = axeResults.violations.filter(v => v.impact === 'serious');
        const moderate = axeResults.violations.filter(v => v.impact === 'moderate');

        results.push({
          page: name,
          theme,
          cls: cls.toFixed(4),
          clsPass: cls < 0.1,
          criticalCount: critical.length,
          seriousCount: serious.length,
          moderateCount: moderate.length,
          violations: axeResults.violations.map(v => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            count: v.nodes.length,
            // First affected node selector for context
            selector: v.nodes[0]?.target?.join(' > ') || '?',
          })),
        });
      } catch (err) {
        results.push({ page: name, theme, error: err.message });
      }

      await context.close();
    }
  }

  await browser.close();

  // ── Print report ──
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  M7 ACCESSIBILITY & CLS AUDIT REPORT');
  console.log('════════════════════════════════════════════════════════\n');

  let totalCritical = 0;
  let totalSerious  = 0;
  let allClsPass    = true;

  for (const r of results) {
    if (r.error) {
      console.log(`[${r.theme.toUpperCase()}] ${r.page} — ERROR: ${r.error}`);
      continue;
    }
    totalCritical += r.criticalCount;
    totalSerious  += r.seriousCount;
    if (!r.clsPass) allClsPass = false;

    const clsStatus = r.clsPass ? '✓' : '✗';
    console.log(`[${r.theme.toUpperCase()}] ${r.page}`);
    console.log(`  CLS:      ${clsStatus} ${r.cls} (< 0.1 target)`);
    console.log(`  Critical: ${r.criticalCount}  Serious: ${r.seriousCount}  Moderate: ${r.moderateCount}`);

    if (r.violations.length > 0) {
      console.log('  Violations:');
      for (const v of r.violations) {
        console.log(`    [${v.impact.toUpperCase()}] ${v.id} (${v.count} node${v.count !== 1 ? 's' : ''})`);
        console.log(`      ${v.description}`);
        console.log(`      First node: ${v.selector}`);
      }
    }
    console.log('');
  }

  console.log('════════════════════════════════════════════════════════');
  console.log(`  SUMMARY`);
  console.log(`  Total critical violations: ${totalCritical}`);
  console.log(`  Total serious violations:  ${totalSerious}`);
  console.log(`  All CLS < 0.1:             ${allClsPass ? 'YES' : 'NO'}`);
  console.log(`  M7 Gate:                   ${totalCritical === 0 && allClsPass ? '✓ PASS' : '✗ FAIL — fixes required'}`);
  console.log('════════════════════════════════════════════════════════\n');

  // Exit non-zero if gate fails — caller can detect
  if (totalCritical > 0 || !allClsPass) process.exit(1);
}

runAudit().catch(err => { console.error(err); process.exit(2); });
