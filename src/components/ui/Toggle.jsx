import React from 'react';

export default function Toggle({ label, checked, onChange, disabled = false, description }) {
  return (
    <label className={`flex items-start justify-between gap-3 cursor-pointer select-none ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div>
        <div className="text-xs font-medium text-zinc-200">{label}</div>
        {description && <div className="text-[10px] text-zinc-400 mt-0.5">{description}</div>}
      </div>
      <div className="relative inline-flex items-center shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
          disabled={disabled}
        />
        <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
      </div>
    </label>
  );
}
