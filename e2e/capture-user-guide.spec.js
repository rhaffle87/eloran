import { test } from '@playwright/test';

// Configuration: High-DPI Desktop 1440x900 layout (zero mobile wrapping)
const VIEWPORT = { width: 1440, height: 900 };

/**
 * Robust helper to ensure MapLibre tiles and WebGL canvas are 100% loaded and rendered
 */
async function ensureMapReady(page) {
  await page.evaluate(async () => {
    const map = window.__maplibreInstance;
    if (!map) return;
    if (!map.loaded() || !map.areTilesLoaded()) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 8000);
        map.once('idle', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  });
  // Extra buffer for canvas rasterization and vector fonts
  await page.waitForTimeout(2500);
}

/**
 * Load the calibrated China East Sea Chain (GRI 8390) preset
 */
async function loadChinaEastSea(page) {
  await page.waitForSelector('#scenario-preset-select');
  await page.selectOption('#scenario-preset-select', 'china_east_sea_8390');
  await ensureMapReady(page);
}

test.describe('SimuLoran - Visual User Guide & High-Resolution Layout Capture', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
  });

  test('Capture 01 - Home Dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=eLoran Simulator');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'docs/assets/screenshots/01_home_dashboard.png' });
  });

  test('Capture 02 - Scenario Presets Grid', async ({ page }) => {
    await page.goto('/');
    const presetsSection = page.locator('#presets');
    await presetsSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'docs/assets/screenshots/02_preset_scenarios_grid.png' });
  });

  test('Capture 03 - Loran-C Hyperbolic Map (China East Sea)', async ({ page }) => {
    await page.goto('/loran-c');
    await loadChinaEastSea(page);

    // Click Layers/Display tab and generate hyperbolic LOP contours
    const displayTab = page.locator('button:has-text("Display")').or(page.locator('button:has-text("Layers")')).first();
    if (await displayTab.count() > 0) {
      await displayTab.click();
      await page.waitForTimeout(500);
      const genBtn = page.locator('button:has-text("Generate LOP Contours")');
      if (await genBtn.count() > 0) {
        await genBtn.click();
        await page.waitForTimeout(3000);
      }
    }

    await ensureMapReady(page);
    await page.screenshot({ path: 'docs/assets/screenshots/03_loran_c_hyperbolic_map.png' });
  });

  test('Capture 04 - Loran-C Chain Design Panel', async ({ page }) => {
    await page.goto('/loran-c');
    await loadChinaEastSea(page);

    const chainDesignBtn = page.locator('button:has-text("Chain Design")').first();
    await chainDesignBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/assets/screenshots/04_chain_design_panel.png' });
  });

  test('Capture 05 - eLoran All-in-View Map (China East Sea Fully Loaded)', async ({ page }) => {
    await page.goto('/eloran');
    await loadChinaEastSea(page);

    // Switch to Stations tab to show station list and radar radials
    const stationsTab = page.locator('button[aria-label="Stations"]');
    if (await stationsTab.count() > 0) {
      await stationsTab.click();
    }

    await ensureMapReady(page);
    await page.screenshot({ path: 'docs/assets/screenshots/05_eloran_all_in_view_map.png' });
  });

  test('Capture 06 - Station Editor Add Modal', async ({ page }) => {
    await page.goto('/eloran');
    await loadChinaEastSea(page);

    const stationsTab = page.locator('button[aria-label="Stations"]');
    if (await stationsTab.count() > 0) {
      await stationsTab.click();
      await page.waitForTimeout(500);
    }

    const addStationBtn = page.locator('button[aria-label="Add Station"]');
    await addStationBtn.click();
    await page.waitForSelector('text=Add Transmission Station');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'docs/assets/screenshots/06_station_editor_add_modal.png' });
  });

  test('Capture 07 - GDOP Heatmap Contours (China East Sea)', async ({ page }) => {
    await page.goto('/eloran');
    await loadChinaEastSea(page);

    // Switch to Layers tab
    const layersTab = page.locator('button[aria-label="Layers"]');
    await layersTab.click();
    await page.waitForTimeout(800);

    // Ensure Live GDOP Coverage Overlay is enabled
    const gdopLabel = page.locator('label:has-text("Live GDOP Coverage Overlay")');
    const gdopCheckbox = gdopLabel.locator('input[type="checkbox"]');
    const isChecked = await gdopCheckbox.isChecked();
    if (!isChecked) {
      await gdopLabel.click();
      await page.waitForTimeout(1500);
    }

    // Scroll the drawer panel to top so the inspector card and buttons are fully visible
    await page.evaluate(() => {
      const scrollable = document.querySelector('.overflow-y-auto');
      if (scrollable) scrollable.scrollTop = 0;
    });

    // Wait for GDOP worker computation and MapLibre layers
    await page.waitForFunction(() => {
      return Boolean(window.__gdopGeoJson && window.__gdopContoursGeoJson);
    }, { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(2000);

    await ensureMapReady(page);
    await page.screenshot({ path: 'docs/assets/screenshots/07_gdop_heatmap_contours.png' });
  });

  test('Capture 08 - ASF Millington Panel', async ({ page }) => {
    await page.goto('/eloran');
    await loadChinaEastSea(page);

    const asfTab = page.locator('button[aria-label="ASF"]');
    await asfTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/assets/screenshots/08_asf_millington_panel.png' });
  });

  test('Capture 09 - Clocks & Allan Variance Lab', async ({ page }) => {
    await page.goto('/eloran');
    await loadChinaEastSea(page);

    const clocksTab = page.locator('button[aria-label="Clocks"]');
    await clocksTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/assets/screenshots/09_clocks_allan_variance.png' });
  });

  test('Capture 10 - GNSS-eLoran Sensor Fusion & Resilience', async ({ page }) => {
    await page.goto('/eloran');
    await loadChinaEastSea(page);

    const fusionTab = page.locator('button[aria-label="Fusion"]');
    await fusionTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/assets/screenshots/10_sensor_fusion_resilience.png' });
  });

  test('Capture 11 - Trajectory Flight Planner', async ({ page }) => {
    await page.goto('/eloran');
    await loadChinaEastSea(page);

    const trajTab = page.locator('button[aria-label="Trajectory"]');
    await trajTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/assets/screenshots/11_trajectory_flight_planner.png' });
  });

  test('Capture 12 - Telemetry Console Expanded', async ({ page }) => {
    await page.goto('/eloran');
    await loadChinaEastSea(page);

    // Expand bottom PNT telemetry drawer
    const expandTrigger = page.locator('text=EXPAND').first();
    if (await expandTrigger.count() > 0) {
      await expandTrigger.click();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: 'docs/assets/screenshots/12_telemetry_console_expanded.png' });
  });

  test('Capture 13 - Marine Bridge NMEA Terminal Modal', async ({ page }) => {
    await page.goto('/eloran');
    await loadChinaEastSea(page);

    const nmeaBtn = page.locator('button:has-text("NMEA 0183")');
    if (await nmeaBtn.count() > 0) {
      await nmeaBtn.click();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: 'docs/assets/screenshots/13_nmea_terminal_modal.png' });
  });

  test('Capture 14 - RF Waveforms Pulse Viewer Oscilloscope', async ({ page }) => {
    await page.goto('/waveforms');
    await page.waitForSelector('text=100 kHz RF Waveform');
    await page.click('button:has-text("Oscilloscope")');
    await page.waitForTimeout(500);

    // Zoom into 1-pulse for maximum waveform graph and SZC detail
    const zoomBtn = page.locator('button:has-text("300 µs (1-Pulse Zoom)")');
    if (await zoomBtn.count() > 0) {
      await zoomBtn.click();
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/assets/screenshots/14_rf_waveforms_pulse_viewer.png' });
  });

  test('Capture 15 - RF Waveforms Skywave Lab', async ({ page }) => {
    await page.goto('/waveforms');
    await page.waitForSelector('text=100 kHz RF Waveform');
    await page.click('button:has-text("Ionospheric Skywave")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/assets/screenshots/15_rf_waveforms_skywave_lab.png' });
  });

  test('Capture 16 - RF Waveforms Cycle Selection & ECD', async ({ page }) => {
    await page.goto('/waveforms');
    await page.waitForSelector('text=100 kHz RF Waveform');
    await page.click('button:has-text("Cycle Selection")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/assets/screenshots/16_rf_waveforms_cycle_selection.png' });
  });

  test('Capture 17 - RF Waveforms SDR Lab', async ({ page }) => {
    await page.goto('/waveforms');
    await page.waitForSelector('text=100 kHz RF Waveform');
    await page.click('button:has-text("SDR Ingestion & Waterfall")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/assets/screenshots/17_rf_waveforms_sdr_lab.png' });
  });

  test('Capture 18 - RF Waveforms LDC Demodulator', async ({ page }) => {
    await page.goto('/waveforms');
    await page.waitForSelector('text=100 kHz RF Waveform');
    await page.click('button:has-text("LDC & Eurofix")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/assets/screenshots/18_rf_waveforms_ldc_demodulator.png' });
  });

  test('Capture 19 - Learn Page Interactive Theory & KaTeX', async ({ page }) => {
    await page.goto('/learn');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'docs/assets/screenshots/19_learn_interactive_theory.png' });
  });

  test('Capture 20 - About Page Empirical Validation', async ({ page }) => {
    await page.goto('/about');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'docs/assets/screenshots/20_about_empirical_validation.png' });
  });
});
