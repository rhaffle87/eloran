import React from 'react';
import { useSimulationStore } from '../../state/simulationStore.js';
import { useAsfHeatmap } from '../../hooks/useAsfHeatmap.js';
import { getColormapCssGradient } from '../../lib/heatmapColormap.js';
import { Activity, Radio } from 'lucide-react';

/**
 * MapLibre visual overlay component that manages the Live ASF / Groundwave Heatmap
 * and renders a sleek, floating on-map HUD legend.
 */
export default function AsfHeatmapLayer({ map }) {
  const { settings, masters, stations } = useSimulationStore();
  const master = masters?.[0] || stations?.find((s) => s.role === 'master' || s.isMaster) || stations?.[0];

  const enabled = Boolean(settings?.asfHeatmapEnabled);
  const mode = settings?.asfHeatmapMode || 'us';
  const landSigma = settings?.asfLandSigma ?? 0.003;
  const landFraction = settings?.asfLandFraction ?? 0.5;
  const resolution = settings?.asfHeatmapResolution ?? 40;
  const opacity = settings?.asfHeatmapOpacity ?? 0.65;
  const isoContours = settings?.asfHeatmapIsoContours ?? true;

  const { isComputing, minVal, maxVal } = useAsfHeatmap({
    map,
    enabled,
    mode,
    landSigma,
    landEpslon: 15.0,
    fallbackLandFraction: landFraction,
    resolution,
    opacity,
    isoContours,
    master: master ? { lat: master.lat, lng: master.lng } : null,
  });

  if (!enabled) return null;

  const colormap = mode === 'us' ? 'jet' : 'viridis';
  const gradientCss = getColormapCssGradient(colormap);
  const unitLabel = mode === 'us' ? 'µs delay' : 'dB loss';

  return (
    <div
      data-testid="asf-heatmap-legend-badge"
      className="absolute top-16 right-4 z-10 backdrop-blur-md rounded-lg p-2.5 shadow-xl text-xs font-mono border transition-all animate-fade-in pointer-events-auto"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-primary)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
        minWidth: '180px',
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5" style={{ color: 'var(--accent-eloran)' }} />
          <span className="font-semibold text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
            {mode === 'us' ? 'ASF Heatmap' : 'GW Attenuation'}
          </span>
        </div>
        {isComputing && (
          <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--accent-eloran)' }}>
            <Activity className="w-3 h-3 animate-spin" />
            <span>Calc...</span>
          </div>
        )}
      </div>

      <div className="text-[10px] mb-1.5 flex justify-between" style={{ color: 'var(--text-secondary)' }}>
        <span>Tx: {master?.label || 'Ref Tx'}</span>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {unitLabel}
        </span>
      </div>

      {/* Colormap gradient bar */}
      <div
        className="h-2.5 w-full rounded shadow-inner mb-1 border"
        style={{
          background: gradientCss,
          borderColor: 'var(--border-subtle)',
        }}
      />

      {/* Min / Max labels */}
      <div className="flex items-center justify-between text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
        <span>{minVal.toFixed(2)}</span>
        <span className="text-[9px] uppercase tracking-wider">{colormap}</span>
        <span>{maxVal.toFixed(2)}</span>
      </div>
    </div>
  );
}
