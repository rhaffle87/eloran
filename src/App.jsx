import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import { EducationalDisclaimerBanner, SystemCapabilityBanner } from './components/ui/SystemBanners.jsx';
import { Loader2, ShieldCheck, Github, BookOpen } from 'lucide-react';

const Home = lazy(() => import('./pages/Home.jsx'));
const LoranC = lazy(() => import('./pages/LoranC.jsx'));
const ELoran = lazy(() => import('./pages/ELoran.jsx'));
const Waveforms = lazy(() => import('./pages/Waveforms.jsx'));
const Learn = lazy(() => import('./pages/Learn.jsx'));
const About = lazy(() => import('./pages/About.jsx'));

function PageLoader() {
  return (
    <div className="w-full h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 font-mono text-sm gap-3">
      <Loader2 size={32} className="animate-spin text-cyan-400" />
      <span className="tracking-widest text-xs uppercase text-zinc-500">
        Initializing Simulation Subsystem...
      </span>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      <EducationalDisclaimerBanner />
      <SystemCapabilityBanner />
      <Navbar />

      <main className="flex-1 flex flex-col">
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/loran-c" element={<LoranC />} />
              <Route path="/eloran" element={<ELoran />} />
              <Route path="/waveforms" element={<Waveforms />} />
              <Route path="/learn" element={<Learn />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Global Persistent Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950/80 backdrop-blur-md py-4 px-4 text-xs font-mono text-zinc-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="font-bold text-zinc-200">LORAN LAB v1.0</span>
            <span>•</span>
            <span className="text-[11px] text-zinc-500">
              Educational Simulator. Not for real navigation or safety-critical use.
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <Link to="/about" className="hover:text-cyan-400 transition">Specs & About</Link>
            <Link to="/learn" className="hover:text-cyan-400 transition">Theory</Link>
            <a
              href="https://github.com/rhaffle87/eloran"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-200 transition flex items-center gap-1"
            >
              <Github size={12} /> GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
