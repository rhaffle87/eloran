import React from 'react';
import { Activity, Info, Radio, Zap } from 'lucide-react';
import PulseViewer from '../components/charts/PulseViewer.jsx';
import CycleSelectionPanel from '../components/charts/CycleSelectionPanel.jsx';

export default function Waveforms() {
  const [activeTab, setActiveTab] = React.useState('all'); // 'all' | 'oscilloscope' | 'cycle-selection'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 font-sans">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-semibold uppercase tracking-wider mb-1">
            <Activity size={14} /> Oscilloscope Subsystem & Physics Lab
          </div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight font-mono">
            100 kHz RF Waveform & Cycle Selection Lab
          </h1>
          <p className="text-zinc-400 text-sm mt-1 max-w-3xl">
            Inspect instantaneous antenna voltages, envelope pulse shapes, ionospheric skywave multi-path,
            and Boyce et al. (ILA 2006) envelope ratio wrong-cycle selection Monte Carlo distributions.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-1 text-xs font-mono">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded transition ${
              activeTab === 'all'
                ? 'bg-cyan-500 text-black font-bold'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            All Views
          </button>
          <button
            onClick={() => setActiveTab('oscilloscope')}
            className={`px-3 py-1.5 rounded transition ${
              activeTab === 'oscilloscope'
                ? 'bg-cyan-500 text-black font-bold'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Oscilloscope
          </button>
          <button
            onClick={() => setActiveTab('cycle-selection')}
            className={`px-3 py-1.5 rounded transition ${
              activeTab === 'cycle-selection'
                ? 'bg-cyan-500 text-black font-bold'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Boyce Monte Carlo
          </button>
        </div>
      </div>

      {/* Main Content Panels */}
      {(activeTab === 'all' || activeTab === 'oscilloscope') && <PulseViewer />}
      {(activeTab === 'all' || activeTab === 'cycle-selection') && <CycleSelectionPanel />}

      {/* Physics and Engineering Explanations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 font-mono text-xs">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-cyan-400 font-bold">
            <Radio size={14} /> 100 kHz Standard Pulse
          </div>
          <p className="text-zinc-400 leading-relaxed">
            Every Loran pulse is transmitted on a center frequency of 100 kHz with 99% of its spectral
            energy confined within the 90–110 kHz band. The standard envelope follows a raised cosine
            rise: $E(t) = 0.5(1 + \cos(\pi t / T_p))$.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold">
            <Zap size={14} /> GRI Timing Structure
          </div>
          <p className="text-zinc-400 leading-relaxed">
            The Group Repetition Interval (GRI) defines the period in tens of microseconds between
            consecutive pulse groups emitted by the chain. For example, GRI 8330 repeats every 83.30 ms.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-bold">
            <Info size={14} /> Skywave Discrimination
          </div>
          <p className="text-zinc-400 leading-relaxed">
            Loran receivers sample the groundwave at the standard 3rd cycle (30 µs from onset) to measure
            precise arrival before ionospheric reflected skywaves arrive (typically 35–50 µs later).
          </p>
        </div>
      </div>
    </div>
  );
}
