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
    </div>
  );
}
