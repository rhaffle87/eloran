import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Radio, Compass, Activity, BookOpen,
  ArrowRight, Globe, CheckCircle2, Zap, AlertTriangle
} from 'lucide-react';
import { PRESET_SCENARIOS } from '../state/presets.js';
import { useSimulationStore } from '../state/simulationStore.js';

/* ── Utility ──────────────────────────────────────────── */
const statusMeta = {
  active:     { label: 'Active',     cls: 'pill-ok'     },
  historical: { label: 'Historical', cls: 'pill-loran-c' },
  synthetic:  { label: 'Synthetic',  cls: 'pill-ghost'  },
};

/* ── Sub-components ───────────────────────────────────── */

function HeroBadge({ children }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[11px] font-mono font-semibold tracking-wider">
      {children}
    </div>
  );
}

function SpecRow({ label, value, accent }) {
  return (
    <div className="flex justify-between items-baseline text-xs font-mono border-b border-[var(--surface-border)] pb-2">
      <span className="text-[var(--text-dim)]">{label}</span>
      <span style={{ color: accent || 'var(--text-primary)' }} className="font-bold tabular-nums">{value}</span>
    </div>
  );
}

function ModuleCard({ icon: CardIcon, title, description, features, to, accent, badge }) {
  const accentColor = accent === 'eloran' ? 'var(--color-eloran)' : 'var(--color-loran-c)';
  const accentBg    = accent === 'eloran' ? 'rgba(6,182,212,0.07)' : 'rgba(245,158,11,0.07)';
  const accentBorder= accent === 'eloran' ? 'rgba(6,182,212,0.2)'  : 'rgba(245,158,11,0.2)';

  return (
    <article className="panel-card flex flex-col justify-between p-6 hover:shadow-lg transition-all duration-300 group relative overflow-hidden">
      {badge && (
        <div className="absolute top-0 right-0 text-[9px] font-mono uppercase px-2 py-1 font-bold border-b border-l rounded-bl-lg"
          style={{ background: accentBg, color: accentColor, borderColor: accentBorder }}>
          {badge}
        </div>
      )}

      <div>
        <div className="w-11 h-11 rounded-lg flex items-center justify-center mb-4 border"
          style={{ background: accentBg, borderColor: accentBorder }}>
          <CardIcon size={22} style={{ color: accentColor }} aria-hidden="true" />
        </div>

        <h3 className="text-base font-bold text-[var(--text-primary)] font-mono mb-2 group-hover:text-[var(--color-eloran)] transition">
          {title}
        </h3>

        <p className="text-sm text-[var(--text-secondary)] leading-relaxed font-sans mb-4">
          {description}
        </p>

        <ul className="space-y-1.5" aria-label="Features">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-xs text-[var(--text-dim)] font-mono">
              <CheckCircle2 size={12} style={{ color: accentColor }} className="mt-0.5 shrink-0" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <Link
        to={to}
        className="mt-6 inline-flex items-center gap-1.5 text-xs font-mono font-semibold transition-all group-hover:gap-2.5"
        style={{ color: accentColor }}
        aria-label={`Open ${title}`}
      >
        Open module <ArrowRight size={13} aria-hidden="true" />
      </Link>
    </article>
  );
}

function PresetCard({ preset, isCurrent, onLaunchEloran, onLaunchLoranC }) {
  const meta = statusMeta[preset.status] || statusMeta.synthetic;
  return (
    <article
      className={`panel-card flex flex-col p-4 transition-all duration-200 ${
        isCurrent ? 'shadow-[0_0_20px_var(--glow-eloran)] border-cyan-500/60' : 'hover:border-[var(--surface-muted)]'
      }`}
      aria-current={isCurrent ? 'true' : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`pill ${meta.cls}`}>{meta.label}</span>
        <span className="text-[10px] font-mono text-[var(--text-dim)]">
          {preset.masters.length}M · {preset.slaves.length}S
        </span>
      </div>

      <h4 className="font-mono font-bold text-sm text-[var(--text-primary)] mb-1.5 leading-tight">
        {preset.name}
      </h4>

      <p className="text-xs text-[var(--text-dim)] leading-relaxed flex-1 line-clamp-3 font-sans">
        {preset.description}
      </p>

      <div className="mt-4 pt-3 border-t border-[var(--surface-border)] grid grid-cols-2 gap-1.5">
        <button
          onClick={onLaunchEloran}
          className="py-1.5 px-2 rounded text-xs font-mono font-semibold transition text-center border"
          style={{ background: 'rgba(6,182,212,0.08)', color: 'var(--color-eloran)', borderColor: 'rgba(6,182,212,0.25)' }}
        >
          eLoran
        </button>
        <button
          onClick={onLaunchLoranC}
          className="py-1.5 px-2 rounded text-xs font-mono font-semibold transition text-center border border-[var(--surface-border)] text-[var(--text-secondary)] hover:border-[var(--surface-muted)] hover:text-[var(--text-primary)]"
        >
          Loran-C
        </button>
      </div>
    </article>
  );
}

/* ── Page ─────────────────────────────────────────────── */
export default function Home() {
  const navigate = useNavigate();
  const { activePresetId, loadPreset } = useSimulationStore();

  const handleLaunchPreset = (presetId, destination) => {
    loadPreset(presetId);
    navigate(destination);
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)]" style={{ background: 'var(--surface-base)' }}>

      {/* ── Hero ─────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-[var(--surface-border)]"
        style={{ background: 'linear-gradient(180deg, var(--surface-layer) 0%, var(--surface-base) 100%)' }}>

        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            backgroundImage: 'linear-gradient(to right, #1e2a33 1px, transparent 1px), linear-gradient(to bottom, #1e2a33 1px, transparent 1px)',
            backgroundSize: '3rem 3rem',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, #000 60%, transparent 100%)',
          }}
          aria-hidden="true"
        />

        {/* Scanline shimmer */}
        <div className="scanlines absolute inset-0 pointer-events-none opacity-20" aria-hidden="true" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-8 py-20 sm:py-28 text-center">
          <HeroBadge>
            <Zap size={11} className="animate-pulse" aria-hidden="true" />
            TERRESTRIAL RADIO NAVIGATION SIMULATION
          </HeroBadge>

          <h1 className="animate-fade-up mt-6 text-5xl sm:text-7xl font-black tracking-tight font-mono"
            style={{ color: 'var(--text-primary)' }}>
            LORAN<span style={{ color: 'var(--color-eloran)' }}>&nbsp;LAB</span>
          </h1>

          <p className="animate-fade-up-delay-1 mt-5 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed"
            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
            High-fidelity simulation of 100&thinsp;kHz Loran-C and modernized eLoran systems.
            Explore hyperbolic TDOA geometry, GDOP heatmaps, atomic clock drift, Additional Secondary
            Factors (ASF), and GNSS-resilient assured PNT.
          </p>

          <div className="animate-fade-up-delay-2 mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/eloran"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-mono font-bold text-sm transition-all shadow-[0_0_24px_var(--glow-eloran)] hover:shadow-[0_0_36px_var(--glow-eloran)]"
              style={{ background: 'var(--color-eloran)', color: '#080b0e' }}
            >
              <Compass size={17} aria-hidden="true" /> eLoran Simulator <ArrowRight size={15} aria-hidden="true" />
            </Link>

            <Link
              to="/loran-c"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-mono font-semibold text-sm transition-all border"
              style={{ background: 'var(--surface-card)', color: 'var(--color-loran-c)', borderColor: 'rgba(245,158,11,0.35)' }}
            >
              <Radio size={17} aria-hidden="true" /> Loran-C LOPs
            </Link>

            <Link
              to="/waveforms"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-mono font-semibold text-sm transition-all border border-[var(--surface-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--surface-muted)]"
              style={{ background: 'var(--surface-card)' }}
            >
              <Activity size={17} aria-hidden="true" /> RF Oscilloscope
            </Link>
          </div>
        </div>
      </section>

      {/* ── Core Modules ──────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
        <div className="text-[10px] font-mono uppercase tracking-widest mb-6" style={{ color: 'var(--text-dim)' }}>
          Core Simulation Modules
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <ModuleCard
            icon={Radio}
            title="Loran-C · LOPs & GDOP"
            description="Master and secondary chains. Hyperbolic Lines of Position, baseline singularities, Gauss-Newton receiver fixes, and real-time 2D GDOP heatmaps."
            features={[
              'Hyperbolic TDOA marching-squares grid',
              'Full CSV chain import & export',
              'Draggable receiver fix with error ellipse',
            ]}
            to="/loran-c"
            accent="loran-c"
          />
          <ModuleCard
            icon={Compass}
            title="eLoran · Assured PNT"
            description="Next-generation terrestrial PNT. Rubidium, Cesium, and GPSDO clock drift, ASF groundwave delays, Eurofix 9th-pulse LDC data channel, and GNSS-denied fusion."
            features={[
              'Pseudorange solver: 2D position + clock bias',
              'Allan deviation / ITU G.811 noise model',
              'Eurofix 9th-pulse 3-state PPM encoding',
            ]}
            to="/eloran"
            accent="eloran"
            badge="Modern PNT"
          />
          <ModuleCard
            icon={Activity}
            title="100 kHz RF Waveform Lab"
            description="Interactive oscilloscope displaying Loran-C 100 kHz pulsed RF carriers, raised-cosine envelopes, GRI timing, and 1-hop ionospheric skywave reflections with E/D-layer selection."
            features={[
              'Carrier & envelope at 100 kHz',
              'Per-station arrival delay offsets',
              'Physics-based 1-hop skywave (E/D layer)',
            ]}
            to="/waveforms"
            accent="eloran"
          />
        </div>
      </section>

      {/* ── Preset Scenarios ──────────────────────────── */}
      <section className="border-t border-[var(--surface-border)] py-16" style={{ background: 'var(--surface-layer)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-lg font-bold font-mono flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Globe size={18} style={{ color: 'var(--color-eloran)' }} aria-hidden="true" />
                Scenario Presets
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                Calibrated operational chains and synthetic testbeds — ready to simulate.
              </p>
            </div>
            <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
              Active:{' '}
              <span style={{ color: 'var(--color-eloran)' }} className="font-semibold">
                {PRESET_SCENARIOS[activePresetId]?.name?.split(' ').slice(0, 3).join(' ') || '—'}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {Object.values(PRESET_SCENARIOS).map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                isCurrent={preset.id === activePresetId}
                onLaunchEloran={() => handleLaunchPreset(preset.id, '/eloran')}
                onLaunchLoranC={() => handleLaunchPreset(preset.id, '/loran-c')}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Why eLoran ────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16 border-t border-[var(--surface-border)]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded border mb-4"
              style={{ color: 'var(--text-dim)', borderColor: 'var(--surface-border)', background: 'var(--surface-layer)' }}>
              <BookOpen size={11} style={{ color: 'var(--color-eloran)' }} aria-hidden="true" />
              Theoretical Foundations
            </span>

            <h2 className="text-2xl font-bold font-mono mb-4" style={{ color: 'var(--text-primary)' }}>
              Why eLoran Matters<br />
              <span style={{ color: 'var(--color-eloran)' }}>in the Satellite Era</span>
            </h2>

            <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
              GNSS signals propagate from 20,000 km altitude at milliwatt power levels, making them
              inherently vulnerable to jamming, spoofing, and solar weather. A single low-power jammer
              can deny navigation across hundreds of square kilometers.
            </p>
            <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
              eLoran operates at <strong style={{ color: 'var(--text-primary)' }}>100 kHz (LF)</strong> with
              megawatt-class pulse power propagating as terrestrial groundwaves. Its completely disassociated
              frequency band, sub-microsecond synchronization, and cycle-slip resilience make it the primary
              standard for Assured PNT backup worldwide.
            </p>

            <div className="flex items-center gap-4">
              <Link
                to="/learn"
                className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold transition-all hover:gap-2.5"
                style={{ color: 'var(--color-eloran)' }}
              >
                Theory & reference chapters <ArrowRight size={13} aria-hidden="true" />
              </Link>
              <span style={{ color: 'var(--surface-muted)' }}>·</span>
              <Link
                to="/about"
                className="text-xs font-mono transition"
                style={{ color: 'var(--text-dim)' }}
              >
                Specs & sources
              </Link>
            </div>
          </div>

          {/* Specs table */}
          <div className="panel-card p-6 font-mono space-y-3">
            <div className="text-[10px] uppercase tracking-widest pb-2 border-b border-[var(--surface-border)]"
              style={{ color: 'var(--text-dim)' }}>
              System Specifications
            </div>

            <SpecRow label="Carrier Frequency"     value="100.000 kHz"         accent="var(--color-eloran)" />
            <SpecRow label="Vacuum Speed of Light"  value="299,792,458 m/s"     accent="var(--text-primary)" />
            <SpecRow label="RTCM η (PF index)"      value="1.000338"            accent="var(--color-eloran)" />
            <SpecRow label="Pulse Envelope"         value="Raised Cosine 100 µs" accent="var(--color-ok)" />
            <SpecRow label="Carrier Cycle Period"   value="10 µs  (cycle-slip Δ ≈ 3 km)" accent="var(--color-warn)" />
            <SpecRow label="Cesium Freq. Stability" value="σ_y ≈ 1×10⁻¹³ /s"  accent="var(--color-eloran)" />
            <SpecRow label="Eurofix Data Rate"      value="9th-pulse PPM, 30 sym/frame" accent="var(--text-primary)" />

            <div className="pt-2 flex items-start gap-2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
              <AlertTriangle size={11} className="shrink-0 mt-0.5" style={{ color: 'var(--color-warn)' }} aria-hidden="true" />
              HPL figures are simplified k×σ estimates, not RTCM MPS integrity bounds.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
