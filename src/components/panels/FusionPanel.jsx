import React, { useState, useMemo } from 'react';
import {
  ShieldCheck, AlertTriangle, Radio, Navigation, Compass,
  WifiOff, Zap, CheckCircle2, Sliders, Activity, Info, Crosshair, Lock
} from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import Slider from '../ui/Slider.jsx';
import Toggle from '../ui/Toggle.jsx';
import { InfoTooltip } from '../ui/Tooltip.jsx';
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
    <div
      className="p-5 rounded-xl space-y-6 shadow-sm font-sans"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Top Header & Sub-Tab Navigation */}
      <div className="flex flex-col gap-3 border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--accent-eloran)]">
            <Activity size={14} /> Multi-Source Fusion &amp; EW Resilience
          </div>
          <h2 className="text-xl font-bold font-mono text-[var(--text-primary)]">
            BLUE Kalman Fusion &amp; Resilient PNT Suite
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Inverse-covariance weighting, Stanford safety containment matrix, and Electronic Warfare anti-spoofing countermeasures.
          </p>
        </div>

        {/* Sub-Tabs */}
        <div
          className="grid grid-cols-3 gap-1 rounded-lg p-1 text-xs font-mono w-full"
          style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}
        >
          {[
            ['overview', 'Overview'],
            ['stanford', 'Stanford Matrix'],
            ['ew', 'EW Defense'],
          ].map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="py-1.5 px-1 rounded-md text-center transition-all cursor-pointer font-medium text-[11px] truncate"
              style={
                activeTab === tab
                  ? { background: 'var(--accent-eloran)', color: 'var(--btn-eloran-text)', fontWeight: 700, boxShadow: 'var(--shadow-subtle)' }
                  : { color: 'var(--text-secondary)' }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Receiver Selection Header */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
          Active Target Receiver
        </label>
        {receivers.length > 1 && (
          <select
            value={selectedReceiver}
            onChange={(e) => setSelectedReceiver(e.target.value)}
            className="text-xs font-mono p-1 rounded"
            style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            {receivers.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label} ({r.lat.toFixed(2)}°, {r.lng.toFixed(2)}°)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* TAB 1: OVERVIEW & SENSOR FUSION */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* PNT Mode Switcher */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
                PNT Navigation Architecture
              </label>
              <InfoTooltip content="Switch between multi-source BLUE inverse-covariance fusion, terrestrial eLoran only, and GNSS satellite only." />
            </div>
            <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
              {modes.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => handleModeChange(id)}
                  className="py-2 px-2 rounded-lg text-center transition flex flex-col items-center gap-1 cursor-pointer"
                  style={currentMode === id
                    ? { background: 'var(--accent-eloran-subtle)', border: '1px solid var(--accent-eloran-border)', color: 'var(--accent-eloran)', fontWeight: 700 }
                    : { background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  <Icon size={14} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Side-by-Side Solution Quality Cards */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
                Multi-Source Fix Comparison
              </label>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                Ratio: {eloranPct}% eLoran / {gnssPct}% GNSS
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono">
              {/* 1. eLoran Standalone */}
              <div
                className="p-2.5 rounded-lg space-y-1.5 border transition"
                style={{
                  background: 'var(--bg-subtle)',
                  borderColor: currentMode === 'eLoran' ? 'var(--accent-eloran)' : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: '#06b6d4' }}>
                    <Radio size={12} /> eLoran (LF)
                  </span>
                  <span
                    className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase"
                    style={{
                      background: eloranSol?.noSolution ? 'var(--status-danger-subtle)' : 'var(--status-ok-subtle)',
                      color: eloranSol?.noSolution ? 'var(--status-danger)' : 'var(--status-ok)',
                    }}
                  >
                    {eloranSol?.noSolution ? 'FAIL' : 'LOCK'}
                  </span>
                </div>
                <div className="text-[10px] space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
                  <div>Coords: {eloranSol?.lat ? `${eloranSol.lat.toFixed(4)}°, ${eloranSol.lng.toFixed(4)}°` : 'No Fix'}</div>
                  <div>1σ Horiz: <span className="font-bold">{eloranSol?.noSolution ? 'n/a' : `${eloranSigma.toFixed(1)} m`}</span></div>
                  <div>HPL (3σ): <span className="font-bold">{eloranSol?.noSolution ? 'n/a' : `${eloranHpl.toFixed(1)} m`}</span></div>
                  <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>HDOP: {eloranSol?.hdop?.toFixed(2) || 'n/a'}</div>
                </div>
              </div>

              {/* 2. GNSS Standalone */}
              <div
                className="p-2.5 rounded-lg space-y-1.5 border transition"
                style={{
                  background: 'var(--bg-subtle)',
                  borderColor: currentMode === 'GNSS' ? 'var(--status-ok)' : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="flex items-center gap-1 text-[11px] font-bold"
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
                    <Navigation size={12} /> GNSS (L-band)
                  </span>
                  <span
                    className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase"
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
                <div className="text-[10px] space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
                  <div>Coords: {gnssFix?.noSolution ? 'Outage' : `${gnssFix?.lat?.toFixed(4)}°, ${gnssFix?.lng?.toFixed(4)}°`}</div>
                  <div>1σ Horiz: <span className="font-bold">{gnssFix?.noSolution ? 'Lost' : `${gnssSigma.toFixed(1)} m`}</span></div>
                  <div>HPL (3σ): <span className="font-bold">{gnssFix?.noSolution ? 'Lost' : `${gnssHpl.toFixed(1)} m`}</span></div>
                  <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                    {gnssStatus === 'spoofed' ? `Bias: +${settings.gnssSpoofBiasMeters || 150}m` : 'Carrier: L1/L5'}
                  </div>
                </div>
              </div>

              {/* 3. Fused BLUE Solution */}
              <div
                className="p-2.5 rounded-lg space-y-1.5 border transition"
                style={{
                  background: 'var(--bg-subtle)',
                  borderColor: currentMode === 'fusion' ? '#a855f7' : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: '#a855f7' }}>
                    <Compass size={12} /> BLUE Fused
                  </span>
                  <span
                    className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase"
                    style={{
                      background: fix?.noSolution ? 'var(--status-danger-subtle)' : '#a855f720',
                      color: fix?.noSolution ? 'var(--status-danger)' : '#a855f7',
                    }}
                  >
                    {fix?.mode === 'fusion' ? 'OPTIMAL' : 'FALLBACK'}
                  </span>
                </div>
                <div className="text-[10px] space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
                  <div>Coords: {fix?.lat ? `${fix.lat.toFixed(4)}°, ${fix.lng.toFixed(4)}°` : 'Calculating'}</div>
                  <div>True Error: <span className="font-bold" style={{ color: fix?.errorMeters > settings.integrityThresholdMeters ? 'var(--status-danger)' : 'var(--text-primary)' }}>{fix?.errorMeters ? `${fix.errorMeters.toFixed(1)} m` : '0 m'}</span></div>
                  <div>HPL (3σ): <span className="font-bold" style={{ color: isHplCompliant ? 'var(--status-ok)' : 'var(--status-danger)' }}>{currentHpl ? `${currentHpl.toFixed(1)} m` : 'n/a'}</span></div>
                  <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>Weight: {eloranPct}%e / {gnssPct}%g</div>
                </div>
              </div>
            </div>
          </div>

          {/* Horizontal Protection Level (HPL) vs Alert Limit Gauge */}
          <div
            className="p-3 rounded-lg space-y-2.5 font-mono text-xs border"
            style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-xs uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
                  Integrity Alert Limit (AL)
                </span>
                <InfoTooltip content="Horizontal Protection Level (HPL) must remain strictly below the Alert Limit (HAL) for the phase of flight/navigation to ensure life-safety integrity." />
              </div>

              <div className="flex items-center gap-1 text-[10px]">
                {Object.entries(alertLimits).map(([key, limit]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedAlertLimit(key)}
                    className="px-2 py-0.5 rounded font-mono transition cursor-pointer"
                    style={{
                      background: selectedAlertLimit === key ? 'var(--accent-eloran)' : 'var(--bg-canvas)',
                      color: selectedAlertLimit === key ? '#ffffff' : 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
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
              <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span>HPL: <strong style={{ color: isHplCompliant ? 'var(--status-ok)' : 'var(--status-danger)' }}>{currentHpl.toFixed(1)} m</strong></span>
                <span>Alert Limit: <strong>{currentLimit.value} m</strong> ({currentLimit.label})</span>
              </div>

              <div className="relative h-4 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
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

              <div className="flex justify-between items-center text-[10px] pt-0.5">
                <span
                  className="font-bold flex items-center gap-1"
                  style={{ color: isHplCompliant ? 'var(--status-ok)' : 'var(--status-danger)' }}
                >
                  {isHplCompliant ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
                  {isHplCompliant ? 'INTEGRITY SECURE' : 'HAZARD MISLEADING INFORMATION (HMI)'}
                </span>
                <span style={{ color: 'var(--text-dim)' }}>
                  Margin: {isHplCompliant ? `+${(currentLimit.value - currentHpl).toFixed(1)} m` : `-${(currentHpl - currentLimit.value).toFixed(1)} m BREACH`}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Degradation Buttons */}
          <div
            className="p-3 rounded-lg space-y-3 font-mono text-xs border"
            style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex justify-between items-center">
              <span className="font-semibold text-xs uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
                Satellite Signal State
              </span>
              <button
                onClick={() => setActiveTab('ew')}
                className="text-[11px] text-[var(--accent-eloran)] hover:underline cursor-pointer flex items-center gap-1"
              >
                Launch Full EW Simulator &rarr;
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5 font-mono text-[11px]">
              {degradationOptions.map(({ id, label, icon: Icon, color, desc }) => (
                <button
                  key={id}
                  data-testid={`gnss-status-${id}`}
                  onClick={() => handleGnssStatusChange(id)}
                  className="py-1.5 px-1 rounded-md text-center transition flex flex-col items-center gap-0.5 cursor-pointer"
                  style={{
                    background: gnssStatus === id ? 'var(--bg-surface)' : 'var(--bg-canvas)',
                    border: gnssStatus === id ? `1px solid ${color}` : '1px solid var(--border-subtle)',
                    color: gnssStatus === id ? color : 'var(--text-secondary)',
                    fontWeight: gnssStatus === id ? 700 : 400,
                  }}
                  title={desc}
                >
                  <Icon size={13} style={{ color: gnssStatus === id ? color : 'var(--text-muted)' }} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Covariance Ellipses Toggle */}
          <div className="pt-1">
            <Toggle
              label="Display 95% Covariance Error Ellipses on Map"
              checked={settings.showCovarianceEllipses !== false}
              onChange={(checked) => updateSettings({ showCovarianceEllipses: checked })}
              tooltip="Renders 95% (2.45σ) uncertainty ellipses for eLoran (cyan), GNSS (green/red), and BLUE fused (purple) solutions on MapView."
            />
          </div>

          {/* Active Models Provenance Indicator */}
          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span className="text-[var(--text-secondary)] font-medium">
              Multi-Sensor Fusion Layers
            </span>
            <InfoTooltip
              align="right"
              text="Active physics layers: PF atmospheric refraction (RTCM), TOA noise injection (Rhee), Millington mixed-path ASF (Turf.js Great-Circle coastline segmentation, Natural Earth vector polygons, ITU-R P.368 conductivities), and Boyce cycle slip monitoring."
            />
          </div>

          {/* DDS Telemetry Stream */}
          <div className="space-y-1.5 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <span className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
              eLoran Data Channel Broadcasts ({ddsLogs.length})
            </span>
            <div
              className="h-24 overflow-y-auto p-2 rounded-lg text-[10px] font-mono space-y-1"
              style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              {ddsLogs.length === 0 ? (
                <div style={{ color: 'var(--text-dim)' }}>No DDS broadcast packets captured yet...</div>
              ) : (
                ddsLogs
                  .slice()
                  .reverse()
                  .map((log, i) => (
                    <div key={i} className="flex items-center justify-between pb-0.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: 'var(--accent-eloran)' }}>[{log.station}]</span>
                      <span style={{ color: 'var(--text-secondary)' }}>Seq #{log.seq}</span>
                      <span style={{ color: 'var(--text-muted)' }}>Diff: {log.diffMeters}m</span>
                      <span style={{ color: 'var(--status-ok)' }}>{log.integrityStatus}</span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STANFORD INTEGRITY MATRIX */}
      {activeTab === 'stanford' && (
        <div className="space-y-4">
          <StanfordDiagram
            currentHpe={fix?.errorMeters || 4.2}
            currentHpl={currentHpl || 12.5}
          />
        </div>
      )}

      {/* TAB 3: ELECTRONIC WARFARE & ANTI-SPOOFING LAB */}
      {activeTab === 'ew' && (
        <div className="space-y-6 font-mono text-xs">
          {/* Sourced EW Header Banner */}
          <div
            className="p-4 rounded-xl flex flex-col justify-between items-start gap-3"
            style={{
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)',
              border: '1px solid var(--accent-eloran-border)',
            }}
          >
            <div>
              <div className="flex items-center gap-1.5 font-bold text-xs uppercase text-[var(--accent-eloran)]">
                <ShieldCheck size={16} /> eLoran High-Power Groundwave Resilience Advantage
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {eloranMargin.summary}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold text-[var(--accent-eloran)]">
                +{eloranMargin.powerAdvantageDb.toFixed(1)} dB
              </div>
              <div className="text-[10px] text-[var(--text-dim)]">Power Margin vs GPS</div>
            </div>
          </div>

          {/* Jammer RF Path Loss Physics Box */}
          <div className="p-4 rounded-xl space-y-4" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                <Zap size={14} className="text-[var(--status-warn)]" />
                <span>Friis Jammer-to-Signal (J/S) RF Propagation Engine</span>
              </div>
              <div
                className="px-2.5 py-1 rounded text-[11px] font-bold uppercase"
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
                GNSS Status: {ewAnalysis.receiverState}
              </div>
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span>Jammer RF Power (EIRP):</span>
                  <span className="font-bold text-[var(--text-primary)]">{jammerPowerWatts} Watts (+{ewAnalysis.jammerPowerDbw.toFixed(1)} dBW)</span>
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
                <div className="flex justify-between text-[11px]">
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
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <div className="p-2.5 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="text-[10px] text-[var(--text-dim)]">Free Space Loss (FSPL)</div>
                <div className="text-base font-bold text-[var(--text-primary)] mt-0.5">{ewAnalysis.pathLossDb.toFixed(1)} dB</div>
              </div>
              <div className="p-2.5 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="text-[10px] text-[var(--text-dim)]">Received Jammer Power</div>
                <div className="text-base font-bold text-[var(--text-primary)] mt-0.5">{ewAnalysis.rxJammerPowerDbw.toFixed(1)} dBW</div>
              </div>
              <div className="p-2.5 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="text-[10px] text-[var(--text-dim)]">Jammer-to-Signal (J/S)</div>
                <div className="text-base font-bold text-[var(--status-warn)] mt-0.5">+{ewAnalysis.jsRatioDb.toFixed(1)} dB</div>
              </div>
              <div className="p-2.5 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="text-[10px] text-[var(--text-dim)]">Induced Noise (1σ)</div>
                <div className="text-base font-bold mt-0.5" style={{ color: ewAnalysis.isDenied ? 'var(--status-error)' : 'var(--text-primary)' }}>
                  {ewAnalysis.isDenied ? 'DENIED' : `${ewAnalysis.inducedNoiseStdMeters.toFixed(1)} m`}
                </div>
              </div>
            </div>
          </div>

          {/* Spoofing Trajectory Pull-Off & eLoran Cross-Check */}
          <div className="p-4 rounded-xl space-y-4" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                <Crosshair size={14} className="text-[var(--status-danger)]" />
                <span>GNSS Spoofing Trajectory Pull-off &amp; eLoran Cross-Check</span>
              </div>
              <button
                onClick={() => handleGnssStatusChange(gnssStatus === 'spoofed' ? 'nominal' : 'spoofed')}
                className="px-3 py-1 rounded text-xs font-bold transition cursor-pointer"
                style={{
                  background: gnssStatus === 'spoofed' ? 'var(--status-danger)' : 'var(--bg-surface)',
                  color: gnssStatus === 'spoofed' ? '#ffffff' : 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {gnssStatus === 'spoofed' ? 'Disable Spoofing' : 'Activate Spoofing Attack'}
              </button>
            </div>

            {gnssStatus === 'spoofed' && spoofAttack && (
              <div className="space-y-4">
                {/* Alert Banner */}
                <div
                  className="p-3 rounded-lg flex items-center gap-2.5 font-bold text-xs"
                  style={{
                    background: spoofAttack.spoofingDetected ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                    border: spoofAttack.spoofingDetected ? '1px solid var(--status-error)' : '1px solid var(--status-warn)',
                    color: spoofAttack.spoofingDetected ? 'var(--status-error)' : 'var(--status-warn)',
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>{spoofAttack.alertMessage}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
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
                    <div className="flex justify-between text-[11px]">
                      <span>Elapsed Attack Time:</span>
                      <span className="font-bold text-[var(--text-primary)]">{spoofElapsedSec} seconds</span>
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

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <div className="p-2.5 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <div className="text-[10px] text-[var(--text-dim)]">Accumulated False Drift</div>
                    <div className="text-base font-bold text-[var(--status-danger)] mt-0.5">{spoofAttack.driftMeters.toFixed(1)} m</div>
                  </div>
                  <div className="p-2.5 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <div className="text-[10px] text-[var(--text-dim)]">eLoran Discrepancy</div>
                    <div className="text-base font-bold text-[var(--text-primary)] mt-0.5">{spoofAttack.eLoranCrossCheckDiscrepancyM.toFixed(1)} m</div>
                  </div>
                  <div className="p-2.5 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <div className="text-[10px] text-[var(--text-dim)]">Integrity Alarm Threshold</div>
                    <div className="text-base font-bold text-[var(--status-ok)] mt-0.5">50.0 m (HEA Res)</div>
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
