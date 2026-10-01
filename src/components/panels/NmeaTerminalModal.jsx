import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  Download,
  Copy,
  Check,
  Trash2,
  Terminal,
  Wifi,
  WifiOff,
  ExternalLink,
} from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import {
  generateRmc,
  generateGga,
  generateGll,
  generateVtg,
} from '../../lib/nmea.js';

const BAUD_RATES = [4800, 9600, 19200, 38400, 115200];
const MAX_BUFFER_LINES = 400;

export default function NmeaTerminalModal({ isOpen, onClose }) {
  const {
    receivers = [],
    selectedReceiver,
    receiverFixes = {},
  } = useSimulationStore();

  const [talker, setTalker] = useState('EC');
  const [sentences, setSentences] = useState({
    rmc: true,
    gga: true,
    gll: true,
    vtg: true,
  });
  const [rateHz, setRateHz] = useState(1);
  const [isStreaming, setIsStreaming] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logs, setLogs] = useState([]);
  const [copied, setCopied] = useState(false);
  const [baudRate, setBaudRate] = useState(4800);
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialError, setSerialError] = useState(null);

  const serialPortRef = useRef(null);
  const serialWriterRef = useRef(null);
  const terminalBoxRef = useRef(null);

  const activeRx = receivers.find((r) => r.label === selectedReceiver) || receivers[0];
  const activeFix = receiverFixes[selectedReceiver] || (activeRx ? receiverFixes[activeRx.label] : null);

  const lat = activeFix?.lat ?? activeRx?.lat ?? 37.4563;
  const lng = activeFix?.lng ?? activeRx?.lng ?? 126.7052;
  const speedKnots = activeRx?.speedKts ?? activeRx?.speed ?? 12.4;
  const courseDeg = activeRx?.courseDeg ?? activeRx?.heading ?? 45.0;
  const hdop = activeFix?.hdop ?? 1.1;

  useEffect(() => {
    if (!isOpen || !isStreaming) return;
    const intervalMs = Math.round(1000 / rateHz);
    const timer = setInterval(() => {
      const now = new Date();
      const timeStr = now.toISOString().slice(11, 23);
      const generated = [];
      if (sentences.rmc) {
        generated.push(generateRmc({ lat, lng, speedKnots, courseDeg, talker, timestamp: now }));
      }
      if (sentences.gga) {
        generated.push(generateGga({ lat, lng, hdop, talker, timestamp: now, quality: talker === 'GP' ? 1 : 7 }));
      }
      if (sentences.gll) {
        generated.push(generateGll({ lat, lng, talker, timestamp: now }));
      }
      if (sentences.vtg) {
        generated.push(generateVtg({ courseDeg, speedKnots, talker }));
      }
      if (generated.length === 0) return;
      const newEntries = generated.map((sent) => ({
        id: `${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
        timeStr,
        text: sent.trimEnd(),
      }));
      setLogs((prev) => {
        const next = [...prev, ...newEntries];
        return next.length > MAX_BUFFER_LINES ? next.slice(-MAX_BUFFER_LINES) : next;
      });
      if (serialWriterRef.current) {
        const rawPayload = generated.join('');
        const encoder = new TextEncoder();
        serialWriterRef.current.write(encoder.encode(rawPayload)).catch((err) => {
          setSerialError(`Serial write error: ${err.message}`);
        });
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isOpen, isStreaming, rateHz, talker, sentences, lat, lng, speedKnots, courseDeg, hdop]);

  useEffect(() => {
    if (autoScroll && terminalBoxRef.current) {
      terminalBoxRef.current.scrollTop = terminalBoxRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleConnectSerial = useCallback(async () => {
    setSerialError(null);
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      setSerialError('Web Serial API is not supported in this browser. Use Chrome/Edge or export .nmea files.');
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: Number(baudRate) });
      const writer = port.writable.getWriter();
      serialPortRef.current = port;
      serialWriterRef.current = writer;
      setSerialConnected(true);
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        setSerialError(`Serial connection failed: ${err.message}`);
      }
    }
  }, [baudRate]);

  const handleDisconnectSerial = useCallback(async () => {
    try {
      if (serialWriterRef.current) {
        await serialWriterRef.current.close();
        serialWriterRef.current.releaseLock();
        serialWriterRef.current = null;
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close();
        serialPortRef.current = null;
      }
    } catch {
      // Ignored during cleanup
    } finally {
      setSerialConnected(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (serialWriterRef.current) {
        serialWriterRef.current.releaseLock?.();
      }
      if (serialPortRef.current) {
        serialPortRef.current.close?.().catch(() => {});
      }
    };
  }, []);

  const handleCopy = useCallback(() => {
    const text = logs.map((l) => l.text).join('\r\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [logs]);

  const handleDownload = useCallback(() => {
    const rawText = logs.map((l) => l.text).join('\r\n') + '\r\n';
    const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nowIso = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `simuloran-telemetry-${nowIso}.nmea`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [logs]);

  const handleClear = useCallback(() => {
    setLogs([]);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in duration-150">
      <div
        className="rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden border"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Header Bar */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b shrink-0"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border"
              style={{
                background: 'var(--accent-eloran-subtle)',
                color: 'var(--accent-eloran)',
                borderColor: 'var(--accent-eloran-border)',
              }}
            >
              <Terminal size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-mono font-bold text-sm sm:text-base tracking-wide" style={{ color: 'var(--text-primary)' }}>
                  NMEA 0183 Telemetry Streamer
                </h2>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border"
                  style={{
                    background: isStreaming ? 'var(--status-ok-subtle)' : 'var(--status-warn-subtle)',
                    color: isStreaming ? 'var(--status-ok)' : 'var(--status-warn)',
                    borderColor: isStreaming ? 'var(--status-ok-border)' : 'var(--status-warn-border)',
                  }}
                >
                  {isStreaming ? 'Streaming Live' : 'Paused'}
                </span>
              </div>
              <p className="text-[11px] font-mono text-[var(--text-muted)]">
                Standard marine ASCII telemetry for OpenCPN, MaxSea, and chartplotters
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/learn#fusion"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded border border-[var(--accent-eloran-border)] bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] hover:opacity-80 transition cursor-pointer"
            >
              <span>Theory &rarr;</span>
              <ExternalLink size={11} />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition cursor-pointer"
              title="Close NMEA terminal dialog"
              aria-label="Close NMEA terminal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Configuration Bar */}
        <div
          className="p-4 border-b flex flex-wrap items-center justify-between gap-3 text-xs font-mono"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-secondary)] font-medium">Talker:</span>
              <div className="inline-flex rounded-lg border border-[var(--border-subtle)] p-0.5 bg-[var(--bg-subtle)]">
                {[
                  { id: 'EC', label: 'EC (eLoran)' },
                  { id: 'LC', label: 'LC (Loran-C)' },
                  { id: 'GP', label: 'GP (GPS)' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTalker(t.id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      talker === t.id
                        ? 'bg-[var(--accent-eloran)] text-[var(--btn-eloran-text)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    title={`Select NMEA talker ID: ${t.label}`}
                    aria-label={`Talker ${t.label}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-secondary)] font-medium">Rate:</span>
              <div className="inline-flex rounded-lg border border-[var(--border-subtle)] p-0.5 bg-[var(--bg-subtle)]">
                {[1, 2, 5].map((hz) => (
                  <button
                    key={hz}
                    onClick={() => setRateHz(hz)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      rateHz === hz
                        ? 'bg-[var(--accent-eloran)] text-[var(--btn-eloran-text)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    title={`Set NMEA sentence broadcast rate to ${hz} Hz`}
                    aria-label={`${hz} Hz`}
                  >
                    {hz} Hz
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 border-l border-[var(--border-subtle)] pl-3">
              {['rmc', 'gga', 'gll', 'vtg'].map((k) => (
                <label key={k} className="flex items-center gap-1 text-[11px] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sentences[k]}
                    onChange={(e) => setSentences({ ...sentences, [k]: e.target.checked })}
                    className="accent-[var(--accent-eloran)] rounded"
                  />
                  <span className="uppercase text-[var(--text-primary)] font-bold">{k}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              disabled={serialConnected}
              className="px-2 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-mono"
            >
              {BAUD_RATES.map((b) => (
                <option key={b} value={b}>
                  {b} baud
                </option>
              ))}
            </select>

            {serialConnected ? (
              <button
                onClick={handleDisconnectSerial}
                className="px-2.5 py-1 rounded-md font-mono text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer bg-[var(--status-danger-subtle)] text-[var(--status-danger)] border border-[var(--status-danger-border)] hover:opacity-90"
                title="Disconnect physical COM/USB serial port"
                aria-label="Disconnect Serial"
              >
                <WifiOff size={13} />
                <span>Disconnect Serial</span>
              </button>
            ) : (
              <button
                onClick={handleConnectSerial}
                className="px-2.5 py-1 rounded-md font-mono text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--accent-eloran-border)] hover:text-[var(--accent-eloran)]"
                title="Connect physical COM port via Web Serial API"
              >
                <Wifi size={13} />
                <span>Connect Web Serial</span>
              </button>
            )}
          </div>
        </div>

        {serialError && (
          <div className="px-4 py-2 bg-[var(--status-danger-subtle)] border-b border-[var(--status-danger-border)] text-[var(--status-danger)] text-xs font-mono flex items-center justify-between">
            <span>{serialError}</span>
            <button onClick={() => setSerialError(null)} className="underline ml-2 cursor-pointer" title="Dismiss serial connection error" aria-label="Dismiss error">
              Dismiss
            </button>
          </div>
        )}

        {/* Terminal Screen */}
        <div className="relative flex-1 p-4 bg-[#05080e] overflow-hidden flex flex-col min-h-[300px]">
          <div className="flex items-center justify-between pb-2 text-[10px] font-mono text-[#64748b] border-b border-[#1e293b] mb-2 select-none">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]/80 inline-block" />
              <span className="ml-2 text-[#94a3b8]">ttyS0 / NMEA-0183 / 8-N-1</span>
            </div>
            <div className="flex items-center gap-3">
              <span>Fix: {activeRx?.label || 'R1'} ({lat.toFixed(4)}°, {lng.toFixed(4)}°)</span>
              <span>Lines: {logs.length}</span>
            </div>
          </div>

          <div
            ref={terminalBoxRef}
            className="flex-1 overflow-y-auto space-y-1 font-mono text-[11px] leading-relaxed text-[#34d399] pr-1 selection:bg-[#064e3b] selection:text-[#a7f3d0]"
          >
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[#64748b] italic py-12">
                Waiting for kinematic updates to stream NMEA sentences...
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 hover:bg-[#0f172a]/60 px-1 rounded transition-colors">
                  <span className="text-[#64748b] select-none shrink-0">[{log.timeStr}]</span>
                  <span className="break-all font-semibold tracking-wide text-[#a7f3d0]">{log.text}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className="p-3 border-t flex flex-wrap items-center justify-between gap-3 text-xs font-mono"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsStreaming(!isStreaming)}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                isStreaming
                  ? 'bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-[var(--status-warn-border)] hover:opacity-90'
                  : 'bg-[var(--accent-eloran)] text-[var(--btn-eloran-text)] hover:opacity-90'
              }`}
              title={isStreaming ? "Pause telemetry logging stream" : "Resume live telemetry stream"}
              aria-label={isStreaming ? "Pause stream" : "Resume stream"}
            >
              {isStreaming ? <Pause size={13} /> : <Play size={13} />}
              <span>{isStreaming ? 'Pause' : 'Resume'}</span>
            </button>

            <button
              onClick={handleClear}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] flex items-center gap-1.5 transition cursor-pointer"
              title="Clear terminal history"
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>

            <label className="flex items-center gap-1.5 text-[var(--text-secondary)] ml-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="accent-[var(--accent-eloran)] rounded"
              />
              <span>Auto-scroll</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={logs.length === 0}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Copy active NMEA sentences buffer to clipboard"
              aria-label="Copy Buffer"
            >
              {copied ? <Check size={13} className="text-[var(--status-ok)]" /> : <Copy size={13} />}
              <span>{copied ? 'Copied!' : 'Copy Buffer'}</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={logs.length === 0}
              className="px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer bg-[var(--accent-eloran)] text-[var(--btn-eloran-text)] hover:opacity-90 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
              title="Download recorded NMEA logs as a .nmea file"
              aria-label="Export .nmea"
            >
              <Download size={13} />
              <span>Export .nmea</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}