import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  Radio,
  Activity,
  Layers,
  ShieldCheck,
  TrendingDown,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import { useSimulationStore } from '../state/simulationStore.js';

export default function Learn() {
  const navigate = useNavigate();
  const { loadPreset } = useSimulationStore();

  const handleLaunchScenario = (presetId, targetRoute) => {
    loadPreset(presetId);
    navigate(targetRoute);
  };

  const concepts = [
    {
      id: 'tdoa',
      title: 'Time Difference of Arrival (TDOA) & Hyperbolas',
      icon: Radio,
      color: 'text-cyan-400',
      borderColor: 'border-cyan-500/30',
      summary:
        'Loran does not measure absolute time-of-flight from transmitter to receiver. Instead, it measures the differential arrival time between synchronized master and secondary transmitters.',
      math: 'TDOA = t_{arr, S} - t_{arr, M} = \\frac{d_S - d_M}{c} + t_{coding}',
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
      color: 'text-amber-400',
      borderColor: 'border-amber-500/30',
      summary:
        'How transmitter geometry magnifies timing measurement errors into horizontal positioning uncertainty.',
      math: 'GDOP = \\sqrt{\\text{trace}\\left((H^T H)^{-1}\\right)}',
      explanation:
        'When transmitter stations are nearly collinear or subtend narrow angles relative to the receiver, hyperbolic lines of position intersect at grazing angles. A tiny 10 ns timing jitter translates into hundreds of meters of horizontal position error. Wide angular baseline separation yields optimal geometry (GDOP < 2).',
      presetId: 'high_gdop',
      targetRoute: '/loran-c',
      buttonLabel: 'Inspect High-GDOP Scenario',
    },
    {
      id: 'asf',
      title: 'Additional Secondary Factor (ASF) & Propagation Delay',
      icon: Layers,
      color: 'text-purple-400',
      borderColor: 'border-purple-500/30',
      summary:
        'Phase delay accumulated as low-frequency groundwaves traverse landmasses of varying soil conductivity and elevation.',
      math: 't_{prop} = \\frac{d}{c} + PF + SF + ASF(\\phi, \\lambda)',
      explanation:
        'Loran 100 kHz signals travel via groundwaves following the Earth curvature. Over seawater (conductivity ~4 S/m), signals travel at close to the speed of light. Over dry land, granite, or mountains (conductivity ~0.001 S/m), signals slow down, creating spatial errors up to hundreds of meters. eLoran maps and cancels these errors using published ASF grids and real-time differential corrections.',
      presetId: 'north_sea',
      targetRoute: '/eloran',
      buttonLabel: 'Explore North Sea ASF Grid',
    },
    {
      id: 'gri',
      title: 'Group Repetition Interval (GRI) & 100 kHz Pulses',
      icon: Activity,
      color: 'text-blue-400',
      borderColor: 'border-blue-500/30',
      summary:
        'Spectral confinement and periodic pulse timing structure designed to resist interference.',
      math: 'E(t) = 0.5\\left(1 + \\cos\\left(\\frac{\\pi t}{T_{pulse}}\\right)\\right), \\quad f_0 = 100\\text{ kHz}',
      explanation:
        'Each station emits a group of 8 or 9 pulses with a fast rise time to allow sampling at the 3rd carrier cycle (30 µs), prior to the arrival of skywaves reflected off the ionosphere. The GRI uniquely identifies the transmitting chain and prevents multi-chain cross-rate interference.',
      presetId: 'jakarta_baseline',
      targetRoute: '/waveforms',
      buttonLabel: 'Open RF Oscilloscope',
    },
    {
      id: 'fusion',
      title: 'GNSS-eLoran Multi-Source PNT Resiliency',
      icon: ShieldCheck,
      color: 'text-emerald-400',
      borderColor: 'border-emerald-500/30',
      summary:
        'Complementary integration between satellite GNSS and high-power terrestrial eLoran.',
      math: '\\mathbf{x}_{fused} = w_E \\mathbf{x}_{eLoran} + w_G \\mathbf{x}_{GNSS}',
      explanation:
        'GNSS operates at microwave frequencies (1.2–1.5 GHz) with extremely faint satellite signals (-130 dBm) vulnerable to accidental jamming and intentional spoofing. eLoran operates at low frequency (100 kHz) with megawatt transmitter towers emitting high-power terrestrial groundwaves that penetrate cities, fjords, and electronic jamming. Together, they provide sovereign, uninterrupted positioning, navigation, and timing (PNT).',
      presetId: 'gnss_denied',
      targetRoute: '/eloran',
      buttonLabel: 'Test GNSS-Denied Outage',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10 font-sans">
      <div>
        <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-semibold uppercase tracking-wider mb-1">
          <BookOpen size={14} /> Knowledge Base & Interactive Guides
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-zinc-100 font-mono tracking-tight">
          Loran-C & eLoran Theoretical Foundations
        </h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-3xl leading-relaxed">
          Explore the physics of low-frequency radio navigation, hyperbolic multilateration,
          relativistic groundwave delays, and resilient multi-sensor fusion. Each guide includes a
          one-click launcher that configures the live simulator to demonstrate the concept.
        </p>
      </div>

      <div className="space-y-6">
        {concepts.map((concept) => {
          const Icon = concept.icon;
          return (
            <div
              key={concept.id}
              className={`bg-zinc-900 border ${concept.borderColor} rounded-2xl p-6 shadow-xl space-y-4`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 ${concept.color}`}>
                    <Icon size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-zinc-100 font-mono tracking-tight">
                      {concept.title}
                    </h2>
                    <p className="text-xs text-zinc-400 font-medium">{concept.summary}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleLaunchScenario(concept.presetId, concept.targetRoute)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-mono font-bold rounded-lg uppercase tracking-wider shadow-sm transition shrink-0"
                >
                  {concept.buttonLabel} <ArrowRight size={14} />
                </button>
              </div>

              {/* Math Equation Formula */}
              <div className="bg-zinc-950 px-4 py-2.5 rounded-lg border border-zinc-800 font-mono text-xs text-cyan-300 overflow-x-auto">
                <span className="text-zinc-500 mr-2 text-[10px] uppercase font-bold tracking-wider">Formula:</span>
                <code>{concept.math}</code>
              </div>

              {/* Detailed Technical Explanation */}
              <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                {concept.explanation}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
