import React from 'react';
import { Link } from 'react-router-dom';
import {
  Cpu, ShieldCheck, Heart, Radio, ExternalLink,
  BookOpen, Database, Compass, Activity, ArrowRight,
  Code2, CheckCircle2,
} from 'lucide-react';


const CAPABILITIES = [
  {
    title: 'Loran-C Hyperbolic Multilateration',
    icon: Radio,
    accent: 'var(--accent-loran-c)',
    accentBg: 'var(--accent-loran-c-subtle)',
    accentBorder: 'var(--accent-loran-c-border)',
    description:
      'Full-featured hyperbolic radionavigation supporting Master-Secondary pairs, Time Difference of Arrival (TDOA) tracking, baseline vectors, off-thread marching-squares LOP contour generation, and real-time GDOP coverage mapping.',
  },
  {
    title: 'eLoran Precision Suite (v1.5)',
    icon: Compass,
    accent: 'var(--accent-eloran)',
    accentBg: 'var(--accent-eloran-subtle)',
    accentBorder: 'var(--accent-eloran-border)',
    description:
      'Modern enhanced Loran incorporating Additional Secondary Factor (ASF) conductivity models, Cesium atomic clock steering, Differential Loran (d-Loran) reference stations, and multi-waypoint dynamic vehicle trajectories.',
  },
  {
    title: 'Multi-Source Resilient PNT & EW Suite',
    icon: ShieldCheck,
    accent: 'var(--status-ok)',
    accentBg: 'var(--status-ok-subtle)',
    accentBorder: 'var(--status-ok-border)',
    description:
      'Best Linear Unbiased Estimator (BLUE) Kalman filter fusing eLoran and GNSS measurements, Stanford Safety Containment Matrix for integrity monitoring, and realistic RF Electronic Warfare jammer path loss simulations.',
  },
  {
    title: '100 kHz RF Waveform Oscilloscope & Demodulation',
    icon: Activity,
    accent: 'var(--accent-eloran)',
    accentBg: 'var(--accent-eloran-subtle)',
    accentBorder: 'var(--accent-eloran-border)',
    description:
      'High-resolution carrier oscilloscope synthesizing USCG standard pulse envelopes, CheolJ (2020) Phase Code Interval (PCI) chain sequencing, ionospheric skywave multi-path discrimination, and Loran Data Channel (LDC) 9th-pulse demodulation.',
  },
];

const ARCHITECTURAL_HIGHLIGHTS = [
  {
    title: 'Well-Conditioned Range-Difference Solver',
    body: 'The hyperbolic multilateration engine is formulated in metric range-difference space rather than seconds space. This prevents matrix determinants from collapsing to order 10⁻³⁴ on iteration zero, guaranteeing rapid 4-iteration convergence and singularity protection under high GDOP.',
  },
  {
    title: 'Sandboxed AST Expression Engine',
    body: 'Custom spatial conductivity and terrain formulas are parsed into an Abstract Syntax Tree via a strict recursive descent parser. Evaluation uses a safe null-prototype token dispatch with zero dynamic code execution (0 eval(), 0 new Function()), ensuring total security.',
  },
  {
    title: 'Decoupled Pure Physics Core',
    body: 'All mathematical, geodesy, and electromagnetic propagation models are isolated in pure, framework-agnostic modules in src/lib/. The physics engine is verified by a 340-test automated Vitest suite covering geodesics, TDOA symmetry, GDOP, and decimation.',
  },
  {
    title: 'Off-Thread High-Performance Web Workers',
    body: 'Computationally demanding grid operations—such as marching-squares hyperbolic contour generation and spatial ASF interpolation—execute on dedicated Web Workers, ensuring the MapLibre GL canvas and user interface maintain a steady 60 FPS.',
  },
];

const TECH_STACK = [
  'React 19', 'Vite 7', 'React Router v7', 'Tailwind CSS v4',
  'Zustand', 'MapLibre GL', 'Proj4', 'Turf.js', 'PapaParse', 'Vitest', 'Web Workers',
];

const DOCS = [
  { label: 'VALIDATION.md', description: 'Empirical field trial benchmarks (Korea 2021 & Maoming 2025).', href: 'https://github.com/rhaffle87/simuloran/blob/main/docs/VALIDATION.md' },
  { label: 'PROVENANCE.md', description: 'Master citation provenance register & verification audit.', href: 'https://github.com/rhaffle87/simuloran/blob/main/docs/PROVENANCE.md' },
  { label: 'REFERENCES.md', description: 'Full survey of primary specs, books, theses & formula sheet.', href: 'https://github.com/rhaffle87/simuloran/blob/main/docs/REFERENCES.md' },
  { label: 'DATA_NOTES.md', description: 'Global transmitter operational history (US, Europe, China).', href: 'https://github.com/rhaffle87/simuloran/blob/main/docs/DATA_NOTES.md' },
  { label: 'TILES.md',      description: 'Centralized basemap setup, offline canvas & terms of use.',  href: 'https://github.com/rhaffle87/simuloran/blob/main/docs/TILES.md'       },
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
          <Cpu size={14} aria-hidden="true" /> Project Overview & System Specifications
        </div>
        <h1 className="text-3xl font-bold font-mono tracking-tight" style={{ color: 'var(--text-primary)' }}>
          About SIMULORAN
        </h1>
        <p className="text-sm mt-2 max-w-3xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          SIMULORAN is an open-source, high-fidelity radionavigation and RF physics testbed running
          entirely inside the browser. It simulates 100 kHz Loran-C and enhanced Loran (eLoran) systems,
          providing an accessible platform to explore resilient Positioning, Navigation, and Timing (PNT).
        </p>
      </header>

      {/* Purpose & Strategic Mission */}
      <SectionCard>
        <SectionHeading icon={Compass} iconColor="var(--accent-eloran)">Purpose & Strategic Mission</SectionHeading>
        <div className="space-y-3 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <p>
            Modern global transportation, cellular synchronization, financial transaction timestamps, and electrical
            power grids depend overwhelmingly on satellite Global Navigation Satellite Systems (GNSS: GPS, Galileo,
            BeiDou, GLONASS). Because satellite signals originate over 20,000 km in medium Earth orbit, their received
            signal power is exceptionally faint—often below -130 dBm, which is weaker than the cosmic thermal noise floor.
            This makes satellite PNT susceptible to intentional jamming, deceptive spoofing, space weather, and cyber disruption.
          </p>
          <p>
            <strong>eLoran (enhanced Loran)</strong> is the internationally recognized, sovereign terrestrial backup to GNSS.
            Operating at 100 kHz in the low-frequency (LF) spectrum, eLoran utilizes high-power megawatt transmitter towers
            emitting surface groundwaves that hug the curvature of the Earth. With a received signal strength exceeding satellite
            signals by +60 to +100 dB, eLoran signals reliably penetrate dense urban skylines, mountainous terrain, and heavily
            contested electronic warfare environments.
          </p>
          <p style={{ color: 'var(--text-muted)' }}>
            SIMULORAN was created to make the complex electromagnetics, geodesy, and signal processing of terrestrial
            radionavigation tangible, interactive, and verifiable for researchers, engineers, and students without requiring
            expensive RF hardware or field receivers.
          </p>
        </div>
      </SectionCard>

      {/* Subsystem Capabilities */}
      <SectionCard>
        <SectionHeading icon={Activity} iconColor="var(--accent-eloran)">Core Subsystem Capabilities</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
          {CAPABILITIES.map((cap) => {
            const CapIcon = cap.icon;
            return (
              <div
                key={cap.title}
                className="p-4 rounded-xl border flex flex-col justify-between space-y-2"
                style={{
                  background: 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center"
                      style={{
                        background: cap.accentBg,
                        color: cap.accent,
                        border: `1px solid ${cap.accentBorder}`,
                      }}
                    >
                      <CapIcon size={13} aria-hidden="true" />
                    </div>
                    <span className="font-mono font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                      {cap.title}
                    </span>
                  </div>
                  <p className="leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {cap.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Software Architecture & Engineering Highlights */}
      <SectionCard>
        <SectionHeading icon={ShieldCheck} iconColor="var(--status-ok)">
          Software Architecture & Engineering Highlights
        </SectionHeading>
        <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
          Engineered as a pure client-side application emphasizing mathematical correctness, sandboxed execution,
          and robust numerical stability.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {ARCHITECTURAL_HIGHLIGHTS.map((item) => (
            <div
              key={item.title}
              className="p-4 rounded-xl space-y-2"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="font-bold font-mono text-xs flex items-center gap-1.5" style={{ color: 'var(--accent-eloran)' }}>
                <CheckCircle2 size={13} aria-hidden="true" />
                {item.title}
              </div>
              <p className="leading-relaxed text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>

        {/* Callout to Theory Page for Equations & Mathematical Models */}
        <div
          className="mt-5 p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          style={{
            background: 'var(--accent-eloran-subtle)',
            borderColor: 'var(--accent-eloran-border)',
          }}
        >
          <div>
            <div className="font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--accent-eloran)' }}>
              <BookOpen size={14} aria-hidden="true" /> Dedicated Mathematical Foundations & Theory
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Looking for detailed mathematical proofs, Sommerfeld integrals, Millington boundary equations, and interactive algorithm demos?
            </p>
          </div>
          <Link
            to="/learn"
            className="px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer shadow-xs"
            style={{
              background: 'var(--accent-eloran)',
              color: 'var(--btn-eloran-text, #ffffff)',
            }}
          >
            Visit Theory Page <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </SectionCard>

      {/* Origin & Attribution */}
      <SectionCard>
        <SectionHeading icon={Heart} iconColor="var(--status-danger)">Origin & Attribution</SectionHeading>
        <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          SIMULORAN was conceived, architected, and engineered by{' '}
          <strong style={{ color: 'var(--text-primary)' }}>Rafli Alif</strong> (
          <a
            href="https://github.com/rhaffle87/ai_ml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold"
            style={{ color: 'var(--accent-eloran)' }}
          >
            rhaffle87/ai_ml <ExternalLink size={11} />
          </a>).
          The platform traces its architectural lineage to the early{' '}
          <strong style={{ color: 'var(--accent-eloran)' }}>ACTIFE</strong>{' '}
          (Artificial Computing Toolkit for Intelligent Feature Experiments) navigation research module and the{' '}
          <em>Cross-Disciplinary Perspective (CDP) / Resulmation "eLORAN Advanced Signal Diagnostics Console"</em>{' '}
          concept demonstrator.
        </p>
        <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>
          While ACTIFE originally encompassed broader machine learning and computer vision experiments,
          SIMULORAN isolates, refactors, and modularizes the LF radio-navigation physics into a dedicated,
          production-grade hyperbolic and pseudorange simulation engine with zero external runtime dependencies.
        </p>
        <div className="p-3 rounded-xl text-xs font-mono" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
          <div className="font-bold mb-1.5 text-[11px]" style={{ color: 'var(--text-primary)' }}>
            Open-Source Reference Implementations & Lineage:
          </div>
          <ul className="space-y-1.5 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            <li className="flex items-start gap-1.5">
              <span style={{ color: 'var(--accent-eloran)' }}>•</span>
              <span>
                <strong style={{ color: 'var(--text-secondary)' }}>CheolJ/Loran-c-reference-code:</strong> Python reference
                chain generator implementations for East Asia 9930, North Sea 7430, and East Sea 8390 chains, establishing
                ground-truth baseline PCI emission delay benchmarks, calibrated regional presets, and interactive PCI waveform synthesis in SIMULORAN.
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <span style={{ color: 'var(--accent-loran-c)' }}>•</span>
              <span>
                <strong style={{ color: 'var(--text-secondary)' }}>romavis/LoranC & loran_datatest:</strong> Open-source C/C++ SDR
                receiver architectures for Loran-C and Russian Chayka (GRI 8000), serving as reference models for RF matched filtering,
                envelope acquisition, and phase-lock loops.
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <span style={{ color: 'var(--status-ok)' }}>•</span>
              <span>
                <strong style={{ color: 'var(--text-secondary)' }}>NOAA NEFSC Coordinate Conversion:</strong> Classical
                conversion algorithms verifying Loran Time Difference hyperbolic fixes against geodetic WGS-84 ellipsoidal positions.
              </span>
            </li>
          </ul>
        </div>
      </SectionCard>

      {/* Empirical Field Trial Validation */}
      <SectionCard>
        <SectionHeading icon={Database} iconColor="var(--accent-eloran)">
          Empirical Field Trial Validation
        </SectionHeading>
        <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          To guard against circular self-validation, SIMULORAN is benchmarked against published real-world
          accuracy campaigns from the Korean Nationwide eLoran Testbed (Rhee et al., 2021) across 7 empirical receiver sites
          and the Maoming Inland Ellipsoidal Geodesic Experiment (Gao et al., 2025) without artificial parameter tuning.
        </p>

        <div
          className="p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono text-xs"
          style={{
            background: 'var(--bg-subtle)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="px-2 py-0.5 rounded text-[10px] font-bold"
                style={{
                  background: 'var(--status-ok-subtle)',
                  color: 'var(--status-ok)',
                  border: '1px solid var(--status-ok-border)',
                }}
              >
                Tier 2 SOURCED
              </span>
              <span className="font-bold text-[var(--text-primary)]">
                7 Test Locations &bull; 10.17 m Measured 95% Accuracy
              </span>
            </div>
            <p className="text-[11px] font-sans" style={{ color: 'var(--text-muted)' }}>
              Evaluates published field campaign statistics, per-station jitter matrices, and ellipsoidal geodesic gains.
            </p>
          </div>

          <Link
            to="/learn#empirical-benchmarks"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition hover:opacity-90 shrink-0 cursor-pointer"
            style={{
              background: 'var(--accent-eloran-subtle)',
              border: '1px solid var(--accent-eloran-border)',
              color: 'var(--accent-eloran)',
            }}
            title="Inspect full empirical benchmark tables, test site coordinates, and preset launchers in Theory"
          >
            Inspect Benchmark Data in Theory &rarr;
          </Link>
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

      {/* Tech Stack & Offline First */}
      <SectionCard>
        <div className="flex items-center gap-2 mb-3 font-mono font-bold text-base" style={{ color: 'var(--text-primary)' }}>
          <Code2 size={16} style={{ color: 'var(--accent-eloran)' }} aria-hidden="true" />
          Technology Stack & Privacy Guarantees
        </div>
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
        <p className="text-[11px] pt-3 leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          100% Free & Open Source. Zero telemetry, zero analytics tracking, and zero external server dependencies.
          All physics simulations, geodesic calculations, and signal syntheses execute entirely within your browser client.
        </p>
      </SectionCard>

      {/* Non-Operational Educational Disclaimer */}
      <div
        className="p-4 rounded-xl border text-xs font-mono leading-relaxed"
        style={{
          background: 'var(--banner-edu-bg, #fffbeb)',
          borderColor: 'var(--banner-edu-border, #fde68a)',
          color: 'var(--banner-edu-text, #92400e)',
        }}
      >
        <div className="font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5" style={{ color: 'var(--banner-edu-title, #78350f)' }}>
          <span>⚠ Educational Simulator Notice</span>
        </div>
        SIMULORAN is an academic simulation and educational tool for exploring radio-navigation principles. It is
        explicitly <strong>not certified</strong> for actual maritime navigation, aviation, or safety-of-life operations.
        Never use simulated coordinates or propagation delays for real-world vessel piloting.
      </div>
    </div>
  );
}
