import React, { useState, useMemo } from 'react';
import {
  ShieldCheck, AlertTriangle, Radio, Navigation, Compass,
  WifiOff, Zap, CheckCircle2, Activity, Crosshair
} from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import Toggle from '../ui/Toggle.jsx';
import InfoTooltip from '../ui/Tooltip.jsx';
import StanfordDiagram from '../charts/StanfordDiagram.jsx';
import {
  computeJammerToSignalRatio,
  computeEloranJammingAdvantage,
  evaluateGnssSpoofingAttack,
} from '../../lib/electronicWarfare.js';

export default function FusionPanel() {
  const {
    receivers, receiverFixes, selectedReceiver,
    setSelectedReceiver, updateStation, settings, updateSettings, ddsLogs,
  } = useSimulationStore();

  const rx = receivers.find((r) => r.label === selectedReceiver) || receivers[0];
  const fix = rx ? receiverFixes[rx.label] : null;
  const currentMode = rx?.fuseMode || 'fusion';

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'stanford' | 'ew'
  const [selectedAlertLimit, setSelectedAlertLimit] = useState('apv');

  // Electronic Warfare Simulator Local State
  const [jammerPowerWatts, setJammerPowerWatts] = useState(10);
  const [jammerDistanceKm, setJammerDistanceKm] = useState(25);
  const [spoofElapsedSec, setSpoofElapsedSec] = useState(120);

  const alertLimits = {
    hea: { label: 'IMO Maritime HEA', value: 25, unit: 'm', desc: 'Harbor Entrance and Approach (IMO Res A.1046(27))' },
    apv: { label: 'ICAO APV-I / LPV', value: 40, unit: 'm', desc: 'Approach with Vertical Guidance (ICAO Annex 10)' },
    rnp03: { label: 'RNAV / RNP 0.3', value: 556, unit: 'm', desc: 'Non-Precision Approach / Heliport (0.3 NM)' },
  };

  const currentLimit = alertLimits[selectedAlertLimit] || alertLimits.apv;
  const currentHpl = fix?.hplMeters || 0;

  const eloranSol = fix?.eloranSol;
  const gnssFix = fix?.gnssFix;
  const eloranHpl = eloranSol?.hplMeters || (eloranSol?.hdop ? eloranSol.hdop * 3 * (fix?.toaNoiseStdDevMeters || 6) : 0);
  const gnssHpl = gnssFix?.hplMeters || (gnssFix?.stdDevMeters ? gnssFix.stdDevMeters * 3 : 24);

  // Compute 1-sigma uncertainty in meters
  const eloranSigma = eloranSol?.covariance
    ? Math.sqrt(Math.max(0, ((eloranSol.covariance[0][0] || 0) + (eloranSol.covariance[1][1] || 0)) / 2))
    : (fix?.toaNoiseStdDevMeters || 6);

  const gnssSigma = gnssFix?.stdDevMeters || 8;

  const weights = fix?.weights || { eloran: 0.5, gnss: 0.5 };
  const eloranPct = Math.round((weights.eloran || 0) * 100);
  const gnssPct = Math.round((weights.gnss || 0) * 100);

  const gnssStatus = settings.gnssStatus || 'nominal';

  const handleModeChange = (mode) => {
    if (!rx) return;
    updateStation(rx.label, { fuseMode: mode });
  };

  const handleGnssStatusChange = (status) => {
    updateSettings({ gnssStatus: status });
  };

  // Electronic Warfare RF Calculations
  const ewAnalysis = useMemo(() => {
    return computeJammerToSignalRatio({
      jammerPowerWatts,
      jammerDistanceMeters: jammerDistanceKm * 1000,
    });
  }, [jammerPowerWatts, jammerDistanceKm]);

  const eloranMargin = useMemo(() => {
    return computeEloranJammingAdvantage();
  }, []);

  const spoofAttack = useMemo(() => {
    if (!rx) return null;
    return evaluateGnssSpoofingAttack(
      { lat: rx.lat, lng: rx.lng },
      eloranSol ? { lat: eloranSol.lat, lng: eloranSol.lng } : null,
      {
        active: gnssStatus === 'spoofed',
        driftRateMetersPerMin: settings.gnssSpoofBiasMeters || 150,
        courseOffsetDeg: 90,
        elapsedSec: spoofElapsedSec,
      }
    );
  }, [rx, eloranSol, gnssStatus, settings.gnssSpoofBiasMeters, spoofElapsedSec]);

  const modes = [
    { id: 'fusion', label: 'BLUE Fused',  icon: Compass   },
    { id: 'eLoran', label: 'eLoran Only', icon: Radio     },
    { id: 'GNSS',   label: 'GNSS Only',   icon: Navigation },
  ];

  const degradationOptions = [
    { id: 'nominal', label: 'Nominal', icon: CheckCircle2, color: 'var(--status-ok)', desc: 'Clean GNSS SPS signals (1σ ~ 8m)' },
    { id: 'jammed',  label: 'Jammed',  icon: Zap,          color: 'var(--status-warn)', desc: 'RF interference / AGC desensitization' },
    { id: 'spoofed', label: 'Spoofed', icon: AlertTriangle,color: 'var(--status-danger)', desc: 'Malicious forged carrier with false spatial bias' },
    { id: 'outage',  label: 'Outage',  icon: WifiOff,      color: 'var(--text-dim)', desc: 'Complete loss of GNSS carrier tracking lock' },
  ];

  // Gauge percentage calculation (capped at 100% of display bar, where 100% is 1.5x of limit)
  const gaugeMax = currentLimit.value * 1.5;
  const hplGaugePercent = Math.min(100, Math.max(0, (currentHpl / gaugeMax) * 100));
  const limitLinePercent = (currentLimit.value / gaugeMax) * 100;
  const isHplCompliant = currentHpl <= currentLimit.value;

  return (
    <div className="space-y-3.5 font-sans">
      {/* Top Header & Sub-Tab Navigation */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
            <Activity size={14} className="text-[var(--accent-eloran)] shrink-0" />
            <span>BLUE Fusion &amp; EW Suite</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] border border-[var(--accent-eloran-border)]">
              v1.5
            </span>
          </div>
          <InfoTooltip
            align="right"
            title="BLUE Kalman & EW Suite"
            text="Inverse-covariance weighting, Stanford safety containment matrix, and Electronic Warfare anti-spoofing countermeasures."
          />
        </div>

        {/* Sub-Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-[var(--bg-subtle)] p-1 rounded-lg border border-[var(--border-subtle)] text-xs font-mono">
          {[
            ['overview', 'Overview'],
            ['stanford', 'Stanford Matrix'],
            ['ew', 'EW Defense'],
          ].map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-1.5 px-1 rounded-md text-center transition cursor-pointer font-semibold text-[11px] truncate ${
                activeTab === tab
                  ? 'bg-[var(--bg-canvas)] border border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] shadow-xs'
                  : 'text-[var(--text-dim)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Receiver Selection Header */}
      {receivers.length > 1 && (
        <div className="flex items-center justify-between text-xs font-mono bg-[var(--bg-subtle)] p-2 rounded-lg border border-[var(--border-subtle)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Target Receiver
          </span>
          <select
            value={selectedReceiver}
            onChange={(e) => setSelectedReceiver(e.target.value)}
            className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
          >
            {receivers.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label} ({r.lat.toFixed(2)}°, {r.lng.toFixed(2)}°)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* TAB 1: OVERVIEW & SENSOR FUSION */}
      {activeTab === 'overview' && (
        <div className="space-y-3 font-mono text-xs">
          {/* PNT Mode Switcher */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider block text-[var(--text-dim)]">
                PNT Architecture
              </label>
              <InfoTooltip
                align="right"
                title="PNT Architecture"
                text="Switch between multi-source BLUE inverse-covariance fusion, terrestrial eLoran only, and GNSS satellite only."
              />
            </div>
            <div className="grid grid-cols-3 gap-1 bg-[var(--bg-subtle)] p-1 rounded-lg border border-[var(--border-subtle)] font-mono text-xs">
              {modes.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => handleModeChange(id)}
                  className={`py-1.5 px-1 rounded-md text-center transition flex items-center justify-center gap-1.5 cursor-pointer text-[10.5px] ${
                    currentMode === id
                      ? 'bg-[var(--bg-canvas)] border border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold shadow-xs'
                      : 'text-[var(--text-dim)] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  <Icon size={12} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Side-by-Side Solution Quality Cards */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold uppercase tracking-wider text-[var(--text-dim)]">
                Multi-Source Fix Comparison
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">
                {eloranPct}% eLoran / {gnssPct}% GNSS
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              {/* 1. eLoran Standalone */}
              <div
                className="p-2 rounded-lg space-y-1 border transition bg-[var(--bg-canvas)]"
                style={{
                  borderColor: currentMode === 'eLoran' ? 'var(--accent-eloran)' : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10.5px] font-bold text-[var(--accent-eloran)]">
                    <Radio size={11} /> eLoran
                  </span>
                  <span
                    className="text-[8.5px] px-1 py-0.2 rounded font-bold uppercase"
                    style={{
                      background: eloranSol?.noSolution ? 'var(--status-danger-subtle)' : 'var(--status-ok-subtle)',
                      color: eloranSol?.noSolution ? 'var(--status-danger)' : 'var(--status-ok)',
                    }}
                  >
                    {eloranSol?.noSolution ? 'FAIL' : 'LOCK'}
                  </span>
                </div>
                <div className="text-[9.5px] space-y-0.5 text-[var(--text-secondary)]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">1σ Horiz:</span>
                    <strong className="text-[var(--text-primary)]">{eloranSol?.noSolution ? 'n/a' : `${eloranSigma.toFixed(1)}m`}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">HPL (3σ):</span>
                    <strong className="text-[var(--text-primary)]">{eloranSol?.noSolution ? 'n/a' : `${eloranHpl.toFixed(1)}m`}</strong>
                  </div>
                  <div className="flex justify-between text-[9px] text-[var(--text-dim)]">
                    <span>HDOP:</span>
                    <span>{eloranSol?.hdop?.toFixed(2) || 'n/a'}</span>
                  </div>
                </div>
              </div>

              {/* 2. GNSS Standalone */}
              <div
                className="p-2 rounded-lg space-y-1 border transition bg-[var(--bg-canvas)]"
                style={{
                  borderColor: currentMode === 'GNSS' ? 'var(--status-ok)' : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="flex items-center gap-1 text-[10.5px] font-bold"
                    style={{
                      color:
                        gnssStatus === 'jammed'
                          ? 'var(--status-warn)'
                          : gnssStatus === 'spoofed'
                          ? 'var(--status-danger)'
                          : gnssStatus === 'outage'
                          ? 'var(--text-dim)'
                          : 'var(--status-ok)',
                    }}
                  >
                    <Navigation size={11} /> GNSS
                  </span>
                  <span
                    className="text-[8.5px] px-1 py-0.2 rounded font-bold uppercase"
                    style={{
                      background:
                        gnssStatus === 'nominal'
                          ? 'var(--status-ok-subtle)'
                          : gnssStatus === 'jammed'
                          ? 'var(--status-warn-subtle)'
                          : 'var(--status-danger-subtle)',
                      color:
                        gnssStatus === 'nominal'
                          ? 'var(--status-ok)'
                          : gnssStatus === 'jammed'
                          ? 'var(--status-warn)'
                          : 'var(--status-danger)',
                    }}
                  >
                    {gnssStatus}
                  </span>
                </div>
                <div className="text-[9.5px] space-y-0.5 text-[var(--text-secondary)]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">1σ Horiz:</span>
                    <strong className="text-[var(--text-primary)]">{gnssFix?.noSolution ? 'Lost' : `${gnssSigma.toFixed(1)}m`}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">HPL (3σ):</span>
                    <strong className="text-[var(--text-primary)]">{gnssFix?.noSolution ? 'Lost' : `${gnssHpl.toFixed(1)}m`}</strong>
                  </div>
                  <div className="flex justify-between text-[9px] text-[var(--text-dim)]">
                    <span>Signal:</span>
                    <span>{gnssStatus === 'spoofed' ? `+${settings.gnssSpoofBiasMeters || 150}m` : 'L1/L5'}</span>
                  </div>
                </div>
              </div>

              {/* 3. Fused BLUE Solution */}
              <div
                className="p-2 rounded-lg space-y-1 border transition bg-[var(--bg-canvas)]"
                style={{
                  borderColor: currentMode === 'fusion' ? '#a855f7' : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10.5px] font-bold" style={{ color: '#a855f7' }}>
                    <Compass size={11} /> BLUE
                  </span>
                  <span
                    className="text-[8.5px] px-1 py-0.2 rounded font-bold uppercase"
                    style={{
                      background: fix?.noSolution ? 'var(--status-danger-subtle)' : '#a855f720',
                      color: fix?.noSolution ? 'var(--status-danger)' : '#a855f7',
                    }}
                  >
                    {fix?.mode === 'fusion' ? 'OPTIMAL' : 'FALLBACK'}
                  </span>
                </div>
                <div className="text-[9.5px] space-y-0.5 text-[var(--text-secondary)]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">Error:</span>
                    <strong style={{ color: fix?.errorMeters > settings.integrityThresholdMeters ? 'var(--status-danger)' : 'var(--text-primary)' }}>
                      {fix?.errorMeters ? `${fix.errorMeters.toFixed(1)}m` : '0m'}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">HPL (3σ):</span>
                    <strong style={{ color: isHplCompliant ? 'var(--status-ok)' : 'var(--status-danger)' }}>
                      {currentHpl ? `${currentHpl.toFixed(1)}m` : 'n/a'}
                    </strong>
                  </div>
                  <div className="flex justify-between text-[9px] text-[var(--text-dim)]">
                    <span>Weight:</span>
                    <span>{eloranPct}%e / {gnssPct}%g</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Horizontal Protection Level (HPL) vs Alert Limit Gauge */}
          <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-2 font-mono text-xs shadow-xs">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[11px] uppercase tracking-wider text-[var(--text-dim)]">
                  Integrity Alert Limit (AL)
                </span>
                <InfoTooltip
                  align="left"
                  title="Alert Limit (HAL)"
                  text="Horizontal Protection Level (HPL) must remain strictly below the Alert Limit (HAL) for the phase of flight/navigation to ensure life-safety integrity."
                />
              </div>

              <div className="flex items-center gap-1 text-[10px]">
                {Object.entries(alertLimits).map(([key, limit]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedAlertLimit(key)}
                    className="px-1.5 py-0.5 rounded font-mono transition cursor-pointer text-[9.5px]"
                    style={{
                      background: selectedAlertLimit === key ? 'var(--accent-eloran)' : 'var(--bg-subtle)',
                      color: selectedAlertLimit === key ? 'var(--btn-eloran-text)' : 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                      fontWeight: selectedAlertLimit === key ? 700 : 400,
                    }}
                    title={limit.desc}
                  >
                    {limit.label.split(' ')[0]} ({limit.value}m)
                  </button>
                ))}
              </div>
            </div>

            {/* Gauge Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono">
                <span>HPL: <strong style={{ color: isHplCompliant ? 'var(--status-ok)' : 'var(--status-danger)' }}>{currentHpl.toFixed(1)} m</strong></span>
                <span>Limit: <strong>{currentLimit.value} m</strong></span>
              </div>

              <div className="relative h-2.5 rounded-full overflow-hidden bg-[var(--bg-muted)]">
                {/* Green safe zone */}
                <div
                  className="absolute left-0 top-0 bottom-0 transition-all duration-300"
                  style={{
                    width: `${limitLinePercent}%`,
                    background: 'rgba(16, 185, 129, 0.2)',
                    borderRight: '2px dashed var(--status-danger)',
                  }}
                />
                {/* Current HPL fill bar */}
                <div
                  className="h-full transition-all duration-300 rounded-full"
                  style={{
                    width: `${hplGaugePercent}%`,
                    background: isHplCompliant ? 'var(--status-ok)' : 'var(--status-danger)',
                    opacity: 0.85,
                  }}
                />
              </div>

              <div className="flex justify-between items-center text-[10px] pt-0.5 font-mono">
                <span
                  className="font-bold flex items-center gap-1 text-[9.5px]"
                  style={{ color: isHplCompliant ? 'var(--status-ok)' : 'var(--status-danger)' }}
                >
                  {isHplCompliant ? <ShieldCheck size={11} /> : <AlertTriangle size={11} />}
                  {isHplCompliant ? 'INTEGRITY SECURE' : 'HMI HAZARD BREACH'}
                </span>
                <span className="text-[9.5px] text-[var(--text-dim)]">
                  Margin: {isHplCompliant ? `+${(currentLimit.value - currentHpl).toFixed(1)}m` : `-${(currentHpl - currentLimit.value).toFixed(1)}m`}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Degradation Buttons */}
          <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-2 font-mono text-xs shadow-xs">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-[11px] uppercase tracking-wider text-[var(--text-dim)]">
                Satellite Signal State
              </span>
              <button
                onClick={() => setActiveTab('ew')}
                className="text-[10px] text-[var(--accent-eloran)] hover:underline cursor-pointer flex items-center gap-0.5"
              >
                EW Lab &rarr;
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1 font-mono text-[10.5px]">
              {degradationOptions.map(({ id, label, icon: Icon, color, desc }) => (
                <button
                  key={id}
                  data-testid={`gnss-status-${id}`}
                  onClick={() => handleGnssStatusChange(id)}
                  className="py-1 px-1 rounded-md text-center transition flex flex-col items-center gap-0.5 cursor-pointer"
                  style={{
                    background: gnssStatus === id ? 'var(--bg-surface)' : 'var(--bg-subtle)',
                    border: gnssStatus === id ? `1px solid ${color}` : '1px solid var(--border-subtle)',
                    color: gnssStatus === id ? color : 'var(--text-secondary)',
                    fontWeight: gnssStatus === id ? 700 : 400,
                  }}
                  title={desc}
                >
                  <Icon size={12} style={{ color: gnssStatus === id ? color : 'var(--text-muted)' }} />
                  <span className="text-[10px] truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Covariance Ellipses Toggle */}
          <div className="pt-0.5">
            <Toggle
              label="95% Covariance Error Ellipses on Map"
              checked={settings.showCovarianceEllipses !== false}
              onChange={(checked) => updateSettings({ showCovarianceEllipses: checked })}
              tooltip="Renders 95% (2.45σ) uncertainty ellipses for eLoran (cyan), GNSS (green/red), and BLUE fused (purple) solutions on MapView."
            />
          </div>

          {/* DDS Telemetry Stream */}
          <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
                DDS Broadcasts ({ddsLogs.length})
              </span>
              <InfoTooltip
                align="right"
                title="DDS Data Broadcasts"
                text="Multi-sensor fusion layers active: PF atmospheric refraction, TOA noise injection, Millington mixed-path ASF, and cycle slip monitoring."
              />
            </div>
            <div className="h-20 overflow-y-auto p-2 rounded-lg text-[9.5px] font-mono space-y-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
              {ddsLogs.length === 0 ? (
                <div className="text-[var(--text-dim)]">No DDS broadcast packets captured yet...</div>
              ) : (
                ddsLogs
                  .slice()
                  .reverse()
                  .map((log, i) => (
                    <div key={i} className="flex items-center justify-between pb-0.5 border-b border-[var(--border-subtle)]/40">
                      <span className="text-[var(--accent-eloran)]">[{log.station}]</span>
                      <span className="text-[var(--text-secondary)]">Seq #{log.seq}</span>
                      <span className="text-[var(--text-muted)]">Diff: {log.diffMeters}m</span>
                      <span className="text-[var(--status-ok)]">{log.integrityStatus}</span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STANFORD INTEGRITY MATRIX */}
      {activeTab === 'stanford' && (
        <div className="space-y-3 font-mono text-xs">
          <StanfordDiagram
            currentHpe={fix?.errorMeters || 4.2}
            currentHpl={currentHpl || 12.5}
          />
        </div>
      )}

      {/* TAB 3: ELECTRONIC WARFARE & ANTI-SPOOFING LAB */}
      {activeTab === 'ew' && (
        <div className="space-y-3.5 font-mono text-xs">
          {/* Sourced EW Header Banner */}
          <div
            className="p-3 rounded-xl flex items-center justify-between gap-2"
            style={{
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)',
              border: '1px solid var(--accent-eloran-border)',
            }}
          >
            <div>
              <div className="flex items-center gap-1.5 font-bold text-xs uppercase text-[var(--accent-eloran)]">
                <ShieldCheck size={14} /> eLoran Groundwave Resilience
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                {eloranMargin.summary}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-bold text-[var(--accent-eloran)]">
                +{eloranMargin.powerAdvantageDb.toFixed(1)} dB
              </div>
              <div className="text-[9px] text-[var(--text-dim)]">Power Margin vs GPS</div>
            </div>
          </div>

          {/* Jammer RF Path Loss Physics Box */}
          <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-3 shadow-xs">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5 font-bold text-[11px] text-[var(--text-primary)]">
                <Zap size={13} className="text-[var(--status-warn)]" />
                <span>Friis J/S RF Propagation Engine</span>
              </div>
              <div
                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                style={{
                  background:
                    ewAnalysis.receiverState === 'nominal'
                      ? 'rgba(34, 197, 94, 0.15)'
                      : ewAnalysis.receiverState === 'degraded'
                      ? 'rgba(234, 179, 8, 0.15)'
                      : 'rgba(239, 68, 68, 0.15)',
                  color:
                    ewAnalysis.receiverState === 'nominal'
                      ? 'var(--status-ok)'
                      : ewAnalysis.receiverState === 'degraded'
                      ? 'var(--status-warn)'
                      : 'var(--status-error)',
                }}
              >
                {ewAnalysis.receiverState}
              </div>
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span>Power (EIRP):</span>
                  <span className="font-bold text-[var(--text-primary)]">{jammerPowerWatts} W (+{ewAnalysis.jammerPowerDbw.toFixed(1)} dBW)</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={jammerPowerWatts}
                  onChange={(e) => setJammerPowerWatts(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--status-warn)]"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span>Distance to Jammer:</span>
                  <span className="font-bold text-[var(--text-primary)]">{jammerDistanceKm} km</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={200}
                  step={1}
                  value={jammerDistanceKm}
                  onChange={(e) => setJammerDistanceKm(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--status-warn)]"
                />
              </div>
            </div>

            {/* Path Loss Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
              <div className="p-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                <div className="text-[9px] text-[var(--text-dim)]">FSPL</div>
                <div className="text-xs font-bold text-[var(--text-primary)] mt-0.5">{ewAnalysis.pathLossDb.toFixed(1)} dB</div>
              </div>
              <div className="p-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                <div className="text-[9px] text-[var(--text-dim)]">Rx Power</div>
                <div className="text-xs font-bold text-[var(--text-primary)] mt-0.5">{ewAnalysis.rxJammerPowerDbw.toFixed(1)} dBW</div>
              </div>
              <div className="p-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                <div className="text-[9px] text-[var(--text-dim)]">J/S Ratio</div>
                <div className="text-xs font-bold text-[var(--status-warn)] mt-0.5">+{ewAnalysis.jsRatioDb.toFixed(1)} dB</div>
              </div>
              <div className="p-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                <div className="text-[9px] text-[var(--text-dim)]">Induced Noise</div>
                <div className="text-xs font-bold mt-0.5" style={{ color: ewAnalysis.isDenied ? 'var(--status-error)' : 'var(--text-primary)' }}>
                  {ewAnalysis.isDenied ? 'DENIED' : `${ewAnalysis.inducedNoiseStdMeters.toFixed(1)} m`}
                </div>
              </div>
            </div>
          </div>

          {/* Spoofing Trajectory Pull-Off & eLoran Cross-Check */}
          <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-3 shadow-xs">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5 font-bold text-[11px] text-[var(--text-primary)]">
                <Crosshair size={13} className="text-[var(--status-danger)]" />
                <span>Spoofing Pull-off &amp; eLoran Cross-Check</span>
              </div>
              <button
                onClick={() => handleGnssStatusChange(gnssStatus === 'spoofed' ? 'nominal' : 'spoofed')}
                className="px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer"
                style={{
                  background: gnssStatus === 'spoofed' ? 'var(--status-danger)' : 'var(--bg-subtle)',
                  color: gnssStatus === 'spoofed' ? '#ffffff' : 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {gnssStatus === 'spoofed' ? 'Disable' : 'Activate Attack'}
              </button>
            </div>

            {gnssStatus === 'spoofed' && spoofAttack && (
              <div className="space-y-2.5 pt-1">
                {/* Alert Banner */}
                <div
                  className="p-2 rounded-lg flex items-center gap-2 font-bold text-[10.5px]"
                  style={{
                    background: spoofAttack.spoofingDetected ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                    border: spoofAttack.spoofingDetected ? '1px solid var(--status-error)' : '1px solid var(--status-warn)',
                    color: spoofAttack.spoofingDetected ? 'var(--status-error)' : 'var(--status-warn)',
                  }}
                >
                  <AlertTriangle size={13} className="shrink-0" />
                  <span className="truncate">{spoofAttack.alertMessage}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span>False Drift Rate:</span>
                      <span className="font-bold text-[var(--text-primary)]">{settings.gnssSpoofBiasMeters || 150} m/min</span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={400}
                      step={10}
                      value={settings.gnssSpoofBiasMeters || 150}
                      onChange={(e) => updateSettings({ gnssSpoofBiasMeters: Number(e.target.value) })}
                      className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--status-danger)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span>Elapsed Attack Time:</span>
                      <span className="font-bold text-[var(--text-primary)]">{spoofElapsedSec}s</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={600}
                      step={10}
                      value={spoofElapsedSec}
                      onChange={(e) => setSpoofElapsedSec(Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--status-danger)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                  <div className="p-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                    <div className="text-[9px] text-[var(--text-dim)]">Accum. Drift</div>
                    <div className="text-xs font-bold text-[var(--status-danger)] mt-0.5">{spoofAttack.driftMeters.toFixed(1)} m</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                    <div className="text-[9px] text-[var(--text-dim)]">Discrepancy</div>
                    <div className="text-xs font-bold text-[var(--text-primary)] mt-0.5">{spoofAttack.eLoranCrossCheckDiscrepancyM.toFixed(1)} m</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                    <div className="text-[9px] text-[var(--text-dim)]">Threshold</div>
                    <div className="text-xs font-bold text-[var(--status-ok)] mt-0.5">50m (HEA)</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
