import React, { useState } from 'react';
import { Database, CheckCircle2, ExternalLink, Globe, Layers, Navigation, Info, ArrowUpRight } from 'lucide-react';
import { evaluateKoreaTrialBenchmark, evaluateMaomingTrialBenchmark } from '../../lib/trialValidation.js';
import { useSimulationStore } from '../../state/simulationStore.js';

export function TrialValidationPanel() {
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

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-zinc-100 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-950/60 border border-cyan-800/50 rounded-lg text-cyan-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 tracking-wide flex items-center gap-2">
              Empirical Field Trial Benchmarks
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 font-mono">
                Tier 2 SOURCED
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Empirical validation against published real-world Loran/eLoran accuracy campaigns
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('korea')}
            className={`px-3 py-1.5 rounded-md transition-all font-medium ${
              activeTab === 'korea'
                ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Korea 2021 (7 Sites)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('maoming')}
            className={`px-3 py-1.5 rounded-md transition-all font-medium ${
              activeTab === 'maoming'
                ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
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
            <div className="bg-zinc-950/60 border border-zinc-800/80 p-3 rounded-lg">
              <span className="text-[11px] text-zinc-400 font-mono block">Field Sites</span>
              <span className="text-lg font-bold text-zinc-100 font-mono">7 Locations</span>
              <span className="text-[10px] text-zinc-500 block mt-0.5">Across S. Korea</span>
            </div>
            <div className="bg-zinc-950/60 border border-zinc-800/80 p-3 rounded-lg">
              <span className="text-[11px] text-zinc-400 font-mono block">Mean Measured 95%</span>
              <span className="text-lg font-bold text-emerald-400 font-mono">
                {koreaBenchmark.summaryMetrics.meanMeasured95m} m
              </span>
              <span className="text-[10px] text-zinc-500 block mt-0.5">Published empirical</span>
            </div>
            <div className="bg-zinc-950/60 border border-zinc-800/80 p-3 rounded-lg">
              <span className="text-[11px] text-zinc-400 font-mono block">Flat 4m (prior-art)</span>
              <span className="text-lg font-bold text-cyan-400 font-mono">
                {koreaBenchmark.summaryMetrics.meanSimulated95m} m
              </span>
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                MAE: {koreaBenchmark.summaryMetrics.meanAbsoluteErrorMeters} m
              </span>
            </div>
            {koreaBenchmark.perStationSummary && (
              <div className="bg-zinc-950/60 border border-violet-800/50 p-3 rounded-lg">
                <span className="text-[11px] text-zinc-400 font-mono block">Per-station (Table 3)</span>
                <span className="text-lg font-bold text-violet-400 font-mono">
                  {koreaBenchmark.perStationSummary.meanSimulated95m} m
                </span>
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  MAE: {koreaBenchmark.perStationSummary.meanAbsoluteErrorMeters} m
                </span>
              </div>
            )}
            <div className="bg-zinc-950/60 border border-zinc-800/80 p-3 rounded-lg">
              <span className="text-[11px] text-zinc-400 font-mono block">Flat Model RMSE</span>
              <span className="text-lg font-bold text-amber-400 font-mono">
                {koreaBenchmark.summaryMetrics.rmseMeters} m
              </span>
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                {koreaBenchmark.perStationSummary 
                  ? `Per-stn: ${koreaBenchmark.perStationSummary.rmseMeters} m`
                  : '—'}
              </span>
            </div>
          </div>

          {/* Action to Load Preset */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/70 border border-cyan-900/40 p-3.5 rounded-lg">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                Live Scenario Preset Available
              </div>
              <p className="text-[11px] text-zinc-400">
                Load the exact 4-station Northeast Asia eLoran network (Pohang, Gwangju, Rongcheng, Xuancheng) into the simulator.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLoadKoreaPreset}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md ${
                activePresetId === 'korea_yellow_sea_trial'
                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/60'
                  : 'bg-cyan-700 hover:bg-cyan-600 text-white'
              }`}
            >
              <Navigation className="w-3.5 h-3.5" />
              {activePresetId === 'korea_yellow_sea_trial' ? 'Preset Active' : 'Load Korea Trial Preset'}
            </button>
          </div>

          {/* Comparison Table */}
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 font-mono text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Test Site</th>
                    <th className="py-2.5 px-2">Coordinates</th>
                    <th className="py-2.5 px-2">HDOP</th>
                    <th className="py-2.5 px-2 text-right">Measured 95%</th>
                    <th className="py-2.5 px-2 text-right">Flat (4m)</th>
                    <th className="py-2.5 px-2 text-right text-violet-400">Per-Station (Table 3)</th>
                    <th className="py-2.5 px-2 text-right">Rhee Sim (4m)</th>
                    <th className="py-2.5 px-2 text-right">Rhee Sim (6m)</th>
                    <th className="py-2.5 px-3 text-right">Δ (Per-Stn)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {koreaBenchmark.sites.map((site) => (
                    <tr key={site.name} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-zinc-200">{site.name}</td>
                      <td className="py-2.5 px-2 text-[11px] text-zinc-400">
                        {site.lat.toFixed(2)}°N, {site.lng.toFixed(2)}°E
                      </td>
                      <td className="py-2.5 px-2 text-cyan-300">{site.hdop.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-right text-emerald-400 font-semibold">
                        {site.measured95m.toFixed(2)} m
                      </td>
                      <td className="py-2.5 px-2 text-right text-cyan-300 font-semibold">
                        {site.loranLab95m.toFixed(2)} m
                      </td>
                      <td className="py-2.5 px-2 text-right text-violet-300 font-semibold">
                        {site.perStationR95m !== null ? `${site.perStationR95m.toFixed(2)} m` : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right text-zinc-400">
                        {site.rheeSim4mMeters.toFixed(2)} m
                      </td>
                      <td className="py-2.5 px-2 text-right text-zinc-500">
                        {site.rheeSim6mMeters.toFixed(2)} m
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-semibold ${
                          Math.abs(site.perStationDeltaMeters ?? site.deltaMeters) < 2.0
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}
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
          <div className="bg-zinc-950/80 border border-zinc-800/80 p-3.5 rounded-lg space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Data Provenance & Source
              </span>
              <a
                href={koreaBenchmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[11px]"
              >
                arXiv:2108.06008 <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              <strong className="text-zinc-300">{koreaBenchmark.citation}</strong>
              <br />
              Summary validation tier: Empirically measured 95% repeatable positioning accuracy across 7 receiver sites
              receiving Pohang (9930M), Gwangju (9930W), Rongcheng (7430M), and Xuancheng (7430X). LORAN LAB evaluates
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
            <div className="bg-rose-950/20 border border-rose-900/40 p-3.5 rounded-lg">
              <span className="text-[11px] text-rose-300 font-mono block">Spherical Model (SHP)</span>
              <span className="text-2xl font-bold text-rose-400 font-mono mt-1 block">
                {maomingBenchmark.publishedResults.sphericalHyperbolaPositioningRmseMeters} m
              </span>
              <span className="text-[10px] text-zinc-400 block mt-1">
                Severe geometric distortion over inland paths
              </span>
            </div>
            <div className="bg-emerald-950/30 border border-emerald-800/50 p-3.5 rounded-lg">
              <span className="text-[11px] text-emerald-300 font-mono block">Ellipsoidal Model (EPP)</span>
              <span className="text-2xl font-bold text-emerald-400 font-mono mt-1 block">
                {maomingBenchmark.publishedResults.ellipsoidalPseudorangePositioningRmseMeters} m
              </span>
              <span className="text-[10px] text-zinc-400 block mt-1">
                WGS84 ellipsoidal pseudorange positioning
              </span>
            </div>
            <div className="bg-cyan-950/30 border border-cyan-800/50 p-3.5 rounded-lg">
              <span className="text-[11px] text-cyan-300 font-mono block">Empirical Accuracy Gain</span>
              <span className="text-2xl font-bold text-cyan-400 font-mono mt-1 block">
                {maomingBenchmark.publishedResults.accuracyImprovementPercent}%
              </span>
              <span className="text-[10px] text-zinc-400 block mt-1">
                Coverage expanded by 129% to 284%
              </span>
            </div>
          </div>

          {/* Inland Geodesic Distortion Demonstration */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
              Inland Geodesic Arc Distortion (Spherical vs WGS84 Ellipsoid)
            </h3>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 font-mono text-[11px]">
                  <tr>
                    <th className="py-2 px-3">Transmitter Baseline (to Maoming)</th>
                    <th className="py-2 px-2 text-right">Distance</th>
                    <th className="py-2 px-2 text-right">WGS84 Ellipsoid</th>
                    <th className="py-2 px-2 text-right">Spherical Earth</th>
                    <th className="py-2 px-2 text-right">Arc Distortion</th>
                    <th className="py-2 px-3 text-right">Timing Bias</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
                  {maomingBenchmark.geodesicComparisons.map((c) => (
                    <tr key={c.transmitter} className="hover:bg-zinc-800/30">
                      <td className="py-2.5 px-3 text-zinc-200 font-semibold">{c.transmitter}</td>
                      <td className="py-2.5 px-2 text-right text-zinc-400">{c.distKm} km</td>
                      <td className="py-2.5 px-2 text-right text-emerald-400">{c.ellipsoidalDistMeters.toLocaleString()} m</td>
                      <td className="py-2.5 px-2 text-right text-zinc-400">{c.sphericalDistMeters.toLocaleString()} m</td>
                      <td className="py-2.5 px-2 text-right text-amber-400 font-semibold">
                        {c.distortionMeters > 0 ? `+${c.distortionMeters}` : c.distortionMeters} m
                      </td>
                      <td className="py-2.5 px-3 text-right text-cyan-300">
                        {c.distortionMicroseconds > 0 ? `+${c.distortionMicroseconds}` : c.distortionMicroseconds} µs
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Technical Context & Provenance */}
          <div className="bg-zinc-950/80 border border-zinc-800/80 p-3.5 rounded-lg space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Data Provenance & Source
              </span>
              <a
                href={maomingBenchmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[11px]"
              >
                DOI: 10.3390/s25165110 <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              <strong className="text-zinc-300">{maomingBenchmark.citation}</strong>
              <br />
              {maomingBenchmark.theoreticalMechanism}
            </p>
          </div>
        </div>
      )}

      {/* Tier Transparency Disclosure */}
      <div className="flex items-start gap-2.5 bg-zinc-950 border border-zinc-800/60 p-3 rounded-lg text-zinc-400 text-xs">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-zinc-300 block">
            Validation Tier Disclosure & Open Data Audit
          </span>
          <p className="text-[11px] leading-relaxed">
            Validation in LORAN LAB is classified as <strong>Tier 2 (Published Empirical Summary Statistics)</strong>.
            Published field test campaigns in navigation literature report multi-point summary statistics (e.g. 95% repeatable
            accuracy, RMSE, signal strength, and estimated jitter) rather than raw streaming TOA pulse time-series logs.
            Detailed methodology and known gaps are documented in <code className="text-zinc-300 bg-zinc-800 px-1 py-0.5 rounded">docs/VALIDATION.md</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default TrialValidationPanel;
