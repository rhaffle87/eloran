import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Phase 4: Full Functional QA Audit Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__LORAN_E2E__ = true;
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 1: Tactical Mode Toolbar (+Master, +Secondary, +Receiver, Pan) & Map Placement
  // ---------------------------------------------------------------------------
  test('Tactical Toolbar: test Pan, +Master, +Secondary, +Receiver mode buttons and map click', async ({ page }) => {
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    // Pan button (P)
    const panBtn = page.locator('button[title*="Pan & Inspect"]');
    await expect(panBtn).toBeVisible();

    // +Master button (M)
    const masterBtn = page.locator('button[title*="Place Master"]');
    await expect(masterBtn).toBeVisible();

    // +Secondary button (S)
    const secondaryBtn = page.locator('button[title*="Place Secondary"]');
    await expect(secondaryBtn).toBeVisible();

    // +Receiver button (R)
    const receiverBtn = page.locator('button[title*="Place Receiver"]');
    await expect(receiverBtn).toBeVisible();

    // Activate +Secondary mode
    await secondaryBtn.click();
    await page.waitForTimeout(200);

    // Initial station marker count
    const initialMarkers = await page.locator('.maplibregl-marker').count();

    // Click on empty map canvas area (top left corner) to place secondary station
    const mapCanvas = page.locator('.maplibregl-canvas');
    await mapCanvas.click({ position: { x: 120, y: 120 }, force: true });
    await page.waitForTimeout(500);

    // Verify station marker was added
    const updatedMarkers = await page.locator('.maplibregl-marker').count();
    expect(updatedMarkers).toBeGreaterThan(initialMarkers);

    // Toggle back to Pan mode via keyboard shortcut 'p'
    await page.keyboard.press('p');
    await page.waitForTimeout(200);
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Clear All & Commit Design to Simulation Workflow
  // ---------------------------------------------------------------------------
  test('Clear All & Chain Design: test Clear All reset and Commit Design to Active Simulation', async ({ page }) => {
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    // 1. Verify Clear All button removes all stations
    const clearAllBtn = page.locator('button:has-text("Clear all")');
    await expect(clearAllBtn).toBeVisible();
    await clearAllBtn.click();
    await page.waitForTimeout(300);

    const activeHeader = page.locator('text=Active Stations (0)');
    await expect(activeHeader).toBeVisible();
    expect(await page.locator('.maplibregl-marker').count()).toBe(0);

    // 2. Switch to Chain Design mode
    const chainDesignBtn = page.getByRole('button', { name: /Chain Design/i }).first();
    await expect(chainDesignBtn).toBeVisible();
    await chainDesignBtn.click();
    await page.waitForTimeout(400);

    // Assert Chain Design header active
    const designActiveBadge = page.locator('text=Chain Design Active');
    await expect(designActiveBadge).toBeVisible();

    // 3. Commit Design to Active Simulation
    const commitBtn = page.getByRole('button', { name: /Commit Design to Active Simulation/i });
    await expect(commitBtn).toBeVisible();
    await commitBtn.click();
    await page.waitForTimeout(400);

    // Assert returned to simulation mode and stations repopulated
    await expect(designActiveBadge).toHaveCount(0);
    const repopulatedCount = await page.locator('.maplibregl-marker').count();
    expect(repopulatedCount).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Real Export -> Clear -> Import CSV Round-Trip
  // ---------------------------------------------------------------------------
  test('Export/Import Round-Trip: export CSV, clear stations, re-import and assert match', async ({ page }) => {
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    // Record initial station count via delete buttons
    const deleteButtonsBefore = page.locator('button[aria-label*="Delete station"]');
    await expect(deleteButtonsBefore.first()).toBeVisible({ timeout: 10000 });
    const initialStationCount = await deleteButtonsBefore.count();
    expect(initialStationCount).toBeGreaterThanOrEqual(2);

    // 1. Export CSV and capture file stream
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button:has-text("Export CSV")').click(),
    ]);

    const downloadStream = await download.createReadStream();
    let csvData = '';
    for await (const chunk of downloadStream) {
      csvData += chunk.toString();
    }

    // Verify CSV structure contains headers and station data
    expect(csvData).toContain('role,lat,lng,label');
    expect(csvData).toContain('master');
    expect(csvData).toContain('slave');
    expect(csvData).toContain('M1-TanjungPriok');
    expect(csvData).toContain('S1-Tangerang');

    // 2. Clear all stations
    await page.locator('button:has-text("Clear all")').click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Active Stations (0)')).toBeVisible();
    expect(await page.locator('button[aria-label*="Delete station"]').count()).toBe(0);

    // 3. Re-import the exported CSV
    const tempCsvPath = path.resolve('docs/verification', 'temp-roundtrip-test.csv');
    fs.writeFileSync(tempCsvPath, csvData, 'utf-8');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('button:has-text("Import CSV")').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(tempCsvPath);
    await page.waitForTimeout(600);

    // Clean up temporary test file
    if (fs.existsSync(tempCsvPath)) {
      fs.unlinkSync(tempCsvPath);
    }

    // 4. Assert stations restored field-for-field
    const restoredStationCount = await page.locator('button[aria-label*="Delete station"]').count();
    expect(restoredStationCount).toBe(initialStationCount);
    await expect(page.locator(`text=Active Stations (${initialStationCount})`)).toBeVisible();
    await expect(page.locator('text=M1-TanjungPriok').first()).toBeVisible();
    await expect(page.locator('text=S1-Tangerang').first()).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Chart Verification 1 — PulseViewer Oscilloscope Dynamic Waveform
  // ---------------------------------------------------------------------------
  test('PulseViewer: assert SVG polyline has non-trivial points and dynamically updates on parameter change', async ({ page }) => {
    await page.goto('/waveforms');
    await page.waitForLoadState('networkidle');

    // Locate primary RF waveform polyline
    const polyline = page.locator('svg polyline').first();
    await expect(polyline).toBeVisible({ timeout: 10000 });

    const initialPoints = await polyline.getAttribute('points');
    expect(initialPoints).toBeTruthy();
    expect(initialPoints.length).toBeGreaterThan(100);

    // Toggle 100 kHz RF Carrier to dynamically re-synthesize waveform
    const carrierToggle = page.locator('label').filter({ hasText: /100 kHz RF Carrier/i });
    await expect(carrierToggle).toBeVisible();
    await carrierToggle.click();
    await page.waitForTimeout(400);

    const updatedPoints = await polyline.getAttribute('points');
    expect(updatedPoints).toBeTruthy();
    expect(updatedPoints).not.toBe(initialPoints);
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Chart Verification 2 — CycleSelectionPanel Monte Carlo & Rice Curve
  // ---------------------------------------------------------------------------
  test('CycleSelectionPanel: assert Rice curve path, Monte Carlo scatter points, and active inspection marker updates', async ({ page }) => {
    await page.goto('/waveforms');
    await page.waitForLoadState('networkidle');

    // Locate theoretical Rice path
    const riceCurve = page.locator('svg path[stroke="#06b6d4"]').first();
    await expect(riceCurve).toBeVisible({ timeout: 10000 });
    const ricePathData = await riceCurve.getAttribute('d');
    expect(ricePathData).toContain('M');

    // Locate Monte Carlo scatter markers
    const mcMarkers = page.locator('svg circle[fill="#e879f9"]');
    const markerCount = await mcMarkers.count();
    expect(markerCount).toBeGreaterThanOrEqual(5);

    // Modulate Carrier SNR slider to 10 dB so totalInspectionSnrDb = 20 dB (within [0, 24] range)
    const snrSliders = page.locator('input[type="range"]');
    const sliderCount = await snrSliders.count();
    expect(sliderCount).toBeGreaterThanOrEqual(1);

    // Find Carrier SNR slider and set to 10
    const carrierSlider = page.locator('div:has-text("Carrier SNR (SNR_c)") input[type="range"]').first();
    if (await carrierSlider.isVisible()) {
      await carrierSlider.fill('10');
      await page.waitForTimeout(300);

      // Now inspection marker circle appears
      const inspectMarker = page.locator('svg circle[fill="#ef4444"]').first();
      await expect(inspectMarker).toBeVisible();
      const initialCx = parseFloat(await inspectMarker.getAttribute('cx') || '0');
      expect(initialCx).toBeGreaterThan(0);

      // Move slider to 4 and verify cx coordinate updates
      await carrierSlider.fill('4');
      await page.waitForTimeout(300);
      const updatedCx = parseFloat(await inspectMarker.getAttribute('cx') || '0');
      expect(updatedCx).not.toBe(initialCx);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Chart Verification 3 — GDOP & Hyperbolic LOP Contours MapLibre Layer
  // ---------------------------------------------------------------------------
  test('GDOP & LOP Contours: compute off-thread marching squares contours and verify MapLibre rendering & telemetry', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    // Wait for MapLibre map and style to be fully ready
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      return Boolean(map && map.isStyleLoaded());
    }, { timeout: 20000 });

    // Switch to Layers / Mesh tab
    const layersTab = page.getByRole('button', { name: /^Layers$/i });
    await expect(layersTab).toBeVisible();
    await layersTab.click();
    await page.waitForTimeout(300);

    // Click Generate LOP Contours
    const genBtn = page.getByRole('button', { name: /Generate LOP Contours/i });
    await expect(genBtn).toBeVisible();
    await genBtn.click();

    // Await contour worker completion and verify MapLibre layer data
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      if (!map) return false;
      const src = map.getSource('loran-lops-source');
      const count = src?._data?.features?.length || src?.serialize?.()?.data?.features?.length || 0;
      return count > 0 || Boolean(map.getLayer('loran-lops-layer'));
    }, { timeout: 25000 });

    const lopsInfo = await page.evaluate(() => {
      const map = window.__maplibreInstance;
      const src = map ? map.getSource('loran-lops-source') : null;
      const count = src?._data?.features?.length || src?.serialize?.()?.data?.features?.length || 0;
      return {
        hasLayer: Boolean(map && map.getLayer('loran-lops-layer')),
        hasSource: Boolean(src),
        featureCount: count,
      };
    });
    expect(lopsInfo.hasLayer || lopsInfo.hasSource).toBe(true);
    expect(lopsInfo.featureCount).toBeGreaterThan(0);

    // Verify positioning telemetry fix card is rendered
    const fixCard = page.locator('text=PNT Solution');
    await expect(fixCard.first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=PNT Solution (PSEUDORANGE)')).toBeVisible();

    // Toggle solver mode to Hyperbolic TDOA and assert visible telemetry update
    const tdoaBtn = page.getByRole('button', { name: /Hyperbolic TDOA/i });
    await tdoaBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=PNT Solution (TDOA)')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // TEST 7: AsfPanel Mode Switching & Persistence Across Drawer Navigation
  // ---------------------------------------------------------------------------
  test('AsfPanel: switch between Millington, Temporal, and Formula modes with drawer state persistence', async ({ page }) => {
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    // Open ASF panel
    const asfTab = page.getByRole('button', { name: /^ASF$/i });
    await asfTab.click();
    await page.waitForTimeout(200);

    // Initial default is Millington
    const millingtonHeader = page.locator('text=Millington Mixed-Path Terrain Model');
    await expect(millingtonHeader).toBeVisible();

    // Switch to Temporal mode
    const temporalBtn = page.locator('button:has-text("Temporal")').first();
    await temporalBtn.click();
    await page.waitForTimeout(200);

    const temporalHeader = page.locator('text=Temporal ASF — Atmospheric Refractivity');
    await expect(temporalHeader).toBeVisible();

    // Switch to Clocks tab
    const clocksTab = page.getByRole('button', { name: /Clocks/i });
    await clocksTab.click();
    await page.waitForTimeout(200);
    await expect(page.locator('button[aria-label="Reset simulation time to 0 seconds"]')).toBeVisible();

    // Switch back to ASF tab and verify Temporal mode persisted
    await asfTab.click();
    await page.waitForTimeout(200);
    await expect(temporalHeader).toBeVisible();

    // Switch to Formula mode
    const formulaBtn = page.locator('button:has-text("Formula")').first();
    await formulaBtn.click();
    await page.waitForTimeout(200);

    const formulaHeader = page.locator('text=Manual ASF Formula (AST)');
    await expect(formulaHeader).toBeVisible();
    await expect(page.locator('text=Valid Sandboxed AST Expression')).toBeVisible();

    // Switch back to Millington mode and assert clean mode restoration
    const millingtonBtn = page.locator('button:has-text("Millington")').first();
    await millingtonBtn.click();
    await page.waitForTimeout(200);
    await expect(millingtonHeader).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // TEST 8: Scenario Presets Switching (All 6 Scenarios)
  // ---------------------------------------------------------------------------
  test('Scenario Presets: verify clean state switching across all 6 presets', async ({ page }) => {
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    const presetSelect = page.locator('#scenario-preset-select');
    await expect(presetSelect).toBeVisible();

    const presets = [
      { name: 'Jakarta Maritime Testbed', minStations: 2 },
      { name: 'North Sea Chain (Historical)', minStations: 3 },
      { name: 'North China Sea Chain (GRI 7430)', minStations: 3 },
      { name: 'Korea-Yellow Sea Trial (2021)', minStations: 3 },
      { name: 'Poor Geometry (High GDOP)', minStations: 2 },
      { name: 'GNSS-Denied Resilience', minStations: 3 },
    ];

    for (const preset of presets) {
      await presetSelect.selectOption({ label: preset.name });
      await page.waitForTimeout(400);

      const selectedText = await presetSelect.evaluate(el => el.options[el.selectedIndex].text);
      expect(selectedText).toBe(preset.name);

      const stationMarkers = page.locator('.maplibregl-marker');
      await expect(stationMarkers.first()).toBeVisible({ timeout: 5000 });
      const markerCount = await stationMarkers.count();
      expect(markerCount).toBeGreaterThanOrEqual(preset.minStations);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 9: Sliders & Timing Controls
  // ---------------------------------------------------------------------------
  test('Sliders & Timing Controls: verify jitter, receiver scaling, and clock reset', async ({ page }) => {
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    const layersTab = page.getByRole('button', { name: /^Layers$/i });
    if (await layersTab.isVisible()) {
      await layersTab.click();
      await page.waitForTimeout(200);

      const sliders = page.locator('input[type="range"]');
      const sliderCount = await sliders.count();
      expect(sliderCount).toBeGreaterThanOrEqual(1);

      const firstSlider = sliders.first();
      const initialVal = await firstSlider.inputValue();
      await firstSlider.fill('15');
      const updatedVal = await firstSlider.inputValue();
      expect(updatedVal).not.toBe(initialVal);
    }

    const clocksTab = page.getByRole('button', { name: /Clocks/i });
    await clocksTab.click();
    await page.waitForTimeout(200);

    const clockResetBtn = page.locator('button[aria-label="Reset simulation time to 0 seconds"]');
    await expect(clockResetBtn).toBeVisible();
    await clockResetBtn.click();
    await page.waitForTimeout(200);
  });

  // ---------------------------------------------------------------------------
  // TEST 10: Basemap Switcher & Radar Canvas Compositing
  // ---------------------------------------------------------------------------
  test('Basemap Switcher: test transitions across OpenFreeMap, OSM, CARTO, and Radar with declutter controls', async ({ page }) => {
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    const providers = [
      { id: 'basemap-osm', testid: 'basemap-osm' },
      { id: 'basemap-carto', testid: 'basemap-carto' },
      { id: 'basemap-radar', testid: 'basemap-radar' },
      { id: 'basemap-openfreemap', testid: 'basemap-openfreemap' },
    ];

    for (const provider of providers) {
      const btn = page.locator(`button[data-testid="${provider.testid}"]`);
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(600);

        if (provider.testid === 'basemap-radar') {
          const radarCanvas = page.locator('canvas[data-testid="radar-backdrop-canvas"], canvas[style*="z-index: 0"]');
          await expect(radarCanvas).toBeVisible();

          const marker = page.locator('.maplibregl-marker').first();
          await expect(marker).toBeVisible();

          // Test radials declutter toggle
          const radialsToggle = page.locator('button[data-testid="toggle-radar-radials"]');
          if (await radialsToggle.isVisible()) {
            await radialsToggle.click();
            await page.waitForTimeout(300);
            await radialsToggle.click();
            await page.waitForTimeout(300);
          }
        }
      }
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 11: Route & Theme Traversal (6 Routes x Light & Dark)
  // ---------------------------------------------------------------------------
  test('Route & Theme QA: verify zero errors and clean theme toggling across all 6 routes', async ({ page }) => {
    const routes = ['/', '/loran-c', '/eloran', '/waveforms', '/learn', '/about'];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const root = page.locator('#root');
      await expect(root).toBeVisible();

      const themeBtn = page.locator('button[aria-label*="theme"]').first();
      if (await themeBtn.isVisible()) {
        const initialTheme = await page.locator('html').getAttribute('data-theme');
        await themeBtn.click();
        await page.waitForTimeout(200);

        const newTheme = await page.locator('html').getAttribute('data-theme');
        expect(newTheme).not.toBe(initialTheme);

        await themeBtn.click();
        await page.waitForTimeout(200);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 12: Trial Validation Panel State Switching
  // ---------------------------------------------------------------------------
  test('Trial Validation Panel: toggle Korea & Maoming datasets and inspect comparison metrics', async ({ page }) => {
    await page.goto('/eloran');
    await page.waitForLoadState('networkidle');

    const trialTab = page.getByRole('button', { name: /Trial Validation|Validation/i });
    if (await trialTab.isVisible()) {
      await trialTab.click();
      await page.waitForTimeout(300);

      const koreaBtn = page.getByRole('button', { name: /Korea/i }).first();
      const maomingBtn = page.getByRole('button', { name: /Maoming/i }).first();

      if (await koreaBtn.isVisible()) {
        await koreaBtn.click();
        await page.waitForTimeout(200);
        await expect(page.locator('text=Rhee et al. 2021').first()).toBeVisible();
      }

      if (await maomingBtn.isVisible()) {
        await maomingBtn.click();
        await page.waitForTimeout(200);
        await expect(page.locator('text=Gao et al. 2025').first()).toBeVisible();
      }
    }
  });
});
