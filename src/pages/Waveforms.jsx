import React from 'react';
import { Activity, BookOpen } from 'lucide-react';
import PulseViewer from '../components/charts/PulseViewer.jsx';
import CycleSelectionPanel from '../components/charts/CycleSelectionPanel.jsx';
import MathView from '../components/ui/MathView.jsx';

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
              <Activity size={14} aria-hidden="true" /> Oscilloscope Subsystem &amp; RF Physics Lab
            </div>
            <h1
              className="text-3xl font-bold tracking-tight font-mono"
              style={{ color: 'var(--text-primary)' }}
            >
              100 kHz RF Waveform &amp; Cycle Selection Lab
            </h1>
            <p className="text-sm mt-1 max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
              Interactive oscilloscope telemetry, USCG standard pulse synthesis, ionospheric skywave multi-path separation,
              and real-time Boyce (2006) envelope ratio wrong-cycle selection risk modeling.
            </p>
          </div>

          {/* Tab Navigation */}
          <div
            className="flex rounded-lg p-1 text-xs font-mono"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
          >
            {[
              ['all', 'All Views'],
              ['oscilloscope', 'Oscilloscope'],
              ['cycle-selection', 'Boyce Monte Carlo'],
            ].map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-3 py-1.5 rounded transition cursor-pointer"
                style={
                  activeTab === tab
                    ? { background: 'var(--accent-eloran)', color: 'var(--btn-eloran-text)', fontWeight: 700 }
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

      {/* RF Standards Quick Reference Strip with Compact KaTeX Formula Badges */}
      <div
        className="rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 font-mono text-xs shadow-sm"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          {/* USCG M16562.4A Standard Pulse Envelope */}
          <div
            className="p-2.5 rounded-lg space-y-1"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex justify-between items-center text-[11px]">
              <span className="font-bold text-[var(--accent-eloran)]">Standard Pulse Envelope</span>
              <span className="text-[10px] text-[var(--text-dim)]">τ = 65 µs</span>
            </div>
            <div className="overflow-x-auto py-0.5 text-xs text-[var(--text-primary)]">
              <MathView math="E(t) = A\left(\frac{t}{\tau}\right)^2 e^{-2(t-\tau)/\tau}" />
            </div>
          </div>

          {/* GRI Timing Structure */}
          <div
            className="p-2.5 rounded-lg space-y-1"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex justify-between items-center text-[11px]">
              <span className="font-bold text-[var(--accent-loran-c)]">GRI Timing Structure</span>
              <span className="text-[10px] text-[var(--text-dim)]">10 µs increments</span>
            </div>
            <div className="overflow-x-auto py-0.5 text-xs text-[var(--text-primary)]">
              <MathView math="T_{\text{GRI}} = \text{GRI} \times 10\,\mu\text{s}" />
            </div>
          </div>

          {/* Skywave Separation & SZC Groundwave Sampling */}
          <div
            className="p-2.5 rounded-lg space-y-1"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex justify-between items-center text-[11px]">
              <span className="font-bold text-[var(--status-ok)]">Groundwave SZC Sampling</span>
              <span className="text-[10px] text-[var(--text-dim)]">3rd Zero Crossing</span>
            </div>
            <div className="overflow-x-auto py-0.5 text-xs text-[var(--text-primary)]">
              <MathView math="t_{\text{sample}} = 3 \cdot T_{\text{carrier}} = 30\,\mu\text{s} < t_{\text{skywave}}" />
            </div>
          </div>
        </div>

        {/* Link to Theory / Documentation */}
        <div className="flex md:flex-col justify-end items-end shrink-0 pl-2">
          <a
            href="/learn#uscg-pulse"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition hover:opacity-90 cursor-pointer"
            style={{
              background: 'var(--accent-eloran-subtle)',
              border: '1px solid var(--accent-eloran-border)',
              color: 'var(--accent-eloran)',
            }}
            title="Open comprehensive theoretical proofs and mathematical formulas in Theory & Documentation"
          >
            <BookOpen size={13} /> Full Theory &amp; Equations in Docs &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
