import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Zap,
  TrendingDown,
} from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import {
  COMPARATIVE_MODES,
  COMPARATIVE_PRESETS,
  evaluateComparativeSystems,
} from '../../lib/comparativeAnalysis.js';

export default function ComparativeAnalysisPanel() {
  const {
    receivers,
    selectedReceiver,
    receiverFixes,
    settings,
    updateSettings,
  } = useSimulationStore();

  const [alertLimitMeters, setAlertLimitMeters] = useState(25.0);
  const [activePreset, setActivePreset] = useState('nominal_clear');

  const rx = receivers.find((r) => r.label === selectedReceiver) || receivers[0];
  const activeFix = rx ? receiverFixes[rx.label] : null;

  const comparison = useMemo(() => {
    return evaluateComparativeSystems({
      trueLat: rx?.lat ?? 37.4563,
      trueLng: rx?.lng ?? 126.7052,
      eloranFix: activeFix?.eloranSol || { errorMeters: activeFix?.errorMeters ?? 12.5, hdop: activeFix?.hdop ?? 1.1 },
      gnssFix: activeFix?.gnssFix || { errorMeters: 5.2 },
      fusedFix: activeFix?.fusedFix || { errorMeters: 4.1 },
      settings: settings || {},
      alertLimitMeters,
    });
  }, [rx, activeFix, settings, alertLimitMeters]);

  const handleApplyPreset = (presetKey) => {
    setActivePreset(presetKey);
    const p = COMPARATIVE_PRESETS[presetKey];
    if (!p) return;
    updateSettings({
      gnssStatus: p.gnssStatus,
      gnssJammingNoiseMeters: p.gnssJammingNoiseMeters ?? settings.gnssJammingNoiseMeters,
      gnssSpoofBiasMeters: p.gnssSpoofBiasMeters ?? settings.gnssSpoofBiasMeters,
      includeSkywave: p.includeSkywave,
      skywaveHourOfDay: p.skywaveHourOfDay ?? settings.skywaveHourOfDay,
      enableCycleSlips: p.enableCycleSlips,
      asfModelMode: p.asfModelMode,
    });
  };

  const systems = comparison.systems;
  const loranC = systems[COMPARATIVE_MODES.LORAN_C];
  const eloran = systems[COMPARATIVE_MODES.ELORAN];
  const gnss = systems[COMPARATIVE_MODES.GNSS];
  const ekf = systems[COMPARATIVE_MODES.EKF_FUSION];

  const improvementRatio = loranC.errorMeters > 0
    ? (((loranC.errorMeters - eloran.errorMeters) / loranC.errorMeters) * 100).toFixed(1)
    : '98.5';

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* Scenario Presets Bar */}
      <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-[var(--text-secondary)] text-[11px] uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-[var(--accent-eloran)]" />
            <span>Interactive PNT Denial & Resilience Scenarios</span>
          </span>
          <span className="text-[10px] text-[var(--text-dim)]">
            Resilience Score: <strong className="text-[var(--status-ok)]">{comparison.resilienceScore}/100</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {Object.entries(COMPARATIVE_PRESETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleApplyPreset(key)}
              className={`p-2 rounded-lg text-left border transition cursor-pointer flex flex-col justify-between ${
                activePreset === key
                  ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--text-primary)] shadow-xs'
                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)]'
              }`}
            >
              <span className="font-bold text-[11px] truncate">{p.name.split('(')[0]}</span>
              <span className="text-[9px] text-[var(--text-dim)] line-clamp-1 mt-0.5">
                {key === 'hormuz_jamming' ? 'GNSS Denied' : key === 'baltic_spoofing' ? 'Spoofing Attack' : key === 'nighttime_skywave_storm' ? 'Skywave Storm' : 'All Nominal'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Alert Limit Selector */}
      <div className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
        <span className="text-[11px] text-[var(--text-secondary)]">Operational Alert Limit (HAL):</span>
        <div className="flex items-center gap-1">
          {[
            { label: 'IMO HEA (25m)', val: 25.0 },
            { label: 'ICAO APV (40m)', val: 40.0 },
            { label: 'RNP 0.3 (556m)', val: 556.0 },
          ].map((item) => (
            <button
              key={item.val}
              type="button"
              onClick={() => setAlertLimitMeters(item.val)}
              className={`px-2 py-0.5 rounded text-[10px] border transition cursor-pointer ${
                alertLimitMeters === item.val
                  ? 'bg-[var(--accent-eloran)] text-[var(--btn-eloran-text)] border-transparent font-bold'
                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4-Way Side-by-Side Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 1. Pure Loran-C Card */}
        <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f97316]" />
              <h3 className="font-bold text-[var(--text-primary)]">{loranC.name}</h3>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-dim)]">
              {loranC.generation}
            </span>
          </div>

          <div className="flex items-baseline justify-between border-y border-[var(--border-subtle)] py-2">
            <div>
              <span className="text-[10px] text-[var(--text-dim)]">Position Error (HPE)</span>
              <div className="text-lg font-bold text-[#f97316]">
                {loranC.errorMeters >= 1000 ? `${(loranC.errorMeters / 1000).toFixed(2)} km` : `${loranC.errorMeters} m`}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[var(--text-dim)]">Protection Level (HPL)</span>
              <div className="text-sm font-semibold text-[var(--text-secondary)]">
                {loranC.hplMeters >= 1000 ? `${(loranC.hplMeters / 1000).toFixed(1)} km` : `${loranC.hplMeters} m`}
              </div>
            </div>
          </div>

          <div className="space-y-1 text-[10px] text-[var(--text-dim)]">
            <div className="flex justify-between">
              <span>Availability:</span>
              <span className={loranC.available ? 'text-[var(--status-ok)] font-bold' : 'text-[var(--status-danger)] font-bold'}>
                {loranC.available ? 'AVAILABLE' : 'UNAVAILABLE (EXCEEDS HAL)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="font-semibold text-[var(--text-primary)]">{loranC.status}</span>
            </div>
            <div className="flex justify-between">
              <span>ASF Calibration:</span>
              <span className="text-[var(--status-danger)]">None (Uncompensated)</span>
            </div>
          </div>
        </div>

        {/* 2. Modernized eLoran Card */}
        <div className="p-3 rounded-xl border border-[var(--accent-eloran-border)] bg-[var(--accent-eloran-subtle)]/20 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-eloran)]" />
              <h3 className="font-bold text-[var(--text-primary)]">{eloran.name}</h3>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] font-bold border border-[var(--accent-eloran-border)]">
              {eloran.generation}
            </span>
          </div>

          <div className="flex items-baseline justify-between border-y border-[var(--border-subtle)] py-2">
            <div>
              <span className="text-[10px] text-[var(--text-dim)]">Position Error (HPE)</span>
              <div className="text-lg font-bold text-[var(--accent-eloran)]">
                {eloran.errorMeters} m
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[var(--text-dim)]">Protection Level (HPL)</span>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {eloran.hplMeters} m
              </div>
            </div>
          </div>

          <div className="space-y-1 text-[10px] text-[var(--text-dim)]">
            <div className="flex justify-between">
              <span>Availability:</span>
              <span className={eloran.available ? 'text-[var(--status-ok)] font-bold' : 'text-[var(--status-warn)] font-bold'}>
                {eloran.available ? 'AVAILABLE (WITHIN HAL)' : 'DEGRADED'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="font-semibold text-[var(--status-ok)]">{eloran.status}</span>
            </div>
            <div className="flex justify-between">
              <span>ASF Calibration:</span>
              <span className="text-[var(--status-ok)]">Active (Millington GIS Ray-Trace)</span>
            </div>
          </div>
        </div>

        {/* 3. GNSS Card */}
        <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]" />
              <h3 className="font-bold text-[var(--text-primary)]">GNSS (GPS L1/L2)</h3>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-dim)]">
              Space-Based UHF
            </span>
          </div>

          <div className="flex items-baseline justify-between border-y border-[var(--border-subtle)] py-2">
            <div>
              <span className="text-[10px] text-[var(--text-dim)]">Position Error (HPE)</span>
              <div className={`text-lg font-bold ${gnss.errorMeters > 50 ? 'text-[var(--status-danger)]' : 'text-[#3b82f6]'}`}>
                {gnss.errorMeters >= 1000 ? `${(gnss.errorMeters / 1000).toFixed(1)} km` : `${gnss.errorMeters} m`}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[var(--text-dim)]">Protection Level (HPL)</span>
              <div className="text-sm font-semibold text-[var(--text-secondary)]">
                {gnss.hplMeters >= 1000 ? 'INF (OUTAGE)' : `${gnss.hplMeters} m`}
              </div>
            </div>
          </div>

          <div className="space-y-1 text-[10px] text-[var(--text-dim)]">
            <div className="flex justify-between">
              <span>Availability:</span>
              <span className={gnss.available ? 'text-[var(--status-ok)] font-bold' : 'text-[var(--status-danger)] font-bold'}>
                {gnss.available ? 'AVAILABLE' : 'DENIED / COMPROMISED'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <span className={`font-semibold ${gnss.status.includes('NOMINAL') ? 'text-[var(--status-ok)]' : 'text-[var(--status-danger)]'}`}>
                {gnss.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span>RF Vulnerability:</span>
              <span className="text-[var(--status-warn)]">UHF -160 dBW (Jamming Vulnerable)</span>
            </div>
          </div>
        </div>

        {/* 4. Integrated EKF Fusion Card */}
        <div className="p-3 rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-subtle)]/20 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[var(--status-ok)]" />
              <h3 className="font-bold text-[var(--text-primary)]">{ekf.name}</h3>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] font-bold border border-[var(--status-ok-border)]">
              Resilience Failover
            </span>
          </div>

          <div className="flex items-baseline justify-between border-y border-[var(--border-subtle)] py-2">
            <div>
              <span className="text-[10px] text-[var(--text-dim)]">Position Error (HPE)</span>
              <div className="text-lg font-bold text-[var(--status-ok)]">
                {ekf.errorMeters} m
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[var(--text-dim)]">Protection Level (HPL)</span>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {ekf.hplMeters} m
              </div>
            </div>
          </div>

          <div className="space-y-1 text-[10px] text-[var(--text-dim)]">
            <div className="flex justify-between">
              <span>Availability:</span>
              <span className={ekf.available ? 'text-[var(--status-ok)] font-bold' : 'text-[var(--status-danger)] font-bold'}>
                {ekf.available ? '100% ASSURED PNT' : 'OUTAGE'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Integrity Engine:</span>
              <span className="font-semibold text-[var(--text-primary)]">{ekf.status}</span>
            </div>
            <div className="flex justify-between">
              <span>Resilience Margin:</span>
              <span className="text-[var(--status-ok)] font-bold">+120 dB Jamming Immunity</span>
            </div>
          </div>
        </div>
      </div>

      {/* Differential Summary Banner */}
      <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-[var(--status-ok)]" />
          <div>
            <div className="font-bold text-[11px] text-[var(--text-primary)]">
              {improvementRatio}% Error Reduction via eLoran Modernization
            </div>
            <div className="text-[10px] text-[var(--text-dim)]">
              ASF Millington delay modeling + differential corrections eliminate the ~1 km bias of 1958 Loran-C.
            </div>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-[var(--text-dim)] block">Resilience Status</span>
          <span className="font-bold text-[11px] text-[var(--status-ok)] flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Assured PNT Active</span>
          </span>
        </div>
      </div>
    </div>
  );
}