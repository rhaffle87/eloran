import React from 'react';

export default function Toggle({ label, checked, onChange, disabled = false, description }) {
  return (
    <label
      className={`flex items-start justify-between gap-3 cursor-pointer select-none ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div>
        <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
        {description && (
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-dim)' }}>{description}</div>
        )}
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
