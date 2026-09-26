import React, { useState, useRef } from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * Interactive hover/click InfoTooltip component
 * Renders a subtle ? icon that expands into a rich, backdrop-blurred card on hover/focus.
 */
export function InfoTooltip({ content, text, children, title, align = 'center', className = '', size = 12 }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const body = content || text || children;

  if (!body) return null;

  const alignClasses =
    align === 'right'
      ? 'right-0 translate-x-0'
      : align === 'left'
      ? 'left-0 translate-x-0'
      : 'left-1/2 -translate-x-1/2';

  return (
    <span
      ref={containerRef}
      className={`relative inline-flex items-center text-[var(--text-dim)] hover:text-[var(--accent-eloran)] transition cursor-help select-none ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      role="tooltip"
      aria-label={typeof body === 'string' ? body : title || 'Info tooltip'}
    >
      <HelpCircle size={size} className="shrink-0 opacity-70 hover:opacity-100 transition-opacity" />
      {open && (
        <span
          className={`absolute bottom-full mb-1.5 z-50 px-2.5 py-1.5 rounded-md text-[11px] font-sans font-normal leading-snug whitespace-normal w-max max-w-[240px] sm:max-w-[280px] pointer-events-none shadow-xl border animate-fade-in text-left normal-case tracking-normal ${alignClasses}`}
          style={{
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border-subtle)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
          }}
        >
          {title && (
            <span className="font-semibold block mb-0.5 text-[var(--accent-eloran)]">
              {title}
            </span>
          )}
          <span>{body}</span>
        </span>
      )}
    </span>
  );
}

export default InfoTooltip;
