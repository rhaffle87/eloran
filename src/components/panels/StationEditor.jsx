import React, { useRef, useState } from 'react';
import {
  Upload,
  Download,
  Plus,
  Trash2,
  Radio,
  Layers,
  FileCode,
  RotateCcw,
} from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import { PRESET_SCENARIOS } from '../../state/presets.js';
import { parseStationsCsv, exportStationsCsv, exportScenarioGeoJson } from '../../lib/stations.js';
import Modal from '../ui/Modal.jsx';

export default function StationEditor({ isELoran = false }) {
  const fileInputRef = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newRole, setNewRole] = useState('slave');
  const [newLabel, setNewLabel] = useState('');
  const [newLat, setNewLat] = useState('-6.25');
  const [newLng, setNewLng] = useState('106.85');

  const {
    masters,
    slaves,
    receivers,
    activePresetId,
    loadPreset,
    addStation,
    removeStation,
    setStations,
    resetAll,
    evaluateReceivers,
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
        if (errors.length) {
          alert(`CSV imported with warnings:\n${errors.slice(0, 5).join('\n')}`);
        }
        setStations(m, s, r);
        setTimeout(() => evaluateReceivers(), 100);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportCsv = () => {
    const all = [...masters, ...slaves, ...receivers];
    const csv = exportStationsCsv(all);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loran-stations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportGeoJson = () => {
    const geojson = exportScenarioGeoJson(masters, slaves, receivers);
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
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

    const station = {
      role: newRole,
      label: newLabel.trim() || `${newRole[0].toUpperCase()}${Date.now().toString().slice(-3)}`,
      lat,
      lng,
      txDbm: newRole === 'master' ? 20 : 18,
      griMs: 1000,
      offsetSec: newRole === 'slave' ? 0.01 : 0,
      ddsEnabled: isELoran,
      clock: { type: 'gps-disciplined', biasSec: 0, driftPerSec: 0 },
      diffCorrections: { enabled: false, avgMeters: 0 },
      asfMeters: 0,
    };

    addStation(station);
    setModalOpen(false);
    setTimeout(() => evaluateReceivers(), 50);
  };

  const allStations = [
    ...masters.map((m) => ({ ...m, role: 'master' })),
    ...slaves.map((s) => ({ ...s, role: 'slave' })),
    ...receivers.map((r) => ({ ...r, role: 'receiver' })),
  ];

  return (
    <div className="space-y-4">
      {/* Preset Scenario Selector */}
      <div>
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
          Scenario Presets
        </label>
        <select
          value={activePresetId}
          onChange={(e) => loadPreset(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-hidden focus:border-cyan-500 font-mono"
        >
          {Object.entries(PRESET_SCENARIOS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-zinc-500 mt-1 leading-normal">
          {PRESET_SCENARIOS[activePresetId]?.description}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 rounded-lg text-xs font-medium transition"
        >
          <Plus size={14} /> Add Station
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition"
        >
          <Upload size={14} /> Import CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="hidden"
        />

        <button
          onClick={handleExportCsv}
          className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition"
        >
          <Download size={14} /> Export CSV
        </button>
        <button
          onClick={handleExportGeoJson}
          className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition"
        >
          <FileCode size={14} /> GeoJSON
        </button>
      </div>

      {/* Station List Table */}
      <div className="space-y-2 pt-2">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Active Stations ({allStations.length})
          </span>
          <button
            onClick={resetAll}
            className="text-[11px] text-zinc-500 hover:text-red-400 flex items-center gap-1 transition"
          >
            <RotateCcw size={12} /> Clear all
          </button>
        </div>

        <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
          {allStations.map((st) => (
            <div
              key={st.label}
              className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono hover:border-zinc-700 transition"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    st.role === 'master'
                      ? 'bg-cyan-400'
                      : st.role === 'slave'
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                />
                <div>
                  <div className="font-bold text-zinc-100 flex items-center gap-2">
                    {st.label}
                    <span className="text-[10px] text-zinc-500 uppercase font-normal">
                      [{st.role}]
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    {st.lat.toFixed(4)}°, {st.lng.toFixed(4)}°
                    {st.txDbm ? ` • ${st.txDbm}dBm` : ''}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => removeStation(st.label)}
                  className="p-1 text-zinc-500 hover:text-red-400 rounded-md hover:bg-zinc-800 transition"
                  title="Delete station"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
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
              <label className="block text-zinc-400 mb-1">Station Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200"
              >
                <option value="master">Master Station (M)</option>
                <option value="slave">Secondary / Slave Station (S)</option>
                <option value="receiver">Receiver (R)</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Station Identifier / Label</label>
              <input
                type="text"
                placeholder="e.g. M1-Bay"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-zinc-400 mb-1">Latitude (°)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={newLat}
                  onChange={(e) => setNewLat(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 font-mono"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Longitude (°)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={newLng}
                  onChange={(e) => setNewLng(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 font-mono"
                />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
