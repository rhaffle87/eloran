import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Radio, Compass, Activity, BookOpen, Info, ShieldAlert, Cpu } from 'lucide-react';
import { useSimulationStore } from '../state/simulationStore.js';
import { PRESET_SCENARIOS } from '../state/presets.js';

export default function Navbar() {
  const { activePresetId, simTimeSec, isSimRunning } = useSimulationStore();
  const activePreset = PRESET_SCENARIOS[activePresetId];

  const navLinks = [
    { to: '/loran-c', label: 'Loran-C', icon: Radio },
    { to: '/eloran', label: 'eLoran Simulator', icon: Compass },
    { to: '/waveforms', label: 'RF Waveforms', icon: Activity },
    { to: '/learn', label: 'Theory & Guide', icon: BookOpen },
    { to: '/about', label: 'Specs & About', icon: Info },
  ];

  return (
    <nav className="bg-zinc-950 border-b border-zinc-800/80 sticky top-0 z-40 select-none backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-500/20 group-hover:border-cyan-400 transition">
              <Cpu size={20} className="group-hover:rotate-12 transition-transform duration-300" />
            </div>
            <div>
              <div className="font-mono font-bold text-sm tracking-widest text-zinc-100 flex items-center gap-2">
                LORAN LAB
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded border border-cyan-500/30 uppercase font-semibold">
                  v1.0
                </span>
              </div>
              <div className="text-[10px] text-zinc-500 font-mono tracking-tight">
                Hyperbolic Radio Navigation Suite
              </div>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-1 font-mono text-xs">
            {navLinks.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                      isActive
                        ? 'bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
                    }`
                  }
                >
                  <Icon size={14} />
                  {item.label}
                </NavLink>
              );
            })}
          </div>

          {/* Active Status Badge */}
          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="hidden lg:flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg text-zinc-300 text-[11px]">
              <span
                className={`w-2 h-2 rounded-full ${
                  isSimRunning ? 'bg-cyan-400 animate-pulse' : 'bg-zinc-600'
                }`}
              />
              <span className="text-zinc-500">T:</span> {simTimeSec}s
              <span className="text-zinc-700">|</span>
              <span className="text-zinc-400 truncate max-w-[120px]" title={activePreset?.name}>
                {activePreset?.name?.split(' ')[0]}
              </span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
