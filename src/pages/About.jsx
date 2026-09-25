import React from 'react';
import { Cpu, ShieldCheck, Heart, Radio, ExternalLink, BookOpen } from 'lucide-react';

const TECH_STACK = [
  'React 19', 'Vite 7', 'React Router v7', 'Tailwind CSS v4',
  'Zustand', 'MapLibre GL', 'Proj4', 'Turf.js', 'PapaParse', 'Vitest', 'Web Workers',
];

const ARCHITECTURE_CARDS = [
  {
    title: '1. Well-Conditioned Gauss-Newton Solver',
    body: 'Discovered and fixed a critical bug in the legacy solver where Jacobians scaled in seconds (1/c) caused matrix determinants of order 10⁻³⁴ to prematurely trigger the 10⁻¹² singularity abort on iteration 0. Refactored into metre range-difference space, ensuring rapid 4-iteration convergence.',
  },
  {
    title: '2. Sandboxed AST Expression Parser',
    body: 'Replaced unsafe new Function and eval statements with a strict whitelist Recursive Descent Parser and null-prototype token dispatch. Completely immune to code injection.',
  },
  {
    title: '3. Decoupled Pure Physics Library',
    body: 'Separated all mathematical and geodesy logic into pure, testable modules in src/lib/, validated by a 16-test Vitest suite covering geodesics, TDOA symmetry, GDOP on known geometries, and RDP decimation.',
  },
  {
    title: '4. 100 kHz Modulated Carrier Oscilloscope',
    body: 'Upgraded the RF waveform viewer from a static envelope display to a high-resolution 100 kHz carrier synthesizer with GRI grid overlays, per-station delay flags, and ionospheric skywave multi-path modelling.',
  },
];

const DOCS = [
  { label: 'REFERENCES.md', description: 'Full survey of primary specs, books, theses & formula sheet.', href: 'https://github.com/rhaffle87/eloran/blob/main/docs/REFERENCES.md' },
  { label: 'DATA_NOTES.md', description: 'Global transmitter operational history (US, Europe, China).', href: 'https://github.com/rhaffle87/eloran/blob/main/docs/DATA_NOTES.md' },
  { label: 'TILES.md',      description: 'Centralized basemap setup, offline canvas & terms of use.',  href: 'https://github.com/rhaffle87/eloran/blob/main/docs/TILES.md'       },
];

function SectionCard({ children, className = '' }) {
  return (
    <div
      className={`rounded-2xl p-6 ${className}`}
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)' }}
    >
      {children}
    </div>
  );
}

function SectionHeading({ icon: Icon, iconColor, children }) {
  return (
    <h2 className="text-base font-bold font-mono flex items-center gap-2 mb-3" style={{ color: 'var(--text-primary)' }}>
      <Icon size={16} style={{ color: iconColor }} aria-hidden="true" /> {children}
    </h2>
  );
}

export default function About() {
  return (
    <div
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {/* Page Header */}
      <header>
        <div
          className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider mb-1"
          style={{ color: 'var(--accent-eloran)' }}
        >
          <Cpu size={14} aria-hidden="true" /> System Specifications
        </div>
        <h1 className="text-3xl font-bold font-mono tracking-tight" style={{ color: 'var(--text-primary)' }}>
          About LORAN LAB
        </h1>
        <p className="text-sm mt-2 max-w-2xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          A dedicated, high-performance, in-browser simulator for 100 kHz Loran-C and enhanced
          Loran (eLoran) hyperbolic radio navigation systems.
        </p>
      </header>

      {/* Origin & Attribution */}
      <SectionCard>
        <SectionHeading icon={Heart} iconColor="var(--status-danger)">Origin & Attribution</SectionHeading>
        <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>
          LORAN LAB was extracted, refactored, and modularized from the radio-navigation subsystems of{' '}
          <strong style={{ color: 'var(--accent-eloran)' }}>ACTIFE</strong>{' '}
          (Artificial Computing Toolkit for Intelligent Feature Experiments),
          originally created by <strong style={{ color: 'var(--text-primary)' }}>Rafli Alif</strong> (
          <a
            href="https://github.com/rhaffle87/ai_ml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1"
            style={{ color: 'var(--accent-eloran)' }}
          >
            rhaffle87/ai_ml <ExternalLink size={11} />
          </a>).
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          While ACTIFE spanned diverse AI/ML disciplines (TensorFlow, MediaPipe, image compression,
          linear regression), LORAN LAB isolates the navigation and RF physics into a production-grade,
          zero-dependency, standalone application with strict unit test coverage and mathematical precision.
        </p>
      </SectionCard>

      {/* Architectural Improvements */}
      <SectionCard>
        <SectionHeading icon={ShieldCheck} iconColor="var(--status-ok)">Architectural Improvements & Bug Fixes</SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {ARCHITECTURE_CARDS.map((card) => (
            <div
              key={card.title}
              className="p-4 rounded-xl space-y-1.5"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="font-bold font-mono" style={{ color: 'var(--accent-eloran)' }}>{card.title}</div>
              <p className="leading-relaxed" style={{ color: 'var(--text-muted)' }}>{card.body}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Literature & Documentation */}
      <SectionCard>
        <SectionHeading icon={BookOpen} iconColor="var(--accent-eloran)">Literature, Standards & Documentation</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          {DOCS.map((doc) => (
            <a
              key={doc.label}
              href={doc.href}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-xl flex flex-col justify-between group transition"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-eloran-border)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
            >
              <div>
                <div className="font-bold group-hover:underline" style={{ color: 'var(--accent-eloran)' }}>{doc.label}</div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--text-dim)' }}>{doc.description}</div>
              </div>
              <div className="text-[10px] mt-2 flex items-center gap-1" style={{ color: 'var(--text-dim)' }}>
                View on GitHub <ExternalLink size={10} />
              </div>
            </a>
          ))}
        </div>
      </SectionCard>

      {/* Tech Stack */}
      <SectionCard>
        <h2 className="text-base font-bold font-mono mb-3" style={{ color: 'var(--text-primary)' }}>
          Technology Stack (Free & Open Source Only)
        </h2>
        <div className="flex flex-wrap gap-2 pt-1 font-mono text-xs">
          {TECH_STACK.map((tech) => (
            <span
              key={tech}
              className="px-2.5 py-1 rounded-md"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              {tech}
            </span>
          ))}
        </div>
        <p className="text-[11px] pt-2" style={{ color: 'var(--text-dim)' }}>
          Static deployment ready. No external APIs, paid subscriptions, or serverless functions required.
        </p>
      </SectionCard>
    </div>
  );
}
