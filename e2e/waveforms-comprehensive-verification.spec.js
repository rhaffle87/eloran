import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('RF Waveforms Thorough & Mean-Details Verification Suite', () => {
  test('exhaustively validates all 8 waveform subsystems, tab switching, interactive controls, and exports', async ({ page }) => {
    test.setTimeout(60000);
    const pageErrors = [];
    const consoleErrors = [];

    page.on('pageerror', (err) => {
      pageErrors.push(err.message || String(err));
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('Download the React DevTools')) {
          consoleErrors.push(text);
        }
      }
    });

    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/waveforms');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // 1. PAGE HEADER & QUICK LINKS
    const headerTitle = page.locator('h1').first();
    await expect(headerTitle).toBeVisible();
    await expect(headerTitle).toContainText('100 kHz RF Waveform');

    const theoryBadge = page.locator('a[href="/learn#waveforms"]').first();
    await expect(theoryBadge).toBeVisible();

    // 2. TAB: OSCILLOSCOPE (PulseViewer)
    const oscTabBtn = page.locator('button:has-text("Oscilloscope")').first();
    await expect(oscTabBtn).toBeVisible();
    await oscTabBtn.click();
    await page.waitForTimeout(200);

    await expect(page.locator('text=DSO CH1/CH2 LIVE TRACE').first()).toBeVisible();
    await expect(page.locator('text=SZC: 30.0 µs').first()).toBeVisible();
    await expect(page.locator('text=fc: 100.0 kHz').first()).toBeVisible();

    const zoom300Us = page.locator('button:has-text("300 µs (1-Pulse Zoom)")').first();
    await expect(zoom300Us).toBeVisible();
    await zoom300Us.click();
    await page.waitForTimeout(150);

    const zoom10Ms = page.locator('button:has-text("10 ms")').first();
    await expect(zoom10Ms).toBeVisible();
    await zoom10Ms.click();
    await page.waitForTimeout(150);

    const gain2x = page.getByRole('button', { name: 'Gain 2x' }).first();
    if (await gain2x.isVisible()) {
      await gain2x.click();
      await page.waitForTimeout(100);
    }

    const noise20dB = page.getByRole('button', { name: '20dB' }).first();
    if (await noise20dB.isVisible()) {
      await noise20dB.click();
      await page.waitForTimeout(100);
    }

    const downloadSvgPromise = page.waitForEvent('download');
    const exportSvgBtn = page.getByRole('button', { name: /Export SVG/i }).first();
    await exportSvgBtn.click();
    const svgDownload = await downloadSvgPromise;
    expect(svgDownload.suggestedFilename()).toContain('.svg');

    const downloadCsvPromise = page.waitForEvent('download');
    const exportCsvBtn = page.getByRole('button', { name: /Export CSV/i }).first();
    await exportCsvBtn.click();
    const csvDownload = await downloadCsvPromise;
    expect(csvDownload.suggestedFilename()).toContain('.csv');

    // 3. TAB: SDR INGESTION & WATERFALL (SdrLabPanel)
    const sdrTabBtn = page.locator('button:has-text("SDR Ingestion & Waterfall")').first();
    await expect(sdrTabBtn).toBeVisible();
    await sdrTabBtn.click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=SDR Baseband Ingestion & Live Spectrogram').first()).toBeVisible();
    await expect(page.locator('text=SZC Lock:').first()).toBeVisible();
    await expect(page.locator('text=Matched Correlation:').first()).toBeVisible();

    const sdrCanvases = page.locator('canvas');
    expect(await sdrCanvases.count()).toBeGreaterThanOrEqual(2);

    const sdrSelect = page.locator('select').first();
    if (await sdrSelect.isVisible()) {
      await sdrSelect.selectOption('dover_master');
      await page.waitForTimeout(200);
      await expect(page.locator('text=dover_tss_master_9pulse.iq').first()).toBeVisible();
    }

    // 4. TAB: RF SYNTHESIZER (CustomWaveformSynthesizer)
    const synthTabBtn = page.locator('button:has-text("RF Synthesizer")').first();
    await expect(synthTabBtn).toBeVisible();
    await synthTabBtn.click();
    await page.waitForTimeout(200);

    await expect(page.locator('text=Custom RF Waveform Generator').first()).toBeVisible();
    await expect(page.locator('text=Rise Time (τ):').first()).toBeVisible();
    await expect(page.locator('text=Envelope Exponent (α):').first()).toBeVisible();

    const standard100Btn = page.locator('button:has-text("Standard 100 kHz")').first();
    if (await standard100Btn.isVisible()) {
      await standard100Btn.click();
      await page.waitForTimeout(100);
    }

    // 5. TAB: PULSE GROUP TIMINGS (CheolJChainViewer)
    const pciTabBtn = page.locator('button:has-text("Pulse Group Timings")').first();
    await expect(pciTabBtn).toBeVisible();
    await pciTabBtn.click();
    await page.waitForTimeout(200);

    await expect(page.locator('text=Calibrated Reference Station Telemetry').first()).toBeVisible();

    const periodBBtn = page.locator('button:has-text("Period B")').first();
    if (await periodBBtn.isVisible()) {
      await periodBBtn.click();
      await page.waitForTimeout(150);
    }
    const periodABtn = page.locator('button:has-text("Period A")').first();
    if (await periodABtn.isVisible()) {
      await periodABtn.click();
      await page.waitForTimeout(150);
    }

    const zoomInBtn = page.locator('button[aria-label="Zoom In 2x"]').first();
    if (await zoomInBtn.isVisible()) {
      await zoomInBtn.click();
      await page.waitForTimeout(100);
    }
    const overviewBtn = page.locator('button:has-text("Full Chain Overview")').first();
    if (await overviewBtn.isVisible()) {
      await overviewBtn.click();
      await page.waitForTimeout(100);
    }

    // 6. TAB: TRACKING LOOP (TrackingPanel)
    const trackingTabBtn = page.locator('button:has-text("Tracking Loop")').first();
    await expect(trackingTabBtn).toBeVisible();
    await trackingTabBtn.click();
    await page.waitForTimeout(200);

    await expect(page.locator('text=Estimated SZC').first()).toBeVisible();
    await expect(page.locator('text=Confidence').first()).toBeVisible();

    // Pause loop first so manual stepping is active
    const pauseBtn = page.locator('button:has-text("Pause Loop")').first();
    if (await pauseBtn.isVisible()) {
      await pauseBtn.click();
      await page.waitForTimeout(100);
    }

    const stepBtn = page.locator('[data-testid="btn-step-tracking-loop"]').first();
    await expect(stepBtn).toBeEnabled();
    await stepBtn.click();
    await page.waitForTimeout(100);

    const slipPlusBtn = page.locator('[data-testid="btn-inject-slip-forward"]').first();
    if (await slipPlusBtn.isVisible()) {
      await slipPlusBtn.click();
      await page.waitForTimeout(150);
    }
    const reacquireBtn = page.locator('[data-testid="btn-reacquire-tracking-loop"]').first();
    if (await reacquireBtn.isVisible()) {
      await reacquireBtn.click();
      await page.waitForTimeout(150);
    }

    // 7. TAB: CYCLE SELECTION (CycleSelectionPanel)
    const cycleTabBtn = page.locator('button:has-text("Cycle Selection")').first();
    await expect(cycleTabBtn).toBeVisible();
    await cycleTabBtn.click();
    await page.waitForTimeout(200);

    await expect(page.locator('text=Loran Cycle Selection & Monte Carlo Simulator').first()).toBeVisible();
    await expect(page.locator('text=ACTIVE OPERATING POINT').first()).toBeVisible();
    await expect(page.locator('text=MTBS:').first()).toBeVisible();

    const snrInput = page.locator('input[aria-label="Carrier SNR (SNR_c)"]').first();
    if (await snrInput.isVisible()) {
      await snrInput.fill('15');
      await page.waitForTimeout(150);
      await expect(page.locator('text=25.0 dB').first()).toBeVisible();
    }

    const reseedBtn = page.locator('button:has-text("Re-seed Trials")').first();
    if (await reseedBtn.isVisible()) {
      await reseedBtn.click();
      await page.waitForTimeout(150);
    }

    // 8. TAB: IONOSPHERIC SKYWAVE (SkywavePanel)
    const skywaveTabBtn = page.locator('button:has-text("Ionospheric Skywave")').first();
    await expect(skywaveTabBtn).toBeVisible();
    await skywaveTabBtn.click();
    await page.waitForTimeout(200);

    await expect(page.locator('text=Ionospheric Skywave & Diurnal Interference').first()).toBeVisible();

    const nightBtn = page.locator('button:has-text("Night / Midnight")').first();
    if (await nightBtn.isVisible()) {
      await nightBtn.click();
      await page.waitForTimeout(150);
    }
    const dayBtn = page.locator('button:has-text("Day / Solar Noon")').first();
    if (await dayBtn.isVisible()) {
      await dayBtn.click();
      await page.waitForTimeout(150);
    }

    // 9. TAB: LDC & EUROFIX (LdcDemodulatorPanel)
    const ldcTabBtn = page.locator('button:has-text("LDC & Eurofix")').first();
    await expect(ldcTabBtn).toBeVisible();
    await ldcTabBtn.click();
    await page.waitForTimeout(200);

    await expect(page.locator('text=Loran Data Channel (LDC) & Eurofix Demodulator').first()).toBeVisible();
    await expect(page.locator('text=CRC-16 VERIFIED').first()).toBeVisible();

    const eurofixBtn = page.locator('button:has-text("Eurofix (3-8)")').first();
    if (await eurofixBtn.isVisible()) {
      await eurofixBtn.click();
      await page.waitForTimeout(150);
    }
    const ppmBtn = page.locator('button:has-text("32-PPM (9th)")').first();
    if (await ppmBtn.isVisible()) {
      await ppmBtn.click();
      await page.waitForTimeout(150);
    }

    const injectBitBtn = page.locator('button:has-text("Inject Bit Flip")').first();
    if (await injectBitBtn.isVisible()) {
      await injectBitBtn.click();
      await page.waitForTimeout(150);
      await expect(page.locator('text=Clear Injected Error').first()).toBeVisible();
      await page.locator('button:has-text("Clear Injected Error")').first().click();
      await page.waitForTimeout(150);
    }

    // 10. ALL VIEWS TAB & STANDARDS FOOTER STRIP
    const allTabBtn = page.locator('button:has-text("All Views")').first();
    await expect(allTabBtn).toBeVisible();
    await allTabBtn.click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=Standard Pulse Envelope').first()).toBeVisible();
    await expect(page.locator('text=GRI Timing Structure').first()).toBeVisible();
    await expect(page.locator('text=Groundwave SZC Sampling').first()).toBeVisible();

    const fullTheoryBtn = page.getByRole('link', { name: /Full Theory & Equations in Docs/i }).first();
    await expect(fullTheoryBtn).toBeVisible();
    await expect(fullTheoryBtn).toHaveAttribute('href', '/learn#uscg-pulse');

    // 11. ZERO CRASHES / ZERO CONSOLE ERRORS
    expect(pageErrors).toHaveLength(0);
    expect(consoleErrors).toHaveLength(0);

    const screenshotDir = path.resolve('docs/verification/screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'waveforms_all_sections_verified.png'), fullPage: false });
  });
});
