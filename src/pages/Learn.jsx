import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass, Radio, Activity, Layers,
  ShieldCheck, TrendingDown, ArrowRight, BookOpen,
  Cpu, Database,
} from 'lucide-react';
import TrialValidationPanel from '../components/panels/TrialValidationPanel.jsx';
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
    math: '\\text{GDOP} = \\sqrt{ \\mathrm{Tr}\\left( (H^T H)^{-1} \\right) }',
    explanation:
      'When transmitter stations are nearly collinear or subtend narrow angles relative to the receiver, hyperbolic lines of position intersect at grazing angles. A 10 ns timing jitter translates into hundreds of metres of horizontal position error. Wide angular baseline separation yields optimal geometry (GDOP < 2).',
    presetId: 'high_gdop',
    targetRoute: '/loran-c',
    buttonLabel: 'Inspect High-GDOP Scenario',
  },
  {
    id: 'gauss-newton',
    title: 'Gauss-Newton Hyperbolic Solver & Metric Conditioning',
    icon: Compass,
    accentVar: '--accent-eloran',
    summary:
      'Iterative non-linear least-squares multilateration formulated in range-difference metre space for ill-conditioned singularity protection.',
    math: '\\Delta \\mathbf{x} = \\left( J^T J \\right)^{-1} J^T \\Delta \\mathbf{\\rho}, \\quad \\det(J^T J) > 10^{-12}',
    explanation:
      'Non-linear hyperbolic measurement equations are linearized via a 2D Jacobian matrix J relating positional corrections [Δx, Δy] to range-difference residuals Δρ. Formulating the normal equations in metric distance space rather than seconds space prevents matrix determinants from collapsing to order 10⁻³⁴, guaranteeing rapid 4-iteration convergence and numerical stability.',
    presetId: 'jakarta_baseline',
    targetRoute: '/loran-c',
    buttonLabel: 'Test Hyperbolic Solver',
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
    id: 'groundwave-decomposition',
    title: 'Groundwave Total Propagation Delay (PF, SF & ASF)',
    icon: Layers,
    accentVar: '--accent-eloran',
    summary:
      'Complete physical phase delay decomposition across atmospheric, seawater, and heterogeneous terrestrial media.',
    math: 't_{\\text{prop}} = \\frac{d}{c} + \\text{PF}(\\eta) + \\text{SF}(\\sigma) + \\text{ASF}(d, \\sigma)',
    explanation:
      'Total signal propagation time decomposes into three physical terms: Primary Factor (PF: atmospheric refractivity delay along the geodesic), Secondary Factor (SF: phase lag over an ideal all-seawater spherical earth with σ = 4.0 S/m), and Additional Secondary Factor (ASF: excess phase retardation accumulated over resistive land and terrain profiles calculated via Millington boundary integration).',
    presetId: 'north_sea',
    targetRoute: '/eloran',
    buttonLabel: 'Inspect Groundwave Delay Grids',
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
    id: 'uscg-pulse',
    title: '100 kHz Standard Pulse & USCG Envelope Specification',
    icon: Radio,
    accentVar: '--accent-eloran',
    summary:
      'USCG Specification COMDTINST M16562.4A definition of the standard Loran 100 kHz RF pulse waveform and mathematical envelope.',
    math: 'E(t) = A \\left( \\frac{t}{\\tau} \\right)^2 e^{-2(t - \\tau)/\\tau}, \\quad \\tau = 65\\,\\mu\\text{s}, \\quad f_0 = 100\\,\\text{kHz}',
    explanation:
      'Every Loran-C and eLoran pulse is transmitted on a carrier center frequency of 100 kHz with 99% of its spectral radiated energy strictly confined within the 90–110 kHz band. The standard pulse envelope exhibits an asymmetric exponential rise peaking at tau = 65 µs from virtual start, followed by an exponential tail decaying through 300 µs. This steep rise is engineered to maximize dE/dt at early cycles while complying with international CCIR Rec. 589 spectrum limits.',
    presetId: 'jakarta_baseline',
    targetRoute: '/waveforms',
    buttonLabel: 'Inspect 100 kHz Waveform in Oscilloscope',
  },
  {
    id: 'rf-carrier-modulation',
    title: '100 kHz Modulated Carrier Waveform & Phase Coherence',
    icon: Activity,
    accentVar: '--accent-eloran',
    summary:
      'Mathematical synthesis of the instantaneous 100 kHz RF carrier signal, phase-code state, and envelope.',
    math: 's(t) = A \\cdot t^2 e^{-2t/t_p} \\sin(2\\pi f_0 t + \\phi), \\quad f_0 = 100\\text{ kHz}',
    explanation:
      'The instantaneous radiated electric field is the product of the USCG asymmetric double-exponential envelope and a 100 kHz sinusoidal carrier. The phase parameter φ ∈ {0, π} rotates by 180° according to the 8-pulse phase-code sequence (e.g. Master Group A: + + - - + - + -), canceling continuous wave (CW) interference and cross-rate chain signals.',
    presetId: 'jakarta_baseline',
    targetRoute: '/waveforms',
    buttonLabel: 'Inspect Carrier Phase in Oscilloscope',
  },
  {
    id: 'skywave-discrimination',
    title: 'Groundwave Sampling & Skywave Multi-path Discrimination',
    icon: Activity,
    accentVar: '--status-ok',
    summary:
      'How Loran receivers eliminate ionospheric multi-path delay distortion by sampling the 3rd zero crossing before skywaves arrive.',
    math: 't_{\\text{sample}} = 3 \\cdot T_{\\text{carrier}} = 30\\,\\mu\\text{s} < t_{\\text{skywave}} = t_{\\text{ground}} + \\frac{\\Delta D_{\\text{extra}}}{c}',
    explanation:
      'Groundwaves propagate along the curvature of the Earth, while skywaves bounce off the ionospheric D-layer (daytime: 70–90 km) or E-layer (nighttime: 100–110 km). Due to the extra geometrical path length delta-D = 2*sqrt(h^2 + (d/2)^2) - d, skywaves arrive 35 to 70 µs after the groundwave leading edge. Loran receivers lock tracking loops to the Standard Zero Crossing (SZC) at the positive-going 3rd zero crossing (exactly 30 µs from onset), completely immune to ionospheric fading and delay variation.',
    presetId: 'jakarta_baseline',
    targetRoute: '/waveforms',
    buttonLabel: 'Simulate Skywave in Oscilloscope',
  },
  {
    id: 'cycle-selection',
    title: 'Cycle Selection, Envelope Ratio Tests & Boyce (2006) Model',
    icon: ShieldCheck,
    accentVar: '--accent-loran-c',
    summary:
      'Mathematical mechanics of envelope ratio testing to prevent catastrophic 10 µs carrier cycle slips under low SNR.',
    math: '\\text{Ratio}(\\tau) = \\frac{E(\\tau - 15\\,\\mu\\text{s})}{E(\\tau)}, \\quad \\text{SZC: } \\text{Ratio}(30) \\approx 0.3966',
    explanation:
      'Because each 100 kHz carrier cycle spans 10 µs (corresponding to approximately 3,000 metres in hyperbolic range difference), mistaking the 3rd cycle for the 2nd or 4th causes a severe 3 km fix error. Sourced from Boyce, Lo, Powell, & Enge (ILA 2006, Section II-D), receivers test the ratio of envelope samples spaced 15 µs apart: Ratio(tau) = E(tau - 15)/E(tau). Validating that Ratio(30) lies within [Ratio(25), Ratio(35)] (bounds ~0.2538 to ~0.5180) ensures cycle lock within a +/- 5 µs safety margin. Wrong-cycle probability follows P[Wrong Cycle] = erfc(5 / (sigma_ECD * sqrt(2))), with historical Austron sigma = 42/sqrt(N*SNR) µs and modern Peterson sigma = 28/sqrt(N*SNR) µs.',
    presetId: 'jakarta_baseline',
    targetRoute: '/waveforms',
    buttonLabel: 'Launch Boyce Monte Carlo Simulator',
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
  {
    id: 'ast-parser',
    title: 'Sandboxed AST Mathematical Expression Parser',
    icon: Cpu,
    accentVar: '--status-ok',
    summary:
      'Formal recursive descent grammar and AST evaluation for user-defined spatial conductivity functions.',
    math: '\\text{Eval}: \\mathrm{AST}(f(x, y)) \\to \\mathbb{R}, \\quad \\text{Sec: 0 eval()}',
    explanation:
      'Custom ground conductivity distributions entered by users are transformed into an Abstract Syntax Tree (AST) using a strict Recursive Descent Parser. The tree is evaluated via safe token dispatch without dynamic code execution (0 eval(), 0 new Function()), guaranteeing absolute security while computing complex mathematical spatial models.',
    presetId: 'north_sea',
    targetRoute: '/eloran',
    buttonLabel: 'Explore North Sea ASF Grid',
  },
];

export default function Learn() {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.slice(1);
      const el = document.getElementById(hash);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      }
    }
  }, []);
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {concepts.map((c) => {
          const Icon = c.icon;
          return (
            <article
              key={c.id}
              id={c.id}
              className="rounded-2xl p-6 flex flex-col justify-between space-y-4 scroll-mt-24"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{
                      background: `var(${c.accentVar}-subtle, var(--bg-subtle))`,
                      color: `var(${c.accentVar})`,
                      border: `1px solid var(${c.accentVar}-border, var(--border-subtle))`,
                    }}
                  >
                    <Icon size={16} aria-hidden="true" />
                  </div>
                  <span
                    className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{
                      background: 'var(--bg-subtle)',
                      color: 'var(--text-dim)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {c.id.toUpperCase()}
                  </span>
                </div>

                <h2 className="text-base font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                  {c.title}
                </h2>

                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {c.summary}
                </p>
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

              {/* Interactive Simulator Launcher */}
              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <button
                  onClick={() => handleLaunch(c.presetId, c.targetRoute)}
                  className="w-full py-2 px-3 rounded-lg text-xs font-mono font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                  style={{
                    background: `var(${c.accentVar}-subtle, var(--accent-eloran-subtle))`,
                    color: `var(${c.accentVar}, var(--accent-eloran))`,
                    border: `1px solid var(${c.accentVar}-border, var(--accent-eloran-border))`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                >
                  {c.buttonLabel} <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
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
            Mathematical formulations and scientific derivations defining low-frequency propagation velocity, surface impedance, and multi-boundary phase recovery.
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
                Sommerfeld (1909) / Norton (1936)
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
              Groundwave propagation over flat, finite-conductivity terrain is governed by the complex surface impedance <span className="font-mono text-[var(--text-primary)]">η</span> and dimensionless Sommerfeld numerical distance <span className="font-mono text-[var(--text-primary)]">p</span>:
            </p>
            <div className="p-2.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] overflow-x-auto text-xs">
              <MathView math="p = \frac{\pi d}{\lambda} |\eta|^2, \quad \eta = \frac{1}{\sqrt{\epsilon_r - j \frac{\sigma}{\omega \epsilon_0}}}" />
            </div>
            <div className="text-[10px] leading-normal text-[var(--text-muted)] space-y-0.5 font-mono bg-[var(--bg-subtle)]/50 p-2 rounded border border-[var(--border-subtle)]">
              <div><strong>SI Units:</strong> <span className="text-[var(--text-primary)]">d</span> in meters [m], <span className="text-[var(--text-primary)]">λ = c/f₀</span> ≈ 2997.9 m [m], <span className="text-[var(--text-primary)]">σ</span> in Siemens per meter [S·m⁻¹], <span className="text-[var(--text-primary)]">ω = 2πf₀</span> ≈ 6.283×10⁵ [rad·s⁻¹], <span className="text-[var(--text-primary)]">ε₀</span> ≈ 8.854×10⁻¹² [F·m⁻¹], <span className="text-[var(--text-primary)]">εᵣ, η, p</span> dimensionless [-].</div>
              <div className="text-[9px] pt-1 border-t border-[var(--border-subtle)] text-[var(--text-dim)]">
                <strong>Citations:</strong> Sommerfeld (1909), <em>Ann. Phys.</em> 333(4); Norton (1936), <em>Proc. IRE</em> 24(10); ITU-R Recommendation P.368-10.
              </div>
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
                Millington (1949)
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
              When a 100 kHz wave traverses multiple media (e.g. land followed by sea), forward-only calculation violates electromagnetic reciprocity. Millington's method computes the arithmetic mean of forward and reverse cumulative boundary evaluations:
            </p>
            <div className="p-2.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] overflow-x-auto text-xs">
              <MathView math="\Phi_F = \Delta t_1(x_1) + \sum_{k=2}^M \left[ \Delta t_k(x_k) - \Delta t_k(x_{k-1}) \right], \quad \text{ASF} = \frac{1}{2}\left(\Phi_F + \Phi_R\right)" />
            </div>
            <div className="text-[10px] leading-normal text-[var(--text-muted)] space-y-0.5 font-mono bg-[var(--bg-subtle)]/50 p-2 rounded border border-[var(--border-subtle)]">
              <div><strong>SI Units & Terms:</strong> <span className="text-[var(--text-primary)]">x_k = \sum d_i</span> cumulative distance [km], <span className="text-[var(--text-primary)]">Δt_k(x)</span> homogeneous delay over medium <span className="text-[var(--text-primary)]">k</span> [µs], <span className="text-[var(--text-primary)]">ASF</span> total delay [µs] or [m] via <span className="text-[var(--text-primary)]">c·Δt</span>.</div>
              <div className="text-[9px] pt-1 border-t border-[var(--border-subtle)] text-[var(--text-dim)]">
                <strong>Citations:</strong> Millington, G. (1949), <em>Proc. IEE</em> 96(39), 53–64; ITU-R Recommendation P.368-10.
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
              At coastlines transitioning from land to sea, <span className="font-mono text-[var(--text-primary)]">{'Δt_k(x_k) - Δt_k(x_{k-1}) < 0'}</span>, producing classical <em>Millington recovery</em> (field strength surge and phase lag decrease). SIMULORAN implements this exact multi-boundary formulation in <span className="font-mono text-[var(--accent-eloran)]">grwave.js</span> with Natural Earth 10m GIS ray-tracing.
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
                <strong className="text-[var(--text-primary)]">Resistive Land Paths:</strong> Over low-conductivity soil (<span className="font-mono">σ = 0.001–0.005 S/m</span>), cumulative delay accumulates monotonically: ~15 m at 100 km, ~45 m at 300 km, and ~75 m at 500 km (<span className="font-mono">d₁ &lt; d₂ ⟹ Δt(d₁) ≤ Δt(d₂)</span>).
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Reciprocal Equality:</strong> Delay from Transmitter to Receiver identically matches delay from Receiver to Transmitter (<span className="font-mono">ASF(A→B) = ASF(B→A)</span>).
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
              <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)]">
                Smith &amp; Weintraub (1953)
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
              The radio refractive index <span className="font-mono text-[var(--text-primary)]">n</span> of tropospheric air alters groundwave phase velocity <span className="font-mono text-[var(--text-primary)]">v = c / n</span> per Smith &amp; Weintraub (1953):
            </p>
            <div className="p-2.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] overflow-x-auto text-xs">
              <MathView math="N = (n - 1) \times 10^6 = 77.6 \frac{P}{T} + 3.73 \times 10^5 \frac{e}{T^2}" />
            </div>
            <div className="text-[10px] leading-normal text-[var(--text-muted)] space-y-0.5 font-mono bg-[var(--bg-subtle)]/50 p-2 rounded border border-[var(--border-subtle)]">
              <div><strong>SI Units:</strong> Total pressure <span className="text-[var(--text-primary)]">P</span> in hectopascals [hPa = 100 Pa], absolute temperature <span className="text-[var(--text-primary)]">T</span> in Kelvin [K], water vapor partial pressure <span className="text-[var(--text-primary)]">e</span> in hectopascals [hPa], refractivity <span className="text-[var(--text-primary)]">N</span> in N-units (dimensionless, ppm).</div>
              <div className="text-[9px] pt-1 border-t border-[var(--border-subtle)] text-[var(--text-dim)]">
                <strong>Citations:</strong> Smith, E. K. &amp; Weintraub, S. (1953), <em>Proc. IRE</em> 41(8); Song, J. &amp; Son, P.-W. (2025).
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
              Where seasonal temperature and humidity swings induce sinusoidal phase variations (up to ~100 ns across 500 km), calibrated in literature against Korean eLoran trials (Song & Son 2025).
            </p>
          </div>
        </div>
      </section>

      {/* Empirical Field Trial Benchmarks & Real-World Validation */}
      <section id="empirical-benchmarks" className="space-y-4">
        <div>
          <div
            className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: 'var(--accent-eloran)' }}
          >
            <Database size={14} aria-hidden="true" /> Empirical Scientific Verification
          </div>
          <h2
            className="text-2xl font-bold tracking-tight font-mono"
            style={{ color: 'var(--text-primary)' }}
          >
            Empirical Field Trial Benchmarks
          </h2>
          <p className="text-sm mt-1 max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
            To guard against circular self-validation, SIMULORAN is validated against published real-world
            accuracy campaigns from the Korean Nationwide eLoran Testbed (Rhee et al., 2021) and the
            Maoming Inland Ellipsoidal Geodesic Experiment (Gao et al., 2025) without artificial parameter tuning.
          </p>
        </div>

        <div
          className="rounded-xl p-5 border"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <TrialValidationPanel />
        </div>
      </section>
    </div>
  );
}
