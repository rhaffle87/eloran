import React, { useState, useRef, useLayoutEffect } from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * Interactive hover/click InfoTooltip component
 * Renders a subtle ? icon that expands into a rich, backdrop-blurred card on hover/focus.
 * Automatically clamps horizontally to avoid clipping against sidebar or viewport edges.
 */
export function InfoTooltip({ content, text, children, title, align = 'center', className = '', size = 12 }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const popupRef = useRef(null);
  const [shiftX, setShiftX] = useState(0);
  const [flipY, setFlipY] = useState(false);
  const body = content || text || children;

  useLayoutEffect(() => {
    if (open && popupRef.current) {
      const rect = popupRef.current.getBoundingClientRect();
      const padding = 8;
      // Constrain within the closest scroll/sidebar container, or viewport
      const scrollParent = popupRef.current.closest('.overflow-y-auto') || popupRef.current.closest('[data-testid="sidebar-content"]') || document.body;
      const parentRect = scrollParent.getBoundingClientRect();
      const minLeft = Math.max(padding, parentRect.left + padding);
      const maxRight = Math.min(window.innerWidth - padding, parentRect.right - padding);

      let delta = 0;
      if (rect.right > maxRight) {
        delta = maxRight - rect.right;
      } else if (rect.left < minLeft) {
        delta = minLeft - rect.left;
      }
      setShiftX(delta);

      const minTop = Math.max(padding, parentRect.top + padding);
      if (rect.top < minTop) {
        setFlipY(true);
      } else {
        setFlipY(false);
      }
    } else {
      setShiftX(0);
      setFlipY(false);
    }
  }, [open]);

  if (!body) return null;

  const baseTranslate =
    align === 'right'
      ? '0px'
      : align === 'left'
      ? '0px'
      : '-50%';

  const alignClasses =
    align === 'right'
      ? 'right-0'
      : align === 'left'
      ? 'left-0'
      : 'left-1/2';

  const verticalClasses = flipY ? 'top-full mt-1.5' : 'bottom-full mb-1.5';

  const transformStyle = shiftX
    ? `translateX(calc(${baseTranslate} + ${shiftX}px))`
    : (baseTranslate !== '0px' ? `translateX(${baseTranslate})` : undefined);

  return (
    <span
      ref={containerRef}
      className={`relative inline-flex items-center text-[var(--text-dim)] hover:text-[var(--accent-eloran)] transition cursor-help select-none ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false);
        }
      }}
      tabIndex={0}
      role="tooltip"
      aria-label={typeof body === 'string' ? body : title || 'Info tooltip'}
    >
      <HelpCircle size={size} className="shrink-0 opacity-70 hover:opacity-100 transition-opacity" />
      {open && (
        <span
          ref={popupRef}
          className={`absolute ${verticalClasses} z-50 px-2.5 py-1.5 rounded-md text-[11px] font-sans font-normal leading-snug whitespace-normal w-max max-w-[240px] sm:max-w-[280px] pointer-events-none shadow-xl border animate-fade-in text-left normal-case tracking-normal ${alignClasses}`}
          style={{
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border-subtle)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
            transform: transformStyle,
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
