import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Compass,
  Navigation,
  Activity,
  Radio,
  AlertTriangle,
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
    subtitle: '18kt → 6kt HEA Fairway',
    waypoints: ROTTERDAM_APPROACH_WAYPOINTS,
    description: 'Deep-water approach from Maas Center Buoy past Hook of Holland into Maasvlakte container basin.',
  },
  {
    id: 'dover',
    name: 'Dover Strait Traffic Separation Scheme',
    shortName: 'Dover Strait TSS',
    subtitle: '16kt TSS Lane Fairway',
    waypoints: DOVER_STRAIT_TSS_WAYPOINTS,
    description: 'High-density commercial passage through the narrow English Channel Dover TSS fairway.',
  },
  {
    id: 'yellow_sea',
    name: 'Incheon Yellow Sea Coastal Corridor',
    shortName: 'Incheon Yellow Sea',
    subtitle: '20kt → 8kt Coastal Channel',
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

  // Initialize EKF on trajectory change
  useEffect(() => {
    const startPos = sampleTrajectory(trajectory, 0);
    ekfRef.current = createEkf(startPos.lat, startPos.lng);
    setPlayheadSec(0);
    setIsPlaying(false);

    // Sync selected receiver position to start of trajectory without re-triggering effect
    const store = useSimulationStore.getState();
    const rxLabel = selectedReceiver || store.receivers?.[0]?.label;
    if (rxLabel) {
      store.updateStation(rxLabel, {
        lat: startPos.lat,
        lng: startPos.lng,
      });
      store.recalculateFixes();
    }
  }, [trajectory, selectedReceiver]);

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
      const rxLabel = selectedReceiver || receivers?.[0]?.label;
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
    const rxLabel = selectedReceiver || receivers?.[0]?.label;
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
    const rxLabel = selectedReceiver || receivers?.[0]?.label;
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
    <div className="space-y-3.5 text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
          <Navigation size={14} className="text-[var(--accent-eloran)] shrink-0" />
          <span>Kinematic Trajectory &amp; EKF</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] border border-[var(--accent-eloran-border)]">
            6-State DWNA
          </span>
        </div>
        <InfoTooltip
          align="right"
          title="Kinematic Trajectory & 6-State EKF"
          text="Real-time vessel dynamic waypoint trajectory generator integrated with discrete white noise acceleration (DWNA) 6-state Extended Kalman Filter."
        />
      </div>

      {/* Trajectory Preset Selector */}
      <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-2 shadow-xs">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Active Vessel Corridor
          </label>
          <span className="text-[10px] text-[var(--accent-eloran)] font-semibold">
            {activePreset.shortName}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {TRAJECTORY_PRESETS.map((p) => {
            const isSelected = p.id === activePresetId;
            return (
              <button
                key={p.id}
                onClick={() => setActivePresetId(p.id)}
                className={`px-2 py-1.5 rounded-lg text-left transition-all border text-[10.5px] cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold shadow-xs'
                    : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)]'
                }`}
              >
                <div className="truncate font-semibold">{p.shortName.split(' ')[0]}</div>
                <div className="text-[9px] text-[var(--text-muted)] truncate mt-0.5">
                  {p.subtitle}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--text-muted)] leading-relaxed pt-0.5">
          {activePreset.description}
        </p>
      </div>

      {/* Playback Controls & Scrubber Deck */}
      <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-2.5 shadow-xs">
        <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-3 py-1.5 rounded-md font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                isPlaying
                  ? 'bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-[var(--status-warn-border)] hover:opacity-90'
                  : 'bg-[var(--accent-eloran)] text-[var(--btn-eloran-text)] hover:opacity-90'
              }`}
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              <span>{isPlaying ? 'Pause' : 'Play Corridor'}</span>
            </button>

            <button
              onClick={handleReset}
              className="p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
              title="Reset to Start"
            >
              <RotateCcw size={13} />
            </button>
          </div>

          {/* Time Counter */}
          <div className="flex items-center gap-1.5 text-[var(--text-secondary)] bg-[var(--bg-subtle)] px-2.5 py-1 rounded-md border border-[var(--border-subtle)] font-mono text-[11px]">
            <Clock size={12} className="text-[var(--text-muted)]" />
            <span>
              {formatTime(playheadSec)} / {formatTime(trajectory.totalDurationSec)}
            </span>
          </div>

          {/* Speed Multiplier Pills */}
          <div className="flex items-center gap-0.5 bg-[var(--bg-subtle)] p-0.5 rounded-md border border-[var(--border-subtle)] font-mono">
            {SPEED_PRESETS.map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-1.5 py-0.5 rounded text-[9.5px] transition cursor-pointer ${
                  playbackSpeed === spd
                    ? 'bg-[var(--accent-eloran)] text-[var(--btn-eloran-text)] font-bold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
        <div className="p-2.5 rounded-lg bg-[var(--status-ok-subtle)] border border-[var(--status-ok-border)] text-[var(--status-ok)] flex items-start justify-between gap-2 shadow-xs">
          <div className="flex items-start gap-1.5">
            <ShieldCheck size={14} className="shrink-0 mt-0.5" />
            <span className="text-[11px] leading-tight font-mono">{cycleSlipNotification.msg}</span>
          </div>
          <button
            onClick={() => setCycleSlipNotification(null)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Kinematics & EKF Telemetry 2-Column Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Vessel Kinematics Card */}
        <div className="p-2.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-bold text-[11px] text-[var(--accent-eloran)]">
              <Ship size={13} />
              <span>Vessel Motion</span>
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
              Ground Truth
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-[var(--bg-subtle)] p-1.5 rounded-lg border border-[var(--border-subtle)]">
              <div className="text-[9px] text-[var(--text-muted)]">Speed</div>
              <div className="text-xs font-bold text-[var(--text-primary)]">
                {currentSample.speedKts.toFixed(1)}{' '}
                <span className="text-[9px] font-normal text-[var(--text-muted)]">kt</span>
              </div>
              <div className="text-[9px] text-[var(--text-dim)]">({currentSample.speedMs.toFixed(1)} m/s)</div>
            </div>

            <div className="bg-[var(--bg-subtle)] p-1.5 rounded-lg border border-[var(--border-subtle)]">
              <div className="text-[9px] text-[var(--text-muted)]">Heading</div>
              <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1">
                <Compass size={11} className="text-[var(--accent-eloran)]" />
                <span>{currentSample.headingDeg.toFixed(0)}°</span>
                <span className="text-[9px] font-semibold text-[var(--accent-eloran)]">
                  {getCompassDirection(currentSample.headingDeg)}
                </span>
              </div>
              <div className="text-[9px] text-[var(--text-dim)]">Ground Track</div>
            </div>
          </div>

          <div className="space-y-0.5 text-[9.5px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Coordinates:</span>
              <span className="text-[var(--text-secondary)] font-mono">
                {currentSample.lat.toFixed(4)}°, {currentSample.lng.toFixed(4)}°
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Distance:</span>
              <span className="text-[var(--text-secondary)]">
                {(currentSample.distanceM / 1000).toFixed(1)} / {(trajectory.totalDistanceM / 1000).toFixed(1)} km
              </span>
            </div>
          </div>
        </div>

        {/* 6-State EKF Filter Card */}
        <div className="p-2.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-bold text-[11px] text-[var(--status-ok)]">
              <Activity size={13} />
              <span>6-State EKF PNT</span>
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)]">
              Locked
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-[var(--bg-subtle)] p-1.5 rounded-lg border border-[var(--border-subtle)]">
              <div className="text-[9px] text-[var(--text-muted)]">1-σ Position</div>
              <div className="text-xs font-bold text-[var(--status-ok)]">
                {ekfState ? ekfState.posSigmaM.toFixed(1) : '--'}{' '}
                <span className="text-[9px] font-normal text-[var(--text-muted)]">m</span>
              </div>
              <div className="text-[9px] text-[var(--text-dim)]">
                HPL: {ekfState ? ekfState.hplMeters.toFixed(1) : '--'}m
              </div>
            </div>

            <div className="bg-[var(--bg-subtle)] p-1.5 rounded-lg border border-[var(--border-subtle)]">
              <div className="text-[9px] text-[var(--text-muted)]">Clock Bias</div>
              <div className="text-xs font-bold text-[var(--text-primary)]">
                {ekfState ? (ekfState.clockBiasSec * 1e9).toFixed(0) : '--'}{' '}
                <span className="text-[9px] font-normal text-[var(--text-muted)]">ns</span>
              </div>
              <div className="text-[9px] text-[var(--text-dim)]">
                ({ekfState ? ekfState.clockBiasM.toFixed(1) : '--'}m)
              </div>
            </div>
          </div>

          <div className="space-y-0.5 text-[9.5px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Vel Uncertainty:</span>
              <span className="text-[var(--text-secondary)]">
                ±{ekfState ? ekfState.velSigmaMs.toFixed(2) : '--'} m/s
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Outliers Rejected:</span>
              <span className="text-[var(--status-ok)] font-semibold">
                {ekfState ? ekfState.totalRejectedCount : 0} NIS gated
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cycle Slip Injection Action */}
      <div className="p-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex items-center justify-between shadow-xs">
        <div>
          <div className="font-semibold text-[11px] text-[var(--text-primary)] flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-[var(--status-warn)] shrink-0" />
            <span>Integrity Fault Injection</span>
          </div>
          <div className="text-[9.5px] text-[var(--text-muted)] mt-0.5 leading-tight">
            Injects 10 µs (+3000 m) cycle slip into transmitter channel to verify NIS rejection.
          </div>
        </div>
        <button
          onClick={handleTriggerCycleSlip}
          className="px-2.5 py-1 rounded-md bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-[var(--status-warn-border)] hover:opacity-90 text-[10.5px] font-semibold transition cursor-pointer shrink-0 ml-2"
        >
          Inject +3000m Slip
        </button>
      </div>

      {/* Live Carrier Doppler Shift Breakdown */}
      <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-2 shadow-xs">
        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span className="flex items-center gap-1.5 text-[var(--text-primary)]">
            <Radio size={13} className="text-[var(--accent-eloran)]" />
            <span>Carrier Doppler Shift (100 kHz)</span>
          </span>
          <span className="text-[9.5px] text-[var(--text-muted)] font-mono">Δf = -f₀ · (v_los / c)</span>
        </div>

        <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden bg-[var(--bg-subtle)]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-canvas)] text-[var(--text-dim)] border-b border-[var(--border-subtle)] text-[9.5px]">
                <th className="py-1 px-2">Transmitter</th>
                <th className="py-1 px-1.5 text-right">Distance</th>
                <th className="py-1 px-1.5 text-right">LOS Rate</th>
                <th className="py-1 px-1.5 text-right">Doppler Δf</th>
                <th className="py-1 px-2 text-right">Rx Freq</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]/40 text-[10px]">
              {dopplerList.map((d) => {
                const isReceding = d.rangeRateMs > 0.05;
                const isApproaching = d.rangeRateMs < -0.05;
                return (
                  <tr key={d.station} className="hover:bg-[var(--bg-canvas)]/50 transition">
                    <td className="py-1 px-2 font-medium flex items-center gap-1 text-[var(--text-primary)]">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          d.isMaster ? 'bg-[var(--accent-eloran)]' : 'bg-[var(--accent-loran-c)]'
                        }`}
                      />
                      <span className="truncate max-w-[80px]">{d.station}</span>
                    </td>
                    <td className="py-1 px-1.5 text-right text-[var(--text-muted)]">
                      {(d.distanceMeters / 1000).toFixed(1)} km
                    </td>
                    <td className="py-1 px-1.5 text-right font-mono">
                      <span
                        className={
                          isReceding
                            ? 'text-[var(--status-warn)]'
                            : isApproaching
                            ? 'text-[var(--accent-eloran)]'
                            : 'text-[var(--text-muted)]'
                        }
                      >
                        {d.rangeRateMs > 0 ? '+' : ''}
                        {d.rangeRateMs.toFixed(1)} m/s
                      </span>
                    </td>
                    <td className="py-1 px-1.5 text-right font-mono font-semibold">
                      <span
                        className={
                          d.dopplerShiftHz > 0
                            ? 'text-[var(--accent-eloran)]'
                            : d.dopplerShiftHz < 0
                            ? 'text-[var(--status-warn)]'
                            : 'text-[var(--text-muted)]'
                        }
                      >
                        {d.dopplerShiftHz > 0 ? '+' : ''}
                        {(d.dopplerShiftHz * 1000).toFixed(1)} mHz
                      </span>
                    </td>
                    <td className="py-1 px-2 text-right font-mono text-[var(--text-dim)] text-[9.5px]">
                      {(d.receivedFreqHz / 1000).toFixed(5)} kHz
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
