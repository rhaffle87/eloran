import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Radio, Compass, Activity, BookOpen, Info, Menu, X, Sun, Moon, Monitor } from 'lucide-react';
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
    <Link to="/" className="flex items-center gap-3 group shrink-0" aria-label="SIMULORAN home">
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
          SIMULORAN
          <span className="text-[9px] px-1 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--accent-eloran)] font-semibold tracking-wider">
            {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v1.1'}
          </span>
        </div>
        <div className="text-xs text-[var(--text-secondary)] font-mono hidden sm:block">
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
        role="img"
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
  const { theme, setTheme, effectiveTheme, toggleTheme } = useThemeStore();
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

            {/* Theme Quick Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition cursor-pointer"
              title={`Switch to ${effectiveTheme === 'dark' ? 'Light' : 'Dark'} mode`}
              aria-label={effectiveTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {effectiveTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* 3-Way Theme Switcher (Light / Dark / Auto) */}
            <div
              className="hidden sm:flex items-center p-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)]"
              role="radiogroup"
              aria-label="Theme mode selection"
              onKeyDown={(e) => {
                const themes = ['light', 'dark', 'system'];
                const idx = themes.indexOf(theme);
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  const next = themes[(idx + 1) % themes.length];
                  setTheme(next);
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  const prev = themes[(idx - 1 + themes.length) % themes.length];
                  setTheme(prev);
                }
              }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'light'}
                tabIndex={theme === 'light' ? 0 : -1}
                onClick={() => setTheme('light')}
                className={`p-1.5 rounded-md transition focus:outline-hidden focus:ring-1 focus:ring-[var(--accent-eloran)] ${
                  theme === 'light'
                    ? 'bg-[var(--bg-surface)] text-[var(--accent-eloran)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
                title="Light mode"
                aria-label="Light mode"
              >
                <Sun size={13} />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'dark'}
                tabIndex={theme === 'dark' ? 0 : -1}
                onClick={() => setTheme('dark')}
                className={`p-1.5 rounded-md transition focus:outline-hidden focus:ring-1 focus:ring-[var(--accent-eloran)] ${
                  theme === 'dark'
                    ? 'bg-[var(--bg-surface)] text-[var(--accent-eloran)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
                title="Dark mode"
                aria-label="Dark mode"
              >
                <Moon size={13} />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'system'}
                tabIndex={theme === 'system' ? 0 : -1}
                onClick={() => setTheme('system')}
                className={`p-1.5 rounded-md transition focus:outline-hidden focus:ring-1 focus:ring-[var(--accent-eloran)] ${
                  theme === 'system'
                    ? 'bg-[var(--bg-surface)] text-[var(--accent-eloran)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
                title="Auto / System mode"
                aria-label="Auto / System mode"
              >
                <Monitor size={13} />
              </button>
            </div>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] border border-[var(--border-subtle)] transition"
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
          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono px-1">
            <span className="text-[var(--text-dim)]">Theme</span>
            <div className="flex items-center gap-1 p-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition ${
                  theme === 'light' ? 'bg-[var(--bg-surface)] text-[var(--accent-eloran)] font-semibold shadow-xs' : 'text-[var(--text-muted)]'
                }`}
                aria-label="Light theme"
              >
                <Sun size={12} /> Light
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition ${
                  theme === 'dark' ? 'bg-[var(--bg-surface)] text-[var(--accent-eloran)] font-semibold shadow-xs' : 'text-[var(--text-muted)]'
                }`}
                aria-label="Dark theme"
              >
                <Moon size={12} /> Dark
              </button>
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition ${
                  theme === 'system' ? 'bg-[var(--bg-surface)] text-[var(--accent-eloran)] font-semibold shadow-xs' : 'text-[var(--text-muted)]'
                }`}
                aria-label="Auto / System theme"
              >
                <Monitor size={12} /> Auto
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
