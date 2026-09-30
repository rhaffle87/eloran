import React, { useId } from 'react';

/**
 * UncertaintySparkline
 * Dynamic real-time SVG strip-chart rendering position error variance / GDOP displacement history.
 *
 * @param {Array<{variance: number, gdop: number, errorMeters: number, timestamp: number}>} data - Chronological points
 * @param {number} [height=44] - SVG height in pixels
 * @param {'variance'|'gdop'|'error'} [metric='variance'] - Active metric key
 * @param {string} [strokeColor='var(--accent-eloran)'] - Stroke color
 * @param {string} [unit='m²'] - Unit label
 */
export default function UncertaintySparkline({
  data = [],
  height = 44,
  metric = 'variance',
  strokeColor = 'var(--accent-eloran)',
  unit = 'm²',
  className = '',
}) {
  const gradientId = useId();

  // Extract metric series
  const values = data.map((d) => (typeof d === 'number' ? d : d[metric] ?? 0));

  if (!values.length || values.length < 2) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg p-2 font-mono text-[10px] ${className}`}
        style={{
          height,
          background: 'var(--bg-subtle)',
          border: '1px dashed var(--border-subtle)',
          color: 'var(--text-dim)',
        }}
      >
        Awaiting live telemetry samples...
      </div>
    );
  }

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  // Viewbox coordinates: 200 x height
  const width = 200;
  const paddingY = 6;
  const effectiveH = Math.max(10, height - paddingY * 2);

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const norm = (v - minVal) / range;
    const y = height - paddingY - norm * effectiveH;
    return { x, y, v };
  });

  const pathD = points.reduce(
    (acc, pt, i) => (i === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`),
    ''
  );

  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;
  const lastPt = points[points.length - 1];
  const currentVal = values[values.length - 1];

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center justify-between font-mono text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: strokeColor }} />
          <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
            {currentVal.toFixed(2)} {unit}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[9px]" style={{ color: 'var(--text-dim)' }}>
          <span>min: {minVal.toFixed(1)}</span>
          <span>•</span>
          <span>max: {maxVal.toFixed(1)}</span>
        </div>
      </div>

      <div
        className="relative rounded overflow-hidden"
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full block"
          style={{ height }}
          preserveAspectRatio="none"
          aria-label={`Uncertainty sparkline chart current value ${currentVal.toFixed(2)} ${unit}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill={`url(#${gradientId})`} />

          {/* Sparkline stroke */}
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Current pulse marker */}
          {lastPt && (
            <g>
              <circle
                cx={lastPt.x}
                cy={lastPt.y}
                r="3"
                fill={strokeColor}
              />
              <circle
                cx={lastPt.x}
                cy={lastPt.y}
                r="5.5"
                fill="none"
                stroke={strokeColor}
                strokeWidth="1"
                opacity="0.75"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
