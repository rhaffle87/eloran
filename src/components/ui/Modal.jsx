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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl max-w-md w-full p-5 text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <h3 className="font-semibold text-lg tracking-wide text-cyan-400 font-mono">{title}</h3>
          <button
            onClick={onCancel}
            className="text-zinc-400 hover:text-zinc-100 p-1 rounded-md hover:bg-zinc-800 transition"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {message && <div className="mt-3 text-sm text-zinc-300 leading-relaxed">{message}</div>}

        {type === 'prompt' && (
          <div className="mt-4">
            <input
              autoFocus
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-hidden focus:border-cyan-500 font-mono"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm?.(value)}
            className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-black bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-sm shadow-cyan-500/20 transition font-mono"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
