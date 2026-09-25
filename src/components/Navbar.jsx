import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Radio, Compass, Activity, BookOpen, Info, Menu, X, Sun, Moon } from 'lucide-react';
import { useSimulationStore } from '../state/simulationStore.js';
import { useThemeStore } from '../state/themeStore.js';
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
      {/* Precision antenna icon */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-subtle)] group-hover:border-[var(--accent-eloran)] transition duration-200">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 16V10" stroke="var(--accent-eloran)" strokeWidth="1.6" strokeLinecap="round"/>
          <path d="M5 13C5 10.2386 7.23858 8 10 8C12.7614 8 15 10.2386 15 13" stroke="var(--accent-eloran)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          <path d="M2.5 15.5C2.5 10.2533 5.92893 6 10 6C14.0711 6 17.5 10.2533 17.5 15.5" stroke="var(--text-dim)" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
          <circle cx="10" cy="16.5" r="1.2" fill="var(--accent-eloran)"/>
        </svg>
      </div>

      <div>
        <div className="font-mono font-bold text-xs tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
          LORAN LAB
          <span className="text-[9px] px-1 py-0.2 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--accent-eloran)] font-semibold tracking-wider">
            v1.1
          </span>
        </div>
        <div className="text-[10px] text-[var(--text-dim)] font-mono hidden sm:block">
          Radionavigation & Physics Testbed
        </div>
      </div>
    </Link>
  );
}

function SimStatusBadge({ isSimRunning, simTimeSec, activePreset }) {
  return (
    <div className="hidden lg:flex items-center gap-2 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] px-2.5 py-1 rounded-md font-mono text-[11px] text-[var(--text-secondary)]">
      <span
        className={`w-1.5 h-1.5 rounded-full ${isSimRunning ? 'bg-[var(--accent-eloran)] signal-blink' : 'bg-[var(--border-strong)]'}`}
        aria-label={isSimRunning ? 'Simulation running' : 'Simulation stopped'}
      />
      <span className="text-[var(--text-dim)]">T:</span>
      <span className="text-[var(--text-primary)] font-semibold tabular-nums">{simTimeSec}s</span>
      {activePreset?.name && (
        <>
          <span className="text-[var(--border-subtle)]">·</span>
          <span className="text-[var(--text-secondary)] truncate max-w-[120px]" title={activePreset.name}>
            {activePreset.name.split(' ').slice(0, 2).join(' ')}
          </span>
        </>
      )}
    </div>
  );
}

export default function Navbar() {
  const { activePresetId, simTimeSec, isSimRunning } = useSimulationStore();
  const { effectiveTheme, toggleTheme } = useThemeStore();
  const activePreset = PRESET_SCENARIOS[activePresetId];
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-40 select-none bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] transition-colors duration-200"
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-4">
          <BrandLogo />

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1 font-mono text-xs">
            {navLinks.map(({ to, label, icon: NavIcon, accent }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md transition duration-150 ${
                    isActive
                      ? accent === 'loran-c'
                        ? 'bg-[var(--accent-loran-c-subtle)] border border-[var(--accent-loran-c-border)] text-[var(--accent-loran-c)] font-semibold'
                        : 'bg-[var(--accent-eloran-subtle)] border border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] border border-transparent'
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

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition"
              title={`Switch to ${effectiveTheme === 'dark' ? 'Light' : 'Dark'} mode`}
              aria-label="Toggle theme mode"
            >
              {effectiveTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] border border-[var(--border-subtle)] transition"
              onClick={() => setMobileOpen((o) => !o)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          className="md:hidden border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 space-y-1"
        >
          {navLinks.map(({ to, label, icon: MobileIcon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono transition ${
                  isActive
                    ? 'bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] border border-[var(--accent-eloran-border)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
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
