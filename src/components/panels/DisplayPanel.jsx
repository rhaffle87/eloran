import React, { useState } from 'react';
import { Activity, Layers, Cpu, ShieldAlert, Zap, Radio, Clock, CheckCircle2 } from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import { computeGridAsync, sampleAsfRasterAsync } from '../../workers/workerClient.js';
import { wgs84ToMercator, mercatorToWgs84, REFRACTIVE_INDEX_PRESETS } from '../../lib/geodesy.js';
import { simplifyRDP } from '../../lib/contours.js';
import { computeToaNoiseStdDevMeters, DEFAULT_TOA_NOISE_PARAMS } from '../../lib/tdoa.js';
import {
  computeAustronWrongCycleProbability,
  computeTheoreticalRiceWrongCycleProbability,
} from '../../lib/pulse.js';
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
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[var(--accent-eloran)] hover:bg-[var(--accent-eloran-border)] disabled:opacity-50 text-black font-semibold rounded-lg font-mono text-xs uppercase tracking-wider shadow-lg  transition"
      >
        <Activity size={15} className={isComputing ? 'animate-spin' : ''} />
        {isComputing ? 'Computing Grid Off-Thread...' : 'Generate LOP Contours'}
      </button>

      {/* Real-Time Positioning Fix Telemetry Card */}
      {activeFix && (
        <div className="bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-lg p-3 text-xs font-mono space-y-2">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
            <span className="text-[var(--text-dim)] font-bold uppercase text-[11px] flex items-center gap-1.5">
              <Cpu size={13} className="text-[var(--accent-eloran)]" />
              PNT Solution ({activeFix.solverMode?.toUpperCase() || 'PNT'})
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] border border-[var(--accent-eloran-border)]">
              {activeFix.converged ? 'CONVERGED' : 'ITERATING'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-[var(--text-muted)] block text-[10px]">FIX POSITION</span>
              <span className="text-[var(--text-primary)]">
                {activeFix.lat?.toFixed(5)}┬░, {activeFix.lng?.toFixed(5)}┬░
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block text-[10px]">RADIAL ERROR</span>
              <span className={`font-bold ${activeFix.errorMeters < 20 ? 'text-[var(--status-ok)]' : activeFix.errorMeters < 100 ? 'text-[var(--accent-loran-c)]' : 'text-[var(--status-danger)]'}`}>
                {activeFix.errorMeters ? `${activeFix.errorMeters.toFixed(1)} m` : '< 1 m'}
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block text-[10px]">RECEIVER BIAS (b_rx)</span>
              <span className="text-[var(--accent-eloran)] font-bold">
                {activeFix.clockBiasNs !== undefined ? `${activeFix.clockBiasNs.toFixed(1)} ns` : '0.0 ns'}
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block text-[10px]" title="Simplified k├ù╧â estimate ΓÇö NOT a formal integrity bound per RTCM MPS">HPL (simplified 3╧â) Γôÿ</span>
              <span className="text-[var(--text-secondary)]">
                {activeFix.hplMeters?.toFixed(1) || '0.0'} m
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block text-[10px]">HDOP / TDOP</span>
              <span className="text-[var(--text-secondary)]">
                {activeFix.hdop?.toFixed(2) || '1.00'} / {activeFix.tdop?.toFixed(2) || '1.00'}
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block text-[10px]">RESIDUAL (RMS)</span>
              <span className="text-[var(--text-secondary)]">
                {activeFix.residualMeters?.toFixed(2) || '0.00'} m
              </span>
            </div>
            <div className="col-span-2 pt-1 border-t border-[var(--border-subtle)]/60 flex items-center justify-between text-[10px]">
              <span className="text-[var(--text-muted)]">Delay Model:</span>
              <span className={`font-mono ${settings.enableSecondaryFactor ? 'text-[var(--accent-loran-c)] font-semibold' : 'text-[var(--text-dim)]'}`}>
                {settings.enableSecondaryFactor
                  ? 'PF + SF + ASF (SF active)'
                  : 'Secondary Factor: off (UNVERIFIED model)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* PNT Solver Algorithm Selection */}
      <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
        <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider block">
          PNT Solver Architecture
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <button
            onClick={() => updateSettings({ solverMode: 'pseudorange' })}
            className={`p-2 rounded border text-left transition flex flex-col gap-1 ${
              settings.solverMode === 'pseudorange'
                ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)]'
                : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
            }`}
          >
            <span className="font-bold">Pseudorange (2D + Clock Bias)</span>
            <span className="text-[10px] text-[var(--text-muted)] leading-tight">
              Estimates 2D position (x, y) and receiver clock bias b_rx. Supports multi-chain.
            </span>
          </button>

          <button
            onClick={() => updateSettings({ solverMode: 'tdoa' })}
            className={`p-2 rounded border text-left transition flex flex-col gap-1 ${
              settings.solverMode === 'tdoa'
                ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)]'
                : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
            }`}
          >
            <span className="font-bold">Hyperbolic TDOA</span>
            <span className="text-[10px] text-[var(--text-muted)] leading-tight">
              Classic master-differenced pairs. Assumes ideal sync.
            </span>
          </button>
        </div>
      </div>

      {/* Standards & Atmospheric Refraction (Primary Factor ╬╖) */}
      <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
        <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider block">
          Primary Factor Refractive Index (╬╖)
        </label>
        <select
          value={settings.refractiveIndex}
          onChange={(e) => updateSettings({ refractiveIndex: parseFloat(e.target.value) })}
          className="w-full bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-mono"
        >
          {Object.values(REFRACTIVE_INDEX_PRESETS).map((p) => (
            <option key={p.id} value={p.value}>
              {p.name} (╬╖ = {p.value})
            </option>
          ))}
        </select>
        <p className="text-[10px] text-[var(--text-muted)]">
          Propagation speed v = c / ╬╖. Differences between RTCM (1.000338) and Handbook (1.000284) yield ~0.18 ┬╡s delay over 1000 km.
        </p>

        <Toggle
          label="Secondary Factor (SF) Seawater Delay"
          description="Brunavs empirical seawater propagation model (sigma = 5 S/m)"
          checked={settings.enableSecondaryFactor}
          onChange={(checked) => updateSettings({ enableSecondaryFactor: checked })}
        />
        <div className="text-[10px] font-mono px-2 py-1 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex items-center justify-between">
          <span className="text-[var(--text-muted)]">Status:</span>
          <span className={settings.enableSecondaryFactor ? 'text-[var(--accent-loran-c)] font-bold' : 'text-[var(--text-dim)]'}>
            {settings.enableSecondaryFactor
              ? 'Secondary Factor: ON (UNVERIFIED model ΓÇô discontinuous at 100 sm)'
              : 'Secondary Factor: off (UNVERIFIED model)'}
          </span>
        </div>
      </div>

      {/* Cycle Slip & TOA Noise Model (Boyce 2006 / Rhee 2021) */}
      <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)] font-mono text-xs">
        <div className="flex items-center justify-between">
          <label className="font-semibold text-[var(--text-dim)] uppercase tracking-wider block">
            Cycle Slip & TOA Noise Model
          </label>
          {settings.enableCycleSlips && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-[var(--status-warn-border)] flex items-center gap-1">
              <ShieldAlert size={11} /> Cycle Slip Active
            </span>
          )}
        </div>

        {/* Status Pills */}
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className="px-1.5 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)]">
            Model: Boyce ILA 2006 (SOURCED)
          </span>
          <span className="px-1.5 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)]">
            Noise: Rhee et al. 2021 (SOURCED)
          </span>
        </div>

        <Toggle
          label="Simulate Carrier Cycle Slips"
          description="Triggers wrong-cycle selection (┬▒10 ┬╡s / ~3 km error) when SNR degrades"
          checked={settings.enableCycleSlips}
          onChange={(checked) => updateSettings({ enableCycleSlips: checked })}
        />

        <div className="space-y-2.5 bg-[var(--bg-canvas)] p-3 rounded-xl border border-[var(--border-subtle)]">
          <div>
            <label className="block text-[var(--text-dim)] text-[11px] mb-1">
              Active Cycle Selection Model
            </label>
            <select
              value={settings.cycleSlipModel || 'boyce-ratio'}
              onChange={(e) => updateSettings({ cycleSlipModel: e.target.value })}
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
            >
              <option value="boyce-ratio">
                Boyce Theoretical Rician Ratio (SOURCED, ILA 2006)
              </option>
              <option value="austron-28">
                Austron New Empirical (28 ┬╡s) (SOURCED, Boyce Eq. 6)
              </option>
              <option value="austron-42">
                Austron Old Empirical (42 ┬╡s) (SOURCED, Boyce Eq. 5)
              </option>
            </select>
          </div>

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
            label="Pulse Averaging Integration"
            value={settings.pulsesAveraged || 10}
            min={1}
            max={50}
            step={1}
            unit="pulses"
            tooltip="Number of pulses averaged per GRI to suppress noise"
            onChange={(val) => updateSettings({ pulsesAveraged: val })}
          />

          <Slider
            label="Transmitter Jitter (J_i)"
            value={settings.jitterMeters ?? DEFAULT_TOA_NOISE_PARAMS.jitterMeters}
            min={0}
            max={20}
            step={0.5}
            unit="m"
            tooltip="Nominal transmitter clock jitter (SOURCED: Rhee et al. 2021)"
            onChange={(val) => updateSettings({ jitterMeters: val })}
          />

          <Slider
            label="Receiver Noise Constant (K)"
            value={settings.kConstantMeters ?? DEFAULT_TOA_NOISE_PARAMS.kConstantMeters}
            min={100}
            max={600}
            step={12.5}
            unit="m"
            tooltip="Receiver scaling constant K (SOURCED: Rhee et al. 2021 / Lo 2008)"
            onChange={(val) => updateSettings({ kConstantMeters: val })}
          />

          {/* Live Calculated Readout */}
          <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] space-y-1 text-[var(--text-dim)]">
            <div className="flex justify-between">
              <span>Total SNR (N ┬╖ SNR):</span>
              <span className="text-[var(--text-primary)] font-bold">
                {((settings.snrDb || 18) + 10 * Math.log10(Math.max(1, settings.pulsesAveraged || 10))).toFixed(1)} dB
              </span>
            </div>
            <div className="flex justify-between">
              <span>TOA Error Std Dev (╧â_i):</span>
              <span className="text-[var(--accent-eloran)] font-bold">
                {computeToaNoiseStdDevMeters({
                  snrDb: settings.snrDb || 18,
                  pulsesAveraged: settings.pulsesAveraged || 10,
                  jitterMeters: settings.jitterMeters ?? DEFAULT_TOA_NOISE_PARAMS.jitterMeters,
                  kConstantMeters: settings.kConstantMeters ?? DEFAULT_TOA_NOISE_PARAMS.kConstantMeters,
                }).toFixed(2)} m ({(computeToaNoiseStdDevMeters({
                  snrDb: settings.snrDb || 18,
                  pulsesAveraged: settings.pulsesAveraged || 10,
                  jitterMeters: settings.jitterMeters ?? DEFAULT_TOA_NOISE_PARAMS.jitterMeters,
                  kConstantMeters: settings.kConstantMeters ?? DEFAULT_TOA_NOISE_PARAMS.kConstantMeters,
                }) / 0.299792).toFixed(1)} ns)
              </span>
            </div>
            <div className="flex justify-between">
              <span>Wrong-Cycle Selection P[E]:</span>
              <span className="text-[var(--accent-loran-c)] font-bold">
                {((settings.cycleSlipModel === 'austron-42'
                  ? computeAustronWrongCycleProbability((settings.snrDb || 18) + 10 * Math.log10(Math.max(1, settings.pulsesAveraged || 10)), 'old')
                  : settings.cycleSlipModel === 'austron-28'
                  ? computeAustronWrongCycleProbability((settings.snrDb || 18) + 10 * Math.log10(Math.max(1, settings.pulsesAveraged || 10)), 'new')
                  : computeTheoreticalRiceWrongCycleProbability((settings.snrDb || 18) + 10 * Math.log10(Math.max(1, settings.pulsesAveraged || 10)))) * 100).toFixed(4)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Layer Visibility Toggles */}
      <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
        <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider block">
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
      <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
        <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider block">
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
          <label className="block text-[var(--text-secondary)] text-xs mb-1">Contour Display Units</label>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <button
              onClick={() => updateSettings({ contourUnit: 'meters' })}
              className={`py-1.5 rounded border transition ${
                settings.contourUnit === 'meters'
                  ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)]'
                  : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-dim)]'
              }`}
            >
              Meters (Range ╬ö)
            </button>
            <button
              onClick={() => updateSettings({ contourUnit: 'seconds' })}
              className={`py-1.5 rounded border transition ${
                settings.contourUnit === 'seconds'
                  ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)]'
                  : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-dim)]'
              }`}
            >
              Seconds (TDOA)
            </button>
          </div>
        </div>
      </div>

      {/* Model Fidelity & Provenance Registry */}
      <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)] font-mono text-xs">
        <div className="flex items-center justify-between">
          <label className="font-semibold text-[var(--text-dim)] uppercase tracking-wider block flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-[var(--accent-eloran)]" /> Model Fidelity & Provenance
          </label>
          <span className="text-[10px] text-[var(--text-muted)]">docs/PROVENANCE.md</span>
        </div>

        <div className="bg-[var(--bg-canvas)] rounded-xl border border-[var(--border-subtle)] p-3 space-y-2.5 text-[11px]">
          {/* Primary Factor */}
          <div className="flex items-center justify-between border-b border-[var(--bg-subtle)] pb-1.5">
            <div>
              <div className="font-bold text-[var(--text-primary)]">Primary Factor (PF)</div>
              <div className="text-[10px] text-[var(--text-muted)]">v = c / ╬╖ (Atmospheric refraction)</div>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)] text-[10px]">
              SOURCED (RTCM / USCG)
            </span>
          </div>

          {/* Secondary Factor */}
          <div className="flex items-center justify-between border-b border-[var(--bg-subtle)] pb-1.5">
            <div>
              <div className="font-bold text-[var(--text-primary)]">Secondary Factor (SF)</div>
              <div className="text-[10px] text-[var(--text-muted)]">Brunavs seawater delay (5 S/m)</div>
            </div>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] border ${
                settings.enableSecondaryFactor
                  ? 'bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border-[var(--status-warn-border)]'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-dim)] border-[var(--border-default)]'
              }`}
            >
              {settings.enableSecondaryFactor ? 'ON (UNVERIFIED)' : 'OFF (UNVERIFIED)'}
            </span>
          </div>

          {/* Mixed-Path ASF */}
          <div className="flex items-center justify-between border-b border-[var(--bg-subtle)] pb-1.5">
            <div>
              <div className="font-bold text-[var(--text-primary)]">Mixed-Path ASF (Millington)</div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {settings.asfModelMode === 'millington'
                  ? `Terrain ╧â = ${settings.asfLandSigma ?? 0.003} S/m, f = ${((settings.asfLandFraction ?? 0.5) * 100).toFixed(0)}%`
                  : 'Safe AST Formula Override'}
              </div>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)] text-[10px]">
              SOURCED (ITU-R P.832) / UNVERIFIED (k)
            </span>
          </div>

          {/* Cycle Selection */}
          <div className="flex items-center justify-between border-b border-[var(--bg-subtle)] pb-1.5">
            <div>
              <div className="font-bold text-[var(--text-primary)]">Cycle Selection Ratio Test</div>
              <div className="text-[10px] text-[var(--text-muted)]">
                Envelope ratio excursion [R(25), R(35)] (┬▒5 ┬╡s)
              </div>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)] text-[10px]">
              SOURCED (Boyce ILA 2006)
            </span>
          </div>

          {/* TOA Noise Model */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-[var(--text-primary)]">TOA Measurement Noise</div>
              <div className="text-[10px] text-[var(--text-muted)]">
                ╧â_i┬▓ = J_i┬▓ + K┬▓ / (N ┬╖ SNR_i)
              </div>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)] text-[10px]">
              SOURCED (Rhee et al. 2021)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}


