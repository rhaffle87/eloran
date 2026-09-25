import React from 'react';
import { Activity, Info, Radio, Zap } from 'lucide-react';
import PulseViewer from '../components/charts/PulseViewer.jsx';
import CycleSelectionPanel from '../components/charts/CycleSelectionPanel.jsx';
import MathView from '../components/ui/MathView.jsx';

const INFO_CARDS = [
  {
    icon: Radio,
    accentVar: '--accent-eloran',
    title: '100 kHz Standard Pulse',
    body: 'Every Loran pulse is transmitted on a centre frequency of 100 kHz with 99% of its spectral energy confined within the 90–110 kHz band. Standard raised-cosine envelope:',
    formula: 'E(t) = 0.5\\left(1 + \\cos\\left(\\frac{\\pi t}{T_p}\\right)\\right)',
  },
  {
    icon: Zap,
    accentVar: '--accent-loran-c',
    title: 'GRI Timing Structure',
    body: 'The Group Repetition Interval (GRI) defines the period in tens of microseconds between consecutive pulse groups emitted by the chain:',
    formula: 'T_{\\text{GRI}} = \\text{GRI} \\times 10\\,\\mu\\text{s}',
  },
  {
    icon: Info,
    accentVar: '--status-ok',
    title: 'Skywave Discrimination',
    body: 'Loran receivers sample the groundwave at the standard 3rd cycle (30 µs from onset) prior to the arrival of skywaves:',
    formula: 't_{\\text{sample}} = 3 \\cdot T_{\\text{carrier}} = 30\\,\\mu\\text{s} < t_{\\text{skywave}}',
  },
];

export default function Waveforms() {
  const [activeTab, setActiveTab] = React.useState('all'); // 'all' | 'oscilloscope' | 'cycle-selection'

  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {/* Page Header */}
      <header>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div
              className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider mb-1"
              style={{ color: 'var(--accent-eloran)' }}
            >
              <Activity size={14} aria-hidden="true" /> Oscilloscope Subsystem &amp; Physics Lab
            </div>
            <h1
              className="text-3xl font-bold tracking-tight font-mono"
              style={{ color: 'var(--text-primary)' }}
            >
              100 kHz RF Waveform &amp; Cycle Selection Lab
            </h1>
            <p className="text-sm mt-1 max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
              Inspect instantaneous antenna voltages, envelope pulse shapes, ionospheric skywave multi-path,
              and Boyce et al. (ILA 2006) envelope ratio wrong-cycle selection Monte Carlo distributions.
            </p>
          </div>

          {/* Tab Navigation */}
          <div
            className="flex rounded-lg p-1 text-xs font-mono"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
          >
            {[['all', 'All Views'], ['oscilloscope', 'Oscilloscope'], ['cycle-selection', 'Boyce Monte Carlo']].map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-3 py-1.5 rounded transition"
                style={activeTab === tab
                  ? { background: 'var(--accent-eloran)', color: 'var(--bg-canvas)', fontWeight: 700 }
                  : { color: 'var(--text-dim)' }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content Panels */}
      {(activeTab === 'all' || activeTab === 'oscilloscope') && <PulseViewer />}
      {(activeTab === 'all' || activeTab === 'cycle-selection') && <CycleSelectionPanel />}

      {/* Physics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 font-mono text-xs">
        {INFO_CARDS.map(({ icon: Icon, accentVar, title, body, formula }) => (
          <div
            key={title}
            className="p-4 rounded-xl space-y-2 flex flex-col justify-between"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="space-y-2">
              <div
                className="flex items-center gap-2 font-bold"
                style={{ color: `var(${accentVar})` }}
              >
                <Icon size={14} aria-hidden="true" /> {title}
              </div>
              <p className="leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {body}
              </p>
            </div>
            {formula && (
              <div
                className="mt-2 px-3 py-1.5 rounded-lg overflow-x-auto"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
              >
                <MathView math={formula} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
