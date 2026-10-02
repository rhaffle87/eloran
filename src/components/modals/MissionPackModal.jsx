import React, { useState, useRef } from 'react';
import {
  Package,
  Download,
  Upload,
  Check,
  AlertCircle,
  Copy,
  FileText,
  X,
  Radio,
  Layers,
  Compass,
} from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import {
  validateMissionPack,
  createMissionPackFromState,
  hydrateMissionPackIntoStore,
  BUILTIN_MISSION_PACKS,
} from '../../lib/scenarioPack.js';

export default function MissionPackModal({ open, onClose }) {
  const store = useSimulationStore();
  const [activeTab, setActiveTab] = useState('builtin'); // 'builtin' | 'import' | 'export'

  // Import State
  const [importedPack, setImportedPack] = useState(null);
  const [importErrors, setImportErrors] = useState([]);
  const [importSuccessMsg, setImportSuccessMsg] = useState('');
  const fileInputRef = useRef(null);

  // Export State
  const [exportName, setExportName] = useState('Custom Tactical Corridor');
  const [exportDesc, setExportDesc] = useState('Tailored eLoran / Loran-C testbed scenario');
  const [exportAuthor, setExportAuthor] = useState('Maritime Navigator');
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const currentExportPack = createMissionPackFromState(store, {
    name: exportName,
    description: exportDesc,
    author: exportAuthor,
  });
  const exportJsonString = JSON.stringify(currentExportPack, null, 2);

  const handleFileDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) readFile(file);
  };

  const handleFileInput = (e) => {
    const file = e.target?.files?.[0];
    if (file) readFile(file);
  };

  const readFile = (file) => {
    setImportErrors([]);
    setImportSuccessMsg('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        const res = validateMissionPack(parsed);
        if (res.valid) {
          setImportedPack(res.data);
          setImportErrors([]);
        } else {
          setImportedPack(null);
          setImportErrors(res.errors);
        }
      } catch (err) {
        setImportedPack(null);
        setImportErrors([`JSON Parsing Error: ${err.message}`]);
      }
    };
    reader.readAsText(file);
  };

  const handleApplyImport = () => {
    if (!importedPack) return;
    const res = hydrateMissionPackIntoStore(importedPack, store);
    if (res.success) {
      setImportSuccessMsg(res.message);
      setTimeout(() => {
        onClose();
      }, 900);
    } else {
      setImportErrors([res.message]);
    }
  };

  const handleLoadBuiltin = (pack) => {
    const res = hydrateMissionPackIntoStore(pack, store);
    if (res.success) {
      setImportSuccessMsg(res.message);
      setTimeout(() => {
        onClose();
      }, 600);
    }
  };

  const handleDownloadExport = () => {
    const blob = new Blob([exportJsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.simuloran.json`;
    a.click();
    URL.revokeObjectURL(a);
  };

  const handleCopyClipboard = async () => {
    try {
      await navigator.clipboard.writeText(exportJsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="mission-pack-modal-title" className="rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-5 transition-all my-8"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--accent-eloran)]">
              <Package size={18} />
            </div>
            <div>
              <h2 id="mission-pack-modal-title" className="font-mono font-bold text-base tracking-wide flex items-center gap-2 text-[var(--text-primary)]">
                SIMULORAN Mission Packs
                <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-[var(--bg-subtle)] text-[var(--accent-eloran)] border border-[var(--border-subtle)]">
                  .simuloran.json
                </span>
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Standardized, portable scenario packaging for reproducible PNT simulation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
            aria-label="Close Mission Pack Modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('builtin')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'builtin'
                ? 'bg-[var(--accent-eloran)] text-white font-bold shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <Layers size={14} /> Built-in Scenarios
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'import'
                ? 'bg-[var(--accent-eloran)] text-white font-bold shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <Upload size={14} /> Import File
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'export'
                ? 'bg-[var(--accent-eloran)] text-white font-bold shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <Download size={14} /> Export Scenario
          </button>
        </div>

        {/* Success Banner */}
        {importSuccessMsg && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-mono flex items-center gap-2">
            <Check size={16} />
            <span>{importSuccessMsg}</span>
          </div>
        )}

        {/* TAB 1: BUILTIN SCENARIOS */}
        {activeTab === 'builtin' && (
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {BUILTIN_MISSION_PACKS.map((pack) => (
              <div
                key={pack.meta.id}
                className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--accent-eloran)]/60 transition space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold font-mono text-[var(--text-primary)]">
                      {pack.meta.name}
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                      {pack.meta.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLoadBuiltin(pack)}
                    data-testid={`load-mission-${pack.meta.id}`}
                    aria-label={`Load Mission ${pack.meta.name}`}
                    className="px-3 py-1.5 rounded-lg bg-[var(--accent-eloran)] hover:opacity-90 text-white font-mono text-xs font-bold shrink-0 transition cursor-pointer shadow-sm"
                  >
                    Load Scenario
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-mono text-[var(--text-dim)] border-t border-[var(--border-subtle)]/50">
                  <span className="flex items-center gap-1">
                    <Radio size={12} className="text-[var(--accent-eloran)]" />
                    {pack.chain.masters.length} Master / {pack.chain.slaves?.length || 0} Secondaries
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Compass size={12} className="text-[var(--accent-loran-c)]" />
                    Solver: {pack.physics.settings.solverMode}
                  </span>
                  <span>·</span>
                  <span>Author: {pack.meta.author}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: IMPORT FILE */}
        {activeTab === 'import' && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--accent-eloran)] rounded-xl p-8 text-center cursor-pointer bg-[var(--bg-canvas)] transition space-y-2"
            >
              <Upload size={28} className="mx-auto text-[var(--accent-eloran)]" />
              <div className="text-xs font-medium text-[var(--text-primary)]">
                Drag and drop a <span className="font-mono font-bold text-[var(--accent-eloran)]">.simuloran.json</span> file here
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                or click to browse from local storage
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.simuloran.json"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>

            {/* Error Display */}
            {importErrors.length > 0 && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs space-y-1">
                <div className="font-bold font-mono flex items-center gap-1.5">
                  <AlertCircle size={14} /> Schema Validation Failed
                </div>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] font-mono">
                  {importErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Valid Pack Preview */}
            {importedPack && (
              <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check size={16} className="text-emerald-500" />
                    <span className="text-xs font-bold font-mono text-[var(--text-primary)]">
                      {importedPack.meta?.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold">
                    Valid Schema v{importedPack.version}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  {importedPack.meta?.description}
                </p>
                <div className="text-[10px] font-mono text-[var(--text-dim)] flex items-center gap-3">
                  <span>Masters: {importedPack.chain?.masters?.length || 0}</span>
                  <span>Secondaries: {importedPack.chain?.slaves?.length || 0}</span>
                  <span>Receivers: {importedPack.environment?.receivers?.length || 0}</span>
                </div>
                <button
                  type="button"
                  onClick={handleApplyImport}
                  className="w-full py-2 rounded-lg bg-[var(--accent-eloran)] hover:opacity-90 text-white font-mono text-xs font-bold transition cursor-pointer shadow-sm"
                >
                  Apply & Hydrate Scenario
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: EXPORT SCENARIO */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-mono font-medium text-[var(--text-muted)] block mb-1">
                  Scenario Name
                </label>
                <input
                  type="text"
                  value={exportName}
                  onChange={(e) => setExportName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[var(--bg-canvas)] border border-[var(--border-subtle)] focus:outline-hidden focus:border-[var(--accent-eloran)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono font-medium text-[var(--text-muted)] block mb-1">
                  Author / Organization
                </label>
                <input
                  type="text"
                  value={exportAuthor}
                  onChange={(e) => setExportAuthor(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[var(--bg-canvas)] border border-[var(--border-subtle)] focus:outline-hidden focus:border-[var(--accent-eloran)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono font-medium text-[var(--text-muted)] block mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={exportDesc}
                  onChange={(e) => setExportDesc(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[var(--bg-canvas)] border border-[var(--border-subtle)] focus:outline-hidden focus:border-[var(--accent-eloran)] text-[var(--text-primary)]"
                />
              </div>
            </div>

            {/* Code Preview */}
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-dim)]">
                <span className="flex items-center gap-1.5">
                  <FileText size={12} /> JSON Payload Preview
                </span>
                <span>{exportJsonString.length} bytes</span>
              </div>
              <pre className="text-[10px] font-mono max-h-48 overflow-y-auto text-[var(--text-secondary)] whitespace-pre-wrap leading-tight">
                {exportJsonString}
              </pre>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCopyClipboard}
                className="px-3 py-2 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                {copied ? 'Copied JSON!' : 'Copy to Clipboard'}
              </button>
              <button
                type="button"
                onClick={handleDownloadExport}
                className="px-4 py-2 rounded-lg bg-[var(--accent-eloran)] hover:opacity-90 text-white text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer shadow-sm"
              >
                <Download size={14} /> Download .simuloran.json
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
