import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Trash2, Filter } from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';

const CATEGORY_COLORS = {
  SOLVER: { text: 'var(--accent-eloran)', bg: 'var(--accent-eloran-subtle)', border: 'var(--accent-eloran-border)' },
  STATION: { text: 'var(--accent-loran-c)', bg: 'var(--accent-loran-c-subtle)', border: 'var(--accent-loran-c-border)' },
  PRESET: { text: 'var(--accent-eloran)', bg: 'var(--accent-eloran-subtle)', border: 'var(--accent-eloran-border)' },
  ROUTING: { text: 'var(--status-ok)', bg: 'var(--status-ok-subtle)', border: 'var(--status-ok-border)' },
  EW: { text: 'var(--status-danger)', bg: 'var(--status-danger-subtle)', border: 'var(--status-danger-border)' },
  ASF: { text: 'var(--text-secondary)', bg: 'var(--bg-subtle)', border: 'var(--border-subtle)' },
  CLOCK: { text: 'var(--accent-loran-c)', bg: 'var(--accent-loran-c-subtle)', border: 'var(--accent-loran-c-border)' },
  SYSTEM: { text: 'var(--text-muted)', bg: 'var(--bg-subtle)', border: 'var(--border-subtle)' },
};

export default function ActivityLogFeed({ maxHeight = '130px', compact = false }) {
  const {
    activityLogs = [],
    isActivityFeedPaused,
    toggleActivityFeedPaused,
    clearActivityLogs,
  } = useSimulationStore();

  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new log unless paused
  useEffect(() => {
    if (!isActivityFeedPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activityLogs, isActivityFeedPaused]);

  const filteredLogs = selectedCategory === 'ALL'
    ? activityLogs
    : activityLogs.filter((l) => l.category === selectedCategory);

  return (
    <div className="flex flex-col h-full font-mono text-xs">
      {/* Header controls */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[var(--border-subtle)] text-[10px]">
        <div className="flex items-center gap-1.5">
          <Filter size={11} style={{ color: 'var(--text-dim)' }} aria-hidden="true" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer"
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            aria-label="Filter activity feed category"
          >
            <option value="ALL">All Events ({activityLogs.length})</option>
            <option value="SOLVER">Solver</option>
            <option value="STATION">Station</option>
            <option value="PRESET">Preset</option>
            <option value="ROUTING">Routing</option>
            <option value="EW">EW / Jamming</option>
            <option value="ASF">ASF Physics</option>
            <option value="CLOCK">Clock</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleActivityFeedPaused}
            className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition"
            style={{
              background: isActivityFeedPaused ? 'var(--status-warn-subtle)' : 'var(--bg-subtle)',
              border: `1px solid ${isActivityFeedPaused ? 'var(--status-warn-border)' : 'var(--border-subtle)'}`,
              color: isActivityFeedPaused ? 'var(--status-warn)' : 'var(--text-muted)',
            }}
            title={isActivityFeedPaused ? 'Resume live feed auto-scroll' : 'Pause live feed'}
          >
            {isActivityFeedPaused ? <Play size={10} /> : <Pause size={10} />}
            <span>{isActivityFeedPaused ? 'PAUSED' : 'LIVE'}</span>
          </button>

          <button
            onClick={clearActivityLogs}
            className="p-1 rounded text-[9px] cursor-pointer transition hover:bg-[var(--bg-subtle)]"
            style={{ color: 'var(--text-dim)' }}
            title="Clear activity log"
            aria-label="Clear activity log"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Scrollable Log Stream */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-1 pt-1.5 pr-1 font-mono text-[10px] select-text"
        style={{ maxHeight }}
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center py-4 text-[10px]" style={{ color: 'var(--text-dim)' }}>
            No activity logged yet.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const catStyle = CATEGORY_COLORS[log.category] || CATEGORY_COLORS.SYSTEM;
            return (
              <div
                key={log.id}
                className="flex items-start gap-1.5 leading-snug py-0.5 border-b border-[var(--border-subtle)]/40 hover:bg-[var(--bg-subtle)]/40 transition px-1 rounded"
              >
                <span className="text-[9px] text-[var(--text-dim)] shrink-0 font-bold">
                  [{log.timeStr || new Date(log.timestamp).toTimeString().slice(0, 8)}]
                </span>
                <span
                  className="px-1 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider shrink-0"
                  style={{
                    background: catStyle.bg,
                    color: catStyle.text,
                    border: `1px solid ${catStyle.border}`,
                  }}
                >
                  {log.category}
                </span>
                <span
                  className={`break-words ${compact ? 'text-[9.5px]' : 'text-[10px]'}`}
                  style={{
                    color:
                      log.level === 'error'
                        ? 'var(--status-danger)'
                        : log.level === 'warn'
                        ? 'var(--status-warn)'
                        : 'var(--text-secondary)',
                  }}
                >
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
