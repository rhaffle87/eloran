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
  Radio,
  HelpCircle,
  Activity,
} from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import {
  generateRmc,
  generateGga,
  generateGll,
  generateVtg,
} from '../../lib/nmea.js';
import {
  STREAM_PROTOCOLS,
  CONNECTION_STATUS,
  createNetworkStreamer,
  formatSignalKDelta,
} from '../../lib/networkStream.js';

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

  // Web Serial API State
  const [baudRate, setBaudRate] = useState(4800);
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialError, setSerialError] = useState(null);

  // Local Network WebSocket & Signal K Streaming Bridge State
  const [networkProtocol, setNetworkProtocol] = useState(STREAM_PROTOCOLS.NMEA0183);
  const [endpointUrl, setEndpointUrl] = useState('ws://localhost:10110');
  const [networkStatus, setNetworkStatus] = useState(CONNECTION_STATUS.DISCONNECTED);
  const [networkStats, setNetworkStats] = useState({
    bytesSent: 0,
    messagesSent: 0,
    nmeaSent: 0,
    signalkSent: 0,
    lastError: null,
  });

  const serialPortRef = useRef(null);
  const serialWriterRef = useRef(null);
  const terminalBoxRef = useRef(null);
  const streamerRef = useRef(null);

  const activeRx = receivers.find((r) => r.label === selectedReceiver) || receivers[0];
  const activeFix = receiverFixes[selectedReceiver] || (activeRx ? receiverFixes[activeRx.label] : null);

  const lat = activeFix?.lat ?? activeRx?.lat ?? 37.4563;
  const lng = activeFix?.lng ?? activeRx?.lng ?? 126.7052;
  const speedKnots = activeRx?.speedKts ?? activeRx?.speed ?? 12.4;
  const courseDeg = activeRx?.courseDeg ?? activeRx?.heading ?? 45.0;
  const hdop = activeFix?.hdop ?? 1.1;

  // Initialize network streamer
  useEffect(() => {
    const streamer = createNetworkStreamer(
      {
        endpointUrl,
        protocol: networkProtocol,
      },
      (newStatus, stats) => {
        setNetworkStatus(newStatus);
        setNetworkStats(stats);
      }
    );
    streamerRef.current = streamer;

    return () => {
      streamer.disconnect();
      streamerRef.current = null;
    };
  }, [endpointUrl, networkProtocol]);

  // Main transmission timer
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

      const navData = {
        lat,
        lng,
        speedKnots,
        courseDeg,
        hdop,
        talker,
        timestamp: now,
      };

      const newEntries = generated.map((sent) => ({
        id: `${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
        timeStr,
        text: sent.trimEnd(),
      }));

      // If Signal K protocol is selected, append a readable delta log entry
      if (networkProtocol === STREAM_PROTOCOLS.SIGNAL_K) {
        formatSignalKDelta(navData);
        newEntries.push({
          id: `sk-${now.getTime()}`,
          timeStr,
          text: `[Signal K Delta] pos: ${lat.toFixed(4)}°,${lng.toFixed(4)}° | SOG: ${(speedKnots * 0.5144).toFixed(1)} m/s | HDOP: ${hdop.toFixed(2)}`,
        });
      }

      setLogs((prev) => {
        const next = [...prev, ...newEntries];
        return next.length > MAX_BUFFER_LINES ? next.slice(-MAX_BUFFER_LINES) : next;
      });

      const rawPayload = generated.join('');

      // 1. Dispatch over local network WebSocket & BroadcastChannel
      if (streamerRef.current) {
        streamerRef.current.send({ nmea: rawPayload, navData });
        const s = streamerRef.current.getStats();
        setNetworkStats(s);
      }

      // 2. Dispatch over Web Serial COM port if connected
      if (serialWriterRef.current) {
        const encoder = new TextEncoder();
        serialWriterRef.current.write(encoder.encode(rawPayload)).catch((err) => {
          setSerialError(`Serial write error: ${err.message}`);
        });
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isOpen, isStreaming, rateHz, talker, sentences, lat, lng, speedKnots, courseDeg, hdop, networkProtocol]);

  useEffect(() => {
    if (autoScroll && terminalBoxRef.current) {
      terminalBoxRef.current.scrollTop = terminalBoxRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Web Serial Port Handlers
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

  // Network WebSocket Handlers
  const handleToggleNetwork = () => {
    if (!streamerRef.current) return;
    if (networkStatus === CONNECTION_STATUS.CONNECTED || networkStatus === CONNECTION_STATUS.CONNECTING) {
      streamerRef.current.disconnect();
    } else {
      streamerRef.current.connect();
    }
  };

  const handleClear = () => setLogs([]);

  const handleCopy = () => {
    if (logs.length === 0) return;
    const text = logs.map((l) => l.text).join('\r\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (logs.length === 0) return;
    const text = logs.map((l) => l.text).join('\r\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simuloran_telemetry_${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}.nmea`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const isNetConnected = networkStatus === CONNECTION_STATUS.CONNECTED;
  const isNetConnecting = networkStatus === CONNECTION_STATUS.CONNECTING;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="NMEA 0183 & Signal K Marine Bridge"
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-4 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-subtle)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="p-2 rounded-lg"
              style={{ background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)' }}
            >
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <span>NMEA 0183 & Signal K Streaming Bridge</span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-mono border"
                  style={{
                    background: 'var(--accent-eloran-subtle)',
                    color: 'var(--accent-eloran)',
                    borderColor: 'var(--accent-eloran-border)',
                  }}
                >
                  Marine IoT v1.5
                </span>
              </h2>
              <p className="text-xs text-[var(--text-dim)] font-mono">
                Real-time NMEA & Signal K Delta streaming over WebSocket (OpenCPN 10110), Web Serial, and BroadcastChannel
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-transparent text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-surface)] transition cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Network & Serial Bridge Controls Bar */}
        <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-2.5">
          {/* LAN WebSocket Streaming Bridge Row */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono">
            <div className="flex items-center gap-2 flex-1 min-w-[280px]">
              <span className="text-[var(--text-secondary)] font-semibold flex items-center gap-1.5">
                <Wifi size={14} className={isNetConnected ? 'text-[var(--status-ok)]' : 'text-[var(--text-dim)]'} />
                <span>LAN Bridge:</span>
              </span>

              <input
                type="text"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="ws://localhost:10110"
                className="flex-1 px-2.5 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-mono focus:outline-none focus:border-[var(--accent-eloran)]"
                title="Target WebSocket endpoint for OpenCPN, QtVlm, or Signal K server"
              />

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEndpointUrl('ws://localhost:10110')}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  title="Preset for OpenCPN / marine chartplotters (port 10110)"
                >
                  :10110
                </button>
                <button
                  type="button"
                  onClick={() => setEndpointUrl('ws://localhost:3000/signalk/v1/stream')}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  title="Preset for Signal K Node Server stream"
                >
                  Signal K
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={networkProtocol}
                onChange={(e) => setNetworkProtocol(e.target.value)}
                className="px-2 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-mono"
              >
                <option value={STREAM_PROTOCOLS.NMEA0183}>NMEA 0183 (ASCII)</option>
                <option value={STREAM_PROTOCOLS.SIGNAL_K}>Signal K (JSON Delta)</option>
                <option value={STREAM_PROTOCOLS.DUAL}>Dual (NMEA + Signal K)</option>
              </select>

              <button
                type="button"
                onClick={handleToggleNetwork}
                className={`px-3 py-1 rounded-md font-mono text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                  isNetConnected
                    ? 'bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border-[var(--status-ok-border)] hover:opacity-90'
                    : isNetConnecting
                    ? 'bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border-[var(--status-warn-border)] hover:opacity-90'
                    : 'bg-[var(--accent-eloran)] text-[var(--btn-eloran-text)] hover:opacity-90'
                }`}
              >
                <Activity size={13} className={isNetConnected || isNetConnecting ? 'animate-spin' : ''} />
                <span>
                  {isNetConnected ? 'Disconnect LAN' : isNetConnecting ? 'Connecting...' : 'Connect LAN'}
                </span>
              </button>
            </div>
          </div>

          {/* Telemetry Statistics & Web Serial Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs font-mono">
            <div className="flex items-center gap-3 text-[11px] text-[var(--text-dim)]">
              <span>Status: <strong className={isNetConnected ? 'text-[var(--status-ok)]' : 'text-[var(--text-dim)]'}>{networkStatus}</strong></span>
              <span>NMEA Pushed: <strong className="text-[var(--text-primary)]">{networkStats.nmeaSent}</strong></span>
              <span>Signal K Deltas: <strong className="text-[var(--text-primary)]">{networkStats.signalkSent}</strong></span>
              <span>Bytes: <strong className="text-[var(--text-primary)]">{(networkStats.bytesSent / 1024).toFixed(1)} KB</strong></span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                disabled={serialConnected}
                className="px-2 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-mono"
              >
                {BAUD_RATES.map((b) => (
                  <option key={b} value={b}>
                    {b} baud
                  </option>
                ))}
              </select>

              {serialConnected ? (
                <button
                  type="button"
                  onClick={handleDisconnectSerial}
                  className="px-2.5 py-0.5 rounded-md font-mono text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer bg-[var(--status-danger-subtle)] text-[var(--status-danger)] border border-[var(--status-danger-border)] hover:opacity-90"
                  title="Disconnect physical COM/USB serial port"
                >
                  <WifiOff size={12} />
                  <span>Disconnect Serial</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectSerial}
                  className="px-2.5 py-0.5 rounded-md font-mono text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--accent-eloran-border)] hover:text-[var(--accent-eloran)]"
                  title="Connect physical COM port via Web Serial API"
                >
                  <Wifi size={12} />
                  <span>Connect Web Serial</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Secondary Configuration Bar: Talker & Sentences */}
        <div
          className="p-3 border-b flex flex-wrap items-center justify-between gap-3 text-xs font-mono"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-subtle)' }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-secondary)] font-semibold">Talker:</span>
              <select
                value={talker}
                onChange={(e) => setTalker(e.target.value)}
                className="px-2 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-xs font-mono"
              >
                <option value="EC">EC (eLoran Receiver)</option>
                <option value="LC">LC (Legacy Loran-C)</option>
                <option value="GP">GP (GPS / GNSS)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-secondary)] font-semibold">Rate:</span>
              <select
                value={rateHz}
                onChange={(e) => setRateHz(Number(e.target.value))}
                className="px-2 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-xs font-mono"
              >
                <option value={1}>1 Hz</option>
                <option value={2}>2 Hz</option>
                <option value={5}>5 Hz</option>
                <option value={10}>10 Hz</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pl-2 border-l border-[var(--border-subtle)]">
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
        </div>

        {serialError && (
          <div className="px-4 py-2 bg-[var(--status-danger-subtle)] border-b border-[var(--status-danger-border)] text-[var(--status-danger)] text-xs font-mono flex items-center justify-between">
            <span>{serialError}</span>
            <button
              onClick={() => setSerialError(null)}
              className="underline ml-2 cursor-pointer"
              title="Dismiss serial connection error"
            >
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
              <span className="ml-2 text-[#94a3b8]">
                {networkProtocol === STREAM_PROTOCOLS.SIGNAL_K ? 'Signal K JSON Delta / WebSocket' : 'NMEA-0183 / 8-N-1 / BroadcastChannel'}
              </span>
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
                Waiting for kinematic updates to stream NMEA / Signal K sentences...
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

        {/* Collapsible Marine LAN Integration Guide */}
        <details className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] text-[var(--text-dim)] group cursor-pointer">
          <summary className="font-semibold text-[var(--text-secondary)] flex items-center justify-between outline-none select-none">
            <div className="flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-[var(--accent-eloran)]" />
              <span>How to connect OpenCPN, QtVlm, or AvNav to SIMULORAN</span>
            </div>
            <span className="text-[9px] text-[var(--text-dim)] group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] space-y-1.5 leading-relaxed text-[11px]">
            <p>
              1. <strong>OpenCPN:</strong> In <em>Options → Connections → Add Connection</em>, select <strong>Network</strong>, protocol <strong>TCP</strong> or <strong>WebSocket</strong>, address <strong>localhost</strong>, port <strong>10110</strong>.
            </p>
            <p>
              2. <strong>Signal K:</strong> In your Signal K Server data connections, add a provider with type <strong>WebSocket</strong> and point to your Simuloran bridge URL.
            </p>
            <p>
              3. <strong>BroadcastChannel:</strong> Open another browser tab or dashboard with BroadcastChannel listener for zero-latency local inter-process telemetry without any daemons.
            </p>
          </div>
        </details>

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
