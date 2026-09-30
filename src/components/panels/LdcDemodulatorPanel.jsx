import React, { useState, useMemo } from 'react';
import {
  Radio,
  ShieldCheck,
  ShieldAlert,
  Zap,
  RotateCcw,
  Binary,
  Layers,
  HelpCircle,
} from 'lucide-react';
import {
  encodeLdcMessage,
  decodeLdcMessage,
  computePulseModulationOffsetUs,
  LDC_MODULATION_TYPES,
  PPM_STEP_US,
  EUROFIX_SHIFT_US,
  PULSE_SPACING_US,
  NINTH_PULSE_SPACING_US,
} from '../../lib/ldc.js';

export default function LdcDemodulatorPanel() {
  const [modType, setModType] = useState(LDC_MODULATION_TYPES.PPM_32);
  const [msgType, setMsgType] = useState(1);
  const [stationId, setStationId] = useState(6731);
  const [asfDeltaCm, setAsfDeltaCm] = useState(420); // +4.20 m
  const [epochSec, setEpochSec] = useState(128);
  const [activeSymbolIndex, setActiveSymbolIndex] = useState(0);
  const [corruptBit, setCorruptBit] = useState(false);

  // Encode message
  const encoded = useMemo(() => {
    return encodeLdcMessage({
      type: msgType,
      stationId,
      asfDeltaCm,
      epochSec,
    });
  }, [msgType, stationId, asfDeltaCm, epochSec]);

  // Optionally corrupt first symbol for parity validation demonstration
  const receivedSymbols = useMemo(() => {
    if (!corruptBit) return encoded.symbols;
    const modified = [...encoded.symbols];
    if (modified.length > 0) {
      modified[0] = (modified[0] ^ 0x01) & 0x1f; // Flip bit 0
    }
    return modified;
  }, [encoded.symbols, corruptBit]);

  // Decode message
  const decoded = useMemo(() => {
    return decodeLdcMessage(receivedSymbols);
  }, [receivedSymbols]);

  // Active symbol for pulse visualization
  const currentSymbol = receivedSymbols[activeSymbolIndex] ?? 0;

  // Pulse array (0 to 8)
  const pulses = useMemo(() => {
    const arr = [];
    let currentT = 0;
    for (let i = 0; i < 9; i++) {
      const nominalT = currentT;
      const offset = computePulseModulationOffsetUs(i, currentSymbol, modType);
      const actualT = nominalT + offset;
      arr.push({
        index: i,
        name: i === 8 ? '9th Pulse (LDC)' : `Pulse ${i + 1}`,
        nominalT,
        offset,
        actualT,
        isModulated: offset !== 0,
      });
      if (i < 7) {
        currentT += PULSE_SPACING_US;
      } else if (i === 7) {
        currentT += NINTH_PULSE_SPACING_US;
      }
    }
    return arr;
  }, [currentSymbol, modType]);

  return (
    <div
      className="p-5 rounded-xl space-y-6 shadow-sm font-sans"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--accent-eloran)]">
            <Radio size={14} /> Telemetry &amp; Data Channel Lab
          </div>
          <h2 className="text-xl font-bold font-mono text-[var(--text-primary)]">
            Loran Data Channel (LDC) &amp; Eurofix Demodulator
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            RTCM 10410.1 &amp; Eurofix LF pulse modulation, 32-PPM 9th-pulse encoding, and CRC-16 parity check.
          </p>
        </div>

        {/* Parity Status Badge */}
        <div className="flex items-center gap-2">
          {decoded.validParity ? (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold"
              style={{
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid var(--status-ok)',
                color: 'var(--status-ok)',
              }}
            >
              <ShieldCheck size={14} /> CRC-16 VERIFIED
            </div>
          ) : (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid var(--status-error)',
                color: 'var(--status-error)',
              }}
            >
              <ShieldAlert size={14} /> CRC-16 PARITY ERROR
            </div>
          )}

          <button
            onClick={() => setCorruptBit(!corruptBit)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer"
            style={{
              background: corruptBit ? 'var(--status-error)' : 'var(--bg-subtle)',
              color: corruptBit ? '#ffffff' : 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
            title="Inject bit flip into symbol 0 to test parity rejection"
          >
            <Zap size={13} />
            {corruptBit ? 'Clear Injected Error' : 'Inject Bit Flip'}
          </button>
        </div>
      </div>

      {/* Control Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Modulation Scheme */}
        <div className="p-3.5 rounded-lg space-y-2" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
          <label className="block text-xs font-mono font-bold text-[var(--text-secondary)] uppercase">
            Modulation Standard
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <button
              onClick={() => setModType(LDC_MODULATION_TYPES.PPM_32)}
              className="py-1.5 px-2 rounded font-bold transition text-center cursor-pointer"
              style={
                modType === LDC_MODULATION_TYPES.PPM_32
                  ? { background: 'var(--accent-eloran)', color: 'var(--btn-eloran-text)' }
                  : { background: 'var(--bg-surface)', color: 'var(--text-dim)', border: '1px solid var(--border-subtle)' }
              }
            >
              32-PPM (9th)
            </button>
            <button
              onClick={() => setModType(LDC_MODULATION_TYPES.EUROFIX)}
              className="py-1.5 px-2 rounded font-bold transition text-center cursor-pointer"
              style={
                modType === LDC_MODULATION_TYPES.EUROFIX
                  ? { background: 'var(--accent-loran-c)', color: 'var(--btn-loran-text)' }
                  : { background: 'var(--bg-surface)', color: 'var(--text-dim)', border: '1px solid var(--border-subtle)' }
              }
            >
              Eurofix (3-8)
            </button>
          </div>
          <div className="text-[11px] text-[var(--text-dim)] pt-1">
            {modType === LDC_MODULATION_TYPES.PPM_32
              ? `eLoran 9th pulse: ${PPM_STEP_US} µs steps (-18.75 to +20.0 µs)`
              : `Eurofix: ±${EUROFIX_SHIFT_US} µs tri-state shift on pulses 3-8`}
          </div>
        </div>

        {/* Message Type */}
        <div className="p-3.5 rounded-lg space-y-2" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
          <label className="block text-xs font-mono font-bold text-[var(--text-secondary)] uppercase">
            Payload Type (4-bit)
          </label>
          <select
            value={msgType}
            onChange={(e) => setMsgType(Number(e.target.value))}
            className="w-full text-xs font-mono p-2 rounded"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <option value={1}>Type 1: Differential ASF Delta</option>
            <option value={2}>Type 2: UTC / Leap Second</option>
            <option value={3}>Type 3: Station Health &amp; Almanac</option>
            <option value={4}>Type 4: Meteorological Warnings</option>
          </select>
          <div className="text-[11px] text-[var(--text-dim)]">
            Station ID: <span className="font-bold text-[var(--text-primary)]">{stationId}</span>
          </div>
        </div>

        {/* Differential ASF Correction */}
        <div className="p-3.5 rounded-lg space-y-2" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="font-bold text-[var(--text-secondary)] uppercase">d-Loran ASF Delta</span>
            <span className="font-bold text-[var(--accent-eloran)]">
              {(asfDeltaCm / 100).toFixed(2)} m ({asfDeltaCm} cm)
            </span>
          </div>
          <input
            type="range"
            min={-1500}
            max={1500}
            step={10}
            value={asfDeltaCm}
            onChange={(e) => setAsfDeltaCm(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--accent-eloran)]"
          />
          <div className="flex justify-between text-[10px] text-[var(--text-dim)] font-mono">
            <span>-15.0 m</span>
            <span>0 m</span>
            <span>+15.0 m</span>
          </div>
        </div>

        {/* Station ID & Epoch */}
        <div className="p-3.5 rounded-lg space-y-2" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
          <label className="block text-xs font-mono font-bold text-[var(--text-secondary)] uppercase">
            Station ID &amp; Epoch
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-[var(--text-dim)] font-mono block">Station ID</span>
              <input
                type="number"
                value={stationId}
                onChange={(e) => setStationId(Number(e.target.value))}
                className="w-full text-xs font-mono p-1.5 rounded"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-dim)] font-mono block">Epoch Sec</span>
              <input
                type="number"
                value={epochSec}
                onChange={(e) => setEpochSec(Number(e.target.value))}
                className="w-full text-xs font-mono p-1.5 rounded"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Symbol Stream */}
      <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-[var(--text-primary)]">
            <Binary size={14} className="text-[var(--accent-eloran)]" />
            <span>Transmitted Frame Symbols (5-bit chunks, Total 11 Symbols)</span>
          </div>
          <div className="text-[11px] font-mono text-[var(--text-dim)]">
            Click any symbol below to preview GRI pulse modulation
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-11 gap-2">
          {receivedSymbols.map((sym, idx) => {
            const isSelected = idx === activeSymbolIndex;
            const shiftUs = (sym - 15) * PPM_STEP_US;
            return (
              <button
                key={idx}
                onClick={() => setActiveSymbolIndex(idx)}
                className="p-2.5 rounded-lg text-center font-mono transition cursor-pointer"
                style={{
                  background: isSelected
                    ? 'var(--accent-eloran)'
                    : idx === 0 && corruptBit
                    ? 'rgba(239, 68, 68, 0.2)'
                    : 'var(--bg-surface)',
                  border: isSelected
                    ? '1px solid var(--accent-eloran)'
                    : idx === 0 && corruptBit
                    ? '1px solid var(--status-error)'
                    : '1px solid var(--border-subtle)',
                  color: isSelected ? 'var(--btn-eloran-text)' : 'var(--text-primary)',
                }}
              >
                <div className="text-[10px] text-[var(--text-dim)]" style={{ color: isSelected ? 'var(--btn-eloran-text)' : undefined }}>
                  Sym #{idx + 1}
                </div>
                <div className="text-base font-bold my-0.5">
                  {sym}
                </div>
                <div className="text-[9px] opacity-80">
                  {shiftUs >= 0 ? `+${shiftUs.toFixed(1)}` : shiftUs.toFixed(1)} µs
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Real-time GRI Pulse Modulated Waveform Timeline (SVG) */}
      <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex justify-between items-center text-xs font-mono">
          <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
            <Layers size={14} className="text-[var(--accent-eloran)]" />
            <span>GRI Pulse Group Modulation Envelope Timeline</span>
          </div>
          <div className="text-[11px] text-[var(--text-dim)]">
            Displaying Symbol #{activeSymbolIndex + 1} ({currentSymbol}) &bull; Modulation:{' '}
            <span className="font-bold text-[var(--accent-eloran)]">
              {pulses[8].offset >= 0 ? `+${pulses[8].offset.toFixed(2)}` : pulses[8].offset.toFixed(2)} µs
            </span>
          </div>
        </div>

        {/* SVG Pulse Train */}
        <div className="w-full overflow-x-auto py-2">
          <svg viewBox="0 0 1000 140" className="w-full h-36 min-w-[700px] select-none font-mono text-[10px]">
            {/* Background Grid */}
            <line x1="40" y1="100" x2="980" y2="100" stroke="var(--border-subtle)" strokeWidth="1.5" />

            {/* Time ticks every 1000 µs */}
            {[0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 9000].map((t, idx) => {
              const x = 50 + (t / 9500) * 900;
              return (
                <g key={idx}>
                  <line x1={x} y1="95" x2={x} y2="105" stroke="var(--text-dim)" strokeWidth="1" />
                  <text x={x} y="120" textAnchor="middle" fill="var(--text-dim)">
                    {t} µs
                  </text>
                </g>
              );
            })}

            {/* Pulses */}
            {pulses.map((p) => {
              const nominalX = 50 + (p.nominalT / 9500) * 900;
              const actualX = 50 + (p.actualT / 9500) * 900;
              const isNinth = p.index === 8;
              const isModulated = p.isModulated;

              return (
                <g key={p.index}>
                  {/* Nominal Ghost if modulated */}
                  {isModulated && (
                    <path
                      d={`M ${nominalX - 12} 100 Q ${nominalX} 35 ${nominalX + 12} 100`}
                      fill="none"
                      stroke="var(--text-dim)"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                      opacity="0.6"
                    />
                  )}

                  {/* Modulated Pulse Peak */}
                  <path
                    d={`M ${actualX - 14} 100 Q ${actualX} ${isNinth ? 20 : 35} ${actualX + 14} 100`}
                    fill={isNinth ? 'rgba(6, 182, 212, 0.25)' : isModulated ? 'rgba(234, 179, 8, 0.25)' : 'rgba(148, 163, 184, 0.15)'}
                    stroke={isNinth ? 'var(--accent-eloran)' : isModulated ? 'var(--accent-loran-c)' : 'var(--text-dim)'}
                    strokeWidth={isNinth ? 2.5 : 1.5}
                  />

                  {/* Label */}
                  <text
                    x={actualX}
                    y={isNinth ? 15 : 30}
                    textAnchor="middle"
                    fill={isNinth ? 'var(--accent-eloran)' : 'var(--text-primary)'}
                    fontWeight={isNinth ? 'bold' : 'normal'}
                  >
                    {isNinth ? 'P9 (LDC)' : `P${p.index + 1}`}
                  </text>

                  {/* Shift indication text */}
                  {isModulated && (
                    <text
                      x={actualX}
                      y="50"
                      textAnchor="middle"
                      fill={isNinth ? 'var(--accent-eloran)' : 'var(--accent-loran-c)'}
                      fontSize="9"
                      fontWeight="bold"
                    >
                      {p.offset >= 0 ? `+${p.offset.toFixed(2)}` : p.offset.toFixed(2)} µs
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Decoded Telemetry Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
        <div className="p-3 rounded-lg" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
          <div className="text-[11px] text-[var(--text-dim)]">Decoded Station ID</div>
          <div className="text-base font-bold text-[var(--text-primary)] mt-1">
            {decoded.validParity ? decoded.stationId : 'CORRUPTED'}
          </div>
        </div>

        <div className="p-3 rounded-lg" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
          <div className="text-[11px] text-[var(--text-dim)]">Decoded d-Loran ASF Delta</div>
          <div className="text-base font-bold mt-1" style={{ color: 'var(--accent-eloran)' }}>
            {decoded.validParity ? `${decoded.asfDeltaMeters?.toFixed(2)} m` : 'INVALID'}
          </div>
        </div>

        <div className="p-3 rounded-lg" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
          <div className="text-[11px] text-[var(--text-dim)]">Raw Packet Bytes (Hex)</div>
          <div className="text-xs font-bold text-[var(--text-primary)] mt-1 truncate" title={encoded.hex}>
            {encoded.hex}
          </div>
        </div>

        <div className="p-3 rounded-lg" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
          <div className="text-[11px] text-[var(--text-dim)]">CRC-16 Checksum</div>
          <div className="text-xs font-bold mt-1">
            <span className="text-[var(--text-primary)]">0x{decoded.receivedCrc?.toString(16).toUpperCase().padStart(4, '0')}</span>
            {' vs '}
            <span style={{ color: decoded.validParity ? 'var(--status-ok)' : 'var(--status-error)' }}>
              0x{decoded.computedCrc?.toString(16).toUpperCase().padStart(4, '0')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
