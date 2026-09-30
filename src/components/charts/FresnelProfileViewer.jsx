import React, { useMemo, useCallback } from 'react';
import { X, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useThemeStore } from '../../state/themeStore.js';
import { fresnelZoneRadiusM, LORAN_WAVELENGTH_M } from '../../lib/terrainMasking.js';

/**
 * SIMULORAN — Fresnel Zone & Knife-Edge Elevation Cross-Section Viewer
 *
 * Visualizes the 2D propagation cross-section between a Loran transmitter and receiver:
 *  - Great-circle terrain elevation profile (Open-Elevation API)
 *  - Transmitter antenna tower (default 30 m) & receiver mast (default 5 m)
 *  - Direct Line-of-Sight (LOS) optical ray
 *  - 1st Fresnel zone clearance envelope (r1 = sqrt(lambda * d1 * d2 / (d1 + d2)))
 *  - Dominant knife-edge diffraction obstacle marker (v parameter, dB loss, timing bias)
 *
 * @param {object} props
 * @param {object} props.profile - Elevation profile { elevations, distanceM, waypoints, flat }
 * @param {object} props.tx - Transmitter { label, name, lat, lng, antennaHeightM }
 * @param {object} props.rx - Receiver { label, lat, lng, antennaHeightM }
 * @param {object} props.masking - Masking analysis result from computeTerrainMasking()
 * @param {function} props.onClose - Callback to dismiss viewer
 */
export default function FresnelProfileViewer({ profile, tx, rx, masking, onClose }) {
  const effectiveTheme = useThemeStore((s) => s.effectiveTheme);
  const isDark = effectiveTheme !== 'light';

  const txAntennaM = tx?.antennaHeightM || 30;
  const rxAntennaM = rx?.antennaHeightM || 5;

  const rawElevations = profile?.elevations;
  const distanceM = profile?.distanceM || 1;

  const {
    points,
    minY,
    maxY,
    txTipY,
    rxTipY,
    fresnelPointsUpper,
    fresnelPointsLower,
    domPoint,
    elevations,
  } = useMemo(() => {
    const elevs = rawElevations || [];
    const numPoints = elevs.length;

    if (!numPoints) {
      return {
        points: [],
        minY: 0,
        maxY: 100,
        txTipY: 30,
        rxTipY: 5,
        fresnelPointsUpper: [],
        fresnelPointsLower: [],
        domPoint: null,
        elevations: [],
      };
    }

    const txBase = elevs[0] || 0;
    const rxBase = elevs[numPoints - 1] || 0;
    const txTip = txBase + txAntennaM;
    const rxTip = rxBase + rxAntennaM;

    let minElev = Math.min(...elevs, 0);
    let maxElev = Math.max(...elevs, txTip, rxTip);

    // Calculate 1st Fresnel zone points along path
    const upper = [];
    const lower = [];
    const pts = [];

    elevs.forEach((elev, i) => {
      const frac = numPoints > 1 ? i / (numPoints - 1) : 0;
      const d1 = distanceM * frac;
      const d2 = distanceM * (1 - frac);
      const losY = txTip + (rxTip - txTip) * frac;
      const r1 = fresnelZoneRadiusM(d1, d2, LORAN_WAVELENGTH_M);

      pts.push({ d: d1, elev, losY, r1, frac });
      upper.push({ d: d1, y: losY + r1 });
      lower.push({ d: d1, y: Math.max(0, losY - r1) });

      maxElev = Math.max(maxElev, losY + r1);
    });

    // Add padding to vertical scale
    const ySpan = Math.max(50, maxElev - minElev);
    const paddedMinY = Math.floor(minElev - ySpan * 0.1);
    const paddedMaxY = Math.ceil(maxElev + ySpan * 0.15);

    let dominantPt = null;
    const dIdx = masking?.dominantIndex !== undefined
      ? masking.dominantIndex
      : (typeof masking?.dominantFrac === 'number' && numPoints > 1
          ? Math.round(masking.dominantFrac * (numPoints - 1))
          : null);

    if (dIdx !== null && pts[dIdx]) {
      dominantPt = {
        ...pts[dIdx],
        hEff: masking?.dominantObstacleM ?? Math.max(0, pts[dIdx].elev - pts[dIdx].losY),
        lossDb: masking?.diffractionLossDb || 0,
        v: masking?.vDominant || 0,
      };
    }

    return {
      points: pts,
      minY: paddedMinY,
      maxY: paddedMaxY,
      txTipY: txTip,
      rxTipY: rxTip,
      fresnelPointsUpper: upper,
      fresnelPointsLower: lower,
      domPoint: dominantPt,
      elevations: elevs,
    };
  }, [rawElevations, distanceM, txAntennaM, rxAntennaM, masking]);

  // SVG Coordinate mapping (ViewBox: 800 x 360)
  const W = 800;
  const H = 360;
  const padL = 60;
  const padR = 40;
  const padT = 40;
  const padB = 50;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const mapX = useCallback(
    (d) => padL + (d / Math.max(1, distanceM)) * plotW,
    [distanceM, padL, plotW]
  );

  const mapY = useCallback(
    (val) => padT + plotH - ((val - minY) / Math.max(1, maxY - minY)) * plotH,
    [minY, maxY, padT, plotH]
  );

  // Build SVG Paths
  const terrainPathD = useMemo(() => {
    if (!points.length) return '';
    let d = `M ${mapX(0)} ${mapY(minY)} `;
    points.forEach((p) => {
      d += `L ${mapX(p.d)} ${mapY(p.elev)} `;
    });
    d += `L ${mapX(distanceM)} ${mapY(minY)} Z`;
    return d;
  }, [points, distanceM, minY, mapX, mapY]);

  const fresnelRibbonD = useMemo(() => {
    if (!fresnelPointsUpper.length) return '';
    let d = `M ${mapX(fresnelPointsUpper[0].d)} ${mapY(fresnelPointsUpper[0].y)} `;
    for (let i = 1; i < fresnelPointsUpper.length; i++) {
      d += `L ${mapX(fresnelPointsUpper[i].d)} ${mapY(fresnelPointsUpper[i].y)} `;
    }
    for (let i = fresnelPointsLower.length - 1; i >= 0; i--) {
      d += `L ${mapX(fresnelPointsLower[i].d)} ${mapY(fresnelPointsLower[i].y)} `;
    }
    d += 'Z';
    return d;
  }, [fresnelPointsUpper, fresnelPointsLower, mapX, mapY]);

  const isBlocked = Boolean(masking?.blocked);
  const numPoints = elevations.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 backdrop-blur-md animate-fade-in"
      style={{ background: 'rgba(0, 0, 0, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fresnel-viewer-title"
    >
      <div
        className="w-full max-w-4xl rounded-2xl border shadow-2xl overflow-hidden font-mono flex flex-col"
        style={{
          background: 'var(--bg-canvas)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border"
              style={{
                background: isBlocked ? 'var(--status-danger-subtle)' : 'var(--status-ok-subtle)',
                borderColor: isBlocked ? 'var(--status-danger-border)' : 'var(--status-ok-border)',
                color: isBlocked ? 'var(--status-danger)' : 'var(--status-ok)',
              }}
            >
              {isBlocked ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="fresnel-viewer-title" className="text-sm font-bold tracking-tight">
                  Propagation Cross-Section: {tx?.label || 'Tx'} &rarr; {rx?.label || 'Rx'}
                </h2>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border"
                  style={{
                    background: isBlocked ? 'var(--status-danger-subtle)' : 'var(--status-ok-subtle)',
                    borderColor: isBlocked ? 'var(--status-danger-border)' : 'var(--status-ok-border)',
                    color: isBlocked ? 'var(--status-danger)' : 'var(--status-ok)',
                  }}
                >
                  {isBlocked ? 'Masked / Obstructed' : 'Clear Line-of-Sight'}
                </span>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                ITU-R P.526-15 Knife-Edge Diffraction &bull; 100 kHz (&lambda; &approx; 2998 m) &bull; {(distanceM / 1000).toFixed(1)} km Great-Circle
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border transition hover:opacity-80 cursor-pointer"
            style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-canvas)' }}
            aria-label="Close elevation cross-section"
          >
            <X size={16} />
          </button>
        </div>

        {/* SVG Visualization Canvas */}
        <div className="p-4 flex-1 flex flex-col items-center justify-center">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto max-h-[380px] select-none"
            style={{ background: isDark ? '#0b1120' : '#f8fafc', borderRadius: '12px' }}
          >
            <defs>
              <linearGradient id="terrain-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isDark ? '#374151' : '#cbd5e1'} stopOpacity="0.8" />
                <stop offset="100%" stopColor={isDark ? '#1f2937' : '#94a3b8'} stopOpacity="0.95" />
              </linearGradient>
              <linearGradient id="fresnel-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.18" />
                <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.18" />
              </linearGradient>
            </defs>

            {/* Grid Lines */}
            {[0.25, 0.5, 0.75].map((frac) => {
              const x = padL + frac * plotW;
              const dKm = ((distanceM * frac) / 1000).toFixed(0);
              return (
                <g key={`x-grid-${frac}`}>
                  <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} strokeDasharray="3,3" />
                  <text x={x} y={H - 25} fill={isDark ? '#94a3b8' : '#64748b'} fontSize="10" textAnchor="middle" fontFamily="monospace">
                    {dKm} km
                  </text>
                </g>
              );
            })}

            {/* 1st Fresnel Zone Envelope Ribbon */}
            <path d={fresnelRibbonD} fill="url(#fresnel-grad)" stroke="#38bdf8" strokeWidth="1" strokeDasharray="4,3" opacity="0.75" />

            {/* Direct Line of Sight (LOS) Ray */}
            <line
              x1={mapX(0)}
              y1={mapY(txTipY)}
              x2={mapX(distanceM)}
              y2={mapY(rxTipY)}
              stroke={isBlocked ? '#ef4444' : '#10b981'}
              strokeWidth="2"
              strokeDasharray={isBlocked ? '5,4' : 'none'}
            />

            {/* Shaded Terrain Elevation Polygon */}
            <path d={terrainPathD} fill="url(#terrain-grad)" stroke={isDark ? '#6b7280' : '#475569'} strokeWidth="1.5" />

            {/* Tx Antenna Mast Graphic */}
            <g transform={`translate(${mapX(0)}, ${mapY(elevations[0] || 0)})`}>
              <line x1="0" y1="0" x2="0" y2={mapY(txTipY) - mapY(elevations[0] || 0)} stroke="#06b6d4" strokeWidth="3" />
              <circle cx="0" cy={mapY(txTipY) - mapY(elevations[0] || 0)} r="4" fill="#06b6d4" />
              <text x="8" y={mapY(txTipY) - mapY(elevations[0] || 0) + 4} fill="#06b6d4" fontSize="10" fontWeight="bold" fontFamily="monospace">
                Tx: {tx?.label} ({txAntennaM}m)
              </text>
            </g>

            {/* Rx Antenna Mast Graphic */}
            <g transform={`translate(${mapX(distanceM)}, ${mapY(elevations[numPoints - 1] || 0)})`}>
              <line x1="0" y1="0" x2="0" y2={mapY(rxTipY) - mapY(elevations[numPoints - 1] || 0)} stroke="#10b981" strokeWidth="3" />
              <circle cx="0" cy={mapY(rxTipY) - mapY(elevations[numPoints - 1] || 0)} r="4" fill="#10b981" />
              <text x="-8" y={mapY(rxTipY) - mapY(elevations[numPoints - 1] || 0) + 4} fill="#10b981" fontSize="10" fontWeight="bold" textAnchor="end" fontFamily="monospace">
                Rx: {rx?.label} ({rxAntennaM}m)
              </text>
            </g>

            {/* Dominant Obstacle Callout */}
            {domPoint && (
              <g transform={`translate(${mapX(domPoint.d)}, ${mapY(domPoint.elev)})`}>
                <line x1="0" y1="0" x2="0" y2="-45" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="2,2" />
                <polygon points="0,-45 -4,-52 4,-52" fill="#f59e0b" />
                <rect x="-65" y="-76" width="130" height="22" rx="4" fill={isDark ? '#1e293b' : '#ffffff'} stroke="#f59e0b" strokeWidth="1" />
                <text x="0" y="-62" fill="#f59e0b" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                  Obstacle: v = {domPoint.v.toFixed(2)} ({domPoint.lossDb.toFixed(1)} dB)
                </text>
              </g>
            )}

            {/* Axes & Legend */}
            <text x={padL} y={padT - 12} fill={isDark ? '#94a3b8' : '#64748b'} fontSize="10" fontFamily="monospace">
              Elev: {minY} m to {maxY} m MSL
            </text>
            <text x={W - padR} y={padT - 12} fill={isDark ? '#94a3b8' : '#64748b'} fontSize="10" textAnchor="end" fontFamily="monospace">
              1st Fresnel Envelope: ~{fresnelZoneRadiusM(distanceM / 2, distanceM / 2).toFixed(0)} m radius
            </text>
          </svg>
        </div>

        {/* Diagnostic Footer Metric Cards */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 border-t text-xs"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-subtle)' }}
        >
          <div className="p-2.5 rounded-lg border" style={{ background: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}>
            <span className="text-[10px] uppercase block" style={{ color: 'var(--text-dim)' }}>Great-Circle Distance</span>
            <span className="text-sm font-bold">{(distanceM / 1000).toFixed(2)} km</span>
          </div>

          <div className="p-2.5 rounded-lg border" style={{ background: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}>
            <span className="text-[10px] uppercase block" style={{ color: 'var(--text-dim)' }}>Diffraction Loss J(v)</span>
            <span className="text-sm font-bold" style={{ color: isBlocked ? 'var(--status-danger)' : 'var(--status-ok)' }}>
              {masking?.diffractionLossDb ? `${masking.diffractionLossDb.toFixed(1)} dB` : '0.0 dB'}
            </span>
          </div>

          <div className="p-2.5 rounded-lg border" style={{ background: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}>
            <span className="text-[10px] uppercase block" style={{ color: 'var(--text-dim)' }}>Induced Excess Delay</span>
            <span className="text-sm font-bold" style={{ color: masking?.timingBiasUs > 0.05 ? '#f59e0b' : 'inherit' }}>
              {masking?.timingBiasUs ? `+${masking.timingBiasUs.toFixed(3)} µs` : '0.000 µs'}
            </span>
          </div>

          <div className="p-2.5 rounded-lg border" style={{ background: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}>
            <span className="text-[10px] uppercase block" style={{ color: 'var(--text-dim)' }}>Fresnel Clearance</span>
            <span className="text-sm font-bold">
              {domPoint ? `${(domPoint.losY - domPoint.elev).toFixed(1)} m` : 'Unconstrained'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
