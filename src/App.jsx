import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import { EducationalDisclaimerBanner, SystemCapabilityBanner } from './components/ui/SystemBanners.jsx';
import { Loader2, Github, BookOpen } from 'lucide-react';

const Home      = lazy(() => import('./pages/Home.jsx'));
const LoranC    = lazy(() => import('./pages/LoranC.jsx'));
const ELoran    = lazy(() => import('./pages/ELoran.jsx'));
const Waveforms = lazy(() => import('./pages/Waveforms.jsx'));
const Learn     = lazy(() => import('./pages/Learn.jsx'));
const About     = lazy(() => import('./pages/About.jsx'));

function PageLoader() {
  return (
    <div
      className="w-full h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center gap-3"
      style={{ background: 'var(--surface-base)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}
    >
      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-eloran)' }} />
      <span className="text-[11px] uppercase tracking-widest">Initializing Simulation Subsystem…</span>
    </div>
  );
}

export default function App() {
  return (
    <div
      className="min-h-screen flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200"
      style={{ background: 'var(--surface-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
    >
      <EducationalDisclaimerBanner />
      <SystemCapabilityBanner />
      <Navbar />

      <main className="flex-1 flex flex-col">
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/"           element={<Home />} />
              <Route path="/loran-c"    element={<LoranC />} />
              <Route path="/eloran"     element={<ELoran />} />
              <Route path="/waveforms"  element={<Waveforms />} />
              <Route path="/learn"      element={<Learn />} />
              <Route path="/about"      element={<About />} />
              <Route path="*"           element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer
        className="border-t py-4 px-4 text-xs font-mono"
        style={{ background: 'var(--surface-layer)', borderColor: 'var(--surface-border)', color: 'var(--text-dim)' }}
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>LORAN LAB v1</span>
            <span style={{ color: 'var(--surface-muted)' }}>·</span>
            <span className="text-[10px]">Educational simulator — not for navigation or safety-critical use</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <Link
              to="/learn"
              className="hover:text-[var(--text-primary)] transition flex items-center gap-1"
              style={{ color: 'var(--text-dim)' }}
            >
              <BookOpen size={11} aria-hidden="true" /> Theory
            </Link>
            <Link
              to="/about"
              className="hover:text-[var(--text-primary)] transition"
              style={{ color: 'var(--text-dim)' }}
            >
              Specs
            </Link>
            <a
              href="https://github.com/rhaffle87/eloran"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-primary)] transition flex items-center gap-1"
              style={{ color: 'var(--text-dim)' }}
            >
              <Github size={11} aria-hidden="true" /> GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
