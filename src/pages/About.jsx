import React from 'react';
import { Cpu, ShieldCheck, Github, Code, Heart, Radio, ExternalLink } from 'lucide-react';

export default function About() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10 font-sans">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-semibold uppercase tracking-wider mb-1">
          <Cpu size={14} /> System Specifications
        </div>
        <h1 className="text-3xl font-bold text-zinc-100 font-mono tracking-tight">
          About LORAN LAB
        </h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-2xl leading-relaxed">
          A dedicated, high-performance, in-browser simulator for 100 kHz Loran-C and enhanced Loran (eLoran)
          hyperbolic radio navigation systems.
        </p>
      </div>

      {/* Origin & Attribution */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-3">
        <h2 className="text-base font-bold text-zinc-100 font-mono flex items-center gap-2">
          <Heart size={16} className="text-red-400" /> Origin & Attribution
        </h2>
        <p className="text-xs text-zinc-300 leading-relaxed">
          LORAN LAB was extracted, refactored, and modularized from the radio-navigation subsystems of{' '}
          <strong className="text-cyan-300">ACTIFE</strong> (Artificial Computing Toolkit for Intelligent Feature Experiments),
          originally created by <strong className="text-zinc-100">Rafli Alif</strong> (
          <a
            href="https://github.com/rhaffle87/ai_ml"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 underline hover:text-cyan-300 inline-flex items-center gap-1"
          >
            rhaffle87/ai_ml <ExternalLink size={11} />
          </a>
          ).
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          While ACTIFE spanned diverse AI/ML disciplines (TensorFlow, MediaPipe, image compression, linear regression),
          LORAN LAB isolates the navigation and RF physics into a production-grade, zero-dependency, standalone application
          with strict unit test coverage and mathematical precision.
        </p>
      </div>

      {/* Technical Innovations & Bug Fixes */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-zinc-100 font-mono flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-400" /> Architectural Improvements & Bug Fixes
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 space-y-1.5">
            <div className="font-bold text-cyan-400 font-mono">1. Well-Conditioned Gauss-Newton Solver</div>
            <p className="text-zinc-400 leading-relaxed">
              Discovered and fixed a critical bug in the legacy solver where Jacobians scaled in seconds ($1/c$)
              caused matrix determinants of order $10^{-34}$ to prematurely trigger the $10^{-12}$ singularity abort on
              iteration 0. Refactored into meter range-difference space, ensuring rapid 4-iteration convergence.
            </p>
          </div>

          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 space-y-1.5">
            <div className="font-bold text-cyan-400 font-mono">2. Sandboxed AST Expression Parser</div>
            <p className="text-zinc-400 leading-relaxed">
              Replaced unsafe <code className="text-amber-300 font-mono">new Function</code> and <code className="text-amber-300 font-mono">eval</code> statements
              with a strict whitelist Recursive Descent Parser and null-prototype token dispatch. Completely immune to code injection.
            </p>
          </div>

          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 space-y-1.5">
            <div className="font-bold text-cyan-400 font-mono">3. Decoupled Pure Physics Library</div>
            <p className="text-zinc-400 leading-relaxed">
              Separated all mathematical and geodesy logic into pure, testable modules in <code className="text-cyan-300 font-mono">src/lib/</code>,
              validated by a 16-test Vitest suite covering geodesics, TDOA symmetry, GDOP on known geometries, and RDP decimation.
            </p>
          </div>

          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 space-y-1.5">
            <div className="font-bold text-cyan-400 font-mono">4. 100 kHz Modulated Carrier Oscilloscope</div>
            <p className="text-zinc-400 leading-relaxed">
              Upgraded the RF waveform viewer from a static envelope display to a high-resolution 100 kHz carrier
              synthesizer with GRI grid overlays, per-station delay flags, and ionospheric skywave multi-path modeling.
            </p>
          </div>
        </div>
      </div>

      {/* Primary Standards & Compendiums */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-zinc-100 font-mono flex items-center gap-2">
          <BookOpen size={16} className="text-cyan-400" /> Literature, Standards & Documentation
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          <a
            href="https://github.com/rhaffle87/eloran/blob/main/docs/REFERENCES.md"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-cyan-500/40 transition group flex flex-col justify-between"
          >
            <div>
              <div className="text-cyan-300 font-bold group-hover:text-cyan-200">REFERENCES.md</div>
              <div className="text-[11px] text-zinc-400 mt-1">Full survey of primary specs, books, theses & formula sheet.</div>
            </div>
            <div className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1">View on GitHub <ExternalLink size={10} /></div>
          </a>

          <a
            href="https://github.com/rhaffle87/eloran/blob/main/docs/DATA_NOTES.md"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-cyan-500/40 transition group flex flex-col justify-between"
          >
            <div>
              <div className="text-cyan-300 font-bold group-hover:text-cyan-200">DATA_NOTES.md</div>
              <div className="text-[11px] text-zinc-400 mt-1">Global transmitter operational history (US, Europe, China).</div>
            </div>
            <div className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1">View on GitHub <ExternalLink size={10} /></div>
          </a>

          <a
            href="https://github.com/rhaffle87/eloran/blob/main/docs/TILES.md"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-cyan-500/40 transition group flex flex-col justify-between"
          >
            <div>
              <div className="text-cyan-300 font-bold group-hover:text-cyan-200">TILES.md</div>
              <div className="text-[11px] text-zinc-400 mt-1">Centralized basemap setup, offline canvas & terms of use.</div>
            </div>
            <div className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1">View on GitHub <ExternalLink size={10} /></div>
          </a>
        </div>
      </div>

      {/* Tech Stack Summary */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-3 font-mono text-xs">
        <h2 className="text-base font-bold text-zinc-100 font-mono">Technology Stack (Free & Open Source Only)</h2>
        <div className="flex flex-wrap gap-2 pt-1">
          {['React 19', 'Vite 7', 'React Router v7', 'Tailwind CSS v4', 'Zustand', 'MapLibre GL', 'Proj4', 'Turf.js', 'PapaParse', 'Vitest', 'Web Workers'].map(
            (tech) => (
              <span
                key={tech}
                className="px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-300"
              >
                {tech}
              </span>
            )
          )}
        </div>
        <p className="text-zinc-500 text-[11px] pt-1">
          Static deployment ready. No external APIs, paid subscriptions, or serverless functions required.
        </p>
      </div>
    </div>
  );
}
