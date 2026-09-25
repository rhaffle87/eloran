import { test, expect } from '@playwright/test';

test.describe('Marker to Baseline Alignment Suite', () => {
  test('station pin circle centers match true map.project geographic coordinates and baseline endpoints within 1px', async ({ page }) => {
    await page.goto('/loran-c', { waitUntil: 'domcontentloaded' });

    // Wait for MapLibre instance, station markers, and baseline GeoJSON layer to initialize
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      const markers = document.querySelectorAll('.station-marker');
      const baselineFeatures = window.__baselineGeoJson?.features;
      return Boolean(map && markers.length >= 3 && baselineFeatures && baselineFeatures.length > 0);
    }, { timeout: 15000 });

    // Allow map projection & layout rendering to settle
    await page.waitForTimeout(2000);

    const auditData = await page.evaluate(() => {
      const map = window.__maplibreInstance;
      const canvas = map.getCanvas();
      const canvasRect = canvas.getBoundingClientRect();
      const markers = document.querySelectorAll('.station-marker');

      // Query baseline GeoJSON source directly
      const baselineFeatures = window.__baselineGeoJson?.features || [];

      const results = [];

      markers.forEach((markerEl) => {
        const dot = markerEl.querySelector('.station-pin-dot') || markerEl.firstElementChild;
        const tag = markerEl.querySelector('.station-pin-label') || markerEl.lastElementChild;
        const label = markerEl.dataset.label || (tag ? tag.innerText.trim() : '');
        const lng = parseFloat(markerEl.dataset.lng);
        const lat = parseFloat(markerEl.dataset.lat);
        const type = markerEl.dataset.type;

        const dotRect = dot.getBoundingClientRect();
        // Physical screen pixel center of the rendered circular pin, relative to map canvas
        const dotScreenCenter = {
          x: (dotRect.left + dotRect.width / 2) - canvasRect.left,
          y: (dotRect.top + dotRect.height / 2) - canvasRect.top,
        };

        // True mathematical geographic projection via MapLibre GL
        const expectedProjected = map.project([lng, lat]);

        // Find corresponding endpoint in baseline layer features
        let baselineCoord = null;
        if (type === 'master') {
          // Master is start vertex (index 0) of the baseline lines
          const feature = baselineFeatures.find((f) => f.geometry?.coordinates?.length >= 2);
          if (feature) {
            baselineCoord = feature.geometry.coordinates[0];
          }
        } else if (type === 'slave') {
          // Secondary is vertex 1 of the baseline line matching this secondary
          const feature = baselineFeatures.find(
            (f) => f.properties?.label?.includes(label) || f.properties?.id?.includes(label)
          );
          if (feature) {
            baselineCoord = feature.geometry.coordinates[1];
          } else {
            for (const f of baselineFeatures) {
              const pt = f.geometry?.coordinates?.[1];
              if (pt && Math.abs(pt[0] - lng) < 1e-4 && Math.abs(pt[1] - lat) < 1e-4) {
                baselineCoord = pt;
                break;
              }
            }
          }
        }

        let baselineProjected = null;
        let diffBaselineMarkerX = null;
        let diffBaselineMarkerY = null;
        let diffBaselineProjX = null;
        let diffBaselineProjY = null;

        if (baselineCoord) {
          baselineProjected = map.project(baselineCoord);
          diffBaselineMarkerX = Math.abs(dotScreenCenter.x - baselineProjected.x);
          diffBaselineMarkerY = Math.abs(dotScreenCenter.y - baselineProjected.y);
          diffBaselineProjX = Math.abs(baselineProjected.x - expectedProjected.x);
          diffBaselineProjY = Math.abs(baselineProjected.y - expectedProjected.y);
        }

        const diffMarkerProjX = Math.abs(dotScreenCenter.x - expectedProjected.x);
        const diffMarkerProjY = Math.abs(dotScreenCenter.y - expectedProjected.y);

        results.push({
          label,
          type,
          coords: [lng, lat],
          dotScreenCenter: {
            x: Number(dotScreenCenter.x.toFixed(3)),
            y: Number(dotScreenCenter.y.toFixed(3)),
          },
          expectedProjected: {
            x: Number(expectedProjected.x.toFixed(3)),
            y: Number(expectedProjected.y.toFixed(3)),
          },
          baselineProjected: baselineProjected
            ? {
                x: Number(baselineProjected.x.toFixed(3)),
                y: Number(baselineProjected.y.toFixed(3)),
              }
            : null,
          diffMarkerProjX: Number(diffMarkerProjX.toFixed(3)),
          diffMarkerProjY: Number(diffMarkerProjY.toFixed(3)),
          diffBaselineMarkerX: diffBaselineMarkerX !== null ? Number(diffBaselineMarkerX.toFixed(3)) : null,
          diffBaselineMarkerY: diffBaselineMarkerY !== null ? Number(diffBaselineMarkerY.toFixed(3)) : null,
          diffBaselineProjX: diffBaselineProjX !== null ? Number(diffBaselineProjX.toFixed(3)) : null,
          diffBaselineProjY: diffBaselineProjY !== null ? Number(diffBaselineProjY.toFixed(3)) : null,
        });
      });

      return {
        results,
        baselineFeatureCount: baselineFeatures.length,
      };
    });

    console.log('Rigorous Marker-to-Projection & Baseline Alignment Results:');
    console.log(JSON.stringify(auditData, null, 2));

    expect(auditData.results.length).toBeGreaterThanOrEqual(3);
    expect(auditData.baselineFeatureCount).toBeGreaterThan(0);

    for (const item of auditData.results) {
      // 1. Assertion: Pin screen center must match map.project([lng, lat]) within 1.0px (subpixel boundary)
      expect(
        item.diffMarkerProjX,
        `Station ${item.label} X offset between DOM pin center and true map.project projection`
      ).toBeLessThanOrEqual(1.0);
      expect(
        item.diffMarkerProjY,
        `Station ${item.label} Y offset between DOM pin center and true map.project projection`
      ).toBeLessThanOrEqual(1.0);

      // 2. Assertion: If transmitter is part of baseline layer, baseline endpoint must match pin screen center within 1.0px
      if (item.baselineProjected) {
        expect(
          item.diffBaselineMarkerX,
          `Station ${item.label} X offset between baseline layer endpoint and DOM pin center`
        ).toBeLessThanOrEqual(1.0);
        expect(
          item.diffBaselineMarkerY,
          `Station ${item.label} Y offset between baseline layer endpoint and DOM pin center`
        ).toBeLessThanOrEqual(1.0);

        // 3. Assertion: Baseline source coordinate must match map.project([lng, lat]) within 0.1px
        expect(
          item.diffBaselineProjX,
          `Station ${item.label} baseline source coordinate drift against station coordinate`
        ).toBeLessThanOrEqual(0.1);
        expect(
          item.diffBaselineProjY,
          `Station ${item.label} baseline source coordinate drift against station coordinate`
        ).toBeLessThanOrEqual(0.1);
      }
    }
  });
});
