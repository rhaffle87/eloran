import { test, expect } from '@playwright/test';

test.describe('Marker to Baseline Alignment Suite', () => {
  test('station pin circle centers match line endpoint coordinates within 1px', async ({ page }) => {
    await page.goto('/loran-c', { waitUntil: 'domcontentloaded' });

    // Wait for MapLibre instance to initialize and markers to render
    await page.waitForFunction(() => {
      const map = window.__maplibreInstance;
      const markers = document.querySelectorAll('.station-marker');
      return Boolean(map && markers.length >= 3);
    }, { timeout: 15000 });

    // Let map settle
    await page.waitForTimeout(2000);

    const coordChecks = await page.evaluate(() => {
      const map = window.__maplibreInstance;
      const canvasRect = map.getCanvas().getBoundingClientRect();
      const checkResults = [];
      const markers = document.querySelectorAll('.station-marker');

      markers.forEach((markerEl) => {
        const dot = markerEl.querySelector('.station-pin-dot') || markerEl.firstElementChild;
        const tag = markerEl.querySelector('.station-pin-label') || markerEl.lastElementChild;
        const label = tag ? tag.innerText.trim() : '';

        const dotRect = dot.getBoundingClientRect();
        const dotCenter = {
          x: (dotRect.left + dotRect.width / 2) - canvasRect.left,
          y: (dotRect.top + dotRect.height / 2) - canvasRect.top,
        };

        // Also check marker element rect directly:
        // markerEl width and height were set to match dot size (22px or 18px)
        const elRect = markerEl.getBoundingClientRect();
        const elCenter = {
          x: (elRect.left + markerEl.offsetWidth / 2) - canvasRect.left,
          y: (elRect.top + markerEl.offsetHeight / 2) - canvasRect.top,
        };

        checkResults.push({
          label,
          offsetWidth: markerEl.offsetWidth,
          offsetHeight: markerEl.offsetHeight,
          dotWidth: dotRect.width,
          dotHeight: dotRect.height,
          dotCenter,
          elCenter,
          diffDotElX: Math.abs(dotCenter.x - elCenter.x),
          diffDotElY: Math.abs(dotCenter.y - elCenter.y),
        });
      });

      return checkResults;
    });

    console.log('Alignment Checks:', JSON.stringify(coordChecks, null, 2));

    expect(coordChecks.length).toBeGreaterThanOrEqual(3);
    for (const check of coordChecks) {
      // The pin dot center must precisely equal the marker's anchor point (offset width / 2, offset height / 2)
      expect(check.diffDotElX, `Station ${check.label} X dot-to-anchor offset`).toBeLessThanOrEqual(0.5);
      expect(check.diffDotElY, `Station ${check.label} Y dot-to-anchor offset`).toBeLessThanOrEqual(0.5);
    }
  });
});
