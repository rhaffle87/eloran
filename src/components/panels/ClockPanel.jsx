import React, { useEffect } from 'react';
import { Play, Pause, RotateCcw, Clock } from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import { OSCILLATOR_PRESETS } from '../../lib/clocks.js';
import Slider from '../ui/Slider.jsx';

export default function ClockPanel() {
  const {
    masters, simTimeSec, isSimRunning,
    setSimTime, toggleSimRunning, updateStation, evaluateReceivers,
  } = useSimulationStore();

  // Periodic simulation tick loop
  useEffect(() => {
    let interval = null;
    if (isSimRunning) {
      interval = setInterval(() => {
        setSimTime(simTimeSec + 1);
        evaluateReceivers();
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isSimRunning, simTimeSec, setSimTime, evaluateReceivers]);

  const master = masters[0];

  const handleOscillatorChange = (presetKey) => {
    const preset = OSCILLATOR_PRESETS[presetKey];
    if (!preset || !master) return;
    updateStation(master.label, {
      clock: {
        type: presetKey,
        biasSec: preset.typicalBiasSec,
        driftPerSec: preset.typicalDriftSecPerSec,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Clock control card */}
      <div
        className="p-3 rounded-lg space-y-3 font-mono"
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent-eloran)' }}>
            <Clock size={14} aria-hidden="true" /> Master Clock
          </div>
          <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {simTimeSec.toFixed(0)} <span className="text-xs font-normal" style={{ color: 'var(--text-dim)' }}>sec</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleSimRunning}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition"
            style={isSimRunning
              ? { background: 'var(--status-warn-subtle)', border: '1px solid var(--status-warn-border)', color: 'var(--status-warn)' }
              : { background: 'var(--accent-eloran)', color: 'var(--bg-canvas)', border: '1px solid transparent' }}
          >
            {isSimRunning ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Run Clock</>}
          </button>
          <button
            onClick={() => setSimTime(0)}
            className="p-1.5 rounded-lg transition"
            style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
            title="Reset Time to 0s"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Oscillator Selector */}
      {master && (
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
            Master Frequency Standard
          </label>
          <div className="grid grid-cols-1 gap-1.5">
            {Object.entries(OSCILLATOR_PRESETS).map(([key, osc]) => {
              const isSelected = (master.clock?.type || 'gps-disciplined') === key;
              return (
                <div
                  key={key}
                  onClick={() => handleOscillatorChange(key)}
                  className="p-2.5 rounded-lg text-xs cursor-pointer transition select-none"
                  style={isSelected
                    ? { background: 'var(--accent-eloran-subtle)', border: '1px solid var(--accent-eloran-border)', color: 'var(--accent-eloran)' }
                    : { background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold" style={{ color: isSelected ? 'var(--accent-eloran)' : 'var(--text-primary)' }}>{osc.name}</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
                      Drift: {osc.typicalDriftSecPerSec.toExponential(0)} s/s
                    </span>
                  </div>
                  <div className="text-[11px] leading-tight" style={{ color: 'var(--text-muted)' }}>
                    {osc.description}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Clock Bias & Drift Tuning */}
          <div className="pt-2 space-y-3">
            <Slider
              label="Clock Bias Override"
              value={master.clock?.biasSec || 0}
              min={-0.0001} max={0.0001} step={0.000001} unit="s"
              tooltip="Fixed static timing synchronization offset"
              onChange={(val) => updateStation(master.label, { clock: { ...master.clock, biasSec: val } })}
            />
            <Slider
              label="Clock Drift Rate"
              value={master.clock?.driftPerSec || 0}
              min={-1e-8} max={1e-8} step={1e-10} unit="s/s"
              tooltip="Continuous oscillator frequency drift per elapsed second"
              onChange={(val) => updateStation(master.label, { clock: { ...master.clock, driftPerSec: val } })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
