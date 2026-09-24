import React, { useEffect } from 'react';
import { Play, Pause, RotateCcw, Clock, Zap, ShieldCheck } from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import { OSCILLATOR_PRESETS } from '../../lib/clocks.js';
import Slider from '../ui/Slider.jsx';

export default function ClockPanel() {
  const {
    masters,
    simTimeSec,
    isSimRunning,
    setSimTime,
    toggleSimRunning,
    updateStation,
    evaluateReceivers,
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
    return () => {
      if (interval) clearInterval(interval);
    };
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
      {/* Simulation Clock Controls */}
      <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-3 font-mono">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider">
            <Clock size={14} /> Master Clock
          </div>
          <div className="text-sm font-bold text-zinc-100">
            {simTimeSec.toFixed(0)} <span className="text-xs font-normal text-zinc-500">sec</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleSimRunning}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
              isSimRunning
                ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                : 'bg-cyan-500 text-black hover:bg-cyan-400'
            }`}
          >
            {isSimRunning ? (
              <>
                <Pause size={14} /> Pause
              </>
            ) : (
              <>
                <Play size={14} /> Run Clock
              </>
            )}
          </button>
          <button
            onClick={() => setSimTime(0)}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition"
            title="Reset Time to 0s"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Oscillator Standards Selector */}
      {master && (
        <div className="space-y-3">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
            Master Frequency Standard
          </label>
          <div className="grid grid-cols-1 gap-1.5">
            {Object.entries(OSCILLATOR_PRESETS).map(([key, osc]) => {
              const isSelected = (master.clock?.type || 'gps-disciplined') === key;
              return (
                <div
                  key={key}
                  onClick={() => handleOscillatorChange(key)}
                  className={`p-2.5 rounded-lg border text-xs cursor-pointer transition select-none ${
                    isSelected
                      ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-200'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold">{osc.name}</span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      Drift: {osc.typicalDriftSecPerSec.toExponential(0)} s/s
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-tight">
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
              min={-0.0001}
              max={0.0001}
              step={0.000001}
              unit="s"
              tooltip="Fixed static timing synchronization offset"
              onChange={(val) =>
                updateStation(master.label, {
                  clock: { ...master.clock, biasSec: val },
                })
              }
            />

            <Slider
              label="Clock Drift Rate"
              value={master.clock?.driftPerSec || 0}
              min={-1e-8}
              max={1e-8}
              step={1e-10}
              unit="s/s"
              tooltip="Continuous oscillator frequency drift per elapsed second"
              onChange={(val) =>
                updateStation(master.label, {
                  clock: { ...master.clock, driftPerSec: val },
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
