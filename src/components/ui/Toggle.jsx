import React from 'react';
import { InfoTooltip } from './Tooltip.jsx';

export default function Toggle({ label, checked, onChange, disabled = false, description, tooltip }) {
  const tipContent = description || tooltip;
  return (
    <label
      className={`flex items-center justify-between gap-3 cursor-pointer select-none py-1 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="flex items-center gap-1.5 flex-1 pr-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {tipContent && <InfoTooltip content={tipContent} align="left" size={13} />}
      </div>
      <div className="relative inline-flex items-center shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
          disabled={disabled}
        />
        <div
          className="w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"
          style={{
            background: checked ? 'var(--accent-eloran)' : 'var(--border-strong)',
          }}
        />
      </div>
    </label>
  );
}
