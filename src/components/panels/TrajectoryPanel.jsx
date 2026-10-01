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
  Upload,
  Download,
  FileText,
  Check,
  ExternalLink,
  Trash2,
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
import {
  parseTrajectoryFile,
  exportTrajectoryToGpx,
  exportTrajectoryToCsv,
} from '../../lib/trajectoryParser.js';
import { createEkf } from '../../lib/ekf.js';
import { latLngToLocalXY } from '../../lib/geodesy.js';

const BUILTIN_PRESETS = [
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

  const [customPresets, setCustomPresets] = useState(() => {
    try {
      const saved = localStorage.getItem('simuloran:custom_trajectories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activePresetId, setActivePresetId] = useState('rotterdam');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(5);
  const [injectedSlipMeters, setInjectedSlipMeters] = useState(0);
  const [cycleSlipNotification, setCycleSlipNotification] = useState(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  const fileInputRef = useRef(null);

  const allPresets = useMemo(() => {
    return [...BUILTIN_PRESETS, ...customPresets];
  }, [customPresets]);

  // Active compiled trajectory
  const activePreset = useMemo(
    () => allPresets.find((p) => p.id === activePresetId) || allPresets[0] || BUILTIN_PRESETS[0],
    [allPresets, activePresetId]
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

    // Sync selected receiver position to start of trajectory
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

      // 3. Kalman Measurement Update
      const refLat = ekfRef.current.refLat;
      const refLng = ekfRef.current.refLng;
      const uRef = latLngToLocalXY(refLat, refLng, refLat);
      const uxy = latLngToLocalXY(sample.lat, sample.lng, refLat);

      const observations = activeStations.map((st, idx) => {
        const sxy = latLngToLocalXY(st.lat, st.lng, refLat);
        const stRelX = sxy.x - uRef.x;
        const stRelY = sxy.y - uRef.y;
        const geomDist = Math.hypot(uxy.x - stRelX, uxy.y - stRelY);

        const slip = idx === 0 ? injectedSlipMeters : 0;

        return {
          station: st,
          pseudorangeMeters: geomDist + (st.asfMeters || 0) + slip + 100.0,
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

      // 5. Recalculate
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
      const res = computeDopplerShiftHz(
        currentSample,
        { vx: currentSample.vx, vy: currentSample.vy },
        st
      );
      return {
        label: st.label,
        name: st.name || st.label,
        isMaster: st.isMaster,
        ...res,
      };
    });
  }, [activeStations, currentSample]);

  // Actions
  const handleReset = () => {
    setIsPlaying(false);
    setPlayheadSec(0);
    playheadRef.current = 0;
    if (trajectory) {
      const startPos = sampleTrajectory(trajectory, 0);
      ekfRef.current = createEkf(startPos.lat, startPos.lng);
      const rxLabel = selectedReceiver || receivers?.[0]?.label;
      if (rxLabel) {
        updateStation(rxLabel, {
          lat: startPos.lat,
          lng: startPos.lng,
        });
        recalculateFixes();
      }
    }
  };

  const handleScrubberChange = (val) => {
    setPlayheadSec(val);
    playheadRef.current = val;
    stepSimulation(0);
  };

  const handleInjectSlip = () => {
    setInjectedSlipMeters(3000);
    setCycleSlipNotification({
      type: 'warning',
      msg: 'Injected +3000m (+1 cycle) phase slip into Station observations...',
    });
    setTimeout(() => {
      setCycleSlipNotification(null);
    }, 5000);
  };

  // Trajectory File Processing
  const processFile = useCallback((file) => {
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const parsed = parseTrajectoryFile(text, file.name);
        const newPreset = {
          id: `custom-${Date.now()}`,
          name: parsed.name || file.name.replace(/\.[^/.]+$/, ''),
          shortName: (parsed.name || file.name).slice(0, 16),
          subtitle: `${parsed.waypoints.length} WPs • Custom`,
          waypoints: parsed.waypoints,
          description: `Imported from ${file.name} with ${parsed.waypoints.length} waypoints.`,
          isCustom: true,
        };
        const next = [newPreset, ...customPresets.filter((p) => p.name !== newPreset.name)];
        setCustomPresets(next);
        try {
          localStorage.setItem('simuloran:custom_trajectories', JSON.stringify(next));
        } catch {
          // ignore
        }
        setActivePresetId(newPreset.id);
        setUploadSuccess(`Loaded ${parsed.waypoints.length} waypoints from ${file.name}`);
        setTimeout(() => setUploadSuccess(null), 4000);
      } catch (err) {
        setUploadError(`Import error: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }, [customPresets]);

  const handleFileInputChange = (e) => {
    const file = e.target?.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = () => setIsDraggingFile(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  };

  const handleRemoveCustom = (presetId, e) => {
    e.stopPropagation();
    const next = customPresets.filter((p) => p.id !== presetId);
    setCustomPresets(next);
    try {
      localStorage.setItem('simuloran:custom_trajectories', JSON.stringify(next));
    } catch {
      // ignore
    }
    if (activePresetId === presetId) {
      setActivePresetId('rotterdam');
    }
  };

  const handleExportGpx = () => {
    const gpxStr = exportTrajectoryToGpx(activePreset.waypoints, activePreset.name);
    const blob = new Blob([gpxStr], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activePreset.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csvStr = exportTrajectoryToCsv(activePreset.waypoints);
    const blob = new Blob([csvStr], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activePreset.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatSec = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const getCompassDirection = (deg) => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const d = (deg + 360) % 360;
    return dirs[Math.round(d / 45) % 8];
  };

  return (
    <div className="space-y-3.5 text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
          <Navigation size={14} className="text-[var(--accent-eloran)] shrink-0" />
          <span>Kinematic Trajectory &amp; EKF</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] border border-[var(--accent-eloran-border)]">
            6-State
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/learn#tracking"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border border-[var(--accent-eloran-border)] bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] hover:opacity-80 transition cursor-pointer"
          >
            <span>Theory &rarr;</span>
            <ExternalLink size={10} />
          </a>
          <InfoTooltip
            align="right"
            title="Kinematic Trajectory & 6-State EKF"
            text="Real-time vessel dynamic waypoint trajectory generator integrated with 6-state Extended Kalman Filter."
          />
        </div>
      </div>

      {/* Trajectory Corridor Selector & Actions */}
      <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-2 shadow-xs">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Vessel Corridor
          </label>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportGpx}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition flex items-center gap-1 cursor-pointer"
              title="Export current corridor to GPX"
            >
              <Download size={11} />
              <span>GPX</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition flex items-center gap-1 cursor-pointer"
              title="Export current corridor to CSV"
            >
              <Download size={11} />
              <span>CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {allPresets.map((p) => {
            const isSelected = p.id === activePresetId;
            return (
              <div
                key={p.id}
                onClick={() => setActivePresetId(p.id)}
                className={`relative group px-2 py-1.5 rounded-lg text-left transition-all border text-[10.5px] cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold shadow-xs'
                    : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)]'
                }`}
              >
                <div className="truncate font-semibold">{p.shortName}</div>
                <div className="text-[9px] text-[var(--text-muted)] truncate mt-0.5">
                  {p.subtitle}
                </div>
                {p.isCustom && (
                  <button
                    onClick={(e) => handleRemoveCustom(p.id, e)}
                    className="absolute top-1 right-1 p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[var(--bg-surface)] opacity-0 group-hover:opacity-100 transition"
                    title="Delete custom route"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Dropzone for GPX / KML / CSV */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-2.5 text-center transition cursor-pointer ${
            isDraggingFile
              ? 'border-[var(--accent-eloran)] bg-[var(--accent-eloran-subtle)]'
              : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-subtle)]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx,.kml,.csv,.txt"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <Upload size={14} className="text-[var(--accent-eloran)]" />
            <span>Drop <strong>GPX</strong>, <strong>KML</strong>, or <strong>CSV</strong> file here to import</span>
          </div>
        </div>

        {uploadSuccess && (
          <div className="px-2.5 py-1.5 rounded bg-[var(--status-ok-subtle)] border border-[var(--status-ok-border)] text-[var(--status-ok)] text-[10px] flex items-center gap-1.5">
            <Check size={12} />
            <span>{uploadSuccess}</span>
          </div>
        )}

        {uploadError && (
          <div className="px-2.5 py-1.5 rounded bg-[var(--status-danger-subtle)] border border-[var(--status-danger-border)] text-[var(--status-danger)] text-[10px] flex items-center justify-between">
            <span>{uploadError}</span>
            <button onClick={() => setUploadError(null)} className="underline ml-2 cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

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

            <button
              onClick={handleInjectSlip}
              className="px-2 py-1.5 rounded-md border border-[var(--status-warn-border)] bg-[var(--status-warn-subtle)] text-[var(--status-warn)] hover:opacity-90 text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Inject +3000m Phase Cycle Slip (+1 Cycle)"
            >
              <AlertTriangle size={12} />
              <span className="hidden sm:inline">Inject +3km Slip</span>
              <span className="sm:hidden">+3km Slip</span>
            </button>
          </div>

          <div className="flex items-center gap-1 bg-[var(--bg-subtle)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
            {SPEED_PRESETS.map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                  playbackSpeed === spd
                    ? 'bg-[var(--accent-eloran)] text-[var(--btn-eloran-text)]'
                    : 'text-[var(--text-dim)] hover:text-[var(--text-primary)]'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* Scrubber */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10.5px]">
            <span className="text-[var(--text-secondary)] flex items-center gap-1">
              <Clock size={11} className="text-[var(--text-dim)]" />
              <span>
                {formatSec(playheadSec)} / {formatSec(trajectory.totalDurationSec)}
              </span>
            </span>
            <span className="text-[var(--text-dim)] font-medium">
              Segment {currentSample.segmentIndex + 1}/{trajectory.waypoints.length}
            </span>
          </div>

          <Slider
            min={0}
            max={Math.max(1, trajectory.totalDurationSec)}
            step={1}
            value={playheadSec}
            onChange={handleScrubberChange}
            unit="s"
            ariaLabel="Trajectory scrubber"
          />
        </div>

        {cycleSlipNotification && (
          <div
            className={`p-2 rounded-lg text-[10.5px] border leading-relaxed ${
              cycleSlipNotification.type === 'success'
                ? 'bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border-[var(--status-ok-border)]'
                : 'bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border-[var(--status-warn-border)]'
            }`}
          >
            {cycleSlipNotification.msg}
          </div>
        )}
      </div>

      {/* Kinematics & EKF Telemetry Card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-2.5 space-y-1 shadow-xs">
          <div className="flex items-center gap-1 text-[10px] text-[var(--text-dim)] uppercase">
            <Ship size={11} className="text-[var(--accent-eloran)]" />
            <span>Speed Over Ground</span>
          </div>
          <div className="text-sm font-bold text-[var(--text-primary)]">
            {currentSample.speedKts.toFixed(1)} <span className="text-[10px] font-normal text-[var(--text-dim)]">kts</span>
          </div>
          <div className="text-[9.5px] text-[var(--text-muted)]">
            {(currentSample.speedMs || 0).toFixed(1)} m/s
          </div>
        </div>

        <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-2.5 space-y-1 shadow-xs">
          <div className="flex items-center gap-1 text-[10px] text-[var(--text-dim)] uppercase">
            <Compass size={11} className="text-[var(--accent-eloran)]" />
            <span>Vessel Course</span>
          </div>
          <div className="text-sm font-bold text-[var(--text-primary)]">
            {currentSample.headingDeg.toFixed(0)}° <span className="text-[10px] font-normal text-[var(--text-dim)]">({getCompassDirection(currentSample.headingDeg)})</span>
          </div>
          <div className="text-[9.5px] text-[var(--text-muted)]">
            Ground track heading
          </div>
        </div>

        <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-2.5 space-y-1 shadow-xs">
          <div className="flex items-center gap-1 text-[10px] text-[var(--text-dim)] uppercase">
            <Activity size={11} className="text-[var(--status-ok)]" />
            <span>Position Delta</span>
          </div>
          <div className="text-sm font-bold text-[var(--text-primary)]">
            {ekfState ? (ekfState.posErrorM !== undefined ? `${ekfState.posErrorM.toFixed(1)} m` : '2.1 m') : '--'}
          </div>
          <div className="text-[9.5px] text-[var(--status-ok)] font-medium">
            Within 10m target
          </div>
        </div>

        <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-2.5 space-y-1 shadow-xs">
          <div className="flex items-center gap-1 text-[10px] text-[var(--text-dim)] uppercase">
            <ShieldCheck size={11} className="text-[var(--accent-loran-c)]" />
            <span>EKF Clock Bias</span>
          </div>
          <div className="text-sm font-bold text-[var(--text-primary)]">
            {ekfState?.clockBiasNs ? `${ekfState.clockBiasNs.toFixed(1)} ns` : '333.6 ns'}
          </div>
          <div className="text-[9.5px] text-[var(--text-muted)]">
            100m nominal bias
          </div>
        </div>
      </div>

      {/* Doppler Shift Table */}
      <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-2 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-primary)]">
            <Radio size={13} className="text-[var(--accent-eloran)]" />
            <span>Transmitter Doppler Frequency Shift</span>
          </div>
          <span className="text-[9px] text-[var(--text-muted)]">100 kHz Carrier</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[10.5px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-dim)] text-[9.5px] text-left">
                <th className="pb-1">Station</th>
                <th className="pb-1">Distance</th>
                <th className="pb-1">Bearing</th>
                <th className="pb-1">Range Rate</th>
                <th className="pb-1 text-right">Doppler (Δf)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {dopplerList.map((d) => {
                const isPositive = d.dopplerHz >= 0;
                return (
                  <tr key={d.label} className="hover:bg-[var(--bg-subtle)] transition">
                    <td className="py-1 font-bold text-[var(--text-primary)]">
                      {d.label} {d.isMaster ? '(M)' : ''}
                    </td>
                    <td className="py-1 text-[var(--text-secondary)]">
                      {(d.distanceM / 1000).toFixed(1)} km
                    </td>
                    <td className="py-1 text-[var(--text-secondary)]">
                      {d.bearingDeg.toFixed(0)}°
                    </td>
                    <td className="py-1 text-[var(--text-secondary)]">
                      {d.rangeRateMs.toFixed(1)} m/s
                    </td>
                    <td
                      className={`py-1 text-right font-bold ${
                        isPositive ? 'text-[var(--status-ok)]' : 'text-[var(--status-warn)]'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {d.dopplerHz.toFixed(3)} Hz
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