import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, CheckCircle2, AlertCircle, Wrench, ShieldAlert, Waves, Layers, Thermometer, Database, ExternalLink, ChevronDown, Radio, Activity } from 'lucide-react';
import { getColormapCssGradient } from '../../lib/heatmapColormap.js';
import { useSimulationStore } from '../../state/simulationStore.js';
import {
  validateAsfExpression,
  ITU_R_P832_CONDUCTIVITIES,
  DEFAULT_MILLINGTON_SCALE,
} from '../../lib/asf.js';
import {
  computeTemporalAsfMicroseconds,
  temporalAsfUsToMeters,
  STANDARD_ATMOSPHERE,
} from '../../lib/temporalAsf.js';
import {
  computeGeoMillingtonAsf,
  COASTLINE_MANIFEST,
} from '../../lib/geoAsf.js';
import { TrialValidationPanel } from './TrialValidationPanel.jsx';
import Toggle from '../ui/Toggle.jsx';
import Slider from '../ui/Slider.jsx';
import FresnelProfileViewer from '../charts/FresnelProfileViewer.jsx';
import { fetchElevationProfile } from '../../lib/elevationProfile.js';
import { computeTerrainMasking } from '../../lib/terrainMasking.js';
import InfoTooltip from '../ui/Tooltip.jsx';

const ASF_TEMPLATES = [
  {
    name: 'Coastal Conductivity Gradient',
    formula: '20 * sin((lat / 10) * pi) + 10 * cos((lng / 10) * pi)',
  },
  {
    name: 'Inland Mountain Range Delay',
    formula: '40 * exp(-((lat + 6.2)^2 + (lng - 106.8)^2) / 0.5)',
  },
  {
    name: 'Uniform Seawater Path (Zero ASF)',
    formula: '0',
  },
];

export default function AsfPanel() {
  const {
    masters,
    receivers,
    selectedReceiver,
    updateStation,
    receiverFixes,
    evaluateReceivers,
    settings,
    updateSettings,
  } = useSimulationStore();
  const master = masters[0];
  const rx = (receivers && receivers.find((r) => r.label === selectedReceiver)) || receivers?.[0];

  const asfMode = settings.asfModelMode || 'millington'; // 'millington' | 'formula' | 'temporal'
  const pathMode = settings.asfMillingtonPathMode || 'geo'; // 'geo' | 'manual'

  // Live ray-tracing result for current master -> selected receiver
  const geoResult = master && rx ? computeGeoMillingtonAsf({
    start: master,
    end: rx,
    landSigma: settings.asfLandSigma ?? 0.003,
    landEpslon: 15.0,
    fallbackLandFraction: settings.asfLandFraction ?? 0.5,
  }) : null;

  // Temporal ASF state
  const [tempC, setTempC] = useState(STANDARD_ATMOSPHERE.tempC);
  const [humidityPct, setHumidityPct] = useState(STANDARD_ATMOSPHERE.humidityPct);
  const [pressureHpa, setPressureHpa] = useState(STANDARD_ATMOSPHERE.pressureHpa);
  const [dayOfYear, setDayOfYear] = useState(180);
  const [fresnelModalData, setFresnelModalData] = useState(null);
  const [isAnalyzingFresnel, setIsAnalyzingFresnel] = useState(false);

  const handleInspectFresnel = async () => {
    if (!master || !rx) return;
    setIsAnalyzingFresnel(true);
    try {
      const profile = await fetchElevationProfile(
        { lat: master.lat, lng: master.lng },
        { lat: rx.lat, lng: rx.lng },
        32
      );
      const masking = computeTerrainMasking(profile, master.antennaHeightM || 30, rx.antennaHeightM || 5);
      setFresnelModalData({ profile, tx: master, rx, masking });
    } catch (err) {
      console.error('Failed to load elevation profile:', err);
    } finally {
      setIsAnalyzingFresnel(false);
    }
  };
  const [temporalDist, setTemporalDist] = useState(500); // km

  // Live temporal ASF preview (500 km path by default)
  const temporalResult = computeTemporalAsfMicroseconds({
    distKm: temporalDist,
    pressureHpa,
    tempC,
    humidityPct,
    dayOfYear,
    includeSeasonalDrift: true,
  });
  const temporalMeters = temporalAsfUsToMeters(temporalResult.totalMicroseconds);

  const [formulaInput, setFormulaInput] = useState(master?.asfFormula || '0');
  const [validation, setValidation] = useState(validateAsfExpression(master?.asfFormula || '0'));
  const [showValidation, setShowValidation] = useState(false);

  const handleFormulaChange = (val) => {
    setFormulaInput(val);
    const res = validateAsfExpression(val);
    setValidation(res);
    if (res.valid && master) {
      updateStation(master.label, { asfFormula: val });
    }
  };

  const handleApplyTemplate = (tmpl) => {
    setFormulaInput(tmpl.formula);
    const res = validateAsfExpression(tmpl.formula);
    setValidation(res);
    if (res.valid && master) {
      updateStation(master.label, { asfFormula: tmpl.formula });
    }
  };

  const handleAutoCalibrate = () => {
    if (!master) return;
    const fixes = Object.values(receiverFixes);
    if (!fixes.length) {
      evaluateReceivers();
    }
    const currentDiff = master.diffCorrections?.avgMeters || 0;
    // Auto-calibration: adjust differential correction to cancel observed residual
    const avgResidual = fixes.length
      ? fixes.reduce((s, f) => s + (f.residualMeters || 0), 0) / fixes.length
      : 5.0;

    const newDiff = parseFloat((currentDiff + avgResidual).toFixed(2));
    updateStation(master.label, {
      diffCorrections: { enabled: true, avgMeters: newDiff },
    });
    setTimeout(() => evaluateReceivers(), 50);
  };

  const engineMethod = settings.asfEngineMethod || 'grwave';

  return (
    <div className="space-y-5">
      {/* Mode Switcher Tabs */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider block">
            ASF Propagation Model Mode
          </label>
          <InfoTooltip
            title="ASF Propagation Models"
            text="Choose between Millington mixed-path physical groundwave (ITU-R P.368), Temporal atmospheric refractivity drift (Song & Son), or sandboxed mathematical Formula."
            align="right"
          />
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-xs font-mono">
          <button
            onClick={() => updateSettings({ asfModelMode: 'millington' })}
            className={`p-2 rounded border text-center transition flex items-center justify-center gap-1.5 cursor-pointer ${
              asfMode === 'millington'
                ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold'
                : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
            }`}
            title="Physical mixed-path delay model based on ITU-R P.832 ground conductivity mapping."
          >
            <Waves size={13} className="text-[var(--accent-eloran)] shrink-0" />
            <span className="text-[11px] truncate">Millington</span>
          </button>

          <button
            onClick={() => updateSettings({ asfModelMode: 'temporal' })}
            className={`p-2 rounded border text-center transition flex items-center justify-center gap-1.5 cursor-pointer ${
              asfMode === 'temporal'
                ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold'
                : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
            }`}
            title="Atmospheric refractivity model with seasonal drift calibrated from Song & Son (2025)."
          >
            <Thermometer size={13} className="text-[var(--accent-eloran)] shrink-0" />
            <span className="text-[11px] truncate">Temporal</span>
          </button>

          <button
            onClick={() => updateSettings({ asfModelMode: 'formula' })}
            className={`p-2 rounded border text-center transition flex items-center justify-center gap-1.5 cursor-pointer ${
              asfMode === 'formula'
                ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold'
                : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
            }`}
            title="Manual sandboxed mathematical formula evaluation for synthetic delay profiles."
          >
            <Sparkles size={13} className="text-[var(--accent-loran-c)] shrink-0" />
            <span className="text-[11px] truncate">Formula</span>
          </button>
        </div>
      </div>

      {/* Live ASF & Groundwave Attenuation Heatmap Controls */}
      <div
        data-testid="asf-heatmap-controls-card"
        className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-3 font-mono text-xs shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[var(--accent-eloran)]" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
                <span>Live Heatmap Overlay</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-normal bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] border border-[var(--accent-eloran-border)]">
                  Web Worker
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-dim)]">
                ITU-R P.368-10 / Sommerfeld groundwave rasterization
              </div>
            </div>
          </div>
          <Toggle
            label=""
            checked={Boolean(settings.asfHeatmapEnabled)}
            onChange={(checked) => updateSettings({ asfHeatmapEnabled: checked })}
            tooltip="Toggle real-time geographic heatmap overlay across map view"
          />
        </div>

        {settings.asfHeatmapEnabled && (
          <div className="space-y-3 pt-2.5 border-t border-[var(--border-subtle)]">
            {/* Quantity Selector: µs vs dB */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1 font-semibold text-[var(--text-secondary)]">
                <span>Physical Quantity:</span>
                <span className="text-[10px] text-[var(--accent-eloran)]">
                  {settings.asfHeatmapMode === 'db' ? 'Groundwave Loss (dB)' : 'ASF Excess Delay (µs)'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  data-testid="btn-heatmap-mode-us"
                  onClick={() => updateSettings({ asfHeatmapMode: 'us' })}
                  className={`p-1.5 rounded border text-center transition flex items-center justify-center gap-1 cursor-pointer text-[11px] ${
                    (settings.asfHeatmapMode || 'us') === 'us'
                      ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
                  }`}
                  title="Timing delay in microseconds relative to all-seawater path (Jet colormap)"
                >
                  <span>µs Timing Delay</span>
                </button>
                <button
                  type="button"
                  data-testid="btn-heatmap-mode-db"
                  onClick={() => updateSettings({ asfHeatmapMode: 'db' })}
                  className={`p-1.5 rounded border text-center transition flex items-center justify-center gap-1 cursor-pointer text-[11px] ${
                    settings.asfHeatmapMode === 'db'
                      ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
                  }`}
                  title="Groundwave amplitude attenuation vs free-space reference (Viridis colormap)"
                >
                  <span>dB Attenuation</span>
                </button>
              </div>
            </div>

            {/* Opacity slider */}
            <Slider
              label="Overlay Opacity"
              value={Math.round((settings.asfHeatmapOpacity ?? 0.65) * 100)}
              onChange={(v) => updateSettings({ asfHeatmapOpacity: v / 100 })}
              min={10}
              max={100}
              step={5}
              unit="%"
              tooltip="Visual opacity of the raster overlay on top of the basemap"
            />

            {/* Resolution slider */}
            <Slider
              label="Grid Resolution"
              value={settings.asfHeatmapResolution ?? 40}
              onChange={(v) => updateSettings({ asfHeatmapResolution: v })}
              min={20}
              max={80}
              step={5}
              unit=" px"
              tooltip="Worker calculation grid dimension per axis (20x20 coarse to 80x80 fine)"
            />

            {/* Iso-contour toggle */}
            <Toggle
              label="Iso-Contour Lines"
              checked={Boolean(settings.asfHeatmapIsoContours ?? true)}
              onChange={(checked) => updateSettings({ asfHeatmapIsoContours: checked })}
              tooltip="Draw subtle iso-contour lines at regular intervals (0.5 µs or 10 dB)"
            />

            {/* Color Scale Legend */}
            <div className="pt-1">
              <div className="flex justify-between text-[10px] mb-1 text-[var(--text-dim)]">
                <span>Scale: {settings.asfHeatmapMode === 'db' ? '0 dB' : '0.0 µs'}</span>
                <span className="uppercase text-[9px] font-semibold text-[var(--accent-eloran)]">
                  {settings.asfHeatmapMode === 'db' ? 'Viridis' : 'Jet'}
                </span>
                <span>{settings.asfHeatmapMode === 'db' ? '60 dB' : '3.0 µs'}</span>
              </div>
              <div
                className="h-2.5 w-full rounded border border-[var(--border-subtle)] shadow-inner"
                style={{
                  background: getColormapCssGradient(settings.asfHeatmapMode === 'db' ? 'viridis' : 'jet'),
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Terrain Masking & Knife-Edge Diffraction (ITU-R P.526) */}
      <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-primary)]">
              Terrain Masking & Obstacle Diffraction
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] border border-[var(--accent-eloran-border)]">
              ITU-R P.526
            </span>
          </div>
          <InfoTooltip
            align="right"
            text="Single knife-edge diffraction calculation across Great-Circle elevation profiles (Open-Elevation API). Identifies masked transmitter-receiver links (>15 dB loss) with excess propagation delay."
          />
        </div>

        <Toggle
          label="Enable Terrain Masking Overlay"
          description="Evaluate knife-edge obstacle loss along Tx-Rx paths and draw clear (green) vs masked (dashed red) vectors on the map."
          checked={Boolean(settings.terrainMaskingEnabled)}
          onChange={(checked) => updateSettings({ terrainMaskingEnabled: checked })}
        />

        {Boolean(settings.terrainMaskingEnabled) && (
          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2 text-[11px]">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[var(--text-dim)] uppercase block">Tx Tower Height</span>
                <span className="text-xs font-semibold text-[var(--text-primary)]">30 m AGL</span>
              </div>
              <div className="p-2 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[var(--text-dim)] uppercase block">Rx Mast Height</span>
                <span className="text-xs font-semibold text-[var(--text-primary)]">5 m AGL</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] px-1">
              <span>Wavelength &lambda; (100 kHz): ~2998 m</span>
              <span className="text-[var(--status-ok)]">API: Open-Elevation + Cache</span>
            </div>
            <button
              onClick={handleInspectFresnel}
              disabled={isAnalyzingFresnel || !master || !rx}
              className="w-full mt-2 py-1.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition hover:opacity-90 cursor-pointer"
              style={{
                background: 'var(--accent-eloran-subtle)',
                borderColor: 'var(--accent-eloran-border)',
                color: 'var(--accent-eloran)',
              }}
            >
              <Activity size={14} className={isAnalyzingFresnel ? 'animate-spin' : ''} />
              {isAnalyzingFresnel ? 'Querying Elevation Profile...' : `Inspect ${master?.label || 'M'} → ${rx?.label || 'R'} Cross-Section`}
            </button>
          </div>
        )}
      </div>

      {/* Mode 1: Physical Mixed-Path Millington Model */}
      {asfMode === 'millington' && (
        <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-4 font-mono text-xs">
          {/* Status Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
            <span className="text-[11px] font-semibold text-[var(--text-primary)]">
              Millington Mixed-Path Terrain Model
            </span>
            <InfoTooltip
              align="right"
              text="Physical mixed-path delay calculation utilizing ITU-R P.832 ground conductivity mapping."
            />
          </div>

          {/* Groundwave Calculation Engine Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[var(--text-secondary)] text-xs font-semibold block">
                Propagation Calculation Engine
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <button
                type="button"
                onClick={() => updateSettings({ asfEngineMethod: 'grwave' })}
                className={`p-1.5 rounded border text-center transition cursor-pointer ${
                  engineMethod === 'grwave'
                    ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold'
                    : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
                }`}
              >
                ITU-R P.368 (GRWAVE)
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ asfEngineMethod: 'empirical' })}
                className={`p-1.5 rounded border text-center transition cursor-pointer ${
                  engineMethod === 'empirical'
                    ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold'
                    : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
                }`}
              >
                Empirical Model (k_asf)
              </button>
            </div>

            {/* Split Provenance Status Bar */}
            {engineMethod === 'grwave' ? (
              <div className="bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-[10px] flex items-center justify-between gap-2">
                <span className="text-[var(--text-dim)] flex items-center gap-1">
                  <span>ITU-R P.368 / Sommerfeld</span>
                  <InfoTooltip
                    align="left"
                    title="Phase Delay Verification Status"
                    text="Note: Phase delay directly feeds the simulator's TDOA/pseudo-range positioning solution. It is cross-checked between Python and JS implementations only; NOT independently validated against GRWAVE or empirical data."
                  />
                </span>
                <span className="px-1.5 py-0.5 rounded font-bold bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)] whitespace-nowrap inline-flex items-center gap-1">
                  SOURCED (ITU-R P.368 GRWAVE)
                  <InfoTooltip
                    align="right"
                    title="Groundwave Attenuation Standard"
                    text="Field strength and groundwave attenuation curve generation is SOURCED from local GRWAVE Fortran reference outputs; ITU-R P.368-10 is not machine-verified upstream."
                  />
                </span>
              </div>
            ) : (
              <div className="bg-[var(--bg-subtle)] border border-[var(--status-warn-border)] rounded px-2.5 py-1.5 text-[10px] flex items-center justify-between">
                <span className="px-1.5 py-0.5 rounded font-bold bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-[var(--status-warn-border)] inline-flex items-center gap-1">
                  <ShieldAlert size={10} /> UNVERIFIED — Empirical k_asf
                </span>
                <InfoTooltip
                  align="right"
                  title="Empirical Model Provenance"
                  text="UNVERIFIED - Empirical k_asf phase lag scaling factor. Heuristic linear conductivity deficit scaling (k_asf). Uncalibrated against primary physical benchmark."
                />
              </div>
            )}
          </div>

          {/* Land Conductivity Selector */}
          <div className="space-y-1.5">
            <label className="text-[var(--text-secondary)] text-xs font-semibold block">
              Land Terrain Conductivity Preset (ITU-R P.832)
            </label>
            <select
              value={
                Object.values(ITU_R_P832_CONDUCTIVITIES).find(
                  (c) => c.sigma === (settings.asfLandSigma ?? 0.003)
                )?.id || 'custom'
              }
              onChange={(e) => {
                const preset = ITU_R_P832_CONDUCTIVITIES[e.target.value];
                if (preset) {
                  updateSettings({ asfLandSigma: preset.sigma });
                }
              }}
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
            >
              {Object.values(ITU_R_P832_CONDUCTIVITIES).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} [{c.category}]
                </option>
              ))}
            </select>
            <div className="text-[10px] text-[var(--text-muted)] flex justify-between">
              <span>Seawater reference: 5.0 S/m</span>
              <span className="text-[var(--accent-eloran)] font-bold">
                Selected σ = {settings.asfLandSigma ?? 0.003} S/m
              </span>
            </div>
          </div>

          {/* Coastline Path Segmentation Mode */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[var(--text-secondary)] text-xs font-semibold block">
                Coastline Path Segmentation Mode
              </label>
              <InfoTooltip
                align="right"
                title="Coastline Ray-Tracing"
                text="Switches between geodesic ray-tracing against real Natural Earth 10m coastline vector geometry and an illustrative manual land-fraction ratio."
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <button
                type="button"
                data-testid="asf-pathmode-geo"
                data-active={pathMode === 'geo' ? 'true' : 'false'}
                onClick={() => updateSettings({ asfMillingtonPathMode: 'geo' })}
                className={`p-1.5 rounded border text-center transition cursor-pointer ${
                  pathMode === 'geo'
                    ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold'
                    : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
                }`}
              >
                Geodesic GIS (Real Coastline)
              </button>
              <button
                type="button"
                data-testid="asf-pathmode-manual"
                data-active={pathMode === 'manual' ? 'true' : 'false'}
                onClick={() => updateSettings({ asfMillingtonPathMode: 'manual' })}
                className={`p-1.5 rounded border text-center transition cursor-pointer ${
                  pathMode === 'manual'
                    ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold'
                    : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
                }`}
              >
                Manual Land Fraction
              </button>
            </div>

            {/* Path Mode Content */}
            {pathMode === 'geo' ? (
              geoResult?.isCovered ? (
                <div className="bg-[var(--bg-subtle)] rounded-lg p-2.5 border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[var(--status-ok)] inline-block"></span>
                      <span>{geoResult.regionName}</span>
                    </span>
                    <span className="text-[10px] text-[var(--text-dim)] font-mono">
                      {master?.label} → {rx?.label} ({geoResult.totalDistKm.toFixed(1)} km)
                    </span>
                  </div>

                  {/* Segment Proportion Bar */}
                  <div className="space-y-1">
                    <div className="h-2 w-full rounded-full bg-[var(--bg-muted)] overflow-hidden flex">
                      <div
                        className="bg-amber-600 h-full transition-all duration-300"
                        style={{ width: `${(geoResult.landFraction * 100).toFixed(1)}%` }}
                        title={`Land: ${(geoResult.landFraction * 100).toFixed(1)}%`}
                      />
                      <div
                        className="bg-blue-500 h-full transition-all duration-300"
                        style={{ width: `${(geoResult.seaFraction * 100).toFixed(1)}%` }}
                        title={`Sea: ${(geoResult.seaFraction * 100).toFixed(1)}%`}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-[var(--text-dim)] font-mono">
                      <span className="text-[var(--accent-loran-c)] font-medium">
                        Land: {geoResult.landDistKm.toFixed(1)} km ({(geoResult.landFraction * 100).toFixed(1)}%)
                      </span>
                      <span className="text-[var(--text-muted)]">
                        {geoResult.transitions} boundary crossing{geoResult.transitions === 1 ? '' : 's'}
                      </span>
                      <span className="text-[var(--accent-eloran)] font-medium">
                        Sea: {geoResult.seaDistKm.toFixed(1)} km ({(geoResult.seaFraction * 100).toFixed(1)}%)
                      </span>
                    </div>
                  </div>

                  {/* Individual Segments Display */}
                  <div className="pt-1 border-t border-[var(--border-subtle)] space-y-1.5">
                    <div className="text-[10px] text-[var(--text-muted)] flex justify-between items-center">
                      <span>Path Segments (Tx → Rx):</span>
                      <span className="text-[var(--accent-eloran)] font-bold">
                        Calculated ASF: {geoResult.asfMeters.toFixed(1)} m ({geoResult.asfMicroseconds.toFixed(3)} µs)
                      </span>
                    </div>
                    {geoResult.segments?.length > 0 && (
                      <details className="text-[10px] group">
                        <summary className="text-[var(--text-dim)] hover:text-[var(--accent-eloran)] cursor-pointer select-none font-mono flex items-center justify-between">
                          <span>Segments Detail ({geoResult.segments.length})</span>
                          <span className="text-[9px] text-[var(--text-muted)] group-open:hidden">Show ▾</span>
                          <span className="text-[9px] text-[var(--text-muted)] hidden group-open:inline">Hide ▴</span>
                        </summary>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto mt-1.5 pt-1 border-t border-[var(--border-subtle)]/40">
                          {geoResult.segments.map((s, idx) => (
                            <span
                              key={idx}
                              className={`px-1.5 py-0.5 rounded text-[9.5px] border ${
                                s.medium === 'land'
                                  ? 'bg-[var(--accent-loran-c-subtle)] border-[var(--accent-loran-c-border)] text-[var(--accent-loran-c)]'
                                  : 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)]'
                              }`}
                            >
                              {s.medium.toUpperCase()} {s.distKm.toFixed(1)} km ({s.startKm.toFixed(0)}–{s.endKm.toFixed(0)} km)
                            </span>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-[var(--bg-subtle)] border border-[var(--status-warn-border)] rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-[var(--status-warn)]">
                    <span className="font-semibold flex items-center gap-1 font-mono">
                      ⚠️ Outside Bundled Coastlines
                    </span>
                    <InfoTooltip
                      title="Geodesic Path Fallback"
                      text={`Path (${master?.label || 'Tx'} → ${rx?.label || 'Rx'}) is outside bundled coastline regions (${Object.values(COASTLINE_MANIFEST).map((m) => m.name.split('—')[0].trim()).join(', ')}). Falling back to manual land fraction.`}
                      align="right"
                    />
                  </div>
                  <div className="text-[10px] text-[var(--text-dim)] font-mono">
                    Using manual fallback ratio ({Math.round((settings.asfLandFraction ?? 0.5) * 100)}%).
                  </div>
                  <Slider
                    label="Manual Land Fraction"
                    value={settings.asfLandFraction ?? 0.5}
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    unit=""
                    tooltip="Illustrative uniform land fraction applied when path is outside bundled coastline data"
                    onChange={(val) => updateSettings({ asfLandFraction: val })}
                  />
                </div>
              )
            ) : (
              <div className="space-y-1">
                <Slider
                  label="Manual Land Fraction (Illustrative, Any Region)"
                  value={settings.asfLandFraction ?? 0.5}
                  min={0.0}
                  max={1.0}
                  step={0.05}
                  unit=""
                  tooltip="Uniform land fraction applied to any geometry regardless of coastline vector data"
                  onChange={(val) => updateSettings({ asfLandFraction: val })}
                />
                
              </div>
            )}
          </div>

          {/* Engine Parameters / Empirical Scale Slider */}
          {engineMethod === 'grwave' ? (
            <div className="bg-[var(--bg-subtle)] rounded-lg px-2.5 py-2 border border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5 font-semibold">
                <span>Sommerfeld Impedance</span>
                <InfoTooltip
                  align="center"
                  title="Sommerfeld & Millington Theory"
                  text="Numerical distance p = (πd/λ)|η|² with multi-boundary reciprocal Millington (1949) averaging. Field strength verified against GRWAVE reference; phase delay uses analytical Sommerfeld-Norton formulation."
                />
              </span>
              <Link
                to="/learn"
                className="text-[10px] text-[var(--accent-eloran)] hover:underline flex items-center gap-1 font-semibold"
              >
                <span>Derivations in Theory →</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-1">
              <Slider
                label="Empirical Scale Constant (k_asf)"
                value={settings.asfMillingtonScale ?? DEFAULT_MILLINGTON_SCALE}
                min={0.0001}
                max={0.0030}
                step={0.0001}
                unit=""
                tooltip="UNVERIFIED empirical phase lag scaling factor"
                onChange={(val) => updateSettings({ asfMillingtonScale: val })}
              />
              <div className="text-[10px] px-2 py-0.5 rounded bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-[var(--status-warn-border)] flex items-center justify-between">
                <span>Status: UNVERIFIED parameter</span>
                <span>Default: 0.0008</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mode 3: Temporal ASF — Atmospheric Refractivity + Seasonal Drift */}
      {asfMode === 'temporal' && (
        <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-4 font-mono text-xs">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
            <span className="text-[11px] font-semibold text-[var(--text-primary)]">
              Temporal ASF — Atmospheric Refractivity
            </span>
            <InfoTooltip
              align="right"
              text="Weather-driven propagation delay variation. Refractivity formula is SOURCED (Smith & Weintraub 1953); seasonal drift magnitudes are UNVERIFIED based on 12-day Korean dataset (Song & Son 2025)."
            />
          </div>

          {/* Split Provenance Status Bar */}
          <div className="bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-[10px] flex items-center justify-between gap-2">
            <span className="text-[var(--text-dim)] flex items-center gap-1">
              <span>Smith &amp; Weintraub 1953</span>
              <span className="px-1.5 py-0.5 rounded font-bold bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)] whitespace-nowrap">
                SOURCED
              </span>
            </span>
            <span className="text-[var(--text-dim)] flex items-center gap-1">
              <span>Song &amp; Son 2025</span>
              <InfoTooltip
                align="right"
                title="Empirical Drift Calibration"
                text="Drift coefficients calibrated from Song &amp; Son (2025), arXiv:2509.26020 — a single 12-day eLoran measurement campaign in Korea. Not validated against other paths or seasons."
              />
              <span className="px-1.5 py-0.5 rounded font-bold bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-[var(--status-warn-border)] whitespace-nowrap">
                UNVERIFIED
              </span>
            </span>
          </div>

          {/* Weather Inputs */}
          <div className="space-y-3">
            <Slider
              label={`Temperature: ${tempC.toFixed(1)} °C`}
              value={tempC}
              min={-20}
              max={45}
              step={0.5}
              unit="°C"
              tooltip="Air temperature along the propagation path"
              onChange={setTempC}
            />
            <Slider
              label={`Relative Humidity: ${humidityPct.toFixed(0)} %`}
              value={humidityPct}
              min={0}
              max={100}
              step={1}
              unit="%"
              tooltip="Relative humidity (affects water vapour partial pressure and wet refractivity term)"
              onChange={setHumidityPct}
            />
            <Slider
              label={`Pressure: ${pressureHpa.toFixed(0)} hPa`}
              value={pressureHpa}
              min={900}
              max={1080}
              step={1}
              unit="hPa"
              tooltip="Atmospheric pressure (affects dry refractivity term)"
              onChange={setPressureHpa}
            />
            <Slider
              label={`Day of Year: ${dayOfYear}`}
              value={dayOfYear}
              min={1}
              max={365}
              step={1}
              unit=""
              tooltip="Day of year for seasonal drift (172 = summer solstice peak, 355 = winter trough)"
              onChange={setDayOfYear}
            />
            <Slider
              label={`Reference Path Length: ${temporalDist} km`}
              value={temporalDist}
              min={50}
              max={1500}
              step={50}
              unit="km"
              tooltip="Reference propagation path distance for preview calculation"
              onChange={setTemporalDist}
            />
          </div>

          {/* Live Preview Breakdown */}
          <div className="bg-[var(--bg-subtle)] rounded-lg p-3 border border-[var(--border-subtle)] space-y-2">
            <div className="text-[11px] font-bold text-[var(--text-secondary)]">Delay Breakdown at {temporalDist} km</div>
            <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
              <div className="bg-[var(--bg-canvas)] p-1.5 rounded border border-[var(--status-ok-border)]">
                <div className="text-[var(--text-muted)] mb-0.5">Refractivity Δτ</div>
                <div className="font-bold text-[var(--status-ok)]">{(temporalResult.refractivityUs * 1000).toFixed(2)} ns</div>
                <div className="text-[9px] text-[var(--text-dim)] mt-0.5">SOURCED</div>
              </div>
              <div className="bg-[var(--bg-canvas)] p-1.5 rounded border border-[var(--status-warn-border)]">
                <div className="text-[var(--text-muted)] mb-0.5">Seasonal Δτ</div>
                <div className="font-bold text-[var(--status-warn)]">{(temporalResult.seasonalUs * 1000).toFixed(2)} ns</div>
                <div className="text-[9px] text-[var(--text-dim)] mt-0.5">UNVERIFIED</div>
              </div>
              <div className="bg-[var(--bg-canvas)] p-1.5 rounded border border-[var(--status-warn-border)]">
                <div className="text-[var(--text-muted)] mb-0.5">Weather Δτ</div>
                <div className="font-bold text-[var(--status-warn)]">{(temporalResult.weatherUs * 1000).toFixed(2)} ns</div>
                <div className="text-[9px] text-[var(--text-dim)] mt-0.5">UNVERIFIED</div>
              </div>
            </div>
            <div className="border-t border-[var(--border-subtle)] pt-2 flex items-center justify-between text-[11px]">
              <span className="text-[var(--text-muted)]">Total Temporal ASF:</span>
              <span className="font-bold text-[var(--accent-eloran)] font-mono">
                {temporalMeters.toFixed(2)} m ({(temporalResult.totalMicroseconds * 1000).toFixed(2)} ns)
              </span>
            </div>
            <div className="text-[9.5px] text-[var(--text-muted)] leading-tight">
              N = {temporalResult.N.toFixed(1)} N-units &nbsp;|&nbsp; Δτ feeds reference table only — not wired to positioning solver in this version.
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: Safe AST Formula Override */}
      {asfMode === 'formula' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider block">
                  Manual ASF Formula (AST)
                </label>
                <InfoTooltip text="Models arbitrary spatial land path delays in meters. Whitelisted variables: lat, lng, pi, e." />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-[var(--status-warn-border)]">
                UNVERIFIED
              </span>
            </div>

            <textarea
              rows={3}
              value={formulaInput}
              onChange={(e) => handleFormulaChange(e.target.value)}
              className="w-full bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg p-2.5 text-xs text-[var(--text-primary)] font-mono focus:outline-hidden focus:border-[var(--accent-eloran-border)]"
              placeholder="e.g. 20 * sin((lat / 10) * pi)"
            />

            {/* Validation Status Badge */}
            <div className="flex items-center justify-between text-xs">
              {validation.valid ? (
                <div className="flex items-center gap-1.5 text-[var(--status-ok)] font-medium text-[11px]">
                  <CheckCircle2 size={13} /> Valid Sandboxed AST Expression
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[var(--status-danger)] font-medium text-[11px]">
                  <AlertCircle size={13} /> {validation.error}
                </div>
              )}
            </div>
          </div>

          {/* Preset Formula Templates */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Example Models
            </span>
            <div className="grid grid-cols-1 gap-1">
              {ASF_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.name}
                  onClick={() => handleApplyTemplate(tmpl)}
                  className="text-left px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] rounded-md text-xs text-[var(--text-secondary)] transition"
                >
                  <div className="font-medium text-[var(--accent-eloran)] text-[11px]">{tmpl.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">{tmpl.formula}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Differential Corrections Tuning */}
      {master && (
        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[var(--text-dim)] uppercase tracking-wider">
              Differential eLoran (dLORAN)
            </span>
            <button
              onClick={handleAutoCalibrate}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--accent-eloran-subtle)] hover:bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] border border-[var(--accent-eloran-border)]/30 rounded text-[11px] font-mono transition"
            >
              <Wrench size={11} /> Auto-Calibrate
            </button>
          </div>

          <Toggle
            label="Enable Differential Corrections"
            description="Broadcasts ASF calibration offsets to mobile receivers via DDS"
            checked={master.diffCorrections?.enabled || false}
            onChange={(checked) =>
              updateStation(master.label, {
                diffCorrections: { ...master.diffCorrections, enabled: checked },
              })
            }
          />

          <Slider
            label="Applied Correction Offset"
            value={master.diffCorrections?.avgMeters || 0}
            min={-50}
            max={50}
            step={0.5}
            unit="m"
            tooltip="Spatial compensation subtracted from observed arrival time"
            disabled={!master.diffCorrections?.enabled}
            onChange={(val) =>
              updateStation(master.label, {
                diffCorrections: { ...master.diffCorrections, avgMeters: val },
              })
            }
          />
        </div>
      )}

      {/* Empirical Field Trial Validation Benchmarks */}
      <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1.5 shrink-0">
            <Database size={13} className="text-[var(--accent-eloran)] shrink-0" />
            <span className="font-semibold text-[var(--text-dim)] uppercase tracking-wider text-[11px] shrink-0">
              Field Benchmarks
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 font-semibold"
              style={{
                background: 'var(--status-ok-subtle)',
                borderColor: 'var(--status-ok-border)',
                borderWidth: '1px',
                color: 'var(--status-ok)',
              }}
            >
              Tier 2 SOURCED
            </span>
            <InfoTooltip
              align="left"
              title="Tier 2 Field Trial Validation Disclosure"
              text="Validation in SIMULORAN is classified as Tier 2 (Published Empirical Summary Statistics). Published field test campaigns in navigation literature report multi-point summary statistics (e.g. 95% repeatable accuracy, RMSE, signal strength, and estimated jitter) rather than raw streaming TOA pulse time-series logs. Detailed methodology and known gaps are documented in docs/VALIDATION.md."
            />
          </div>
          <button
            type="button"
            data-testid="toggle-validation-benchmarks"
            onClick={() => setShowValidation(!showValidation)}
            className="text-[11px] hover:underline font-semibold cursor-pointer shrink-0 ml-auto"
            style={{ color: 'var(--accent-eloran)' }}
          >
            {showValidation ? 'Hide Benchmarks' : 'View Benchmarks'}
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Evaluated against 7-site Korean eLoran campaign (Rhee et al., 2021) and Maoming inland geodesic test (Gao et al., 2025).
        </p>
        {showValidation && (
          <div className="mt-3">
            <TrialValidationPanel compact={true} />
          </div>
        )}
      </div>
      {fresnelModalData && (
        <FresnelProfileViewer
          profile={fresnelModalData.profile}
          tx={fresnelModalData.tx}
          rx={fresnelModalData.rx}
          masking={fresnelModalData.masking}
          onClose={() => setFresnelModalData(null)}
        />
      )}
    </div>
  );
}

