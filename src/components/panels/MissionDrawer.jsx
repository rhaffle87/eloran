import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Target,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  Zap,
  Award,
  ArrowRight,
  Info,
} from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import { isInsideBaselineExtension } from '../../lib/chainDesign.js';
import { MISSIONS } from '../../lib/missions.js';

const STORAGE_KEY = 'simuloran_completed_missions';

export default function MissionDrawer({ isOpen, onClose }) {
  const store = useSimulationStore();
  const {
    receiverFixes = {},
    selectedReceiver,
    receivers = [],
  } = store;

  const [activeMissionIdx, setActiveMissionIdx] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showHints, setShowHints] = useState(false);

  // Completed missions persistent state
  const [completedMissions, setCompletedMissions] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Transient context for tracking transient mission milestones (e.g. peak GDOP)
  const [missionContext, setMissionContext] = useState({
    maxGdopObserved: 0,
    hasEnteredHazard: false,
  });

  const activeMission = MISSIONS[activeMissionIdx] || MISSIONS[0];
  const activeRx = receivers.find((r) => r.label === selectedReceiver) || receivers[0];
  const activeFix = receiverFixes[selectedReceiver] || (activeRx ? receiverFixes[activeRx.label] : null);

  // Monitor transient metrics for Mission 3
  useEffect(() => {
    const currentGdop = activeFix?.gdop ?? activeFix?.eloranSol?.gdop ?? 0;
    const m = store.masters[0];
    const s = store.slaves[0];
    let inExt = false;
    if (m && s && activeRx) {
      inExt = isInsideBaselineExtension(activeRx, m, s).isExtension;
    }

    setMissionContext((prev) => ({
      maxGdopObserved: Math.max(prev.maxGdopObserved, currentGdop),
      hasEnteredHazard: prev.hasEnteredHazard || inExt || currentGdop >= 8.0,
    }));
  }, [activeFix, store.masters, store.slaves, activeRx]);

  // Evaluate objectives for active mission
  const objectiveStatus = useMemo(() => {
    return activeMission.objectives.map((obj) => {
      const satisfied = Boolean(obj.check(store, activeFix, activeRx, missionContext));
      const metric = obj.getMetric(store, activeFix, activeRx, missionContext);
      return { id: obj.id, satisfied, metric };
    });
  }, [activeMission, store, activeFix, activeRx, missionContext]);

  const allCompleted = objectiveStatus.every((o) => o.satisfied);

  // Mark mission completed in localStorage
  useEffect(() => {
    if (allCompleted && !completedMissions.includes(activeMission.id)) {
      const updated = [...completedMissions, activeMission.id];
      setCompletedMissions(updated);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore localStorage quota errors
      }
      store.logActivity(
        'MISSION',
        `Mission Accomplished: "${activeMission.title}" verified!`,
        'ok'
      );
    }
  }, [allCompleted, activeMission, completedMissions, store]);

  const handleAutoSetup = useCallback(() => {
    // Reset transient context on auto-setup
    setMissionContext({
      maxGdopObserved: 0,
      hasEnteredHazard: false,
    });
    activeMission.setup(store);
  }, [activeMission, store]);

  const handleNextMission = useCallback(() => {
    if (activeMissionIdx < MISSIONS.length - 1) {
      setActiveMissionIdx(activeMissionIdx + 1);
      setMissionContext({ maxGdopObserved: 0, hasEnteredHazard: false });
    }
  }, [activeMissionIdx]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="mission-drawer"
      className="fixed z-40 transition-all duration-300 font-mono"
      style={{
        bottom: store.isConsoleOpen ? '265px' : '48px',
        left: '16px',
        maxWidth: isMinimized ? '340px' : '480px',
        width: 'calc(100vw - 32px)',
      }}
    >
      <div
        className="rounded-xl shadow-2xl backdrop-blur-md overflow-hidden flex flex-col"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
        }}
      >
        {/* Header Bar */}
        <div
          className="px-3.5 py-2.5 flex items-center justify-between cursor-pointer select-none"
          style={{
            background: 'var(--bg-subtle)',
            borderBottom: isMinimized ? 'none' : '1px solid var(--border-subtle)',
          }}
          onClick={() => setIsMinimized(!isMinimized)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              style={{
                background: `var(${activeMission.accentVar}-subtle)`,
                border: `1px solid var(${activeMission.accentVar}-border)`,
                color: `var(${activeMission.accentVar})`,
              }}
            >
              <Target size={13} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold tracking-wider truncate" style={{ color: 'var(--text-primary)' }}>
                  MISSION LAB
                </span>
                <span
                  className="text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase shrink-0 border"
                  style={{
                    background: completedMissions.length === MISSIONS.length ? 'var(--status-ok-subtle)' : 'var(--bg-surface)',
                    borderColor: completedMissions.length === MISSIONS.length ? 'var(--status-ok-border)' : 'var(--border-subtle)',
                    color: completedMissions.length === MISSIONS.length ? 'var(--status-ok)' : 'var(--text-secondary)',
                  }}
                >
                  {completedMissions.length}/{MISSIONS.length} COMPLETED
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 rounded hover:bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              title={isMinimized ? 'Expand Mission Drawer' : 'Minimize Mission Drawer'}
              aria-label={isMinimized ? 'Expand Mission Drawer' : 'Minimize Mission Drawer'}
            >
              {isMinimized ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              title="Close Mission Drawer"
              aria-label="Close Mission Drawer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Minimized Quick Bar */}
        {isMinimized && (
          <div
            className="px-3.5 py-2 text-[11px] flex items-center justify-between cursor-pointer"
            onClick={() => setIsMinimized(false)}
          >
            <span className="text-[var(--text-secondary)] truncate">
              M{activeMission.number}: <strong style={{ color: 'var(--text-primary)' }}>{activeMission.shortTitle}</strong>
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ml-2"
              style={{
                background: allCompleted ? 'var(--status-ok-subtle)' : 'var(--accent-eloran-subtle)',
                color: allCompleted ? 'var(--status-ok)' : 'var(--accent-eloran)',
              }}
            >
              {allCompleted ? 'ACCOMPLISHED' : `${objectiveStatus.filter((o) => o.satisfied).length}/3 OBJ`}
            </span>
          </div>
        )}

        {/* Expanded Drawer Content */}
        {!isMinimized && (
          <div className="p-3.5 space-y-3 max-h-[70vh] overflow-y-auto">
            {/* Mission Selector Tabs */}
            <div className="flex gap-1 p-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
              {MISSIONS.map((m, idx) => {
                const isActive = idx === activeMissionIdx;
                const isDone = completedMissions.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setActiveMissionIdx(idx);
                      setMissionContext({ maxGdopObserved: 0, hasEnteredHazard: false });
                    }}
                    className="flex-1 py-1 px-1.5 rounded text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer truncate"
                    style={{
                      background: isActive ? 'var(--bg-surface)' : 'transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                      border: isActive ? '1px solid var(--border-subtle)' : '1px solid transparent',
                      boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                    }}
                  >
                    {isDone ? (
                      <CheckCircle2 size={11} className="text-[var(--status-ok)] shrink-0" />
                    ) : (
                      <span className="opacity-60">{m.number}.</span>
                    )}
                    <span className="truncate">{m.shortTitle}</span>
                  </button>
                );
              })}
            </div>

            {/* Mission Briefing Card */}
            <div
              className="p-3 rounded-lg border space-y-2 text-xs"
              style={{
                background: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                    style={{
                      background: `var(${activeMission.accentVar}-subtle)`,
                      borderColor: `var(${activeMission.accentVar}-border)`,
                      color: `var(${activeMission.accentVar})`,
                    }}
                  >
                    {activeMission.badge}
                  </span>
                  <span className="text-[11px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                    {activeMission.title}
                  </span>
                </div>

                <a
                  href={activeMission.theoryAnchor}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-bold flex items-center gap-1 transition px-1.5 py-0.5 rounded border shrink-0 hover:opacity-80"
                  style={{
                    background: 'var(--bg-canvas)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                  title="Read mathematical formulation in Theory section"
                >
                  <span>Theory</span>
                  <ExternalLink size={9} aria-hidden="true" />
                </a>
              </div>

              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {activeMission.briefing}
              </p>

              {/* Action Ribbon: Auto-Setup & Hints */}
              <div className="pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoSetup}
                  className="flex-1 py-1.5 px-2.5 rounded text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer hover:opacity-90"
                  style={{
                    background: `var(${activeMission.accentVar}-subtle)`,
                    border: `1px solid var(${activeMission.accentVar}-border)`,
                    color: `var(${activeMission.accentVar})`,
                  }}
                  title="Initialize scenario state with 1-click preset setup"
                >
                  <Zap size={12} aria-hidden="true" />
                  <span>Auto-Setup Scenario</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowHints(!showHints)}
                  className="py-1.5 px-2 rounded text-[10px] font-bold flex items-center gap-1 border transition hover:bg-[var(--bg-muted)]"
                  style={{
                    background: 'var(--bg-canvas)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                  title="Toggle guidance hints"
                >
                  <Info size={11} aria-hidden="true" />
                  <span>{showHints ? 'Hide Hints' : 'Hints'}</span>
                </button>
              </div>
            </div>

            {/* Guidance Hints (Collapsible) */}
            {showHints && (
              <div
                className="p-2.5 rounded-lg border text-[10px] space-y-1"
                style={{
                  background: 'var(--bg-canvas)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                <div className="font-bold flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                  <Info size={11} />
                  <span>Tactical Hints & Operational Guidance:</span>
                </div>
                <ul className="list-disc pl-4 space-y-0.5 leading-relaxed">
                  {activeMission.hints.map((hint, i) => (
                    <li key={i}>{hint}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Objective Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>
                <span>OPERATIONAL OBJECTIVES</span>
                <span
                  style={{
                    color: allCompleted ? 'var(--status-ok)' : 'var(--text-secondary)',
                  }}
                >
                  {objectiveStatus.filter((o) => o.satisfied).length}/{activeMission.objectives.length} Complete
                </span>
              </div>

              {activeMission.objectives.map((obj, i) => {
                const status = objectiveStatus[i];
                const isSatisfied = status?.satisfied;
                return (
                  <div
                    key={obj.id}
                    className="p-2.5 rounded-lg border transition-all text-xs space-y-1"
                    style={{
                      background: isSatisfied ? 'var(--status-ok-subtle)' : 'var(--bg-subtle)',
                      borderColor: isSatisfied ? 'var(--status-ok-border)' : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="pt-0.5 shrink-0">
                        {isSatisfied ? (
                          <CheckCircle2 size={14} className="text-[var(--status-ok)]" />
                        ) : (
                          <Circle size={14} className="text-[var(--text-dim)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="font-bold text-[11px] truncate"
                            style={{
                              color: isSatisfied ? 'var(--status-ok)' : 'var(--text-primary)',
                              textDecoration: isSatisfied ? 'none' : 'none',
                            }}
                          >
                            {i + 1}. {obj.title}
                          </span>
                          <span
                            className="text-[9px] font-bold uppercase px-1 rounded shrink-0 border"
                            style={{
                              background: isSatisfied ? 'var(--status-ok)' : 'var(--bg-canvas)',
                              color: isSatisfied ? '#000' : 'var(--text-dim)',
                              borderColor: isSatisfied ? 'var(--status-ok)' : 'var(--border-subtle)',
                            }}
                          >
                            {isSatisfied ? 'MET' : 'PENDING'}
                          </span>
                        </div>
                        <p className="text-[10px] leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {obj.desc}
                        </p>
                        <div
                          className="mt-1 text-[9px] font-mono px-1.5 py-0.5 rounded truncate"
                          style={{
                            background: 'var(--bg-canvas)',
                            border: '1px solid var(--border-subtle)',
                            color: isSatisfied ? 'var(--status-ok)' : 'var(--text-secondary)',
                          }}
                        >
                          {status?.metric || '--'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mission Accomplished Card */}
            {allCompleted && (
              <div
                className="p-3 rounded-xl border flex items-center justify-between gap-2"
                style={{
                  background: 'var(--status-ok-subtle)',
                  borderColor: 'var(--status-ok-border)',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: 'var(--status-ok)',
                      color: '#000',
                      boxShadow: '0 0 12px var(--status-ok)',
                    }}
                  >
                    <Award size={18} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-[11px] uppercase tracking-wider" style={{ color: 'var(--status-ok)' }}>
                      MISSION ACCOMPLISHED!
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)] truncate">
                      All criteria successfully verified.
                    </div>
                  </div>
                </div>

                {activeMissionIdx < MISSIONS.length - 1 && (
                  <button
                    type="button"
                    onClick={handleNextMission}
                    className="py-1 px-2.5 rounded text-[10px] font-bold flex items-center gap-1 transition shrink-0 cursor-pointer hover:opacity-90"
                    style={{
                      background: 'var(--status-ok)',
                      color: '#000',
                    }}
                  >
                    <span>Next Mission</span>
                    <ArrowRight size={11} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
