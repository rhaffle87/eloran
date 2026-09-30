import React, { useRef, useEffect } from 'react';
import { useThemeStore } from '../../state/themeStore.js';

/**
 * High-performance 2D Canvas chart displaying the real-time time-history
 * of Envelope-to-Cycle Difference (ECD) and Standard Zero Crossing (SZC)
 * over the last 50 GRIs.
 */
export default function TrackingChart({ history = [], nominalSzcUs = 30.0, height = 140 }) {
  const canvasRef = useRef(null);
  const effectiveTheme = useThemeStore((s) => s.effectiveTheme);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 360;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const isDark = effectiveTheme !== 'light';
    const bg = isDark ? '#111827' : '#f8fafc';
    const gridLine = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textDim = isDark ? '#9ca3af' : '#6b7280';
    const colorLocked = '#10b981';
    const colorSlipped = '#f59e0b';
    const colorLost = '#ef4444';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    if (!history || history.length < 2) {
      ctx.fillStyle = textDim;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Accumulating GRI tracking history...', width / 2, height / 2);
      return;
    }

    const padding = { top: 16, bottom: 20, left: 32, right: 12 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    // Y scale: SZC ranges from 15 to 45 µs (covers cycles 2, 3, 4)
    const yMin = 15;
    const yMax = 45;
    const getY = (val) => padding.top + plotH - ((val - yMin) / (yMax - yMin)) * plotH;
    const getX = (i) => padding.left + (i / Math.max(1, history.length - 1)) * plotW;

    // Draw reference horizontal grid lines (20 µs, 30 µs nominal, 40 µs)
    [20, 30, 40].forEach((level) => {
      const y = getY(level);
      ctx.beginPath();
      ctx.strokeStyle = level === 30 ? (isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.4)') : gridLine;
      ctx.setLineDash(level === 30 ? [4, 4] : [2, 2]);
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = level === 30 ? colorLocked : textDim;
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${level}µs`, padding.left - 4, y + 3);
    });

    // Plot SZC trajectory
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const pt = history[i];
      const x = getX(i);
      const y = getY(pt.estimatedSzcUs);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = history[history.length - 1].state === 'SLIPPED' ? colorSlipped : colorLocked;
    ctx.stroke();

    // Draw status dots on data points
    history.forEach((pt, i) => {
      const x = getX(i);
      const y = getY(pt.estimatedSzcUs);
      ctx.beginPath();
      ctx.arc(x, y, pt.state === 'SLIPPED' ? 3.5 : 2, 0, Math.PI * 2);
      ctx.fillStyle = pt.state === 'LOST' ? colorLost : (pt.state === 'SLIPPED' ? colorSlipped : colorLocked);
      ctx.fill();
    });

    // Time axis label
    ctx.fillStyle = textDim;
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SZC Tracking History (last 50 GRIs)', padding.left, padding.top - 5);
    ctx.textAlign = 'right';
    const last = history[history.length - 1];
    ctx.fillStyle = last.state === 'SLIPPED' ? colorSlipped : (last.state === 'LOST' ? colorLost : colorLocked);
    ctx.fillText(`${last.state} (${last.estimatedSzcUs.toFixed(2)} µs)`, width - padding.right, padding.top - 5);

  }, [history, nominalSzcUs, height, effectiveTheme]);

  return (
    <div className="w-full rounded-lg overflow-hidden border border-[var(--border-subtle)] shadow-inner">
      <canvas ref={canvasRef} style={{ width: '100%', height: `${height}px`, display: 'block' }} />
    </div>
  );
}
