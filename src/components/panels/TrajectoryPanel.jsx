import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Compass,
  Navigation,
  Activity,
  Gauge,
  Radio,
  AlertTriangle,
  CheckCircle2,
  Ship,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import Slider from '../ui/Slider.jsx';
import InfoTooltip from '../ui/Tooltip.jsx';
import {
  createWaypointTrajectory,
  sampleTrajectory,
  computeDopplerShiftHz,
  ROTTERDAM_APPROACH_WAYPOINTS,
  DOVER_STRAIT_TSS_WAYPOINTS,
  YELLOW_SEA_CORRIDOR_WAYPOINTS,
} from '../../lib/trajectory.js';
import { createEkf } from '../../lib/ekf.js';
import { latLngToLocalXY } from '../../lib/geodesy.js';

const TRAJECTORY_PRESETS = [
  {
    id: 'rotterdam',
    name: 'Rotterdam Europort Harbor Approach',
    shortName: 'Rotterdam Europort',
    waypoints: ROTTERDAM_APPROACH_WAYPOINTS,
    description: 'Deep-water approach from Maas Center Buoy past Hook of Holland into Maasvlakte container basin.',
  },
  {
    id: 'dover',
    name: 'Dover Strait Traffic Separation Scheme',
    shortName: 'Dover Strait TSS',
    waypoints: DOVER_STRAIT_TSS_WAYPOINTS,
    description: 'High-density commercial passage through the narrow English Channel Dover TSS fairway.',
  },
  {
    id: 'yellow_sea',
    name: 'Incheon Yellow Sea Coastal Corridor',
    shortName: 'Incheon Yellow Sea',
    waypoints: YELLOW_SEA_CORRIDOR_WAYPOINTS,
    description: 'Incheon Port approach fairway subject to severe regional satellite GNSS jamming.',
  },
];

const SPEED_PRESETS = [1, 2, 5, 10, 20];

export default function TrajectoryPanel() {
  const {
    masters,
    slaves,
    receivers,
    selectedReceiver,
    updateStation,
    recalculateFixes,
  } = useSimulationStore();

  const [activePresetId, setActivePresetId] = useState('rotterdam');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(5);
  const [injectedSlipMeters, setInjectedSlipMeters] = useState(0);
  const [cycleSlipNotification, setCycleSlipNotification] = useState(null);

  // Active compiled trajectory
  const activePreset = useMemo(
    () => TRAJECTORY_PRESETS.find((p) => p.id === activePresetId) || TRAJECTORY_PRESETS[0],
    [activePresetId]
  );

  const trajectory = useMemo(
    () => createWaypointTrajectory(activePreset.waypoints, { loop: true }),
    [activePreset]
  );

  // Dedicated 6-State EKF Instance
  const ekfRef = useRef(null);
  const lastTimeRef = useRef(null);
  const playheadRef = useRef(playheadSec);
  playheadRef.current = playheadSec;

  // Initialize EKF on trajectory or preset change
  useEffect(() => {
    const startPos = sampleTrajectory(trajectory, 0);
    ekfRef.current = createEkf(startPos.lat, startPos.lng);
    setPlayheadSec(0);
    setIsPlaying(false);

    // Sync selected receiver position to start of trajectory
    if (selectedReceiver) {
      updateStation(selectedReceiver, {
        lat: startPos.lat,
        lng: startPos.lng,
      });
      recalculateFixes();
    }
  }, [trajectory, selectedReceiver, updateStation, recalculateFixes]);

  // Current kinematic sample at playhead
  const currentSample = useMemo(
    () => sampleTrajectory(trajectory, playheadSec),
    [trajectory, playheadSec]
  );

  // Visible stations
  const activeStations = useMemo(() => {
    const visible = [];
    masters.forEach((m) => visible.push({ ...m, isMaster: true }));
    slaves.forEach((s) => visible.push({ ...s, isMaster: false }));
    return visible;
  }, [masters, slaves]);

  // Step the simulation by dt seconds
  const stepSimulation = useCallback(
    (dtSeconds) => {
      if (!trajectory || !ekfRef.current) return;

      const nextPlayhead = (playheadRef.current + dtSeconds) % Math.max(1, trajectory.totalDurationSec);
      playheadRef.current = nextPlayhead;
      setPlayheadSec(nextPlayhead);

      const sample = sampleTrajectory(trajectory, nextPlayhead);

      // 1. Move receiver on map
      const rxLabel = selectedReceiver || receivers[0]?.label;
      if (rxLabel) {
        updateStation(rxLabel, {
          lat: sample.lat,
          lng: sample.lng,
        });
      }

      // 2. Kalman Time Update (Predict)
      ekfRef.current.predict(dtSeconds);

      // 3. Kalman Measurement Update (Pseudoranges with optional cycle slip)
      const refLat = ekfRef.current.refLat;
      const refLng = ekfRef.current.refLng;
      const uRef = latLngToLocalXY(refLat, refLng, refLat);
      const uxy = latLngToLocalXY(sample.lat, sample.lng, refLat);

      const observations = activeStations.map((st, idx) => {
        const sxy = latLngToLocalXY(st.lat, st.lng, refLat);
        const stRelX = sxy.x - uRef.x;
        const stRelY = sxy.y - uRef.y;
        const geomDist = Math.hypot(uxy.x - stRelX, uxy.y - stRelY);

        // Inject intentional cycle slip on first station if triggered
        const slip = idx === 0 ? injectedSlipMeters : 0;

        return {
          station: st,
          pseudorangeMeters: geomDist + (st.asfMeters || 0) + slip + 100.0, // 100m receiver clock bias
          sigmaMeters: 5.0,
        };
      });

      const updateResult = ekfRef.current.updatePseudoranges(observations);

      if (injectedSlipMeters > 0) {
        if (updateResult.rejectedCount > 0) {
          setCycleSlipNotification({
            type: 'success',
            msg: `Chi-Square NIS Gating successfully detected and rejected +3000m cycle slip on ${activeStations[0]?.label}!`,
          });
        }
        setInjectedSlipMeters(0);
      }

      // 4. Update Doppler measurements
      const dopplerObs = activeStations.map((st) => {
        const dop = computeDopplerShiftHz(sample, { vx: sample.vx, vy: sample.vy }, st);
        return {
          station: st,
          rangeRateMs: dop.rangeRateMs,
          sigmaRateMs: 0.5,
        };
      });

      ekfRef.current.updateDoppler(dopplerObs);

      // 5. Trigger store recalculation
      recalculateFixes();
    },
    [
      trajectory,
      selectedReceiver,
      receivers,
      updateStation,
      activeStations,
      injectedSlipMeters,
      recalculateFixes,
    ]
  );

  // Animation frame loop
  useEffect(() => {
    let animId;
    if (isPlaying) {
      lastTimeRef.current = performance.now();

      const loop = (now) => {
        const deltaMs = now - (lastTimeRef.current || now);
        lastTimeRef.current = now;

        // Advance simulation time scaled by playbackSpeed
        const dtSec = (deltaMs / 1000) * playbackSpeed;
        if (dtSec > 0 && dtSec < 10) {
          stepSimulation(dtSec);
        }

        animId = requestAnimationFrame(loop);
      };

      animId = requestAnimationFrame(loop);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, playbackSpeed, stepSimulation]);

  // Current live EKF state
  const ekfState = ekfRef.current ? ekfRef.current.getState() : null;

  // Live Doppler calculations for all stations
  const dopplerList = useMemo(() => {
    return activeStations.map((st) => {
      const dop = computeDopplerShiftHz(
        currentSample,
        { vx: currentSample.vx, vy: currentSample.vy },
        st
      );
      return {
        station: st.label,
        isMaster: st.isMaster,
        ...dop,
      };
    });
  }, [activeStations, currentSample]);

  // Format MM:SS helper
  const formatTime = (sec) => {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const remS = s % 60;
    return `${String(m).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
  };

  const handleSeek = (val) => {
    const targetSec = (val / 100) * trajectory.totalDurationSec;
    setPlayheadSec(targetSec);
    const sample = sampleTrajectory(trajectory, targetSec);
    const rxLabel = selectedReceiver || receivers[0]?.label;
    if (rxLabel) {
      updateStation(rxLabel, {
        lat: sample.lat,
        lng: sample.lng,
      });
      recalculateFixes();
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setPlayheadSec(0);
    const startPos = sampleTrajectory(trajectory, 0);
    if (ekfRef.current) {
      ekfRef.current.reset(startPos.lat, startPos.lng);
    }
    const rxLabel = selectedReceiver || receivers[0]?.label;
    if (rxLabel) {
      updateStation(rxLabel, {
        lat: startPos.lat,
        lng: startPos.lng,
      });
      recalculateFixes();
    }
  };

  const handleTriggerCycleSlip = () => {
    setInjectedSlipMeters(3000.0); // 1 cycle at 100 kHz = 10 us = ~3000m
  };

  // Compass heading direction helper
  const getCompassDirection = (deg) => {
    const d = (deg + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    return dirs[Math.round(d / 45)];
  };

  return (
    <div className="space-y-4 text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default/50 pb-2.5">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-accent-eloran" />
          <span className="font-semibold text-text-primary text-sm tracking-wide">
            Kinematic Trajectory & 6-State EKF
          </span>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] bg-accent-eloran/10 text-accent-eloran border border-accent-eloran/20">
          6-State DWNA Filter
        </span>
      </div>

      {/* Trajectory Preset Selector */}
      <div className="space-y-1.5">
        <label className="text-text-secondary text-[11px] font-medium flex items-center justify-between">
          <span>Active Vessel Corridor</span>
          <InfoTooltip text="Select calibrated marine entrance fairway or transit lane with predefined waypoints and dynamic speed profiles." />
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {TRAJECTORY_PRESETS.map((p) => {
            const isSelected = p.id === activePresetId;
            return (
              <button
                key={p.id}
                onClick={() => setActivePresetId(p.id)}
                className={`px-2 py-1.5 rounded text-left transition-all border text-[11px] ${
                  isSelected
                    ? 'bg-accent-eloran/15 border-accent-eloran text-text-primary shadow-sm'
                    : 'bg-surface-elevated/40 border-border-default text-text-muted hover:text-text-secondary hover:bg-surface-elevated'
                }`}
              >
                <div className="font-semibold truncate">{p.shortName}</div>
                <div className="text-[9px] text-text-muted truncate mt-0.5">
                  {p.id === 'rotterdam' && '18kt → 6kt HEA'}
                  {p.id === 'dover' && '16kt TSS Lane'}
                  {p.id === 'yellow_sea' && '20kt → 8kt Channel'}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-text-muted leading-tight mt-1">{activePreset.description}</p>
      </div>

      {/* Playback Controls & Scrubber */}
      <div className="p-3 bg-surface-elevated/50 border border-border-default rounded-lg space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-3 py-1.5 rounded-md font-medium text-xs flex items-center gap-1.5 transition-all shadow-sm ${
                isPlaying
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-accent-eloran text-white hover:bg-accent-eloran/90'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Play Corridor'}</span>
            </button>

            <button
              onClick={handleReset}
              className="p-1.5 rounded-md border border-border-default hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
              title="Reset to Start"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Time Counter */}
          <div className="flex items-center gap-1.5 text-text-secondary bg-surface-base px-2.5 py-1 rounded border border-border-default/60">
            <Clock className="w-3 h-3 text-text-muted" />
            <span>
              {formatTime(playheadSec)} / {formatTime(trajectory.totalDurationSec)}
            </span>
          </div>

          {/* Speed Multiplier Pills */}
          <div className="flex items-center gap-1 bg-surface-base p-0.5 rounded border border-border-default/60">
            {SPEED_PRESETS.map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-all ${
                  playbackSpeed === spd
                    ? 'bg-accent-eloran text-white font-semibold'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* Progress Slider */}
        <div className="space-y-1">
          <Slider
            label="Trajectory Progress"
            value={trajectory.totalDurationSec > 0 ? (playheadSec / trajectory.totalDurationSec) * 100 : 0}
            min={0}
            max={100}
            step={0.1}
            unit="%"
            onChange={handleSeek}
          />
        </div>
      </div>

      {/* Cycle Slip Notification */}
      {cycleSlipNotification && (
        <div className="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-start justify-between gap-2">
          <div className="flex items-start gap-1.5">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-[11px] leading-tight">{cycleSlipNotification.msg}</span>
          </div>
          <button
            onClick={() => setCycleSlipNotification(null)}
            className="text-text-muted hover:text-text-primary text-[10px]"
          >
            ✕
          </button>
        </div>
      )}

      {/* Kinematics & EKF Telemetry 2-Column Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Vessel Kinematics Card */}
        <div className="p-2.5 bg-surface-elevated/40 border border-border-default rounded-lg space-y-2">
          <div className="flex items-center justify-between text-text-secondary font-medium">
            <span className="flex items-center gap-1.5">
              <Ship className="w-3.5 h-3.5 text-accent-eloran" />
              <span>Vessel Motion</span>
            </span>
            <span className="text-[10px] text-text-muted">Ground Truth</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-surface-base/80 p-1.5 rounded border border-border-default/40">
              <div className="text-[9px] text-text-muted">Speed</div>
              <div className="text-sm font-bold text-text-primary">
                {currentSample.speedKts.toFixed(1)}{' '}
                <span className="text-[10px] font-normal text-text-muted">kt</span>
              </div>
              <div className="text-[9px] text-text-muted">({currentSample.speedMs.toFixed(1)} m/s)</div>
            </div>

            <div className="bg-surface-base/80 p-1.5 rounded border border-border-default/40">
              <div className="text-[9px] text-text-muted">Heading</div>
              <div className="text-sm font-bold text-text-primary flex items-center gap-1">
                <Compass className="w-3 h-3 text-accent-eloran" />
                <span>{currentSample.headingDeg.toFixed(0)}°</span>
                <span className="text-[10px] font-normal text-accent-eloran">
                  {getCompassDirection(currentSample.headingDeg)}
                </span>
              </div>
              <div className="text-[9px] text-text-muted">Ground Track</div>
            </div>
          </div>

          <div className="space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-text-muted">Coordinates:</span>
              <span className="text-text-secondary font-mono">
                {currentSample.lat.toFixed(5)}°, {currentSample.lng.toFixed(5)}°
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Distance Traveled:</span>
              <span className="text-text-secondary">
                {(currentSample.distanceM / 1000).toFixed(2)} km / {(trajectory.totalDistanceM / 1000).toFixed(2)} km
              </span>
            </div>
          </div>
        </div>

        {/* 6-State EKF Filter Card */}
        <div className="p-2.5 bg-surface-elevated/40 border border-border-default rounded-lg space-y-2">
          <div className="flex items-center justify-between text-text-secondary font-medium">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>6-State EKF PNT</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Locked
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-surface-base/80 p-1.5 rounded border border-border-default/40">
              <div className="text-[9px] text-text-muted">1-σ Position</div>
              <div className="text-sm font-bold text-emerald-400">
                {ekfState ? ekfState.posSigmaM.toFixed(1) : '--'}{' '}
                <span className="text-[10px] font-normal text-text-muted">m</span>
              </div>
              <div className="text-[9px] text-text-muted">
                HPL: {ekfState ? ekfState.hplMeters.toFixed(1) : '--'} m
              </div>
            </div>

            <div className="bg-surface-base/80 p-1.5 rounded border border-border-default/40">
              <div className="text-[9px] text-text-muted">Clock Bias</div>
              <div className="text-sm font-bold text-text-primary">
                {ekfState ? (ekfState.clockBiasSec * 1e9).toFixed(0) : '--'}{' '}
                <span className="text-[10px] font-normal text-text-muted">ns</span>
              </div>
              <div className="text-[9px] text-text-muted">
                ({ekfState ? ekfState.clockBiasM.toFixed(1) : '--'} m)
              </div>
            </div>
          </div>

          <div className="space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-text-muted">Vel Uncertainty:</span>
              <span className="text-text-secondary">
                ±{ekfState ? ekfState.velSigmaMs.toFixed(2) : '--'} m/s
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Outliers Rejected:</span>
              <span className="text-emerald-400 font-semibold">
                {ekfState ? ekfState.totalRejectedCount : 0} epochs (NIS Gated)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cycle Slip Injection Action */}
      <div className="p-2.5 rounded-lg bg-surface-elevated/30 border border-border-default flex items-center justify-between">
        <div>
          <div className="font-semibold text-text-primary flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Integrity Fault Injection</span>
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">
            Injects 10 µs (+3000 m) cycle slip into transmitter channel to verify NIS rejection.
          </div>
        </div>
        <button
          onClick={handleTriggerCycleSlip}
          className="px-2.5 py-1.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 text-[11px] font-medium transition-all"
        >
          Inject +3000m Slip
        </button>
      </div>

      {/* Live Carrier Doppler Shift Breakdown */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-text-secondary text-[11px] font-medium">
          <span className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-accent-eloran" />
            <span>Carrier Doppler Shift Breakdown (100 kHz)</span>
          </span>
          <span className="text-[10px] text-text-muted">Δf = -f₀ · (v_los / c)</span>
        </div>

        <div className="border border-border-default/60 rounded-lg overflow-hidden bg-surface-base">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-elevated text-text-muted border-b border-border-default/50 text-[10px]">
                <th className="py-1 px-2.5">Transmitter</th>
                <th className="py-1 px-2 text-right">Distance</th>
                <th className="py-1 px-2 text-right">LOS Rate</th>
                <th className="py-1 px-2 text-right">Doppler Δf</th>
                <th className="py-1 px-2.5 text-right">Received Freq</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default/30 text-[11px]">
              {dopplerList.map((d) => {
                const isReceding = d.rangeRateMs > 0.05;
                const isApproaching = d.rangeRateMs < -0.05;
                return (
                  <tr key={d.station} className="hover:bg-surface-hover/50">
                    <td className="py-1 px-2.5 font-medium flex items-center gap-1">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          d.isMaster ? 'bg-accent-eloran' : 'bg-accent-loran-c'
                        }`}
                      />
                      <span className="truncate max-w-[100px]">{d.station}</span>
                    </td>
                    <td className="py-1 px-2 text-right text-text-muted">
                      {(d.distanceMeters / 1000).toFixed(1)} km
                    </td>
                    <td className="py-1 px-2 text-right font-mono">
                      <span
                        className={
                          isReceding
                            ? 'text-amber-400'
                            : isApproaching
                            ? 'text-cyan-400'
                            : 'text-text-muted'
                        }
                      >
                        {d.rangeRateMs > 0 ? '+' : ''}
                        {d.rangeRateMs.toFixed(1)} m/s
                      </span>
                    </td>
                    <td className="py-1 px-2 text-right font-mono font-semibold">
                      <span
                        className={
                          d.dopplerShiftHz > 0
                            ? 'text-cyan-400'
                            : d.dopplerShiftHz < 0
                            ? 'text-amber-400'
                            : 'text-text-muted'
                        }
                      >
                        {d.dopplerShiftHz > 0 ? '+' : ''}
                        {(d.dopplerShiftHz * 1000).toFixed(2)} mHz
                      </span>
                    </td>
                    <td className="py-1 px-2.5 text-right font-mono text-text-muted text-[10px]">
                      {(d.receivedFreqHz / 1000).toFixed(6)} kHz
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
