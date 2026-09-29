import React, { useState } from 'react';
import { Database, CheckCircle2, ExternalLink, Globe, Navigation, Info } from 'lucide-react';
import { evaluateKoreaTrialBenchmark, evaluateMaomingTrialBenchmark } from '../../lib/trialValidation.js';
import { useSimulationStore } from '../../state/simulationStore.js';

export function TrialValidationPanel({ compact = false }) {
  const [activeTab, setActiveTab] = useState('korea'); // 'korea' | 'maoming'
  const loadPreset = useSimulationStore((state) => state.loadPreset);
  const activePresetId = useSimulationStore((state) => state.activePresetId);

  const koreaBenchmark = evaluateKoreaTrialBenchmark();
  const maomingBenchmark = evaluateMaomingTrialBenchmark();

  const handleLoadKoreaPreset = () => {
    if (loadPreset) {
      loadPreset('korea_yellow_sea_trial');
    }
  };

  if (compact) {
    return (
      <div
        data-testid="trial-validation-panel"
        className="rounded-xl p-3 shadow-md space-y-3 border font-mono transition-colors text-xs"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
      >
        <div className="flex items-center justify-between gap-2 border-b pb-2" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <Database className="w-4 h-4 text-[var(--accent-eloran)] shrink-0" />
            <span className="font-semibold text-[11px] text-[var(--text-primary)] truncate">Trial Benchmarks</span>
          </div>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold shrink-0"
            style={{
              background: 'var(--status-ok-subtle)',
              border: '1px solid var(--status-ok-border)',
              color: 'var(--status-ok)',
            }}
          >
            Tier 2 SOURCED
          </span>
        </div>

        {/* Quick KPI stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
          <div className="p-2 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1" data-testid="korea-benchmark-card">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-dim)] font-semibold">Korea 2021 (7 Sites)</span>
              <span className="text-[9px] font-mono text-[var(--text-primary)]">
                <span className="text-[var(--text-muted)]">Measured: </span>
                <span data-testid="korea-measured-mean" className="font-bold">{koreaBenchmark.summaryMetrics?.meanMeasured95m?.toFixed(2) ?? '10.17'}m</span>
              </span>
            </div>
            <div className="space-y-0.5 pt-1 border-t border-[var(--border-subtle)]/60 font-mono">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[var(--text-muted)]">Flat (4m):</span>
                <span className="font-bold text-[var(--text-primary)]" data-testid="korea-flat-simulated-mean">
                  {koreaBenchmark.summaryMetrics?.meanSimulated95m?.toFixed(2) ?? '11.67'}m <span className="font-normal text-[9px] text-[var(--text-dim)]">(MAE {koreaBenchmark.summaryMetrics?.meanAbsoluteErrorMeters?.toFixed(2) ?? '1.74'}m)</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[var(--accent-eloran)] font-medium">Per-Station (T3):</span>
                <span className="font-bold text-[var(--accent-eloran)]" data-testid="korea-per-station-simulated-mean">
                  {koreaBenchmark.perStationSummary?.meanSimulated95m?.toFixed(2) ?? '9.03'}m <span className="font-normal text-[9px] text-[var(--text-dim)]">(MAE {koreaBenchmark.perStationSummary?.meanAbsoluteErrorMeters?.toFixed(2) ?? '1.37'}m)</span>
                </span>
              </div>
            </div>
          </div>
          <div className="p-2 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1" data-testid="maoming-benchmark-card">
            <span className="text-[var(--text-dim)] font-semibold block">Maoming 2025 (Gao et al.)</span>
            <div className="space-y-0.5 pt-1 border-t border-[var(--border-subtle)]/60 font-mono">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[var(--text-muted)]">SHP (spherical hyperbola):</span>
                <span className="font-bold text-[var(--text-primary)]" data-testid="maoming-shp-rmse">
                  {maomingBenchmark.publishedResults?.sphericalHyperbolaPositioningRmseMeters ?? 417.2} m RMSE
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[var(--accent-eloran)] font-medium">EPP (ellipsoidal PR):</span>
                <span className="font-bold text-[var(--accent-eloran)]" data-testid="maoming-epp-rmse">
                  {maomingBenchmark.publishedResults?.ellipsoidalPseudorangePositioningRmseMeters ?? 43.1} m RMSE
                </span>
              </div>
              <div className="text-[9px] text-[var(--text-dim)] pt-0.5" data-testid="maoming-attribution">
                Inland, Gao et al. 2025 (89.7% gain via ellipsoidal model)
              </div>
            </div>
          </div>
        </div>

        {/* Preset Loader Button */}
        <button
          type="button"
          onClick={handleLoadKoreaPreset}
          className="w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
          style={activePresetId === 'korea_yellow_sea_trial'
            ? {
                background: 'var(--status-ok-subtle)',
                color: 'var(--status-ok)',
                border: '1px solid var(--status-ok-border)',
              }
            : {
                background: 'var(--accent-eloran)',
                color: 'var(--btn-eloran-text)',
                border: '1px solid transparent',
              }}
        >
          <Navigation className="w-3.5 h-3.5" />
          {activePresetId === 'korea_yellow_sea_trial' ? 'Preset Active' : 'Load Korea Trial Preset'}
        </button>

        {/* Link to Full About Page Section */}
        <div className="pt-1 text-center">
          <a
            href="/about"
            className="text-[11px] text-[var(--accent-eloran)] hover:underline inline-flex items-center gap-1 font-semibold"
          >
            <span>Full comparative tables & error plots on About page</span>
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="trial-validation-panel"
      className="rounded-xl p-4 sm:p-5 shadow-xl space-y-6 border font-mono transition-colors"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="p-2.5 rounded-lg shrink-0"
            style={{
              background: 'var(--accent-eloran-subtle)',
              border: '1px solid var(--accent-eloran-border)',
              color: 'var(--accent-eloran)',
            }}
          >
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold tracking-wide flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              Empirical Field Trial Benchmarks
              <span
                className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold"
                style={{
                  background: 'var(--status-ok-subtle)',
                  border: '1px solid var(--status-ok-border)',
                  color: 'var(--status-ok)',
                }}
              >
                Tier 2 SOURCED
              </span>
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
              Empirical validation against published real-world Loran/eLoran accuracy campaigns
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div
          className="flex items-center gap-1.5 p-1 rounded-lg border text-xs"
          style={{
            background: 'var(--bg-subtle)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('korea')}
            className="px-3 py-1.5 rounded-md transition-all font-medium cursor-pointer"
            style={activeTab === 'korea'
              ? {
                  background: 'var(--accent-eloran-subtle)',
                  color: 'var(--accent-eloran)',
                  border: '1px solid var(--accent-eloran-border)',
                  fontWeight: 600,
                }
              : {
                  color: 'var(--text-dim)',
                  border: '1px solid transparent',
                }}
          >
            Korea 2021 (7 Sites)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('maoming')}
            className="px-3 py-1.5 rounded-md transition-all font-medium cursor-pointer"
            style={activeTab === 'maoming'
              ? {
                  background: 'var(--accent-eloran-subtle)',
                  color: 'var(--accent-eloran)',
                  border: '1px solid var(--accent-eloran-border)',
                  fontWeight: 600,
                }
              : {
                  color: 'var(--text-dim)',
                  border: '1px solid transparent',
                }}
          >
            Maoming 2025 (Inland)
          </button>
        </div>
      </div>

      {/* Korea 2021 Benchmark */}
      {activeTab === 'korea' && (
        <div className="space-y-5">
          {/* Summary Cards */}
          <div className="flex flex-wrap gap-2.5 [&>*]:flex-1 [&>*]:min-w-[110px]">
            <div
              className="p-3 rounded-lg border"
              style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
            >
              <span className="text-[11px] font-mono block" style={{ color: 'var(--text-dim)' }}>Field Sites</span>
              <span className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>7 Locations</span>
              <span className="text-[10px] block mt-0.5" style={{ color: 'var(--text-muted)' }}>Across S. Korea</span>
            </div>
            <div
              className="p-3 rounded-lg border"
              style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
            >
              <span className="text-[11px] font-mono block" style={{ color: 'var(--text-dim)' }}>Mean Measured 95%</span>
              <span className="text-lg font-bold font-mono" style={{ color: 'var(--status-ok)' }}>
                {koreaBenchmark.summaryMetrics.meanMeasured95m} m
              </span>
              <span className="text-[10px] block mt-0.5" style={{ color: 'var(--text-muted)' }}>Published empirical</span>
            </div>
            <div
              className="p-3 rounded-lg border"
              style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
            >
              <span className="text-[11px] font-mono block" style={{ color: 'var(--text-dim)' }}>Flat 4m (prior-art)</span>
              <span className="text-lg font-bold font-mono" style={{ color: 'var(--accent-eloran)' }}>
                {koreaBenchmark.summaryMetrics.meanSimulated95m} m
              </span>
              <span className="text-[10px] block mt-0.5" style={{ color: 'var(--text-muted)' }}>
                MAE: {koreaBenchmark.summaryMetrics.meanAbsoluteErrorMeters} m
              </span>
            </div>
            {koreaBenchmark.perStationSummary && (
              <div
                className="p-3 rounded-lg border"
                style={{
                  background: 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <span className="text-[11px] font-mono block" style={{ color: 'var(--text-dim)' }}>Per-station (Table 3)</span>
                <span className="text-lg font-bold font-mono text-violet-600 dark:text-violet-400">
                  {koreaBenchmark.perStationSummary.meanSimulated95m} m
                </span>
                <span className="text-[10px] block mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  MAE: {koreaBenchmark.perStationSummary.meanAbsoluteErrorMeters} m
                </span>
              </div>
            )}
            <div
              className="p-3 rounded-lg border"
              style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
            >
              <span className="text-[11px] font-mono block" style={{ color: 'var(--text-dim)' }}>Flat Model RMSE</span>
              <span className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">
                {koreaBenchmark.summaryMetrics.rmseMeters} m
              </span>
              <span className="text-[10px] block mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {koreaBenchmark.perStationSummary 
                  ? `Per-stn: ${koreaBenchmark.perStationSummary.rmseMeters} m`
                  : '—'}
              </span>
            </div>
          </div>

          {/* Action to Load Preset */}
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border"
            style={{
              background: 'var(--bg-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="space-y-0.5">
              <div className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--accent-eloran)' }}>
                <Globe className="w-3.5 h-3.5" />
                Live Scenario Preset Available
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                Load the exact 4-station Northeast Asia eLoran network (Pohang, Gwangju, Rongcheng, Xuancheng) into the simulator.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLoadKoreaPreset}
              className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
              style={activePresetId === 'korea_yellow_sea_trial'
                ? {
                    background: 'var(--status-ok-subtle)',
                    color: 'var(--status-ok)',
                    border: '1px solid var(--status-ok-border)',
                  }
                : {
                    background: 'var(--accent-eloran)',
                color: 'var(--btn-eloran-text)',
                    border: '1px solid transparent',
                  }}
            >
              <Navigation className="w-3.5 h-3.5" />
              {activePresetId === 'korea_yellow_sea_trial' ? 'Preset Active' : 'Load Korea Trial Preset'}
            </button>
          </div>

          {/* Comparison Table */}
          <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead
                  className="border-b font-mono text-[11px]"
                  style={{
                    background: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-dim)',
                  }}
                >
                  <tr>
                    <th className="py-2.5 px-3">Test Site</th>
                    <th className="py-2.5 px-2">Coordinates</th>
                    <th className="py-2.5 px-2">HDOP</th>
                    <th className="py-2.5 px-2 text-right">Measured 95%</th>
                    <th className="py-2.5 px-2 text-right">Flat (4m)</th>
                    <th className="py-2.5 px-2 text-right text-violet-600 dark:text-violet-400">Per-Station (Table 3)</th>
                    <th className="py-2.5 px-2 text-right">Rhee Sim (4m)</th>
                    <th className="py-2.5 px-2 text-right">Rhee Sim (6m)</th>
                    <th className="py-2.5 px-3 text-right">Δ (Per-Stn)</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono" style={{ borderColor: 'var(--border-subtle)' }}>
                  {koreaBenchmark.sites.map((site) => (
                    <tr
                      key={site.name}
                      className="transition-colors hover:bg-[var(--bg-muted)]/40"
                    >
                      <td className="py-2.5 px-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{site.name}</td>
                      <td className="py-2.5 px-2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
                        {site.lat.toFixed(2)}°N, {site.lng.toFixed(2)}°E
                      </td>
                      <td className="py-2.5 px-2 font-semibold" style={{ color: 'var(--accent-eloran)' }}>{site.hdop.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-right font-semibold" style={{ color: 'var(--status-ok)' }}>
                        {site.measured95m.toFixed(2)} m
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold" style={{ color: 'var(--accent-eloran)' }}>
                        {site.simuloran95m.toFixed(2)} m
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-violet-600 dark:text-violet-400">
                        {site.perStationR95m !== null ? `${site.perStationR95m.toFixed(2)} m` : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right" style={{ color: 'var(--text-dim)' }}>
                        {site.rheeSim4mMeters.toFixed(2)} m
                      </td>
                      <td className="py-2.5 px-2 text-right" style={{ color: 'var(--text-muted)' }}>
                        {site.rheeSim6mMeters.toFixed(2)} m
                      </td>
                      <td
                        className="py-2.5 px-3 text-right font-semibold"
                        style={{
                          color: Math.abs(site.perStationDeltaMeters ?? site.deltaMeters) < 2.0
                            ? 'var(--status-ok)'
                            : 'var(--status-warn)',
                        }}
                      >
                        {site.perStationDeltaMeters !== null
                          ? (site.perStationDeltaMeters > 0 ? `+${site.perStationDeltaMeters.toFixed(2)}` : `${site.perStationDeltaMeters.toFixed(2)}`)
                          : (site.deltaMeters > 0 ? `+${site.deltaMeters.toFixed(2)}` : `${site.deltaMeters.toFixed(2)}`)} m
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Provenance & Citation Note */}
          <div
            className="p-3.5 rounded-lg border space-y-2 text-xs"
            style={{
              background: 'var(--bg-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--status-ok)' }} />
                Data Provenance & Source
              </span>
              <a
                href={koreaBenchmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline flex items-center gap-1 text-[11px] font-semibold"
                style={{ color: 'var(--accent-eloran)' }}
              >
                arXiv:2108.06008 <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{koreaBenchmark.citation}</strong>
              <br />
              Summary validation tier: Empirically measured 95% repeatable positioning accuracy across 7 receiver sites
              receiving Pohang (9930M), Gwangju (9930W), Rongcheng (7430M), and Xuancheng (7430X). SIMULORAN evaluates
              the identical geometry using both the prior-art 4 m flat baseline (RMSE 2.11 m, MAE 1.74 m) and full
              per-station covariance with Rhee Table 3 jitter estimates (RMSE 1.72 m, MAE 1.37 m) without artificial parameter tuning.
            </p>
          </div>
        </div>
      )}

      {/* Maoming 2025 Benchmark */}
      {activeTab === 'maoming' && (
        <div className="space-y-5">
          {/* Headline Results */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              className="p-3.5 rounded-lg border"
              style={{
                background: 'var(--status-danger-subtle)',
                borderColor: 'var(--status-danger-border, rgba(220, 38, 38, 0.2))',
              }}
            >
              <span className="text-[11px] font-mono block" style={{ color: 'var(--status-danger)' }}>Spherical Model (SHP)</span>
              <span className="text-2xl font-bold font-mono mt-1 block" style={{ color: 'var(--status-danger)' }}>
                {maomingBenchmark.publishedResults.sphericalHyperbolaPositioningRmseMeters} m
              </span>
              <span className="text-[10px] block mt-1" style={{ color: 'var(--text-muted)' }}>
                Severe geometric distortion over inland paths
              </span>
            </div>
            <div
              className="p-3.5 rounded-lg border"
              style={{
                background: 'var(--status-ok-subtle)',
                borderColor: 'var(--status-ok-border)',
              }}
            >
              <span className="text-[11px] font-mono block" style={{ color: 'var(--status-ok)' }}>Ellipsoidal Model (EPP)</span>
              <span className="text-2xl font-bold font-mono mt-1 block" style={{ color: 'var(--status-ok)' }}>
                {maomingBenchmark.publishedResults.ellipsoidalPseudorangePositioningRmseMeters} m
              </span>
              <span className="text-[10px] block mt-1" style={{ color: 'var(--text-muted)' }}>
                WGS84 ellipsoidal pseudorange positioning
              </span>
            </div>
            <div
              className="p-3.5 rounded-lg border"
              style={{
                background: 'var(--accent-eloran-subtle)',
                borderColor: 'var(--accent-eloran-border)',
              }}
            >
              <span className="text-[11px] font-mono block" style={{ color: 'var(--accent-eloran)' }}>Empirical Accuracy Gain</span>
              <span className="text-2xl font-bold font-mono mt-1 block" style={{ color: 'var(--accent-eloran)' }}>
                {maomingBenchmark.publishedResults.accuracyImprovementPercent}%
              </span>
              <span className="text-[10px] block mt-1" style={{ color: 'var(--text-muted)' }}>
                Coverage expanded by 129% to 284%
              </span>
            </div>
          </div>

          {/* Inland Geodesic Distortion Demonstration */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider font-mono" style={{ color: 'var(--text-primary)' }}>
              Inland Geodesic Arc Distortion (Spherical vs WGS84 Ellipsoid)
            </h3>
            <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
              <table className="w-full text-left text-xs">
                <thead
                  className="border-b font-mono text-[11px]"
                  style={{
                    background: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-dim)',
                  }}
                >
                  <tr>
                    <th className="py-2 px-3">Transmitter Baseline (to Maoming)</th>
                    <th className="py-2 px-2 text-right">Distance</th>
                    <th className="py-2 px-2 text-right">WGS84 Ellipsoid</th>
                    <th className="py-2 px-2 text-right">Spherical Earth</th>
                    <th className="py-2 px-2 text-right">Arc Distortion</th>
                    <th className="py-2 px-3 text-right">Timing Bias</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono text-[11px]" style={{ borderColor: 'var(--border-subtle)' }}>
                  {maomingBenchmark.geodesicComparisons.map((c) => (
                    <tr key={c.transmitter} className="hover:bg-[var(--bg-muted)]/40 transition-colors">
                      <td className="py-2.5 px-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{c.transmitter}</td>
                      <td className="py-2.5 px-2 text-right" style={{ color: 'var(--text-dim)' }}>{c.distKm} km</td>
                      <td className="py-2.5 px-2 text-right font-semibold" style={{ color: 'var(--status-ok)' }}>
                        {c.ellipsoidalDistMeters.toLocaleString()} m
                      </td>
                      <td className="py-2.5 px-2 text-right" style={{ color: 'var(--text-dim)' }}>
                        {c.sphericalDistMeters.toLocaleString()} m
                      </td>
                      <td
                        className="py-2.5 px-2 text-right font-semibold"
                        style={{ color: 'var(--status-warn)' }}
                      >
                        {c.distortionMeters > 0 ? `+${c.distortionMeters}` : c.distortionMeters} m
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold" style={{ color: 'var(--accent-eloran)' }}>
                        {c.distortionMicroseconds > 0 ? `+${c.distortionMicroseconds}` : c.distortionMicroseconds} µs
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Technical Context & Provenance */}
          <div
            className="p-3.5 rounded-lg border space-y-2 text-xs"
            style={{
              background: 'var(--bg-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--status-ok)' }} />
                Data Provenance & Source
              </span>
              <a
                href={maomingBenchmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline flex items-center gap-1 text-[11px] font-semibold"
                style={{ color: 'var(--accent-eloran)' }}
              >
                DOI: 10.3390/s25165110 <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{maomingBenchmark.citation}</strong>
              <br />
              {maomingBenchmark.theoreticalMechanism}
            </p>
          </div>
        </div>
      )}

      {/* Tier Transparency Disclosure */}
      <div
        className="flex items-start gap-2.5 p-3 rounded-lg border text-xs"
        style={{
          background: 'var(--bg-subtle)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-secondary)',
        }}
      >
        <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-eloran)' }} />
        <div className="space-y-1">
          <span className="font-semibold block" style={{ color: 'var(--text-primary)' }}>
            Validation Tier Disclosure & Open Data Audit
          </span>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
            Validation in SIMULORAN is classified as <strong>Tier 2 (Published Empirical Summary Statistics)</strong>.
            Published field test campaigns in navigation literature report multi-point summary statistics (e.g. 95% repeatable
            accuracy, RMSE, signal strength, and estimated jitter) rather than raw streaming TOA pulse time-series logs.
            Detailed methodology and known gaps are documented in <code className="px-1 py-0.5 rounded font-mono" style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)' }}>docs/VALIDATION.md</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default TrialValidationPanel;
