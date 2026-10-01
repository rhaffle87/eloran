import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Play,
  Pause,
  RotateCcw,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import {
  TRACKING_STATES,
  computeTrackingSigmaUs,
} from '../../lib/trackingLoop.js';
import TrackingChart from '../charts/TrackingChart.jsx';
import Slider from '../ui/Slider.jsx';

export default function TrackingPanel() {
  const {
    settings,
    updateSettings,
    trackingLoop,
    stepTrackingLoop: stepLoop,
    injectCycleSlip: injectSlip,
    reacquireTrackingLoop: reacquireLoop,
  } = useSimulationStore();

  const [isRunning, setIsRunning] = useState(true);
  const [localSnrDb, setLocalSnrDb] = useState(settings?.snrDb ?? 18);

  const intervalRef = useRef(null);

  // Sync SNR from global settings if changed externally
  useEffect(() => {
    if (settings?.snrDb !== undefined) {
      setLocalSnrDb(settings.snrDb);
    }
  }, [settings?.snrDb]);

  // Simulation tick loop
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      stepLoop(localSnrDb);
    }, 150);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, localSnrDb, stepLoop]);

  const handleStepOnce = () => {
    stepLoop(localSnrDb);
  };

  const handleInjectSlip = (direction) => {
    injectSlip(direction);
  };

  const handleReacquire = () => {
    reacquireLoop();
  };

  const handleSnrChange = (val) => {
    setLocalSnrDb(val);
    updateSettings({ snrDb: val });
  };

  const state = trackingLoop.state;
  const isLocked = state === TRACKING_STATES.LOCKED;
  const isSlipped = state === TRACKING_STATES.SLIPPED;
  const isAcquiring = state === TRACKING_STATES.ACQUIRING;
  const isLost = state === TRACKING_STATES.LOST;

  const sigmaUs = computeTrackingSigmaUs(localSnrDb, settings?.pulsesAveraged ?? 10);
  const sigmaMeters = sigmaUs * 299.792458;

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* State banner */}
      <div
        className="p-3.5 rounded-xl border flex items-center justify-between shadow-sm transition-all"
        style={{
          background: isLocked
            ? 'var(--status-ok-subtle)'
            : isSlipped
            ? 'var(--status-warn-subtle)'
            : isAcquiring
            ? 'var(--accent-eloran-subtle)'
            : 'var(--status-danger-subtle)',
          borderColor: isLocked
            ? 'var(--status-ok-border)'
            : isSlipped
            ? 'var(--status-warn-border)'
            : isAcquiring
            ? 'var(--accent-eloran-border)'
            : 'var(--status-danger-border)',
        }}
      >
        <div className="flex items-center gap-2.5">
          {isLocked && <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--status-ok)' }} />}
          {isSlipped && <AlertTriangle className="w-5 h-5 animate-pulse" style={{ color: 'var(--status-warn)' }} />}
          {isAcquiring && <Activity className="w-5 h-5 animate-spin" style={{ color: 'var(--accent-eloran)' }} />}
          {isLost && <XCircle className="w-5 h-5" style={{ color: 'var(--status-danger)' }} />}

          <div>
            <div className="font-bold uppercase tracking-wider text-[11px] flex items-center gap-2">
              <span
                style={{
                  color: isLocked
                    ? 'var(--status-ok)'
                    : isSlipped
                    ? 'var(--status-warn)'
                    : isAcquiring
                    ? 'var(--accent-eloran)'
                    : 'var(--status-danger)',
                }}
              >
                {state}
              </span>
              <span className="text-[10px] font-normal text-[var(--text-dim)]">
                Cycle {trackingLoop.cycleIndex} ({(trackingLoop.cycleIndex * 10).toFixed(0)} µs)
              </span>
            </div>
            <div className="text-[10px] text-[var(--text-secondary)]">
              {isLocked && 'Standard Zero Crossing (SZC) tracked at 30.0 µs.'}
              {isSlipped && 'Cycle slip active: Envelope ratio test biased by wrong zero crossing.'}
              {isAcquiring && `Integrating pulse train (confidence: ${Math.round(trackingLoop.lockConfidence * 100)}%)...`}
              {isLost && 'SNR below acquisition threshold (-10 dB). Tracking lost.'}
            </div>
          </div>
        </div>

        {/* Lock confidence badge */}
        <div className="text-right">
          <div className="text-[10px] text-[var(--text-dim)]">Confidence</div>
          <div className="text-sm font-bold text-[var(--text-primary)]">
            {Math.round(trackingLoop.lockConfidence * 100)}%
          </div>
        </div>
      </div>

      {/* Primary Tracking Metrics Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="card p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
          <div className="text-[10px] text-[var(--text-dim)]">Estimated SZC</div>
          <div className="text-sm font-bold text-[var(--text-primary)]">
            {trackingLoop.estimatedSzcUs.toFixed(2)} µs
          </div>
          <div className="text-[9px] text-[var(--text-secondary)]">
            Nominal: 30.00 µs
          </div>
        </div>

        <div className="card p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
          <div className="text-[10px] text-[var(--text-dim)]">ECD Offset</div>
          <div
            className="text-sm font-bold"
            style={{
              color: Math.abs(trackingLoop.ecdUs) > 2.5 ? 'var(--status-warn)' : 'var(--text-primary)',
            }}
          >
            {trackingLoop.ecdUs.toFixed(2)} µs
          </div>
          <div className="text-[9px] text-[var(--text-secondary)]">
            Tolerance: ±2.50 µs
          </div>
        </div>

        <div className="card p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
          <div className="text-[10px] text-[var(--text-dim)]">Phase Jitter (1σ)</div>
          <div className="text-sm font-bold text-[var(--accent-eloran)]">
            {sigmaUs.toFixed(3)} µs
          </div>
          <div className="text-[9px] text-[var(--text-secondary)]">
            ~{sigmaMeters.toFixed(1)} m (Rhee 2021)
          </div>
        </div>

        <div className="card p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
          <div className="text-[10px] text-[var(--text-dim)]">Wrong Cycle P(wc)</div>
          <div
            className="text-sm font-bold"
            style={{
              color: trackingLoop.wrongCycleProb > 0.05 ? 'var(--status-warn)' : 'var(--status-ok)',
            }}
          >
            {(trackingLoop.wrongCycleProb * 100).toFixed(2)}%
          </div>
          <div className="text-[9px] text-[var(--text-secondary)]">
            Slips: {trackingLoop.slipsCount}
          </div>
        </div>
      </div>

      {/* Real-time Tracking History Chart */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
          <span className="font-semibold uppercase tracking-wider">SZC Tracking Sparkline</span>
          <span className="text-[10px] text-[var(--text-dim)]">Total GRIs: {trackingLoop.totalGris}</span>
        </div>
        <TrackingChart history={trackingLoop.history} nominalSzcUs={30.0} height={130} />
      </div>

      {/* Control Strip */}
      <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg p-2.5 space-y-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="btn-toggle-tracking-loop"
              onClick={() => setIsRunning((r) => !r)}
              className="px-3 py-1 rounded border text-xs flex items-center gap-1.5 cursor-pointer font-bold transition"
              style={{
                background: isRunning ? 'var(--status-warn-subtle)' : 'var(--accent-eloran-subtle)',
                borderColor: isRunning ? 'var(--status-warn-border)' : 'var(--accent-eloran-border)',
                color: isRunning ? 'var(--status-warn)' : 'var(--accent-eloran)',
              }}
            >
              {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isRunning ? 'Pause Loop' : 'Run Loop'}</span>
            </button>

            <button
              type="button"
              data-testid="btn-step-tracking-loop"
              onClick={handleStepOnce}
              disabled={isRunning}
              className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-default)] disabled:opacity-40 text-xs flex items-center gap-1 cursor-pointer"
              title="Advance tracking state machine by 1 GRI pulse train"
            >
              <Activity className="w-3.5 h-3.5 text-[var(--accent-eloran)]" />
              <span>Step 1 GRI</span>
            </button>

            <button
              type="button"
              data-testid="btn-reacquire-tracking-loop"
              onClick={handleReacquire}
              className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-dim)] hover:text-[var(--text-primary)] text-xs flex items-center gap-1 cursor-pointer"
              title="Reset loop and force fresh signal acquisition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reacquire</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="btn-inject-slip-forward"
              onClick={() => handleInjectSlip(1)}
              className="px-2 py-1 rounded border border-[var(--status-warn-border)] bg-[var(--status-warn-subtle)] text-[var(--status-warn)] text-[11px] flex items-center gap-1 cursor-pointer font-semibold"
              title="Force an artificial cycle slip to cycle 4 (+10 µs)"
            >
              <Zap className="w-3 h-3" />
              <span>Slip +10µs</span>
            </button>

            <button
              type="button"
              data-testid="btn-inject-slip-backward"
              onClick={() => handleInjectSlip(-1)}
              className="px-2 py-1 rounded border border-[var(--status-warn-border)] bg-[var(--status-warn-subtle)] text-[var(--status-warn)] text-[11px] flex items-center gap-1 cursor-pointer font-semibold"
              title="Force an artificial cycle slip to cycle 2 (-10 µs)"
            >
              <Zap className="w-3 h-3" />
              <span>Slip -10µs</span>
            </button>
          </div>
        </div>

        {/* Live SNR override slider */}
        <div className="pt-2 border-t border-[var(--border-subtle)]">
          <Slider
            label="Simulated SNR"
            value={localSnrDb}
            onChange={handleSnrChange}
            min={-15}
            max={30}
            step={1}
            unit=" dB"
            tooltip="Overrides receiver signal-to-noise ratio to test lock acquisition and cycle slip thresholds"
          />
        </div>
      </div>

      {/* Collapsible Physics / Theory Disclosure */}
      <details className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[10px] text-[var(--text-dim)] group cursor-pointer">
        <summary className="font-semibold text-[var(--text-secondary)] flex items-center justify-between outline-none select-none">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-[var(--accent-eloran)]" />
            <span>Zero-Crossing Tracking Theory</span>
          </div>
          <span className="text-[9px] text-[var(--text-dim)] group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] space-y-1.5 leading-relaxed">
          <p>
            Loran-C receivers track the <strong>Standard Zero Crossing (SZC)</strong> at precisely 30 µs
            (positive-going zero crossing of 3rd carrier cycle, ~50% peak amplitude, preceding skywaves by &gt; 35 µs).
          </p>
          <p>
            Wrong-cycle selection shifts tracking by integer cycles (<strong>±10 µs</strong>), inducing an immediate range error of <strong>~2,998 meters</strong>.
          </p>
        </div>
      </details>
    </div>
  );
}
