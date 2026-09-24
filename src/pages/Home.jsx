import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Radio, Compass, Activity, BookOpen, Info, ShieldCheck, 
  ArrowRight, Waves, Globe, Cpu, AlertTriangle, CheckCircle2, Zap
} from 'lucide-react';
import { PRESET_SCENARIOS } from '../state/presets.js';
import { useSimulationStore } from '../state/simulationStore.js';

export default function Home() {
  const navigate = useNavigate();
  const { activePresetId, loadPreset } = useSimulationStore();

  const handleLaunchPreset = (presetId, destination = '/eloran') => {
    loadPreset(presetId);
    navigate(destination);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-950 text-zinc-200">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-zinc-800/80 bg-gradient-to-b from-zinc-900/50 via-zinc-950 to-zinc-950 py-16 sm:py-24">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#18181b15_1px,transparent_1px),linear-gradient(to_bottom,#18181b15_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono mb-6">
            <Zap size={14} className="animate-pulse" />
            TERRESTRIAL RADIO-NAVIGATION SIMULATION SUITE
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-zinc-100 font-mono">
            LORAN<span className="text-cyan-400"> LAB</span>
          </h1>

          <p className="mt-4 text-base sm:text-xl text-zinc-400 max-w-3xl mx-auto font-sans leading-relaxed">
            High-fidelity simulation environment for 100&nbsp;kHz Loran-C and modernized eLoran systems.
            Explore hyperbolic TDOA geometry, GDOP heatmaps, oscillator drift, Additional Secondary Factors (ASF),
            and GNSS-resilient positioning.
          </p>

          {/* Quick launch buttons */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/eloran"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-mono font-bold text-sm transition shadow-[0_0_20px_rgba(6,182,212,0.3)]"
            >
              <Compass size={18} />
              eLoran Simulator
              <ArrowRight size={16} />
            </Link>

            <Link
              to="/loran-c"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-mono font-semibold text-sm transition"
            >
              <Radio size={18} className="text-amber-400" />
              Loran-C LOPs & GDOP
            </Link>

            <Link
              to="/waveforms"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-mono font-semibold text-sm transition"
            >
              <Activity size={18} className="text-emerald-400" />
              100 kHz Oscilloscope
            </Link>
          </div>
        </div>
      </section>

      {/* Main Feature Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-6">
          Core Simulation Modules
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Loran-C Card */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 hover:border-cyan-500/40 transition group flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
                <Radio size={24} />
              </div>
              <h3 className="text-lg font-bold text-zinc-100 font-mono group-hover:text-amber-400 transition">
                Loran-C Baseline & GDOP
              </h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed font-sans">
                Master and secondary station chains. Visualize hyperbolic Lines of Position (LOPs),
                baseline extension singularities, real-time Gauss-Newton receiver fixes, and live 2D GDOP heatmaps.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-zinc-400 font-mono">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-amber-400" />
                  Hyperbolic TDOA marching-squares
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-amber-400" />
                  Full CSV station chain import & export
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-amber-400" />
                  Interactive draggable receiver & fix covariance
                </li>
              </ul>
            </div>
            <Link
              to="/loran-c"
              className="mt-6 inline-flex items-center gap-2 text-xs font-mono font-semibold text-amber-400 hover:text-amber-300 transition"
            >
              Open Loran-C <ArrowRight size={14} />
            </Link>
          </div>

          {/* eLoran Card */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 hover:border-cyan-500/40 transition group flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-cyan-500/10 text-cyan-400 text-[10px] font-mono uppercase px-2.5 py-1 border-b border-l border-cyan-500/20 rounded-bl-lg font-bold">
              Modern PNT
            </div>
            <div>
              <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4">
                <Compass size={24} />
              </div>
              <h3 className="text-lg font-bold text-zinc-100 font-mono group-hover:text-cyan-400 transition">
                eLoran & Multi-Sensor Fusion
              </h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed font-sans">
                Next-generation terrestrial PNT. Evaluate Rubidium, Cesium, and Quartz oscillator drift,
                Additional Secondary Factor (ASF) groundwave delays, Eurofix DDS messaging, and GNSS fallback fusion.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-zinc-400 font-mono">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-cyan-400" />
                  Atomic clock drift & bias modeling
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-cyan-400" />
                  Safe AST-evaluated spatial ASF formulas
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-cyan-400" />
                  GNSS-spoofed resilient navigation fusion
                </li>
              </ul>
            </div>
            <Link
              to="/eloran"
              className="mt-6 inline-flex items-center gap-2 text-xs font-mono font-semibold text-cyan-400 hover:text-cyan-300 transition"
            >
              Open eLoran Simulator <ArrowRight size={14} />
            </Link>
          </div>

          {/* Waveforms Card */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 hover:border-cyan-500/40 transition group flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
                <Activity size={24} />
              </div>
              <h3 className="text-lg font-bold text-zinc-100 font-mono group-hover:text-emerald-400 transition">
                100 kHz RF Waveform Lab
              </h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed font-sans">
                Interactive oscilloscope displaying Loran-C 100 kHz pulsed RF carriers, raised-cosine envelopes,
                Group Repetition Intervals (GRI), per-station arrival delays, and ionospheric skywave reflections.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-zinc-400 font-mono">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  Carrier & envelope visualization
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  Time-of-arrival delay offsets
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  Ionospheric skywave bounce simulation
                </li>
              </ul>
            </div>
            <Link
              to="/waveforms"
              className="mt-6 inline-flex items-center gap-2 text-xs font-mono font-semibold text-emerald-400 hover:text-emerald-300 transition"
            >
              Open Oscilloscope <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* Preset Scenarios Gallery */}
      <section className="border-t border-zinc-800/80 bg-zinc-900/30 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-xl font-bold font-mono text-zinc-100 flex items-center gap-2">
                <Globe size={20} className="text-cyan-400" />
                Scenario Presets
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Load calibrated operational chains directly into the interactive simulator.
              </p>
            </div>
            <div className="text-xs font-mono text-zinc-500">
              Active: <span className="text-cyan-400 font-semibold">{PRESET_SCENARIOS[activePresetId]?.name}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.values(PRESET_SCENARIOS).map((preset) => {
              const isCurrent = preset.id === activePresetId;
              return (
                <div
                  key={preset.id}
                  className={`bg-zinc-900 border rounded-lg p-5 flex flex-col justify-between transition ${
                    isCurrent
                      ? 'border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.15)] bg-cyan-950/20'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        {preset.masters.length}M + {preset.slaves.length}S
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-1">
                          <CheckCircle2 size={12} /> Loaded
                        </span>
                      )}
                    </div>
                    <h4 className="font-mono font-bold text-sm text-zinc-200">
                      {preset.name}
                    </h4>
                    <p className="text-xs text-zinc-400 mt-2 line-clamp-3">
                      {preset.description}
                    </p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-zinc-800/80 flex items-center gap-2">
                    <button
                      onClick={() => handleLaunchPreset(preset.id, '/eloran')}
                      className="flex-1 py-1.5 px-2 rounded bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-mono transition text-center"
                    >
                      eLoran
                    </button>
                    <button
                      onClick={() => handleLaunchPreset(preset.id, '/loran-c')}
                      className="flex-1 py-1.5 px-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition text-center"
                    >
                      Loran-C
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Physics & Theory Summary */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 border-t border-zinc-800/80">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-zinc-800 text-zinc-400 text-xs font-mono mb-3">
              <BookOpen size={14} className="text-cyan-400" />
              THEORETICAL FOUNDATIONS
            </div>
            <h2 className="text-2xl font-bold font-mono text-zinc-100">
              Why eLoran Matters in the Satellite Era
            </h2>
            <p className="mt-3 text-sm text-zinc-400 leading-relaxed font-sans">
              Global Navigation Satellite Systems (GNSS) operate on milliwatt-level microwave frequencies (~1.5 GHz)
              transmitted from 20,000 km altitude, making them vulnerable to intentional jamming, spoofing, and solar events.
            </p>
            <p className="mt-3 text-sm text-zinc-400 leading-relaxed font-sans">
              eLoran operates at <strong className="text-zinc-200">100 kHz (LF)</strong> with gigawatt-class pulse power
              propagating as terrestrial groundwaves. Its cross-rate interference resistance, completely disassociated
              frequency band, and sub-microsecond synchronization make it the world standard for Assured PNT backup.
            </p>
            <div className="mt-5">
              <Link
                to="/learn"
                className="inline-flex items-center gap-2 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition"
              >
                Explore interactive theory chapters <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 font-mono text-xs space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
              <span className="text-zinc-500 uppercase tracking-wider">Metric</span>
              <span className="text-zinc-500 uppercase tracking-wider">Specification</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Carrier Frequency</span>
              <span className="text-cyan-400 font-bold">100.00 kHz</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Propagation Velocity (c)</span>
              <span className="text-zinc-200 font-bold">299,792,458 m/s</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Pulse Envelope Function</span>
              <span className="text-emerald-400 font-bold">Raised Cosine (100 µs)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Atomic Frequency Stability</span>
              <span className="text-amber-400 font-bold">Cesium Beam: 1×10⁻¹³</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Telemetry Data Rate</span>
              <span className="text-zinc-200 font-bold">Eurofix 9th-pulse PPM</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-zinc-950 py-8 text-center text-xs font-mono text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            LORAN LAB &bull; Standalone Loran-C & eLoran Simulation Suite
          </div>
          <div>
            Extracted & refactored from <span className="text-zinc-400">ACTIFE</span>. Pure physics in Web Workers.
          </div>
        </div>
      </footer>
    </div>
  );
}
