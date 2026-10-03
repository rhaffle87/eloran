import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.resolve(process.cwd(), 'docs', 'assets', 'screenshots');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

test.describe('Simuloran User Guide Visual Capture', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('01 - Home Dashboard & Presets', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT_DIR, '01_home_dashboard.png') });

    // Scroll to preset scenarios
    const presetHeading = page.getByRole('heading', { name: /Scenario Presets/i });
    if (await presetHeading.isVisible()) {
      await presetHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, '02_preset_scenarios_grid.png') });
    }
  });

  test('02 - Loran-C Hyperbolic Map & Chain Design', async ({ page }) => {
    await page.goto('/loran-c');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, '03_loran_c_hyperbolic_map.png') });

    const loranSidebar = page.locator('[data-testid="sidebar-content"]');
    if (await loranSidebar.isVisible()) {
      await loranSidebar.screenshot({ path: path.join(OUT_DIR, '04_chain_design_panel.png') });
    }
  });

  test('03 - eLoran All-in-View Map & Sidebars', async ({ page }) => {
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, '05_eloran_all_in_view_map.png') });

    // Station Editor Add Modal
    const addStationBtn = page.getByRole('button', { name: /Add Station/i });
    if (await addStationBtn.isVisible()) {
      await addStationBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT_DIR, '06_station_editor_add_modal.png') });
      const cancelBtn = page.getByRole('button', { name: /Cancel/i });
      if (await cancelBtn.isVisible()) await cancelBtn.click();
      await page.waitForTimeout(300);
    }

    const eloranSidebar = page.locator('[data-testid="sidebar-content"]');

    // ASF Tab
    const asfTab = page.getByRole('button', { name: /^ASF$/i });
    if (await asfTab.isVisible()) {
      await asfTab.click();
      await page.waitForTimeout(400);
      if (await eloranSidebar.isVisible()) {
        await eloranSidebar.screenshot({ path: path.join(OUT_DIR, '08_asf_millington_panel.png') });
      }
    }

    // Clocks Tab
    const clocksTab = page.getByRole('button', { name: /^Clocks$/i });
    if (await clocksTab.isVisible()) {
      await clocksTab.click();
      await page.waitForTimeout(400);
      if (await eloranSidebar.isVisible()) {
        await eloranSidebar.screenshot({ path: path.join(OUT_DIR, '09_clocks_allan_variance.png') });
      }
    }

    // Fusion Tab
    const fusionTab = page.getByRole('button', { name: /^Fusion$/i });
    if (await fusionTab.isVisible()) {
      await fusionTab.click();
      await page.waitForTimeout(400);
      if (await eloranSidebar.isVisible()) {
        await eloranSidebar.screenshot({ path: path.join(OUT_DIR, '10_sensor_fusion_resilience.png') });
      }
    }

    // Trajectory Tab
    const trajTab = page.getByRole('button', { name: /^Trajectory$/i });
    if (await trajTab.isVisible()) {
      await trajTab.click();
      await page.waitForTimeout(400);
      if (await eloranSidebar.isVisible()) {
        await eloranSidebar.screenshot({ path: path.join(OUT_DIR, '11_trajectory_flight_planner.png') });
      }
    }

    // Layers Tab / GDOP
    const layersTab = page.locator('button[aria-label="Layers"], button:has-text("Layers")').first();
    if (await layersTab.isVisible()) {
      await layersTab.click();
      await page.waitForTimeout(400);
      const gdopToggle = page.locator('label:has-text("Live GDOP Coverage Overlay"), label:has-text("GDOP")').first();
      if (await gdopToggle.isVisible()) {
        await gdopToggle.click();
        await page.waitForTimeout(1000);
      }
      await page.screenshot({ path: path.join(OUT_DIR, '07_gdop_heatmap_contours.png') });
    }
  });

  test('04 - Telemetry Console & NMEA Modal', async ({ page }) => {
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    });
    await page.waitForTimeout(800);

    const expandTelemetryBtn = page.locator('button[title*="Telemetry"], button[aria-label*="Telemetry"], button:has-text("TELEMETRY")').first();
    if (await expandTelemetryBtn.isVisible()) {
      await expandTelemetryBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, '12_telemetry_console_expanded.png') });

      // NMEA Terminal Modal
      const terminalBtn = page.locator('button[title*="NMEA"], button:has-text("NMEA"), button:has-text("Terminal")').first();
      if (await terminalBtn.isVisible()) {
        await terminalBtn.click({ force: true });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(OUT_DIR, '13_nmea_terminal_modal.png') });
      }
    }
  });

  test('05 - RF Waveforms Workbench Labs', async ({ page }) => {
    await page.goto('/waveforms');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    });
    await page.waitForTimeout(600);

    // Pulse Viewer
    const oscTab = page.getByRole('button', { name: /Oscilloscope|Pulse/i }).first();
    if (await oscTab.isVisible()) await oscTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, '14_rf_waveforms_pulse_viewer.png') });

    // Skywave Lab
    const skywaveTab = page.getByRole('button', { name: /Skywave/i }).first();
    if (await skywaveTab.isVisible()) {
      await skywaveTab.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, '15_rf_waveforms_skywave_lab.png') });
    }

    // Cycle Selection
    const cycleTab = page.getByRole('button', { name: /Cycle Selection/i }).first();
    if (await cycleTab.isVisible()) {
      await cycleTab.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, '16_rf_waveforms_cycle_selection.png') });
    }

    // SDR Lab
    const sdrTab = page.getByRole('button', { name: /SDR/i }).first();
    if (await sdrTab.isVisible()) {
      await sdrTab.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, '17_rf_waveforms_sdr_lab.png') });
    }

    // LDC Demodulator
    const ldcTab = page.getByRole('button', { name: /LDC/i }).first();
    if (await ldcTab.isVisible()) {
      await ldcTab.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, '18_rf_waveforms_ldc_demodulator.png') });
    }
  });

  test('06 - Learn Theory & About Validation', async ({ page }) => {
    await page.goto('/learn');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT_DIR, '19_learn_interactive_theory.png') });

    await page.goto('/about');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT_DIR, '20_about_empirical_validation.png') });
  });
});
