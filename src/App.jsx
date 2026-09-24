import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import { Loader2 } from 'lucide-react';

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
    </div>
  );
}
