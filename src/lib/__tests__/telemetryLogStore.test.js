import { describe, it, expect, beforeEach } from 'vitest';
import { useSimulationStore } from '../../state/simulationStore.js';

describe('Telemetry & Operational Activity Store Integration', () => {
  beforeEach(() => {
    const store = useSimulationStore.getState();
    store.clearActivityLogs();
  });

  it('initializes activityLogs and logs new activity entries', () => {
    const store = useSimulationStore.getState();
    expect(store.activityLogs).toEqual([]);

    store.logActivity('SOLVER', 'Gauss-Newton fix converged in 4 iterations', 'info');
    const logs = useSimulationStore.getState().activityLogs;
    expect(logs.length).toBe(1);
    expect(logs[0].category).toBe('SOLVER');
    expect(logs[0].message).toContain('Gauss-Newton');
    expect(logs[0].level).toBe('info');
  });

  it('caps activity logs at 200 items to prevent unbounded memory growth', () => {
    const store = useSimulationStore.getState();
    for (let i = 0; i < 250; i++) {
      store.logActivity('SYSTEM', `Event ${i}`, 'info');
    }
    const logs = useSimulationStore.getState().activityLogs;
    expect(logs.length).toBe(200);
    expect(logs[logs.length - 1].message).toBe('Event 249');
  });

  it('toggles pause state and clears logs', () => {
    const store = useSimulationStore.getState();
    expect(store.isActivityFeedPaused).toBe(false);

    store.toggleActivityFeedPaused();
    expect(useSimulationStore.getState().isActivityFeedPaused).toBe(true);

    store.toggleActivityFeedPaused();
    expect(useSimulationStore.getState().isActivityFeedPaused).toBe(false);

    store.logActivity('TEST', 'Msg 1');
    store.clearActivityLogs();
    expect(useSimulationStore.getState().activityLogs.length).toBe(0);
  });

  it('records uncertainty samples and caps at 60 points', () => {
    const store = useSimulationStore.getState();
    for (let i = 0; i < 75; i++) {
      store.recordUncertaintyPoint({
        timestamp: Date.now() + i,
        variance: i * 0.5,
        gdop: 1.5,
        errorMeters: Math.sqrt(i * 0.5),
      });
    }
    const history = useSimulationStore.getState().uncertaintyHistory;
    expect(history.length).toBe(60);
    expect(history[history.length - 1].variance).toBe(74 * 0.5);
  });

  it('toggles console open state', () => {
    const store = useSimulationStore.getState();
    const initial = store.isConsoleOpen;
    store.toggleConsoleOpen();
    expect(useSimulationStore.getState().isConsoleOpen).toBe(!initial);
    store.toggleConsoleOpen();
    expect(useSimulationStore.getState().isConsoleOpen).toBe(initial);
  });

  it('logs station status degradation and failure in activity log', () => {
    const store = useSimulationStore.getState();
    store.setStationStatus('M', 'failed');

    const logs = useSimulationStore.getState().activityLogs;
    const stationLog = logs.find((l) => l.category === 'STATION');
    expect(stationLog).toBeDefined();
    expect(stationLog.message).toContain('Station M status set to FAILED');
    expect(stationLog.level).toBe('warn');
  });

  it('logs scenario preset loading into activity log', () => {
    const store = useSimulationStore.getState();
    store.loadPreset('korea_yellow_sea_trial');

    const logs = useSimulationStore.getState().activityLogs;
    const presetLog = logs.find((l) => l.category === 'PRESET');
    expect(presetLog).toBeDefined();
    expect(presetLog.message).toContain('Loaded scenario preset');
  });

  it('automatically captures uncertainty samples when evaluating receivers', () => {
    const store = useSimulationStore.getState();
    store.evaluateReceivers();

    const history = useSimulationStore.getState().uncertaintyHistory;
    expect(history.length).toBeGreaterThan(0);
    const latest = history[history.length - 1];
    expect(latest).toHaveProperty('variance');
    expect(latest).toHaveProperty('gdop');
    expect(latest).toHaveProperty('errorMeters');
    expect(latest.variance).toBeGreaterThanOrEqual(0.01);
  });
});
