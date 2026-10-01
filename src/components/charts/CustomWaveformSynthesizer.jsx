import React, { useState, useMemo, useRef } from 'react';
import { RotateCcw, Download, Upload, Zap } from 'lucide-react';
export default function CustomWaveformSynthesizer() {
  const fileInputRef = useRef(null);

  // Modular Synthesizer Parameters
  const [carrierKhz, setCarrierKhz] = useState(100);
  const [peakTimeUs, setPeakTimeUs] = useState(65);
  const [exponent, setExponent] = useState(2.0);
  const [pulseCount, setPulseCount] = useState(8);
  const [pulseSpacingUs, setPulseSpacingUs] = useState(1000);
  const [phaseCodes, setPhaseCodes] = useState([1, 1, 1, -1, 1, 1, -1, -1]); // 8 pulses default
  const [includeSkywave, setIncludeSkywave] = useState(false);
  const [skywaveDelayUs, setSkywaveDelayUs] = useState(35);
  const [skywaveAmpRatio, setSkywaveAmpRatio] = useState(0.4);

  // SVG dimensions
  const svgW = 900;
  const svgH = 260;
  const padL = 60;
  const padR = 30;
  const padT = 30;
  const padB = 40;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const midY = padT + plotH / 2;

  // Total synthesized window in microseconds
  const totalUs = useMemo(() => {
    return Math.max(300, (pulseCount - 1) * pulseSpacingUs + 250);
  }, [pulseCount, pulseSpacingUs]);

  // Handle phase code toggle for pulse i
  const togglePhaseCode = (idx) => {
    setPhaseCodes((prev) => {
      const next = [...prev];
      next[idx] = (next[idx] || 1) === 1 ? -1 : 1;
      return next;
    });
  };

  // Adjust pulse count and sync phase array
  const handlePulseCountChange = (cnt) => {
    const val = Math.max(1, Math.min(16, cnt));
    setPulseCount(val);
    setPhaseCodes((prev) => {
      const next = [...prev];
      while (next.length < val) next.push(1);
      return next.slice(0, val);
    });
  };

  // Synthesize custom RF points
  const points = useMemo(() => {
    const numSamples = 1200;
    const pts = [];
    const envPts = [];
    const dt = totalUs / numSamples;
    const fMhz = carrierKhz / 1000;
    const tau = Math.max(1, peakTimeUs);
    const normFactor = Math.exp(exponent) / Math.pow(tau, exponent);

    for (let i = 0; i <= numSamples; i++) {
      const t = i * dt;
      let totalRf = 0;
      let totalEnv = 0;

      for (let p = 0; p < pulseCount; p++) {
        const pulseStart = p * pulseSpacingUs;
        const localT = t - pulseStart;
        const code = phaseCodes[p] || 1;

        if (localT >= 0 && localT <= 250) {
          const env = normFactor * Math.pow(localT, exponent) * Math.exp((-exponent * localT) / tau);
          const carrier = Math.sin(2 * Math.PI * fMhz * localT) * code;
          totalRf += env * carrier;
          totalEnv += env;

          // Skywave multipath
          if (includeSkywave && localT >= skywaveDelayUs) {
            const skyLocalT = localT - skywaveDelayUs;
            const skyEnv = normFactor * Math.pow(skyLocalT, exponent) * Math.exp((-exponent * skyLocalT) / tau) * skywaveAmpRatio;
            const skyCarrier = Math.sin(2 * Math.PI * fMhz * skyLocalT) * code;
            totalRf += skyEnv * skyCarrier;
            totalEnv += skyEnv;
          }
        }
      }

      pts.push({ t, v: totalRf });
      envPts.push({ t, v: totalEnv });
    }

    return { pts, envPts };
  }, [totalUs, carrierKhz, peakTimeUs, exponent, pulseCount, pulseSpacingUs, phaseCodes, includeSkywave, skywaveDelayUs, skywaveAmpRatio]);

  // Construct SVG paths
  const maxAmp = 1.5;
  const rfPath = useMemo(() => {
    return points.pts
      .map((p, idx) => {
        const x = padL + (p.t / totalUs) * plotW;
        const y = midY - (p.v / maxAmp) * (plotH / 2);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points.pts, totalUs, plotW, midY, maxAmp, padL, plotH]);

  const envPath = useMemo(() => {
    return points.envPts
      .map((p, idx) => {
        const x = padL + (p.t / totalUs) * plotW;
        const y = midY - (p.v / maxAmp) * (plotH / 2);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points.envPts, totalUs, plotW, midY, maxAmp, padL, plotH]);

  // Reset to USCG 100 kHz Standard
  const handleResetDefaults = () => {
    setCarrierKhz(100);
    setPeakTimeUs(65);
    setExponent(2.0);
    setPulseCount(8);
    setPulseSpacingUs(1000);
    setPhaseCodes([1, 1, 1, -1, 1, 1, -1, -1]);
    setIncludeSkywave(false);
    setSkywaveDelayUs(35);
    setSkywaveAmpRatio(0.4);
  };

  // Export JSON specification
  const handleExportJson = () => {
    const spec = {
      name: 'Custom Synthesizer Waveform',
      version: '1.5.1',
      carrierKhz,
      peakTimeUs,
      exponent,
      pulseCount,
      pulseSpacingUs,
      phaseCodes,
      includeSkywave,
      skywaveDelayUs,
      skywaveAmpRatio,
    };
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simuloran-waveform-spec-${carrierKhz}khz.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON specification
  const handleImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const spec = JSON.parse(event.target?.result);
        if (typeof spec.carrierKhz === 'number') setCarrierKhz(spec.carrierKhz);
        if (typeof spec.peakTimeUs === 'number') setPeakTimeUs(spec.peakTimeUs);
        if (typeof spec.exponent === 'number') setExponent(spec.exponent);
        if (typeof spec.pulseCount === 'number') setPulseCount(spec.pulseCount);
        if (typeof spec.pulseSpacingUs === 'number') setPulseSpacingUs(spec.pulseSpacingUs);
        if (Array.isArray(spec.phaseCodes)) setPhaseCodes(spec.phaseCodes);
        if (typeof spec.includeSkywave === 'boolean') setIncludeSkywave(spec.includeSkywave);
        if (typeof spec.skywaveDelayUs === 'number') setSkywaveDelayUs(spec.skywaveDelayUs);
        if (typeof spec.skywaveAmpRatio === 'number') setSkywaveAmpRatio(spec.skywaveAmpRatio);
      } catch (err) {
        alert('Invalid waveform JSON spec: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div
      className="rounded-xl p-5 space-y-6 shadow-sm font-sans"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold"
              style={{
                background: 'var(--accent-eloran-subtle)',
                color: 'var(--accent-eloran)',
                border: '1px solid var(--accent-eloran-border)',
              }}
            >
              <Zap size={13} /> Modular RF Pulse Synthesizer
            </span>
            <span className="text-xs font-mono text-[var(--text-dim)]">
              {carrierKhz} kHz &bull; &tau; = {peakTimeUs} &mu;s
            </span>
          </div>
          <h2
            className="text-xl font-bold tracking-tight font-mono mt-1"
            style={{ color: 'var(--text-primary)' }}
          >
            Custom RF Waveform Generator
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 max-w-2xl">
            Configure custom carrier frequencies, pulse envelope curvature exponents, pulse group timing intervals,
            and phase coding sequences.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
          <button
            onClick={handleResetDefaults}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
            title="Reset to standard 100 kHz USCG Loran pulse"
          >
            <RotateCcw size={12} /> Standard 100 kHz
          </button>
          <button
            onClick={handleExportJson}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            title="Export waveform JSON specification"
          >
            <Download size={12} /> Export JSON
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            title="Import waveform JSON specification"
          >
            <Upload size={12} /> Import JSON
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportJson} className="hidden" />
          <a
            href="/learn#waveforms"
            className="inline-flex items-center gap-1 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-[var(--accent-eloran-border)] bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] hover:opacity-80 transition"
          >
            Theory &rarr;
          </a>
        </div>
      </div>

      {/* SVG Waveform Visualizer */}
      <div
        className="rounded-lg p-3 overflow-hidden shadow-inner"
        style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}
      >
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto select-none">
          {/* Grid lines */}
          <line x1={padL} y1={midY} x2={padL + plotW} y2={midY} stroke="var(--border-subtle)" strokeWidth="1.2" />
          <line x1={padL} y1={padT} x2={padL + plotW} y2={padT} stroke="var(--border-subtle)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
          <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="var(--border-subtle)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />

          {/* Time axis ticks */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
            const x = padL + frac * plotW;
            const tVal = (frac * totalUs).toFixed(0);
            return (
              <g key={frac}>
                <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="var(--border-subtle)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
                <text x={x} y={padT + plotH + 18} fill="var(--text-dim)" fontSize="10" fontFamily="monospace" textAnchor="middle">
                  {tVal} &mu;s
                </text>
              </g>
            );
          })}

          {/* Voltage ticks */}
          <text x={padL - 10} y={padT + 4} fill="var(--text-dim)" fontSize="10" fontFamily="monospace" textAnchor="end">+1.5V</text>
          <text x={padL - 10} y={midY + 4} fill="var(--text-dim)" fontSize="10" fontFamily="monospace" textAnchor="end">0.0V</text>
          <text x={padL - 10} y={padT + plotH + 4} fill="var(--text-dim)" fontSize="10" fontFamily="monospace" textAnchor="end">-1.5V</text>

          {/* Envelope path */}
          <path d={envPath} fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="4 2" opacity="0.85" />

          {/* RF Signal path */}
          <path d={rfPath} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Interactive Parameter Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
        {/* Carrier Frequency Slider */}
        <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-[var(--text-secondary)]">Carrier Frequency:</span>
            <span className="font-bold text-[var(--accent-eloran)]">{carrierKhz.toFixed(1)} kHz</span>
          </div>
          <input
            type="range"
            min={80}
            max={120}
            step={0.5}
            value={carrierKhz}
            onChange={(e) => setCarrierKhz(parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: 'var(--accent-eloran)', background: 'var(--bg-muted)' }}
          />
          <div className="flex justify-between text-[10px] text-[var(--text-dim)]">
            <span>80 kHz</span>
            <span>100 kHz (Std)</span>
            <span>120 kHz</span>
          </div>
        </div>

        {/* Envelope Peak Timing */}
        <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-[var(--text-secondary)]">Rise Time (&tau;):</span>
            <span className="font-bold text-[var(--accent-eloran)]">{peakTimeUs.toFixed(1)} &mu;s</span>
          </div>
          <input
            type="range"
            min={40}
            max={90}
            step={0.5}
            value={peakTimeUs}
            onChange={(e) => setPeakTimeUs(parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: 'var(--accent-eloran)', background: 'var(--bg-muted)' }}
          />
          <div className="flex justify-between text-[10px] text-[var(--text-dim)]">
            <span>40 &mu;s</span>
            <span>65 &mu;s (Std)</span>
            <span>90 &mu;s</span>
          </div>
        </div>

        {/* Exponent Curvature */}
        <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-[var(--text-secondary)]">Envelope Exponent (&alpha;):</span>
            <span className="font-bold text-[var(--accent-eloran)]">{exponent.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={1.0}
            max={4.0}
            step={0.1}
            value={exponent}
            onChange={(e) => setExponent(parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: 'var(--accent-eloran)', background: 'var(--bg-muted)' }}
          />
          <div className="flex justify-between text-[10px] text-[var(--text-dim)]">
            <span>1.0</span>
            <span>2.0 (Std t&sup2;)</span>
            <span>4.0</span>
          </div>
        </div>
      </div>

      {/* Pulse Group & Phase Coding Grid */}
      <div className="p-4 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-3 font-mono text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="font-bold text-[var(--text-primary)]">Pulse Group Sequence</span>
            <span className="text-[10px] text-[var(--text-dim)] block">Click any pulse badge to toggle its binary phase code (+1 / -1)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-secondary)]">Pulses:</span>
            <div className="flex gap-1">
              {[1, 4, 8, 9, 10, 16].map((cnt) => (
                <button
                  key={cnt}
                  onClick={() => handlePulseCountChange(cnt)}
                  className="px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer"
                  title={`Set pulse group count to ${cnt} pulses`}
                  aria-label={`Set pulse count ${cnt}`}
                  style={pulseCount === cnt
                    ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', borderColor: 'var(--accent-eloran-border)' }
                    : { background: 'var(--bg-canvas)', color: 'var(--text-dim)', borderColor: 'var(--border-subtle)' }}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Phase Code Bit Pills */}
        <div className="flex flex-wrap gap-2 pt-1">
          {Array.from({ length: pulseCount }).map((_, idx) => {
            const code = phaseCodes[idx] || 1;
            return (
              <button
                key={idx}
                onClick={() => togglePhaseCode(idx)}
                className="flex flex-col items-center justify-center w-10 h-12 rounded-lg border transition cursor-pointer hover:brightness-110"
                style={{
                  background: code === 1 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  borderColor: code === 1 ? 'var(--status-ok-border)' : 'var(--status-danger-border)',
                  color: code === 1 ? 'var(--status-ok)' : 'var(--status-danger)',
                }}
                title={`Pulse P${idx + 1}: Click to invert phase`}
              >
                <span className="text-[9px] text-[var(--text-dim)] font-mono">P{idx + 1}</span>
                <span className="text-sm font-bold">{code > 0 ? '+1' : '-1'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
