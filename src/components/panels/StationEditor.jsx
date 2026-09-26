import React, { useRef, useState } from 'react';
import { Upload, Download, Plus, Trash2, FileCode, RotateCcw } from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import { PRESET_SCENARIOS } from '../../state/presets.js';
import { parseStationsCsv, exportStationsCsv, exportScenarioGeoJson } from '../../lib/stations.js';
import Modal from '../ui/Modal.jsx';

const ROLE_COLOR_VAR = {
  master:   '--accent-eloran',
  slave:    '--accent-loran-c',
  receiver: '--status-ok',
};
const ROLE_LABEL = { master: 'MST', slave: 'SEC', receiver: 'RCV' };

export default function StationEditor({ isELoran = false }) {
  const fileInputRef = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newRole, setNewRole] = useState('slave');
  const [newLabel, setNewLabel] = useState('');
  const [newLat, setNewLat] = useState('-6.25');
  const [newLng, setNewLng] = useState('106.85');

  const {
    masters, slaves, receivers, activePresetId,
    loadPreset, addStation, removeStation, setStations, resetAll, evaluateReceivers,
  } = useSimulationStore();

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      alert('Security Notice: Station CSV exceeds 1 MB maximum file size limit.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        const { masters: m, slaves: s, receivers: r, errors } = parseStationsCsv(text);
        if (errors.length) alert(`CSV imported with warnings:\n${errors.slice(0, 5).join('\n')}`);
        setStations(m, s, r);
        setTimeout(() => evaluateReceivers(), 100);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportCsv = () => {
    const csv = exportStationsCsv([...masters, ...slaves, ...receivers]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loran-stations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportGeoJson = () => {
    const blob = new Blob([JSON.stringify(exportScenarioGeoJson(masters, slaves, receivers), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loran-scenario-${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateStation = () => {
    const lat = parseFloat(newLat);
    const lng = parseFloat(newLng);
    if (isNaN(lat) || isNaN(lng)) return;
    addStation({
      role: newRole,
      label: newLabel.trim() || `${newRole[0].toUpperCase()}${Date.now().toString().slice(-3)}`,
      lat, lng,
      txDbm: newRole === 'master' ? 20 : 18,
      griMs: 1000,
      offsetSec: newRole === 'slave' ? 0.01 : 0,
      ddsEnabled: isELoran,
      clock: { type: 'gps-disciplined', biasSec: 0, driftPerSec: 0 },
      diffCorrections: { enabled: false, avgMeters: 0 },
      asfMeters: 0,
    });
    setModalOpen(false);
    setTimeout(() => evaluateReceivers(), 50);
  };

  const allStations = [
    ...masters.map((m) => ({ ...m, role: 'master' })),
    ...slaves.map((s) => ({ ...s, role: 'slave' })),
    ...receivers.map((r) => ({ ...r, role: 'receiver' })),
  ];

  // Shared input style
  const inputStyle = {
    width: '100%',
    background: 'var(--bg-canvas)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
    outline: 'none',
  };

  return (
    <div className="space-y-4">
      {/* Preset selector */}
      <div>
        <label
          htmlFor="scenario-preset-select"
          className="text-xs font-semibold uppercase tracking-wider block mb-1.5"
          style={{ color: 'var(--text-dim)' }}
        >
          Scenario Presets
        </label>
        <select
          id="scenario-preset-select"
          value={activePresetId}
          onChange={(e) => loadPreset(e.target.value)}
          style={inputStyle}
        >
          {Object.entries(PRESET_SCENARIOS).map(([id, p]) => (
            <option key={id} value={id}>{p.name}</option>
          ))}
        </select>
        <p className="text-[11px] mt-1 leading-normal" style={{ color: 'var(--text-dim)' }}>
          {PRESET_SCENARIOS[activePresetId]?.description}
        </p>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition"
          style={{ background: 'var(--accent-eloran-subtle)', border: '1px solid var(--accent-eloran-border)', color: 'var(--accent-eloran)' }}
        >
          <Plus size={14} /> Add Station
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition"
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <Upload size={14} /> Import CSV
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />

        <button
          onClick={handleExportCsv}
          className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition"
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <Download size={14} /> Export CSV
        </button>
        <button
          onClick={handleExportGeoJson}
          className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition"
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <FileCode size={14} /> GeoJSON
        </button>
      </div>

      {/* Station list */}
      <div className="space-y-2 pt-2">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
            Active Stations ({allStations.length})
          </span>
          <button
            onClick={resetAll}
            className="text-[11px] flex items-center gap-1 transition"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--status-danger)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            <RotateCcw size={12} /> Clear all
          </button>
        </div>

        <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
          {allStations.map((st) => {
            const colorVar = ROLE_COLOR_VAR[st.role];
            return (
              <div
                key={st.label}
                className="rounded-lg p-2.5 flex items-center justify-between text-xs font-mono transition"
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: `var(${colorVar})` }}
                  />
                  <div>
                    <div className="font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                      <span>{st.label}</span>
                      {st.name && (
                        <span className="font-normal text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          · {st.name}
                        </span>
                      )}
                      <span
                        className="text-[9px] px-1 py-0.5 rounded font-mono"
                        style={{
                          background: `var(${colorVar}-subtle)`,
                          color: `var(${colorVar})`,
                          border: `1px solid var(${colorVar}-border)`,
                        }}
                      >
                        {ROLE_LABEL[st.role]}
                      </span>
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                      {st.lat.toFixed(4)}°, {st.lng.toFixed(4)}°
                      {st.txDbm ? ` · ${st.txDbm} dBm` : ''}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => removeStation(st.label)}
                  className="p-1 rounded-md transition"
                  style={{ color: 'var(--text-muted)' }}
                  title="Delete station"
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--status-danger)'; e.currentTarget.style.background = 'var(--status-danger-subtle)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}

          {allStations.length === 0 && (
            <p className="text-[11px] text-center py-6 font-mono" style={{ color: 'var(--text-dim)' }}>
              No stations — select a preset or add stations via map click
            </p>
          )}
        </div>
      </div>

      {/* Add Station Modal */}
      {modalOpen && (
        <Modal
          open={modalOpen}
          title="Add Transmission Station"
          onCancel={() => setModalOpen(false)}
          onConfirm={handleCreateStation}
        >
          <div className="space-y-3 pt-2 text-xs">
            <div>
              <label className="block mb-1" style={{ color: 'var(--text-secondary)' }}>Station Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                style={inputStyle}
              >
                <option value="master">Master Station (M)</option>
                <option value="slave">Secondary / Slave Station (S)</option>
                <option value="receiver">Receiver (R)</option>
              </select>
            </div>
            <div>
              <label className="block mb-1" style={{ color: 'var(--text-secondary)' }}>Station Identifier / Label</label>
              <input
                type="text"
                placeholder="e.g. M1-Bay"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-secondary)' }}>Latitude (°)</label>
                <input type="number" step="0.0001" value={newLat} onChange={(e) => setNewLat(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-secondary)' }}>Longitude (°)</label>
                <input type="number" step="0.0001" value={newLng} onChange={(e) => setNewLng(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
