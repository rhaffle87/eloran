import React, { useState } from 'react';
import { Activity, Layers, Cpu, ShieldAlert, Zap, Radio, Clock } from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import { computeGridAsync, sampleAsfRasterAsync } from '../../workers/workerClient.js';
import { wgs84ToMercator, mercatorToWgs84, REFRACTIVE_INDEX_PRESETS } from '../../lib/geodesy.js';
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
    receiverFixes,
    selectedReceiver,
    toggleBaselines,
    toggleLops,
    toggleGdopLayer,
    updateSettings,
    setGridStatus,
    setContours,
    simTimeSec,
  } = useSimulationStore();

  const [isComputing, setIsComputing] = useState(false);

  const activeFix = receiverFixes[selectedReceiver] || Object.values(receiverFixes)[0];

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

      {/* Real-Time Positioning Fix Telemetry Card */}
      {activeFix && (
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3 text-xs font-mono space-y-2">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
            <span className="text-zinc-400 font-bold uppercase text-[11px] flex items-center gap-1.5">
              <Cpu size={13} className="text-cyan-400" />
              PNT Solution ({activeFix.solverMode?.toUpperCase() || 'PNT'})
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
              {activeFix.converged ? 'CONVERGED' : 'ITERATING'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-zinc-500 block text-[10px]">FIX POSITION</span>
              <span className="text-zinc-200">
                {activeFix.lat?.toFixed(5)}°, {activeFix.lng?.toFixed(5)}°
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px]">RADIAL ERROR</span>
              <span className={`font-bold ${activeFix.errorMeters < 20 ? 'text-emerald-400' : activeFix.errorMeters < 100 ? 'text-amber-400' : 'text-red-400'}`}>
                {activeFix.errorMeters ? `${activeFix.errorMeters.toFixed(1)} m` : '< 1 m'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px]">RECEIVER BIAS (b_rx)</span>
              <span className="text-cyan-300 font-bold">
                {activeFix.clockBiasNs !== undefined ? `${activeFix.clockBiasNs.toFixed(1)} ns` : '0.0 ns'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px]" title="Simplified k×σ estimate — NOT a formal integrity bound per RTCM MPS">HPL (simplified 3σ) ⓘ</span>
              <span className="text-zinc-300">
                {activeFix.hplMeters?.toFixed(1) || '0.0'} m
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px]">HDOP / TDOP</span>
              <span className="text-zinc-300">
                {activeFix.hdop?.toFixed(2) || '1.00'} / {activeFix.tdop?.toFixed(2) || '1.00'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px]">RESIDUAL (RMS)</span>
              <span className="text-zinc-300">
                {activeFix.residualMeters?.toFixed(2) || '0.00'} m
              </span>
            </div>
          </div>
        </div>
      )}

      {/* PNT Solver Algorithm Selection */}
      <div className="space-y-2 pt-2 border-t border-zinc-800/80">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
          PNT Solver Architecture
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <button
            onClick={() => updateSettings({ solverMode: 'pseudorange' })}
            className={`p-2 rounded border text-left transition flex flex-col gap-1 ${
              settings.solverMode === 'pseudorange'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <span className="font-bold">Pseudorange (2D + Clock Bias)</span>
            <span className="text-[10px] text-zinc-500 leading-tight">
              Estimates 2D position (x, y) and receiver clock bias b_rx. Supports multi-chain.
            </span>
          </button>

          <button
            onClick={() => updateSettings({ solverMode: 'tdoa' })}
            className={`p-2 rounded border text-left transition flex flex-col gap-1 ${
              settings.solverMode === 'tdoa'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <span className="font-bold">Hyperbolic TDOA</span>
            <span className="text-[10px] text-zinc-500 leading-tight">
              Classic master-differenced pairs. Assumes ideal sync.
            </span>
          </button>
        </div>
      </div>

      {/* Standards & Atmospheric Refraction (Primary Factor η) */}
      <div className="space-y-2 pt-2 border-t border-zinc-800/80">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
          Primary Factor Refractive Index (η)
        </label>
        <select
          value={settings.refractiveIndex}
          onChange={(e) => updateSettings({ refractiveIndex: parseFloat(e.target.value) })}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono"
        >
          {Object.values(REFRACTIVE_INDEX_PRESETS).map((p) => (
            <option key={p.id} value={p.value}>
              {p.name} (η = {p.value})
            </option>
          ))}
        </select>
        <p className="text-[10px] text-zinc-500">
          Propagation speed v = c / η. Differences between RTCM (1.000338) and Handbook (1.000284) yield ~0.18 µs delay over 1000 km.
        </p>

        <Toggle
          label="Secondary Factor (SF) Seawater Delay"
          description="Brunavs empirical seawater propagation model (sigma = 5 S/m)"
          checked={settings.enableSecondaryFactor}
          onChange={(checked) => updateSettings({ enableSecondaryFactor: checked })}
        />
      </div>

      {/* Cycle Slip / Wrong-Cycle Selection Simulation (Boyce 2006) */}
      <div className="space-y-2 pt-2 border-t border-zinc-800/80">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
            Cycle Slip & Noise Model
          </label>
          {settings.enableCycleSlips && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-mono">
              <ShieldAlert size={11} /> 10 µs Slip Active
            </span>
          )}
        </div>

        <Toggle
          label="Simulate Carrier Cycle Slips"
          description="Triggers wrong-cycle selection (±10 µs / ~3 km error) when SNR is degraded"
          checked={settings.enableCycleSlips}
          onChange={(checked) => updateSettings({ enableCycleSlips: checked })}
        />

        {settings.enableCycleSlips && (
          <div className="space-y-2 pl-2 border-l-2 border-amber-500/40">
            <Slider
              label="Receiver RF SNR"
              value={settings.snrDb || 18}
              min={-5}
              max={30}
              step={1}
              unit="dB"
              tooltip="Lower SNR increases wrong-cycle selection probability"
              onChange={(val) => updateSettings({ snrDb: val })}
            />
            <Slider
              label="Pulse Integration Count"
              value={settings.pulsesAveraged || 10}
              min={1}
              max={50}
              step={1}
              unit="pulses"
              tooltip="Number of pulses averaged per GRI to suppress noise"
              onChange={(val) => updateSettings({ pulsesAveraged: val })}
            />
          </div>
        )}
      </div>

      {/* Layer Visibility Toggles */}
      <div className="space-y-3 pt-2 border-t border-zinc-800/80">
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
          Grid Mesh & Decimation
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
