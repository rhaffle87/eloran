import React from 'react';
import { X } from 'lucide-react';

export default function Modal({
  open,
  title = '',
  message = '',
  type = 'info',
  value = '',
  onChange,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div
        className="rounded-xl shadow-2xl max-w-md w-full p-5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
      >
        <div className="flex items-center justify-between pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 className="font-semibold text-lg tracking-wide font-mono" style={{ color: 'var(--accent-eloran)' }}>
            {title}
          </h3>
          <button
            onClick={onCancel}
            className="p-1 rounded-md transition"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close modal"
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-muted)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <X size={18} />
          </button>
        </div>

        {message && (
          <div className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {message}
          </div>
        )}

        {type === 'prompt' && (
          <div className="mt-4">
            <input
              autoFocus
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono focus:outline-hidden"
              style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition"
            style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm?.(value)}
            className="px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition font-mono"
            style={{ background: 'var(--accent-eloran)', color: 'var(--bg-canvas)', border: '1px solid transparent' }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
