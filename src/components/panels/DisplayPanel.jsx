import React, { useState } from 'react';
import { Activity, Layers, Play, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import { computeGridAsync, sampleAsfRasterAsync } from '../../workers/workerClient.js';
import { wgs84ToMercator, mercatorToWgs84 } from '../../lib/geodesy.js';
import { simplifyRDP } from '../../lib/contours.js';
import Toggle from '../ui/Toggle.jsx';
import Slider from '../ui/Slider.jsx';

export default function DisplayPanel({ isELoran = false }) {
  const {
    masters,
    slaves,
    receivers,
    baselinesVisible,
    lopsVisible,
    gdopLayerVisible,
    settings,
    toggleBaselines,
    toggleLops,
    toggleGdopLayer,
    updateSettings,
    setGridStatus,
    setContours,
    simTimeSec,
  } = useSimulationStore();

  const [isComputing, setIsComputing] = useState(false);

  const handleComputeContours = async () => {
    if (!masters.length || !slaves.length) {
      alert('Simulation requires at least 1 Master and 1 Secondary station.');
      return;
    }

    setIsComputing(true);
    setGridStatus({ status: 'computing' });

    try {
      // Calculate geographic bounding box in EPSG:3857 meters
      const all = [...masters, ...slaves, ...receivers];
      const lats = all.map((a) => a.lat);
      const lngs = all.map((a) => a.lng);

      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      const padX = Math.max((maxLng - minLng) * 0.4, 0.05);
      const padY = Math.max((maxLat - minLat) * 0.4, 0.05);

      const bl = wgs84ToMercator([minLng - padX, minLat - padY]);
      const tr = wgs84ToMercator([maxLng + padX, maxLat + padY]);
      const gridBounds = { minX: bl[0], minY: bl[1], maxX: tr[0], maxY: tr[1] };

      const nx = settings.gridResolution || 180;
      const ny = settings.gridResolution || 180;

      // Convert stations to EPSG:3857 coordinates
      const mMeters = masters.map((m) => {
        const xy = wgs84ToMercator([m.lng, m.lat]);
        return {
          x: xy[0],
          y: xy[1],
          label: m.label,
          asfMeters: m.asfMeters || 0,
          diffCorrections: m.diffCorrections,
          clock: m.clock,
          offsetSec: m.offsetSec || 0,
        };
      });

      const sMeters = slaves.map((s) => {
        const xy = wgs84ToMercator([s.lng, s.lat]);
        return {
          x: xy[0],
          y: xy[1],
          label: s.label,
          asfMeters: s.asfMeters || 0,
          diffCorrections: s.diffCorrections,
          clock: s.clock,
          offsetSec: s.offsetSec || 0,
        };
      });

      // Compute typical inter-station spacing to set hyperbolic contour intervals
      let maxDist = 0;
      for (const m of mMeters) {
        for (const s of sMeters) {
          const d = Math.hypot(m.x - s.x, m.y - s.y);
          if (d > maxDist) maxDist = d;
        }
      }
      const step = Math.max(100, maxDist / 12);
      const levelsMeters = [];
      for (let k = -8; k <= 8; k++) levelsMeters.push(k * step);

      // Pre-sample ASF rasters if formula is defined
      const asfRasters = [];
      if (isELoran) {
        for (const m of masters) {
          if (m.asfFormula && m.asfFormula !== '0') {
            const dx = (gridBounds.maxX - gridBounds.minX) / (nx - 1);
            const dy = (gridBounds.maxY - gridBounds.minY) / (ny - 1);
            const latArr = new Float64Array(nx * ny);
            const lngArr = new Float64Array(nx * ny);
            let idx = 0;
            for (let j = 0; j < ny; j++) {
              const y = gridBounds.minY + j * dy;
              for (let i = 0; i < nx; i++, idx++) {
                const x = gridBounds.minX + i * dx;
                const [lng, lat] = mercatorToWgs84([x, y]);
                latArr[idx] = lat;
                lngArr[idx] = lng;
              }
            }
            try {
              const raster = await sampleAsfRasterAsync(m.asfFormula, latArr, lngArr, nx, ny);
              asfRasters.push(raster.buffer);
            } catch {
              asfRasters.push(null);
            }
          } else {
            asfRasters.push(null);
          }
        }
      }

      // Compute TDOA grid and marching squares contours in worker
      const result = await computeGridAsync({
        masters: mMeters,
        slaves: sMeters,
        gridBounds,
        nx,
        ny,
        simTimeSec,
        asfRasters,
        levelsMeters,
      });

      // Simplify and convert contours back to geographic [lng, lat]
      const simplified = result.contours.map((c) => {
        const simp =
          settings.contourEpsilonMeters > 0
            ? simplifyRDP(c.points, settings.contourEpsilonMeters)
            : c.points;

        const coords = simp.map(([x, y]) => mercatorToWgs84([x, y]));
        return {
          ...c,
          points: coords,
        };
      });

      setContours(simplified);
      setGridStatus({ status: 'ready', computedAt: Date.now() });
    } catch (err) {
      console.error('Grid computation failed:', err);
      setGridStatus({ status: 'error', message: err.message });
    } finally {
      setIsComputing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Compute Contours Action */}
      <button
        onClick={handleComputeContours}
        disabled={isComputing}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-black font-semibold rounded-lg font-mono text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 transition"
      >
        <Activity size={15} className={isComputing ? 'animate-spin' : ''} />
        {isComputing ? 'Computing Grid Off-Thread...' : 'Generate LOP Contours'}
      </button>

      {/* Layer Visibility Toggles */}
      <div className="space-y-3 pt-2">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
          Map Visual Layers
        </label>

        <Toggle
          label="Hyperbolic Lines of Position (LOP)"
          description="Display zero and equidistant TDOA isochrones"
          checked={lopsVisible}
          onChange={toggleLops}
        />

        <Toggle
          label="Baseline Station Vectors"
          description="Show dashed baseline links and extended lines beyond secondaries"
          checked={baselinesVisible}
          onChange={toggleBaselines}
        />

        <Toggle
          label="Live GDOP Coverage Overlay"
          description="Display precision dilution readout and gradient coverage"
          checked={gdopLayerVisible}
          onChange={toggleGdopLayer}
        />
      </div>

      {/* Numerical Grid Settings */}
      <div className="space-y-3 pt-2 border-t border-zinc-800/80">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
          Solver & Resolution Parameters
        </label>

        <Slider
          label="Grid Mesh Density"
          value={settings.gridResolution}
          min={80}
          max={300}
          step={20}
          unit="cells"
          tooltip="Higher resolution gives sharper hyperbolas but requires more compute"
          onChange={(val) => updateSettings({ gridResolution: val })}
        />

        <Slider
          label="RDP Contour Decimation"
          value={settings.contourEpsilonMeters}
          min={0}
          max={25}
          step={1}
          unit="m"
          tooltip="Tolerance in meters for polyline vertex reduction"
          onChange={(val) => updateSettings({ contourEpsilonMeters: val })}
        />

        <div>
          <label className="block text-zinc-300 text-xs mb-1">Contour Display Units</label>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <button
              onClick={() => updateSettings({ contourUnit: 'meters' })}
              className={`py-1.5 rounded border transition ${
                settings.contourUnit === 'meters'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400'
              }`}
            >
              Meters (Range Δ)
            </button>
            <button
              onClick={() => updateSettings({ contourUnit: 'seconds' })}
              className={`py-1.5 rounded border transition ${
                settings.contourUnit === 'seconds'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400'
              }`}
            >
              Seconds (TDOA)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
