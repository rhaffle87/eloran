import React, { useState } from 'react';
import { Layers, Radio, Settings, Navigation, ChevronLeft, ChevronRight } from 'lucide-react';
import MapView from '../components/map/MapView.jsx';
import StationEditor from '../components/panels/StationEditor.jsx';
import DisplayPanel from '../components/panels/DisplayPanel.jsx';
import { useSimulationStore } from '../state/simulationStore.js';

export default function LoranC() {
  const [activeTab, setActiveTab] = useState('stations'); // 'stations' | 'display'
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { mapMode, setMapMode, addStation, evaluateReceivers } = useSimulationStore();

  const handleMapClick = (lngLat) => {
    if (mapMode === 'add-master') {
      addStation({
        role: 'master',
        label: `M${Date.now().toString().slice(-3)}`,
        lat: lngLat.lat,
        lng: lngLat.lng,
        txDbm: 20,
        griMs: 1000,
        offsetSec: 0,
      });
      setMapMode('pan');
      setTimeout(() => evaluateReceivers(), 50);
    } else if (mapMode === 'add-slave') {
      addStation({
        role: 'slave',
        label: `S${Date.now().toString().slice(-3)}`,
        lat: lngLat.lat,
        lng: lngLat.lng,
        txDbm: 18,
        griMs: 1000,
        offsetSec: 0.015,
      });
      setMapMode('pan');
      setTimeout(() => evaluateReceivers(), 50);
    } else if (mapMode === 'add-receiver') {
      addStation({
        role: 'receiver',
        label: `R${Date.now().toString().slice(-3)}`,
        lat: lngLat.lat,
        lng: lngLat.lng,
        fuseMode: 'eLoran',
      });
      setMapMode('pan');
      setTimeout(() => evaluateReceivers(), 50);
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] flex overflow-hidden bg-zinc-950 font-sans">
      {/* Map is the Hero */}
      <div className="flex-1 relative h-full">
        <MapView onMapClick={handleMapClick} isELoran={false} />

        {/* Mode toolbar overlay on map */}
        <div className="absolute top-4 right-4 z-20 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-lg p-1 flex items-center gap-1 shadow-2xl font-mono text-xs">
          <button
            onClick={() => setMapMode('pan')}
            className={`px-3 py-1.5 rounded-md transition ${
              mapMode === 'pan'
                ? 'bg-cyan-500 text-black font-bold'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            }`}
            title="Pan & Inspect (Shortkey: P)"
          >
            Pan (P)
          </button>
          <button
            onClick={() => setMapMode('add-master')}
            className={`px-3 py-1.5 rounded-md transition ${
              mapMode === 'add-master'
                ? 'bg-cyan-400 text-black font-bold'
                : 'text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800'
            }`}
            title="Click map to place Master station (Shortkey: M)"
          >
            +Master (M)
          </button>
          <button
            onClick={() => setMapMode('add-slave')}
            className={`px-3 py-1.5 rounded-md transition ${
              mapMode === 'add-slave'
                ? 'bg-amber-400 text-black font-bold'
                : 'text-zinc-400 hover:text-amber-300 hover:bg-zinc-800'
            }`}
            title="Click map to place Secondary station (Shortkey: S)"
          >
            +Secondary (S)
          </button>
          <button
            onClick={() => setMapMode('add-receiver')}
            className={`px-3 py-1.5 rounded-md transition ${
              mapMode === 'add-receiver'
                ? 'bg-emerald-400 text-black font-bold'
                : 'text-zinc-400 hover:text-emerald-300 hover:bg-zinc-800'
            }`}
            title="Click map to place Receiver (Shortkey: R)"
          >
            +Receiver (R)
          </button>
        </div>
      </div>

      {/* Collapsible Left Console Drawer */}
      <div
        className={`relative z-30 transition-all duration-300 ease-in-out border-l border-zinc-800 bg-zinc-900/95 backdrop-blur-md flex flex-col ${
          sidebarOpen ? 'w-96' : 'w-0 border-l-0 overflow-hidden'
        }`}
      >
        {/* Toggle Collapse Tab */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -left-7 top-4 z-40 bg-zinc-900 border border-zinc-800 border-r-0 text-zinc-400 hover:text-zinc-100 p-1.5 rounded-l-md shadow-xl transition"
          title={sidebarOpen ? 'Collapse console' : 'Expand console'}
        >
          {sidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {sidebarOpen && (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Console Header & Tabs */}
            <div className="p-4 border-b border-zinc-800 bg-zinc-950/60">
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono font-bold text-xs uppercase tracking-widest text-cyan-400 flex items-center gap-2">
                  <Radio size={14} /> Loran-C Console
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">100 kHz LOP Engine</span>
              </div>

              <div className="flex border border-zinc-800 rounded-lg p-0.5 bg-zinc-950 font-mono text-xs">
                <button
                  onClick={() => setActiveTab('stations')}
                  className={`flex-1 py-1.5 rounded text-center transition ${
                    activeTab === 'stations'
                      ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Stations
                </button>
                <button
                  onClick={() => setActiveTab('display')}
                  className={`flex-1 py-1.5 rounded text-center transition ${
                    activeTab === 'display'
                      ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Layers & Mesh
                </button>
              </div>
            </div>

            {/* Panel Content Scroll Container */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'stations' && <StationEditor isELoran={false} />}
              {activeTab === 'display' && <DisplayPanel isELoran={false} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
