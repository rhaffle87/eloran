import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Radio,
  Sliders,
  RotateCcw,
  Zap,
} from 'lucide-react';
import {
  ALERT_LIMIT_PRESETS,
  classifyStanfordZone,
  STANFORD_ZONES,
  performRaimFde,
} from '../../lib/integrityRaim.js';

export default function StanfordDiagram({
  currentHpe = 4.2,
  currentHpl = 12.5,
  observations = null,
  residuals = null,
  sigmas = null,
}) {
  const [selectedPreset, setSelectedPreset] = useState('maritime_hea');
  const [simHpe, setSimHpe] = useState(null);
  const [simHpl, setSimHpl] = useState(null);

  // Active Alert Limit
  const preset = ALERT_LIMIT_PRESETS[selectedPreset] || ALERT_LIMIT_PRESETS.maritime_hea;
  const hal = preset.halMeters;

  // Active values (allow interactive simulation override)
  const hpe = simHpe !== null ? simHpe : Math.max(0, currentHpe || 0);
  const hpl = simHpl !== null ? simHpl : Math.max(0, currentHpl || 0);

  // Classification
  const classification = useMemo(() => {
    return classifyStanfordZone(hpe, hpl, hal);
  }, [hpe, hpl, hal]);

  // RAIM FDE analysis
  const raim = useMemo(() => {
    if (observations && residuals && sigmas) {
      return performRaimFde(observations, residuals, sigmas);
    }
    // Default simulated RAIM with 5 stations
    const mockObs = [{ station: { label: 'Sylt' } }, { station: { label: 'Lessay' } }, { station: { label: 'Værlandet' } }, { station: { label: 'Anthorn' } }, { station: { label: 'Bø' } }];
    const mockRes = [1.2, -0.8, 1.9, -1.1, classification.zone === STANFORD_ZONES.HMI ? 35.0 : 0.4];
    const mockSig = [3.5, 3.5, 4.0, 3.0, 3.5];
    return performRaimFde(mockObs, mockRes, mockSig);
  }, [observations, residuals, sigmas, classification.zone]);

  // SVG coordinate transformation
  // Dynamic scale: max of (1.5 * HAL, 1.2 * HPE, 1.2 * HPL)
  const maxVal = Math.max(hal * 1.5, hpe * 1.2, hpl * 1.2, 15);
  const svgSize = 340;
  const padding = 45;
  const plotSize = svgSize - 2 * padding;

  const scale = (val) => (val / maxVal) * plotSize;
  const toSvgX = (xVal) => padding + scale(xVal);
  const toSvgY = (yVal) => padding + plotSize - scale(yVal); // Invert Y

  // Coordinate lines
  const halX = toSvgX(hal);
  const halY = toSvgY(hal);
  const curX = toSvgX(hpe);
  const curY = toSvgY(hpl);

  // Colors per zone
  const getZoneBadge = () => {
    switch (classification.zone) {
      case STANFORD_ZONES.NORMAL:
        return { bg: 'rgba(34, 197, 94, 0.15)', border: 'var(--status-ok)', text: 'var(--status-ok)', icon: ShieldCheck };
      case STANFORD_ZONES.UNAVAILABLE:
        return { bg: 'rgba(234, 179, 8, 0.15)', border: 'var(--status-warn)', text: 'var(--status-warn)', icon: AlertTriangle };
      case STANFORD_ZONES.MI:
        return { bg: 'rgba(249, 115, 22, 0.15)', border: '#f97316', text: '#f97316', icon: AlertTriangle };
      case STANFORD_ZONES.HMI:
      default:
        return { bg: 'rgba(239, 68, 68, 0.2)', border: 'var(--status-error)', text: 'var(--status-error)', icon: Zap };
    }
  };

  const badge = getZoneBadge();
  const BadgeIcon = badge.icon;

  return (
    <div
      className="p-5 rounded-xl space-y-5 shadow-sm font-sans"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--accent-eloran)]">
            <Radio size={14} /> RTCA DO-229D / ICAO Annex 10
          </div>
          <h2 className="text-xl font-bold font-mono text-[var(--text-primary)]">
            Stanford Diagram &amp; RAIM Integrity Matrix
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            2D Horizontal Protection Level (HPL) vs Horizontal Position Error (HPE) safety containment.
          </p>
        </div>

        {/* Operational Zone Status Badge */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold"
          style={{
            background: badge.bg,
            border: `1px solid ${badge.border}`,
            color: badge.text,
          }}
        >
          <BadgeIcon size={14} />
          <span>{classification.label}</span>
        </div>
      </div>

      {/* Preset Alert Limit Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-mono font-bold text-[var(--text-secondary)] uppercase mr-1">
          Alert Limit (HAL):
        </span>
        {Object.values(ALERT_LIMIT_PRESETS).map((p) => {
          const isSelected = selectedPreset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedPreset(p.id)}
              className="px-2.5 py-1 rounded text-xs font-mono font-semibold transition cursor-pointer"
              style={{
                background: isSelected ? 'var(--accent-eloran)' : 'var(--bg-subtle)',
                color: isSelected ? 'var(--btn-eloran-text)' : 'var(--text-primary)',
                border: isSelected ? '1px solid var(--accent-eloran)' : '1px solid var(--border-subtle)',
              }}
              title={p.description}
            >
              {p.name.split(' ')[0]} ({p.halMeters}m)
            </button>
          );
        })}
      </div>

      {/* Main Grid: SVG Plot + Metrics & Fault Injection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* SVG Stanford Plot (col-span-7) */}
        <div className="lg:col-span-7 flex justify-center">
          <div
            className="p-2 rounded-xl relative select-none"
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <svg
              viewBox={`0 0 ${svgSize} ${svgSize}`}
              className="w-full max-w-[380px] h-auto font-mono text-[9px]"
            >
              <defs>
                {/* Zone Pattern / Colors */}
                <clipPath id="plot-clip">
                  <rect x={padding} y={padding} width={plotSize} height={plotSize} />
                </clipPath>
              </defs>

              {/* Plot Background (clipped) */}
              <g clipPath="url(#plot-clip)">
                {/* Zone 1: Normal Operations (Green: HPE <= HPL <= HAL) */}
                <polygon
                  points={`${toSvgX(0)},${toSvgY(0)} ${halX},${toSvgY(0)} ${halX},${halY} ${toSvgX(0)},${halY}`}
                  fill="rgba(34, 197, 94, 0.08)"
                />
                <polygon
                  points={`${toSvgX(0)},${toSvgY(0)} ${halX},${halY} ${toSvgX(0)},${halY}`}
                  fill="rgba(34, 197, 94, 0.18)"
                />

                {/* Zone 2: System Unavailable (Orange: HPL > HAL, HPE <= HPL) */}
                <polygon
                  points={`${toSvgX(0)},${halY} ${toSvgX(maxVal)},${halY} ${toSvgX(maxVal)},${toSvgY(maxVal)} ${toSvgX(0)},${toSvgY(maxVal)}`}
                  fill="rgba(234, 179, 8, 0.12)"
                />

                {/* Zone 3: Misleading Information (Amber: HPE > HPL, HPE <= HAL) */}
                <polygon
                  points={`${toSvgX(0)},${toSvgY(0)} ${halX},${toSvgY(0)} ${halX},${halY}`}
                  fill="rgba(249, 115, 22, 0.18)"
                />

                {/* Zone 4: Hazardously Misleading Information (Red: HPE > HPL and HPE > HAL) */}
                <polygon
                  points={`${halX},${toSvgY(0)} ${toSvgX(maxVal)},${toSvgY(0)} ${toSvgX(maxVal)},${toSvgY(maxVal)} ${halX},${halY}`}
                  fill="rgba(239, 68, 68, 0.22)"
                />

                {/* Diagonal line: HPE = HPL */}
                <line
                  x1={toSvgX(0)}
                  y1={toSvgY(0)}
                  x2={toSvgX(maxVal)}
                  y2={toSvgY(maxVal)}
                  stroke="var(--text-dim)"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />

                {/* HAL Horizontal Line */}
                <line
                  x1={padding}
                  y1={halY}
                  x2={padding + plotSize}
                  y2={halY}
                  stroke="var(--status-warn)"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />

                {/* HAL Vertical Line */}
                <line
                  x1={halX}
                  y1={padding}
                  x2={halX}
                  y2={padding + plotSize}
                  stroke="var(--status-error)"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />

                {/* Zone Text Labels */}
                <text x={toSvgX(hal * 0.3)} y={toSvgY(hal * 0.75)} fill="var(--status-ok)" fontWeight="bold">
                  NORMAL
                </text>
                <text x={toSvgX(hal * 0.1)} y={toSvgY(hal * 1.35)} fill="var(--status-warn)" fontWeight="bold">
                  UNAVAILABLE
                </text>
                <text x={toSvgX(hal * 0.75)} y={toSvgY(hal * 0.25)} fill="#f97316" fontWeight="bold">
                  MI
                </text>
                <text x={toSvgX(Math.min(maxVal * 0.85, hal * 1.25))} y={toSvgY(hal * 0.5)} fill="var(--status-error)" fontWeight="bold">
                  HMI (HAZARD)
                </text>
              </g>

              {/* Axes */}
              <line
                x1={padding}
                y1={padding + plotSize}
                x2={padding + plotSize + 10}
                y2={padding + plotSize}
                stroke="var(--text-primary)"
                strokeWidth="1.5"
              />
              <line
                x1={padding}
                y1={padding + plotSize}
                x2={padding}
                y2={padding - 10}
                stroke="var(--text-primary)"
                strokeWidth="1.5"
              />

              {/* Axis Ticks & Labels */}
              <text x={padding + plotSize} y={padding + plotSize + 25} textAnchor="end" fill="var(--text-secondary)">
                Horizontal Error (HPE) [m] &rarr;
              </text>
              <text
                x={-(padding + 5)}
                y="15"
                transform="rotate(-90)"
                textAnchor="end"
                fill="var(--text-secondary)"
              >
                Protection Level (HPL) [m] &rarr;
              </text>

              {/* HAL Ticks */}
              <text x={halX} y={padding + plotSize + 14} textAnchor="middle" fill="var(--status-warn)" fontWeight="bold">
                HAL ({hal}m)
              </text>
              <text x={padding - 6} y={halY + 3} textAnchor="end" fill="var(--status-warn)" fontWeight="bold">
                {hal}m
              </text>

              {/* Current Epoch Indicator */}
              <g>
                {/* Crosshairs */}
                <line
                  x1={curX}
                  y1={padding}
                  x2={curX}
                  y2={padding + plotSize}
                  stroke="var(--accent-eloran)"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  opacity="0.8"
                />
                <line
                  x1={padding}
                  y1={curY}
                  x2={padding + plotSize}
                  y2={curY}
                  stroke="var(--accent-eloran)"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  opacity="0.8"
                />

                {/* Pulsing Target Dot */}
                <circle cx={curX} cy={curY} r="7" fill={badge.border} opacity="0.3" className="animate-ping" />
                <circle cx={curX} cy={curY} r="5" fill={badge.border} stroke="#ffffff" strokeWidth="1.5" />
              </g>
            </svg>
          </div>
        </div>

        {/* Metrics & Interactive Sliders (col-span-5) */}
        <div className="lg:col-span-5 space-y-4 font-mono text-xs">
          {/* Key Metric Gauges */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
              <div className="text-[11px] text-[var(--text-dim)]">Horizontal Error (HPE)</div>
              <div className="text-lg font-bold text-[var(--text-primary)] mt-0.5">
                {hpe.toFixed(2)} m
              </div>
              <div className="text-[10px] text-[var(--text-dim)]">True position discrepancy</div>
            </div>

            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
              <div className="text-[11px] text-[var(--text-dim)]">Protection Level (HPL)</div>
              <div className="text-lg font-bold text-[var(--accent-eloran)] mt-0.5">
                {hpl.toFixed(2)} m
              </div>
              <div className="text-[10px] text-[var(--text-dim)]">K_ffmd * drms confidence</div>
            </div>
          </div>

          {/* Interactive Simulation Sliders */}
          <div className="p-3.5 rounded-lg space-y-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex justify-between items-center">
              <span className="font-bold text-[var(--text-secondary)] uppercase text-[11px] flex items-center gap-1.5">
                <Sliders size={13} /> Interactive Fault Injection
              </span>
              {(simHpe !== null || simHpl !== null) && (
                <button
                  onClick={() => {
                    setSimHpe(null);
                    setSimHpl(null);
                  }}
                  className="text-[10px] text-[var(--accent-eloran)] flex items-center gap-1 hover:underline cursor-pointer"
                  title="Reset simulated position error back to live EKF solution"
                  aria-label="Reset simulation"
                >
                  <RotateCcw size={10} /> Reset Live
                </button>
              )}
            </div>

            {/* HPE Slider */}
            <div>
              <div className="flex justify-between text-[11px]">
                <span>Simulated HPE:</span>
                <span className="font-bold text-[var(--text-primary)]">{hpe.toFixed(1)} m</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(60, hal * 2)}
                step={0.5}
                value={hpe}
                onChange={(e) => setSimHpe(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--accent-eloran)]"
              />
            </div>

            {/* HPL Slider */}
            <div>
              <div className="flex justify-between text-[11px]">
                <span>Simulated HPL:</span>
                <span className="font-bold text-[var(--text-primary)]">{hpl.toFixed(1)} m</span>
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(60, hal * 2)}
                step={0.5}
                value={hpl}
                onChange={(e) => setSimHpl(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--accent-eloran)]"
              />
            </div>

            {/* Quick Test Presets */}
            <div className="grid grid-cols-4 gap-1.5 pt-1 text-[10px]">
              <button
                onClick={() => {
                  setSimHpe(hal * 0.4);
                  setSimHpl(hal * 0.8);
                }}
                className="py-1 px-1 rounded bg-[var(--bg-surface)] text-[var(--status-ok)] border border-[var(--border-subtle)] hover:border-[var(--status-ok)] cursor-pointer"
                title="Simulate Nominal Safe Operation: HPE < HPL < HAL (Normal Navigation)"
                aria-label="Simulate Normal Navigation"
              >
                Nominal
              </button>
              <button
                onClick={() => {
                  setSimHpe(hal * 0.5);
                  setSimHpl(hal * 1.4);
                }}
                className="py-1 px-1 rounded bg-[var(--bg-surface)] text-[var(--status-warn)] border border-[var(--border-subtle)] hover:border-[var(--status-warn)] cursor-pointer"
                title="Simulate System Unavailable: HPL >= HAL (Navigation Integrity Alert)"
                aria-label="Simulate System Unavailable"
              >
                Unavail
              </button>
              <button
                onClick={() => {
                  setSimHpe(hal * 0.85);
                  setSimHpl(hal * 0.4);
                }}
                className="py-1 px-1 rounded bg-[var(--bg-surface)] text-[#f97316] border border-[var(--border-subtle)] hover:border-[#f97316] cursor-pointer"
                title="Simulate Degraded Operation: High error within integrity bound"
                aria-label="Simulate Degraded Operation"
              >
                MI Zone
              </button>
              <button
                onClick={() => {
                  setSimHpe(hal * 1.6);
                  setSimHpl(hal * 0.7);
                }}
                className="py-1 px-1 rounded bg-[var(--bg-surface)] text-[var(--status-error)] border border-[var(--border-subtle)] hover:border-[var(--status-error)] cursor-pointer"
                title="Simulate Hazardous Misleading Information (HMI): HPE > HAL and HPE > HPL (Critical Safety Hazard)"
                aria-label="Simulate Critical Safety Hazard"
              >
                HMI Fault
              </button>
            </div>
          </div>

          {/* Autonomous RAIM Parity Check Summary */}
          <div className="p-3 rounded-lg space-y-1.5" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex justify-between items-center text-[11px]">
              <span className="font-bold text-[var(--text-secondary)] uppercase">Autonomous RAIM FDE:</span>
              <span
                className="font-bold px-1.5 py-0.5 rounded text-[10px]"
                style={{
                  background: raim.faultDetected ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                  color: raim.faultDetected ? 'var(--status-error)' : 'var(--status-ok)',
                }}
              >
                {raim.faultDetected ? `FAULT DETECTED (${raim.isolatedStation})` : 'ALL TRANSMITTERS CLEAN'}
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-[var(--text-dim)]">
              <span>Test Stat (SSE): {raim.testStatistic.toFixed(2)}</span>
              <span>Chi-Square Threshold: {raim.threshold.toFixed(2)} (DOF={raim.dof})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
