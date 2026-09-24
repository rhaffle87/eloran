import React from 'react';

export default function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  disabled = false,
  tooltip = '',
}) {
  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex justify-between items-center text-xs">
        <span className="text-zinc-300 font-medium" title={tooltip}>
          {label}
        </span>
        <span className="font-mono text-cyan-400 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[11px]">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-hidden"
      />
    </div>
  );
}
