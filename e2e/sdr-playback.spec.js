import { test, expect } from '@playwright/test';

test.describe('SDR Baseband Ingestion & Waveform Playback Suite', () => {
  test('navigates to waveforms lab, opens SDR tab, verifies canvases and telemetry HUD', async ({ page }) => {
    await page.goto('/waveforms');
    await page.waitForLoadState('networkidle');

    // 1. Switch to SDR Ingestion & Waterfall tab
    const sdrTabBtn = page.getByRole('button', { name: /SDR Ingestion & Waterfall/i });
    await expect(sdrTabBtn).toBeVisible();
    await sdrTabBtn.click();

    // 2. Verify SDR header and main controls
    await expect(page.locator('text=SDR Baseband Ingestion & Live Spectrogram')).toBeVisible();
    await expect(page.locator('text=Load I/Q or WAV')).toBeVisible();
    await expect(page.locator('text=Reset to Synthetic')).toBeVisible();

    // 3. Verify Canvas Visualizations
    const canvases = page.locator('canvas');
    expect(await canvases.count()).toBeGreaterThanOrEqual(3);

    // 4. Verify Telemetry HUD
    await expect(page.locator('text=SZC Lock:')).toBeVisible();
    await expect(page.locator('text=Matched Correlation:')).toBeVisible();
    await expect(page.locator('text=DSP Latency:')).toBeVisible();

    // 5. Verify Play/Pause Toggle
    const pauseBtn = page.getByRole('button', { name: /Pause/i });
    if (await pauseBtn.isVisible()) {
      await pauseBtn.click();
      await expect(page.getByRole('button', { name: /Play/i })).toBeVisible();
    }

    // 6. Test Preset Selection
    const presetSelect = page.locator('select').first();
    await expect(presetSelect).toBeVisible();
    await presetSelect.selectOption('dover_master');
    await expect(page.locator('text=dover_tss_master_9pulse.iq')).toBeVisible();
  });
});
