import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Radio, Compass, Activity, BookOpen, Info, Menu, X } from 'lucide-react';
import { useSimulationStore } from '../state/simulationStore.js';
import { PRESET_SCENARIOS } from '../state/presets.js';

const navLinks = [
  { to: '/loran-c',   label: 'Loran-C',       icon: Radio,     accent: 'loran-c' },
  { to: '/eloran',    label: 'eLoran',         icon: Compass,   accent: 'eloran'  },
  { to: '/waveforms', label: 'RF Waveforms',   icon: Activity,  accent: 'eloran'  },
  { to: '/learn',     label: 'Theory',         icon: BookOpen,  accent: null      },
  { to: '/about',     label: 'About',          icon: Info,      accent: null      },
];

function BrandLogo() {
  return (
    <Link to="/" className="flex items-center gap-3 group shrink-0" aria-label="LORAN LAB home">
      {/* SVG antenna icon */}
      <div className="w-9 h-9 rounded-lg flex items-center justify-center border border-[var(--surface-border)] bg-[var(--surface-layer)] group-hover:border-[var(--color-eloran)] group-hover:shadow-[0_0_12px_var(--glow-eloran)] transition duration-300">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 16V10" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M5 13C5 10.2386 7.23858 8 10 8C12.7614 8 15 10.2386 15 13" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          <path d="M2.5 15.5C2.5 10.2533 5.92893 6 10 6C14.0711 6 17.5 10.2533 17.5 15.5" stroke="#4a6070" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
          <circle cx="10" cy="16.5" r="1.2" fill="#06b6d4"/>
        </svg>
      </div>

      <div>
        <div className="font-mono font-bold text-sm tracking-widest text-[var(--text-primary)] flex items-center gap-2">
          LORAN LAB
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface-muted)] text-[var(--color-eloran)] border border-[var(--surface-border)] uppercase font-semibold tracking-wider">
            v1
          </span>
        </div>
        <div className="text-[10px] text-[var(--text-dim)] font-mono mt-0.5 hidden sm:block">
          Hyperbolic Radio Navigation Suite
        </div>
      </div>
    </Link>
  );
}

function SimStatusBadge({ isSimRunning, simTimeSec, activePreset }) {
  return (
    <div className="hidden lg:flex items-center gap-2 bg-[var(--surface-layer)] border border-[var(--surface-border)] px-3 py-1.5 rounded-lg font-mono text-[11px] text-[var(--text-secondary)]">
      <span
        className={`w-1.5 h-1.5 rounded-full ${isSimRunning ? 'bg-[var(--color-eloran)] signal-blink' : 'bg-[var(--surface-muted)]'}`}
        aria-label={isSimRunning ? 'Simulation running' : 'Simulation stopped'}
      />
      <span className="text-[var(--text-dim)]">T:</span>
      <span className="text-[var(--text-primary)] font-semibold tabular-nums">{simTimeSec}s</span>
      {activePreset?.name && (
        <>
          <span className="text-[var(--surface-muted)]">·</span>
          <span className="text-[var(--text-secondary)] truncate max-w-[110px]" title={activePreset.name}>
            {activePreset.name.split(' ').slice(0, 2).join(' ')}
          </span>
        </>
      )}
    </div>
  );
}

export default function Navbar() {
  const { activePresetId, simTimeSec, isSimRunning } = useSimulationStore();
  const activePreset = PRESET_SCENARIOS[activePresetId];
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-40 select-none"
      style={{ background: 'var(--surface-base)', borderBottom: '1px solid var(--surface-border)' }}
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-4">
          <BrandLogo />

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-0.5 font-mono text-xs">
            {navLinks.map(({ to, label, icon: NavIcon, accent }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all duration-200 ${
                    isActive
                      ? accent === 'loran-c'
                        ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
                        : 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300'
                      : 'text-[var(--text-dim)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-layer)] border border-transparent'
                  }`
                }
              >
                <NavIcon size={13} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <SimStatusBadge
              isSimRunning={isSimRunning}
              simTimeSec={simTimeSec}
              activePreset={activePreset}
            />

            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 rounded-md text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-layer)] border border-transparent transition"
              onClick={() => setMobileOpen((o) => !o)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          className="md:hidden border-t border-[var(--surface-border)] bg-[var(--surface-layer)] px-4 py-3 space-y-1"
        >
          {navLinks.map(({ to, label, icon: MobileIcon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-mono transition ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)]'
                }`
              }
            >
              <MobileIcon size={14} />
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  );
}
