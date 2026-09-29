import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Waveforms Revamp & Export Fidelity Verification', () => {
  test('verify waveform lab oscilloscope, receiver telemetry, and exports', async ({ page }) => {
    await page.goto('/waveforms');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // 1. Verify Image 2 Revamp: Tactical Receiver Telemetry & Antenna Station Deck
    const rxAntennaLabel = page.locator('text=Receiver Antenna:');
    await expect(rxAntennaLabel).toBeVisible();

    const rxSelect = page.locator('select').first();
    await expect(rxSelect).toBeVisible();
    await expect(rxSelect).toHaveValue('R1-Vessel');

    const activeBadge = page.locator('text=RF FRONT-END ACTIVE');
    await expect(activeBadge).toBeVisible();

    const geodeticCoords = page.locator('text=Geodetic Coords');
    await expect(geodeticCoords).toBeVisible();

    const transmittersInTrack = page.locator('text=Transmitters in Track');
    await expect(transmittersInTrack).toBeVisible();

    const compositePeak = page.locator('text=Composite Peak / Power');
    await expect(compositePeak).toBeVisible();

    const trackingDiscriminator = page.locator('text=Tracking Discriminator');
    await expect(trackingDiscriminator).toBeVisible();

    // 2. Verify Image 1 Revamp: Full Timebase Slider & Oscilloscope Side Capabilities
    const timebaseSlider = page.locator('[data-testid="slider-time-axis-observation-window"]');
    await expect(timebaseSlider).toBeVisible();

    // Verify Quick Zoom Presets
    const quickZoom1Pulse = page.getByRole('button', { name: /300 µs \(1-Pulse Zoom\)/i });
    await expect(quickZoom1Pulse).toBeVisible();

    const quickZoom10ms = page.getByRole('button', { name: /10 ms \(Default\)/i });
    await expect(quickZoom10ms).toBeVisible();

    // Verify Side Capabilities: Trigger Offset, Vertical Gain, Noise Injection
    const triggerOffsetLabel = page.locator('text=Trigger Offset (Δt):');
    await expect(triggerOffsetLabel).toBeVisible();

    const verticalGainLabel = page.locator('text=Vertical Gain (V/div):');
    await expect(verticalGainLabel).toBeVisible();

    const noiseInjectionLabel = page.locator('text=RF Noise Injection:');
    await expect(noiseInjectionLabel).toBeVisible();

    // Click 30 dB noise injection to test real-time noise updates
    const noise30dB = page.getByRole('button', { name: '30dB' });
    await expect(noise30dB).toBeVisible();
    await noise30dB.click();
    await page.waitForTimeout(200);

    // Click 2.0x vertical gain
    const gain2x = page.getByRole('button', { name: '2x' });
    await expect(gain2x).toBeVisible();
    await gain2x.click();
    await page.waitForTimeout(200);

    // Verify Scope Telemetry HUD
    const dsoHeader = page.locator('text=DSO CH1/CH2 LIVE TRACE');
    await expect(dsoHeader).toBeVisible();

    const szcHud = page.locator('text=SZC:');
    await expect(szcHud.first()).toBeVisible();

    // 3. Verify Image 3 Revamp: Fuller Graph & Active Operating Reticle
    const boyceTab = page.getByRole('button', { name: /Boyce Monte Carlo/i });
    await expect(boyceTab).toBeVisible();

    // Scroll down to CycleSelectionPanel
    const cycleSection = page.locator('text=Loran Cycle Selection & Monte Carlo Simulator');
    await expect(cycleSection).toBeVisible();

    // Verify Operating Reticle and Callout Badge
    const activeOpBadge = page.locator('text=ACTIVE OPERATING POINT');
    await expect(activeOpBadge).toBeVisible();

    // Verify MTBS and Operational Status
    const mtbsLabel = page.locator('text=MTBS:');
    await expect(mtbsLabel).toBeVisible();

    // Move Input SNR slider and verify real-time reticle & MTBS updates
    const snrSlider = page.locator('[data-testid="slider-receiver-rf-input-snr"]');
    await expect(snrSlider).toBeVisible();
    await snrSlider.fill('12');
    await page.waitForTimeout(200);

    // Verify that the callout updated to reflect 12 dB + 10 dB = 22 dB
    const updatedOp = page.locator('text=22.0 dB');
    await expect(updatedOp.first()).toBeVisible();

    // 4. Verify Export Fidelity (Requirement 3)
    // Test SVG Export
    const downloadPromiseSvg = page.waitForEvent('download');
    const exportSvgBtn = page.getByRole('button', { name: /Export SVG/i });
    await exportSvgBtn.click();
    const downloadSvg = await downloadPromiseSvg;
    const svgPath = await downloadSvg.path();
    const svgContent = fs.readFileSync(svgPath, 'utf8');

    // Rigorous SVG Content checks
    expect(svgContent).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svgContent).toContain('Loran-C / eLoran Antenna Composite Voltage');
    expect(svgContent).toContain('SCOPE HUD TELEMETRY');
    expect(svgContent).toContain('SZC: 30.0 µs');
    expect(svgContent).toContain('fc: 100.0 kHz');
    expect(svgContent).not.toContain('NaN');
    expect(svgContent).not.toContain('undefined');

    // Test CSV Export
    const downloadPromiseCsv = page.waitForEvent('download');
    const exportCsvBtn = page.getByRole('button', { name: /Export CSV/i });
    await exportCsvBtn.click();
    const downloadCsv = await downloadPromiseCsv;
    const csvPath = await downloadCsv.path();
    const csvContent = fs.readFileSync(csvPath, 'utf8');

    // Rigorous CSV Content checks
    expect(csvContent).toContain('# Loran-C / eLoran Antenna Composite Voltage Sample Export');
    expect(csvContent).toContain('time_seconds,time_microseconds,carrier_voltage_v,envelope_voltage_v');
    const csvLines = csvContent.trim().split('\n');
    expect(csvLines.length).toBeGreaterThan(100);
    // Verify first data line has 4 comma-separated values
    const firstDataLine = csvLines.find((l) => !l.startsWith('#') && !l.startsWith('time_'));
    expect(firstDataLine.split(',').length).toBe(4);

    // 5. Verify Streamlined RF Reference Bar & Theory Link (Requirement 1 & 6)
    const theoryLink = page.getByRole('link', { name: /Full Theory & Equations in Docs/i });
    await expect(theoryLink).toBeVisible();
    await expect(theoryLink).toHaveAttribute('href', '/learn#uscg-pulse');

    // Capture visual proof screenshots
    const screenshotDir = path.resolve('docs/verification/screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });

    // Switch back to All Views & 1-Pulse canonical zoom for pristine capture
    await quickZoom1Pulse.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotDir, 'waveforms_lab_overhaul_dark.png'), fullPage: true });

    // Toggle theme to light mode and capture
    const themeBtn = page.locator('button[aria-label*="theme" i], button[title*="theme" i], button:has(svg.lucide-sun), button:has(svg.lucide-moon)').first();
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotDir, 'waveforms_lab_overhaul_light.png'), fullPage: true });
    }
  });
});
