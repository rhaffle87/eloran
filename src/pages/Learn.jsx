import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass, Radio, Activity, Layers,
  ShieldCheck, TrendingDown, ArrowRight, BookOpen,
} from 'lucide-react';
import { useSimulationStore } from '../state/simulationStore.js';
import MathView from '../components/ui/MathView.jsx';

const concepts = [
  {
    id: 'tdoa',
    title: 'Time Difference of Arrival (TDOA) & Hyperbolas',
    icon: Radio,
    accentVar: '--accent-eloran',
    summary:
      'Loran does not measure absolute time-of-flight from transmitter to receiver. Instead, it measures the differential arrival time between synchronized master and secondary transmitters.',
    math: '\\text{TDOA} = t_{\\text{arr},S} - t_{\\text{arr},M} = \\frac{d_S - d_M}{c} + t_{\\text{coding}}',
    explanation:
      'For any fixed time difference, the locus of points having a constant distance difference from two fixed stations forms a hyperbola (Line of Position / LOP). The intersection of two or more LOPs uniquely fixes the receiver in two dimensions.',
    presetId: 'jakarta_baseline',
    targetRoute: '/loran-c',
    buttonLabel: 'Launch Baseline TDOA Demo',
  },
  {
    id: 'gdop',
    title: 'Geometric Dilution of Precision (GDOP)',
    icon: TrendingDown,
    accentVar: '--accent-loran-c',
    summary:
      'How transmitter geometry magnifies timing measurement errors into horizontal positioning uncertainty.',
    math: '\\text{GDOP} = \\sqrt{ \\operatorname{Tr}\\left( (H^T H)^{-1} \\right) }',
    explanation:
      'When transmitter stations are nearly collinear or subtend narrow angles relative to the receiver, hyperbolic lines of position intersect at grazing angles. A 10 ns timing jitter translates into hundreds of metres of horizontal position error. Wide angular baseline separation yields optimal geometry (GDOP < 2).',
    presetId: 'high_gdop',
    targetRoute: '/loran-c',
    buttonLabel: 'Inspect High-GDOP Scenario',
  },
  {
    id: 'asf',
    title: 'Additional Secondary Factor (ASF) & Propagation Delay',
    icon: Layers,
    accentVar: '--accent-loran-c',
    summary:
      'Phase delay accumulated as low-frequency groundwaves traverse landmasses of varying soil conductivity and elevation.',
    math: 't_{\\text{prop}} = \\frac{d}{c} + \\text{PF} + \\text{SF} + \\text{ASF}(\\varphi, \\lambda)',
    explanation:
      'Loran 100 kHz signals travel via groundwaves following Earth curvature. Over seawater (conductivity ~4 S/m), signals travel near the speed of light. Over dry land or granite (~0.001 S/m), signals slow down, creating spatial errors up to hundreds of metres. eLoran maps and cancels these errors using published ASF grids and real-time differential corrections.',
    presetId: 'north_sea',
    targetRoute: '/eloran',
    buttonLabel: 'Explore North Sea ASF Grid',
  },
  {
    id: 'gri',
    title: 'Group Repetition Interval (GRI) & 100 kHz Pulses',
    icon: Activity,
    accentVar: '--accent-eloran',
    summary:
      'Spectral confinement and periodic pulse timing structure designed to resist interference.',
    math: 'E(t) = 0.5\\left(1 + \\cos\\left(\\frac{\\pi t}{T_{\\text{pulse}}}\\right)\\right), \\quad f_0 = 100\\text{ kHz}',
    explanation:
      'Each station emits a group of 8 or 9 pulses with a fast rise time to allow sampling at the 3rd carrier cycle (30 µs), prior to the arrival of skywaves reflected off the ionosphere. The GRI uniquely identifies the transmitting chain and prevents multi-chain cross-rate interference.',
    presetId: 'jakarta_baseline',
    targetRoute: '/waveforms',
    buttonLabel: 'Open RF Oscilloscope',
  },
  {
    id: 'fusion',
    title: 'GNSS–eLoran Multi-Source PNT Resiliency',
    icon: ShieldCheck,
    accentVar: '--status-ok',
    summary:
      'Complementary integration between satellite GNSS and high-power terrestrial eLoran.',
    math: '\\mathbf{x}_{\\text{fused}} = w_{\\text{eLoran}} \\mathbf{x}_{\\text{eLoran}} + w_{\\text{GNSS}} \\mathbf{x}_{\\text{GNSS}}',
    explanation:
      'GNSS operates at microwave frequencies (1.2–1.5 GHz) with extremely faint satellite signals (−130 dBm), vulnerable to accidental jamming and intentional spoofing. eLoran operates at 100 kHz (LF) with megawatt transmitter towers emitting high-power terrestrial groundwaves that penetrate cities, fjords, and electronic jamming. Together they provide sovereign, uninterrupted positioning, navigation, and timing (PNT).',
    presetId: 'gnss_denied',
    targetRoute: '/eloran',
    buttonLabel: 'Test GNSS-Denied Outage',
  },
];

export default function Learn() {
  const navigate = useNavigate();
  const { loadPreset } = useSimulationStore();

  const handleLaunch = (presetId, route) => {
    loadPreset(presetId);
    navigate(route);
  };

  return (
    <div
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {/* Page Header */}
      <header>
        <div
          className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider mb-1"
          style={{ color: 'var(--accent-eloran)' }}
        >
          <BookOpen size={14} aria-hidden="true" /> Knowledge Base & Interactive Guides
        </div>
        <h1
          className="text-3xl md:text-4xl font-bold font-mono tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Loran-C & eLoran Theoretical Foundations
        </h1>
        <p className="text-sm mt-2 max-w-3xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Explore the physics of low-frequency radio navigation, hyperbolic multilateration,
          relativistic groundwave delays, and resilient multi-sensor fusion. Each guide includes a
          one-click launcher that configures the live simulator to demonstrate the concept.
        </p>
      </header>

      {/* Concept Cards */}
      <div className="space-y-6">
        {concepts.map((c) => {
          const Icon = c.icon;
          return (
            <article
              key={c.id}
              className="rounded-2xl p-6 space-y-4"
              style={{
                background: 'var(--bg-surface)',
                border: `1px solid var(${c.accentVar}-border, var(--border-subtle))`,
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2.5 rounded-xl"
                    style={{
                      background: `var(${c.accentVar}-subtle, var(--bg-subtle))`,
                      border: `1px solid var(${c.accentVar}-border, var(--border-subtle))`,
                    }}
                  >
                    <Icon size={22} style={{ color: `var(${c.accentVar})` }} aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold font-mono tracking-tight" style={{ color: 'var(--text-primary)' }}>
                      {c.title}
                    </h2>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{c.summary}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleLaunch(c.presetId, c.targetRoute)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-mono font-bold rounded-lg uppercase tracking-wider transition shrink-0"
                  style={{ background: `var(${c.accentVar})`, color: 'var(--bg-canvas)' }}
                >
                  {c.buttonLabel} <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>

              {/* Math Formula */}
              <div
                className="px-4 py-2.5 rounded-lg text-xs overflow-x-auto flex items-center gap-3"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
              >
                <span className="text-[10px] font-mono uppercase font-bold tracking-wider shrink-0" style={{ color: 'var(--text-dim)' }}>
                  Formula:
                </span>
                <MathView math={c.math} />
              </div>

              {/* Explanation */}
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
                {c.explanation}
              </p>
            </article>
          );
        })}
      </div>

      {/* Deep-Dive Theoretical Foundations Section */}
      <section className="space-y-6 pt-6 border-t border-[var(--border-subtle)]">
        <div>
          <div
            className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: 'var(--accent-eloran)' }}
          >
            <BookOpen size={14} aria-hidden="true" /> Technical Reference & Derivations
          </div>
          <h2
            className="text-2xl font-bold font-mono tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Groundwave Propagation & Atmospheric Delay Physics
          </h2>
          <p className="text-xs mt-1 max-w-3xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Mathematical formulations relocated from interactive simulation panels to maintain a clean, focused user interface while preserving full scientific rigor.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Sommerfeld Impedance */}
          <div
            className="rounded-xl p-5 border space-y-3 font-mono text-xs"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                1. Sommerfeld Numerical Distance & Surface Impedance
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)]">
                ITU-R P.368
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
              Groundwave propagation over flat, finite-conductivity terrain is governed by the complex surface impedance <span className="font-mono text-[var(--text-primary)]">η</span> and numerical distance <span className="font-mono text-[var(--text-primary)]">p</span>:
            </p>
            <div className="p-2.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] overflow-x-auto text-xs">
              <MathView math="p = \frac{\pi d}{\lambda} |\eta|^2, \quad \eta = \frac{1}{\sqrt{\epsilon_r - j \frac{\sigma}{\omega \epsilon_0}}}" />
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
              The attenuation function <span className="font-mono text-[var(--text-primary)]">F(p)</span> produces both field strength loss and phase retardation. For 100 kHz LF signals, groundwave field strength curves are sourced from ITU-R P.368-10 / GRWAVE, with phase delay computed via analytical Sommerfeld-Norton integrals.
            </p>
          </div>

          {/* Card 2: Millington Mixed-Path */}
          <div
            className="rounded-xl p-5 border space-y-3 font-mono text-xs"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                2. Millington's Reciprocal Mixed-Path Method
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] border border-[var(--accent-eloran-border)]">
                Boundary Crossing
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
              When a 100 kHz wave traverses multiple media (e.g. land followed by sea), forward-only calculation violates electromagnetic reciprocity. Millington's method computes the arithmetic mean of forward and reverse boundary evaluations:
            </p>
            <div className="p-2.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] overflow-x-auto text-xs">
              <MathView math="\text{ASF} = \frac{1}{2} \left[ \sum_{i=1}^n \Delta t_{\text{fwd}, i} + \sum_{i=1}^n \Delta t_{\text{rev}, i} \right]" />
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
              At coastlines, the wave experiences "phase recovery" over seawater due to higher conductivity (5.0 S/m vs 0.001–0.005 S/m for land). SIMULORAN performs geodesic ray-tracing against Natural Earth vector coastlines to evaluate these boundary crossings.
            </p>
          </div>

          {/* Card 3: Monotonic Delay & Terrain Conductivity */}
          <div
            className="rounded-xl p-5 border space-y-3 font-mono text-xs"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                3. Monotonic Delay & Terrain Conductivity Bounds
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)]">
                Physical Invariant
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
              Electromagnetic phase delay exhibits strict physical monotonicity across path length and soil resistivity:
            </p>
            <ul className="space-y-1.5 text-[11px] text-[var(--text-secondary)] font-sans list-disc list-inside">
              <li>
                <strong className="text-[var(--text-primary)]">All-Seawater Paths:</strong> With high conductivity (<span className="font-mono">σ = 5.0 S/m</span>), the wave propagates near the speed of light in air, resulting in <span className="font-mono text-[var(--accent-eloran)]">ASF ≈ 0.00 m</span>.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Resistive Land Paths:</strong> Over low-conductivity soil (<span className="font-mono">σ = 0.001–0.005 S/m</span>), cumulative delay accumulates monotonically: ~15 m at 100 km, ~45 m at 300 km, and ~75 m at 500 km.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Reciprocal Equality:</strong> Delay from Transmitter to Receiver identically matches delay from Receiver to Transmitter.
              </li>
            </ul>
          </div>

          {/* Card 4: Atmospheric Refractivity */}
          <div
            className="rounded-xl p-5 border space-y-3 font-mono text-xs"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                4. Atmospheric Refractivity & Seasonal Drift
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-[var(--status-warn-border)]">
                Smith & Weintraub 1953
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
              The radio refractive index <span className="font-mono text-[var(--text-primary)]">n</span> of tropospheric air alters the groundwave phase velocity <span className="font-mono text-[var(--text-primary)]">v = c / n</span> per the empirical formula of Smith & Weintraub (1953):
            </p>
            <div className="p-2.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] overflow-x-auto text-xs">
              <MathView math="N = (n - 1) \times 10^6 = 77.6 \frac{P}{T} + 3.73 \times 10^5 \frac{e}{T^2}" />
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
              Where <span className="font-mono text-[var(--text-primary)]">P</span> is atmospheric pressure (hPa), <span className="font-mono text-[var(--text-primary)]">T</span> is temperature (K), and <span className="font-mono text-[var(--text-primary)]">e</span> is water vapor partial pressure (hPa). Seasonal temperature and humidity swings induce sinusoidal phase variations (up to ~100 ns across 500 km), calibrated in literature against Korean eLoran trials (Song & Son 2025).
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
