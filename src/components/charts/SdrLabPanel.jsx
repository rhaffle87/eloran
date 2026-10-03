import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Radio,
  Play,
  Pause,
  RotateCcw,
  Upload,
  Cpu,
  Zap,
  Activity,
  Maximize2,
  Volume2,
} from 'lucide-react';
import {
  parseRawIQ,
  parseWavAudio,
  generateSyntheticSdrCapture,
} from '../../lib/sdrPlayback.js';
import {
  designBandpassFir,
  applyFirFilter,
  generatePulseTemplate,
  matchedFilterCorrelation,
  detectSzc,
  computeFftSpectrum,
} from '../../workers/sdrWorker.js';

export default function SdrLabPanel() {
  // Capture & Ingestion state
  const [sourceMode, setSourceMode] = useState('synthetic'); // 'synthetic' | 'file'
  const [selectedPreset, setSelectedPreset] = useState('korea_nominal');
  const [sampleRate, setSampleRate] = useState(1000000); // 1 MSPS
  const [firFilterEnabled, setFirFilterEnabled] = useState(true);
  const [matchedFilterEnabled, setMatchedFilterEnabled] = useState(true);
  const [snrDb, setSnrDb] = useState(15);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [fileName, setFileName] = useState('synthetic_eloran_1msps.iq');
  const [fileStats, setFileStats] = useState({ sampleCount: 3000, durationMs: 3.0 });
  const [waterfallOrientation, setWaterfallOrientation] = useState('horizontal'); // 'horizontal' (Time ->) | 'vertical' (Time v)

  // Telemetry state
  const [telemetry, setTelemetry] = useState({
    peakSnrDb: 18.2,
    szcTimeUs: 30.0,
    szcIndex: 30,
    peakCorr: 0.96,
    carrierFreqKHz: 100.0,
    processTimeMs: 1.2,
  });

  // Raw buffers in memory
  const iBufferRef = useRef(new Float32Array(0));
  const qBufferRef = useRef(new Float32Array(0));
  const playheadRef = useRef(0);
  const animFrameRef = useRef(null);

  // Canvases
  const scopeCanvasRef = useRef(null);
  const waterfallCanvasRef = useRef(null);
  const corrCanvasRef = useRef(null);

  // Waterfall history memory (256 bins wide x 120 lines tall)
  const waterfallHistoryRef = useRef([]);

  // Generate synthetic preset data
  const loadPreset = useCallback((presetKey, snrVal = snrDb) => {
    let pulses = 8;
    let durMs = 3.5;
    let name = 'korea_flight_corridor.iq';

    if (presetKey === 'korea_nominal') {
      pulses = 8;
      name = 'incheon_flight_8pulse.iq';
    } else if (presetKey === 'dover_master') {
      pulses = 9;
      name = 'dover_tss_master_9pulse.iq';
    } else if (presetKey === 'deep_sea_noise') {
      pulses = 8;
      durMs = 4.0;
      name = 'north_sea_barrage_noise.iq';
    }

    const capture = generateSyntheticSdrCapture({
      sampleRate,
      durationMs: durMs,
      numPulses: pulses,
      snrDb: snrVal,
    });

    iBufferRef.current = capture.iSamples;
    qBufferRef.current = capture.qSamples;
    playheadRef.current = 0;
    setFileName(name);
    setFileStats({ sampleCount: capture.iSamples.length, durationMs: durMs });
  }, [sampleRate, snrDb]);

  // Initial load
  useEffect(() => {
    loadPreset(selectedPreset);
  }, [loadPreset, selectedPreset]);

  // File upload handler
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const arrayBuf = evt.target.result;
        const lowerName = file.name.toLowerCase();

        if (lowerName.endsWith('.wav')) {
          const wav = parseWavAudio(arrayBuf);
          iBufferRef.current = wav.iSamples;
          qBufferRef.current = wav.qSamples || new Float32Array(wav.iSamples.length);
          setSampleRate(wav.sampleRate);
          setFileName(file.name);
          setFileStats({
            sampleCount: wav.sampleCount,
            durationMs: parseFloat(((wav.sampleCount / wav.sampleRate) * 1000).toFixed(1)),
          });
        } else {
          // Assume raw I/Q (uint8 or int16)
          const format = lowerName.endsWith('.raw') || lowerName.endsWith('.int16') ? 'int16' : 'uint8';
          const iq = parseRawIQ(arrayBuf, format);
          iBufferRef.current = iq.iSamples;
          qBufferRef.current = iq.qSamples;
          setFileName(file.name);
          setFileStats({
            sampleCount: iq.sampleCount,
            durationMs: parseFloat(((iq.sampleCount / sampleRate) * 1000).toFixed(1)),
          });
        }
        setSourceMode('file');
        playheadRef.current = 0;
      } catch (err) {
        alert('Failed to parse SDR file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Process a chunk and draw frame
  const processAndRenderFrame = useCallback(() => {
    const totalSamples = iBufferRef.current.length;
    if (totalSamples < 64) return;

    const t0 = performance.now();
    const frameSize = Math.min(1024, totalSamples);

    // Get current window
    let start = playheadRef.current;
    if (start + frameSize > totalSamples) {
      start = 0;
      playheadRef.current = 0;
    }

    const chunkI = iBufferRef.current.slice(start, start + frameSize);
    const chunkQ = qBufferRef.current.slice(start, start + frameSize);

    // 1. FIR Bandpass
    let iFilt = chunkI;
    let qFilt = chunkQ;
    if (firFilterEnabled) {
      const taps = designBandpassFir(31, 100000, 20000, sampleRate);
      iFilt = applyFirFilter(chunkI, taps);
      qFilt = applyFirFilter(chunkQ, taps);
    }

    // 2. Envelope
    const env = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
      env[i] = Math.sqrt(iFilt[i] * iFilt[i] + qFilt[i] * qFilt[i]);
    }

    // 3. SZC Lock
    const szc = detectSzc(iFilt, env, sampleRate);

    // 4. Matched Filter Correlation
    let corr = new Float32Array(0);
    let peakCorr = 0;
    if (matchedFilterEnabled) {
      const template = generatePulseTemplate(sampleRate, 65, 65);
      corr = matchedFilterCorrelation(iFilt, template, 1);
      for (let k = 0; k < corr.length; k++) {
        if (corr[k] > peakCorr) peakCorr = corr[k];
      }
    }

    // 5. FFT
    const fftRes = computeFftSpectrum(iFilt, 256, sampleRate);

    const t1 = performance.now();
    setTelemetry({
      peakSnrDb: parseFloat((snrDb + (peakCorr * 5)).toFixed(1)),
      szcTimeUs: szc.szcTimeUs > 0 ? szc.szcTimeUs : 30.0,
      szcIndex: szc.szcIndex,
      peakCorr: parseFloat(peakCorr.toFixed(3)),
      carrierFreqKHz: 100.0,
      processTimeMs: parseFloat((t1 - t0).toFixed(2)),
    });

    // -----------------------------------------------------------------------
    // Canvas 1: Time Domain Oscilloscope (Carrier, Envelope & SZC Marker)
    // -----------------------------------------------------------------------
    const scopeCv = scopeCanvasRef.current;
    if (scopeCv) {
      const ctx = scopeCv.getContext('2d');
      const w = scopeCv.width;
      const h = scopeCv.height;
      ctx.clearRect(0, 0, w, h);

      // Grid background
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      const xDivs = 8;
      const yDivs = 4;
      for (let x = 0; x <= xDivs; x++) {
        ctx.beginPath();
        ctx.moveTo((x * w) / xDivs, 0);
        ctx.lineTo((x * w) / xDivs, h);
        ctx.stroke();
      }
      for (let y = 0; y <= yDivs; y++) {
        ctx.beginPath();
        ctx.moveTo(0, (y * h) / yDivs);
        ctx.lineTo(w, (y * h) / yDivs);
        ctx.stroke();
      }

      // Center reference zero-line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Draw I(t) Carrier in Cyan
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < frameSize; i++) {
        const x = (i / (frameSize - 1)) * w;
        const y = h / 2 - (iFilt[i] * (h * 0.42));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw A(t) Envelope in Bright Amber
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      for (let i = 0; i < frameSize; i++) {
        const x = (i / (frameSize - 1)) * w;
        const y = h / 2 - (env[i] * (h * 0.42));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw SZC crosshair marker if valid
      if (szc.szcIndex >= 0 && szc.szcIndex < frameSize) {
        const szcX = (szc.szcIndex / (frameSize - 1)) * w;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(szcX, 0);
        ctx.lineTo(szcX, h);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.fillStyle = '#ef4444';
        ctx.font = '10px monospace';
        ctx.fillText(`SZC (30µs)`, Math.min(w - 70, szcX + 4), 16);
      }
    }

    // -----------------------------------------------------------------------
    // Canvas 2: Matched Filter Correlation Trace
    // -----------------------------------------------------------------------
    const corrCv = corrCanvasRef.current;
    if (corrCv && corr.length > 0) {
      const ctx = corrCv.getContext('2d');
      const w = corrCv.width;
      const h = corrCv.height;
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeRect(0, 0, w, h);

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k < corr.length; k++) {
        const x = (k / (corr.length - 1)) * w;
        const normY = Math.max(0, Math.min(1, corr[k]));
        const y = h - (normY * (h * 0.88) + 4);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Threshold guideline
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(0, h * 0.35);
      ctx.lineTo(w, h * 0.35);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // -----------------------------------------------------------------------
    // Canvas 3: Scrolling FFT Spectral Waterfall / Spectrogram
    // -----------------------------------------------------------------------
    const wfCv = waterfallCanvasRef.current;
    if (wfCv && fftRes.powerDb.length > 0) {
      const ctx = wfCv.getContext('2d');
      const w = wfCv.width;
      const h = wfCv.height;

      const isHorizontal = waterfallOrientation === 'horizontal';
      const history = waterfallHistoryRef.current;
      history.unshift(new Float32Array(fftRes.powerDb));
      const maxHistory = isHorizontal ? w : h;
      if (history.length > maxHistory) history.pop();

      const imgData = ctx.createImageData(w, h);
      const data = imgData.data;

      // Colormap helper: Tactical Heatmap (Deep Navy -> Cyan -> Green -> Yellow -> Red)
      const getColor = (db) => {
        const tNorm = Math.max(0, Math.min(1, (db + 70) / 60));
        let r = 0, g = 0, b = 0;
        if (tNorm < 0.25) {
          const f = tNorm / 0.25;
          b = Math.floor(60 + f * 140);
        } else if (tNorm < 0.5) {
          const f = (tNorm - 0.25) / 0.25;
          g = Math.floor(f * 200);
          b = Math.floor(200 - f * 50);
        } else if (tNorm < 0.75) {
          const f = (tNorm - 0.5) / 0.25;
          r = Math.floor(f * 220);
          g = Math.floor(200 + f * 55);
          b = Math.floor(50 - f * 50);
        } else {
          const f = (tNorm - 0.75) / 0.25;
          r = 255;
          g = Math.floor(255 * (1 - f * 0.7));
          b = 0;
        }
        return [r, g, b];
      };

      if (isHorizontal) {
        // HORIZONTAL SPECTROGRAM:
        // X-axis: Time (scrolls leftward: right edge col = w - 1 is t = 0s [newest], left edge col = 0 is oldest history)
        // Y-axis: Frequency (bottom row = h - 1 is 0 kHz [DC], top row = 0 is Nyquist limit e.g. 500 kHz)
        for (let col = 0; col < w; col++) {
          const historyIdx = (w - 1) - col;
          const line = historyIdx < history.length ? history[historyIdx] : null;
          const lineLen = line ? line.length : fftRes.powerDb.length;

          for (let row = 0; row < h; row++) {
            // Frequency mapping: 0 at row=h-1 (DC), maxFreq at row=0 (Nyquist)
            const normFreq = (h - 1 - row) / (h - 1);
            const binIdx = Math.min(lineLen - 1, Math.floor(normFreq * lineLen));
            const db = line ? (line[binIdx] ?? -80) : -76 + Math.sin(row * 0.15 + col * 0.08) * 2 - Math.random() * 4;

            const [r, g, b] = getColor(db);
            const pixelIdx = (row * w + col) * 4;
            data[pixelIdx] = r;
            data[pixelIdx + 1] = g;
            data[pixelIdx + 2] = b;
            data[pixelIdx + 3] = 255;
          }
        }
      } else {
        // VERTICAL WATERFALL:
        // X-axis: Frequency (left = 0 kHz, right = Nyquist)
        // Y-axis: Time (top row = 0 is t = 0s [newest], bottom row = h - 1 is oldest history)
        for (let row = 0; row < h; row++) {
          const line = row < history.length ? history[row] : null;
          const lineLen = line ? line.length : fftRes.powerDb.length;

          for (let col = 0; col < w; col++) {
            const binIdx = Math.floor((col / w) * lineLen);
            const db = line ? (line[binIdx] ?? -80) : -76 + Math.sin(row * 0.15 + col * 0.08) * 2 - Math.random() * 4;

            const [r, g, b] = getColor(db);
            const pixelIdx = (row * w + col) * 4;
            data[pixelIdx] = r;
            data[pixelIdx + 1] = g;
            data[pixelIdx + 2] = b;
            data[pixelIdx + 3] = 255;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // Overlays and HUD Markings
      const maxFreq = sampleRate / 2;

      if (isHorizontal) {
        // Horizontal band for 90–110 kHz eLoran passband
        // Top row = maxFreq, bottom row = 0
        const y90 = (1 - (90000 / maxFreq)) * h;
        const y110 = (1 - (110000 / maxFreq)) * h;
        const y100 = (1 - (100000 / maxFreq)) * h;

        ctx.fillStyle = 'rgba(6, 182, 212, 0.14)';
        ctx.fillRect(0, y110, w, y90 - y110);

        ctx.strokeStyle = 'rgba(6, 182, 212, 0.75)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y100);
        ctx.lineTo(w, y100);
        ctx.stroke();
        ctx.setLineDash([]);

        // Frequency axis labels on the canvas
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(6, 182, 212, 0.9)';
        ctx.fillText('100 kHz eLoran Carrier (90–110 kHz Passband Rail)', 8, Math.max(16, y100 - 4));

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillText(`${maxFreq / 1000} kHz (Nyquist)`, 8, 14);
        ctx.fillText('0 kHz (DC)', 8, h - 8);

        // Time axis labels along bottom right
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillText('t ≈ -3.5s (Past)', w - 180, h - 8);
        ctx.fillText('▶ t = 0s (Live)', w - 90, h - 8);
      } else {
        // Vertical Waterfall overlays
        const x90 = ((90000 / maxFreq) * w);
        const x110 = ((110000 / maxFreq) * w);
        const x100 = ((100000 / maxFreq) * w);

        ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
        ctx.fillRect(x90, 0, x110 - x90, h);

        ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x100, 0);
        ctx.lineTo(x100, h);
        ctx.stroke();

        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText('t = 0s (now)', 8, 14);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fillText('t ≈ -3.5s', 8, h - 8);
      }
    }

        // Advance playhead
    if (isPlaying) {
      const stepSamples = Math.round(128 * playbackSpeed);
      playheadRef.current = (playheadRef.current + stepSamples) % totalSamples;
    }
  }, [firFilterEnabled, matchedFilterEnabled, isPlaying, playbackSpeed, sampleRate, snrDb, waterfallOrientation]);

  // Main animation loop
  useEffect(() => {
    let active = true;
    const loop = () => {
      if (!active) return;
      processAndRenderFrame();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [processAndRenderFrame]);

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Top Controls & Ingestion Bar */}
      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[var(--accent-eloran)]" />
            <span className="font-bold text-[var(--text-primary)] text-sm tracking-wide uppercase">
              SDR Baseband Ingestion &amp; Live Spectrogram
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition">
              <Upload className="w-3.5 h-3.5" />
              <span>Load I/Q or WAV</span>
              <input
                type="file"
                accept=".iq,.bin,.dat,.raw,.wav"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setSourceMode('synthetic');
                loadPreset(selectedPreset);
              }}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition"
            >
              Reset to Synthetic
            </button>
          </div>
        </div>

        {/* Source Presets & Sample Rate */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-[var(--border-subtle)]">
          <div>
            <label className="text-[10px] text-[var(--text-dim)] uppercase block mb-1">Capture Presets</label>
            <select
              value={selectedPreset}
              onChange={(e) => {
                setSelectedPreset(e.target.value);
                setSourceMode('synthetic');
                loadPreset(e.target.value);
              }}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] cursor-pointer"
            >
              <option value="korea_nominal">Korea Incheon Testbed (8-Pulse)</option>
              <option value="dover_master">Dover TSS English Channel (Master 9-Pulse)</option>
              <option value="deep_sea_noise">North Sea Low SNR (-5 dB)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-[var(--text-dim)] uppercase block mb-1">Sample Rate</label>
            <select
              value={sampleRate}
              onChange={(e) => setSampleRate(Number(e.target.value))}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] cursor-pointer"
            >
              <option value="250000">250 kSPS (Nyquist 125 kHz)</option>
              <option value="500000">500 kSPS (Nyquist 250 kHz)</option>
              <option value="1000000">1.0 MSPS (Standard eLoran)</option>
              <option value="2000000">2.0 MSPS (High-Fidelity)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-[var(--text-dim)] uppercase block mb-1">
              Synthetic SNR: <span className="text-[var(--accent-eloran)] font-bold">{snrDb} dB</span>
            </label>
            <input
              type="range"
              min="-10"
              max="30"
              step="1"
              value={snrDb}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSnrDb(val);
                if (sourceMode === 'synthetic') loadPreset(selectedPreset, val);
              }}
              className="w-full cursor-pointer accent-[var(--accent-eloran)]"
            />
          </div>

          <div>
            <label className="text-[10px] text-[var(--text-dim)] uppercase block mb-1">DSP Pipeline Filters</label>
            <div className="flex items-center gap-2 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={firFilterEnabled}
                  onChange={(e) => setFirFilterEnabled(e.target.checked)}
                  className="rounded border-[var(--border-subtle)] text-[var(--accent-eloran)]"
                />
                <span>FIR 90–110 kHz</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={matchedFilterEnabled}
                  onChange={(e) => setMatchedFilterEnabled(e.target.checked)}
                  className="rounded border-[var(--border-subtle)] text-[var(--accent-eloran)]"
                />
                <span>Matched Filter</span>
              </label>
            </div>
          </div>
        </div>

        {/* Playback Transport & Telemetry HUD */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent-eloran)] text-[var(--btn-eloran-text)] font-bold flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playheadRef.current = 0;
              }}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              title="Rewind to start"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-1 pl-2">
              {[0.5, 1.0, 2.0].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-2 py-0.5 rounded text-[10px] border ${
                    playbackSpeed === spd
                      ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold'
                      : 'border-[var(--border-subtle)] text-[var(--text-dim)]'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <div>
              <span className="text-[var(--text-dim)]">File: </span>
              <span className="font-bold text-[var(--text-primary)]">{fileName}</span>
              <span className="text-[10px] text-[var(--text-dim)] ml-1">
                ({fileStats.sampleCount} pts, {fileStats.durationMs} ms)
              </span>
            </div>
            <div>
              <span className="text-[var(--text-dim)]">SZC Lock: </span>
              <span className="font-bold text-[var(--status-ok)]">
                {telemetry.szcTimeUs.toFixed(1)} µs ({telemetry.szcIndex} idx)
              </span>
            </div>
            <div>
              <span className="text-[var(--text-dim)]">Matched Correlation: </span>
              <span className="font-bold text-[var(--accent-eloran)]">{telemetry.peakCorr}</span>
            </div>
            <div>
              <span className="text-[var(--text-dim)]">DSP Latency: </span>
              <span className="font-bold text-[var(--text-secondary)]">{telemetry.processTimeMs} ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: Time-Domain Oscilloscope & Correlation Peak */}
        <div className="space-y-4">
          <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[var(--text-secondary)] text-[11px] flex items-center gap-1.5 uppercase">
                <Activity className="w-3.5 h-3.5 text-[#06b6d4]" />
                <span>Time-Domain Oscilloscope (I-Carrier &amp; Envelope)</span>
              </span>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="flex items-center gap-1 text-[#06b6d4]">
                  <span className="w-2 h-2 rounded-full bg-[#06b6d4]" /> I(t) Carrier
                </span>
                <span className="flex items-center gap-1 text-[#f59e0b]">
                  <span className="w-2 h-2 rounded-full bg-[#f59e0b]" /> Envelope A(t)
                </span>
              </div>
            </div>
            <div className="relative rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[#030712]">
              <canvas ref={scopeCanvasRef} width={640} height={240} className="w-full h-48 block" />
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[var(--text-secondary)] text-[11px] flex items-center gap-1.5 uppercase">
                <Zap className="w-3.5 h-3.5 text-[#10b981]" />
                <span>USCG Matched Filter Cross-Correlation Peak Trace</span>
              </span>
              <span className="text-[10px] text-[var(--text-dim)]">
                Template: USCG Standard τ = 65 µs
              </span>
            </div>
            <div className="relative rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[#030712]">
              <canvas ref={corrCanvasRef} width={640} height={120} className="w-full h-24 block" />
            </div>
          </div>
        </div>

        {/* Right Column: Live Scrolling Spectral Waterfall / Spectrogram */}
        <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="font-bold text-[var(--text-secondary)] text-[11px] flex items-center gap-1.5 uppercase">
                <Cpu className="w-3.5 h-3.5 text-[var(--accent-eloran)]" />
                <span>
                  {waterfallOrientation === 'horizontal'
                    ? `Live Horizontal Spectrogram (0 to ${sampleRate / 2000} kHz)`
                    : `Live FFT Spectral Waterfall (0 to ${sampleRate / 2000} kHz)`}
                </span>
              </span>

              <div className="flex items-center gap-2">
                {/* Orientation Selector: Horizontal (Time ->) vs Vertical (Time v) */}
                <div className="flex items-center bg-[var(--bg-main)] p-0.5 rounded border border-[var(--border-subtle)] text-[10px]">
                  <button
                    type="button"
                    onClick={() => setWaterfallOrientation('horizontal')}
                    className={`px-2 py-0.5 rounded font-mono transition-colors ${
                      waterfallOrientation === 'horizontal'
                        ? 'bg-[var(--accent-eloran)] text-black font-bold'
                        : 'text-[var(--text-dim)] hover:text-white'
                    }`}
                    title="Horizontal: Time scrolls horizontally, Frequency is vertical"
                  >
                    ↔ Horizontal
                  </button>
                  <button
                    type="button"
                    onClick={() => setWaterfallOrientation('vertical')}
                    className={`px-2 py-0.5 rounded font-mono transition-colors ${
                      waterfallOrientation === 'vertical'
                        ? 'bg-[var(--accent-eloran)] text-black font-bold'
                        : 'text-[var(--text-dim)] hover:text-white'
                    }`}
                    title="Vertical: Frequency is horizontal, Time cascades downward"
                  >
                    ↕ Vertical
                  </button>
                </div>

                {/* Colormap Legend */}
                <div className="hidden sm:flex items-center gap-1 text-[9px] text-[var(--text-dim)]" title="Spectral power color scale: -70 dB to -10 dB">
                  <span>-70dB</span>
                  <div
                    className="w-12 h-2 rounded-sm"
                    style={{
                      background: 'linear-gradient(to right, #001030, #06b6d4, #10b981, #f59e0b, #ef4444)',
                    }}
                  />
                  <span>-10dB</span>
                </div>
              </div>
            </div>

            <div className="relative rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[#030712]">
              <canvas ref={waterfallCanvasRef} width={640} height={360} className="w-full h-76 block" />
            </div>
          </div>

          {/* Footer Axis Description */}
          <div className="flex items-center justify-between text-[10px] text-[var(--text-dim)] pt-2 border-t border-[var(--border-subtle)]">
            {waterfallOrientation === 'horizontal' ? (
              <>
                <span>← t ≈ -3.5s (Past History)</span>
                <span className="text-[#06b6d4] font-bold">100 kHz Center Bandpass (90–110 kHz Rail)</span>
                <span>Real-Time Live (t = 0s) ▶</span>
              </>
            ) : (
              <>
                <span>0 kHz (DC)</span>
                <span className="text-[#06b6d4] font-bold">100 kHz (Carrier Center)</span>
                <span>{sampleRate / 2000} kHz (Nyquist Limit)</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
