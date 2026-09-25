import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * High-performance, theme-safe KaTeX math renderer for LORAN LAB formulas.
 * Supports inline or display (block) mode.
 */
export default function MathView({ math, block = false, className = '' }) {
  const html = useMemo(() => {
    if (!math) return '';
    try {
      return katex.renderToString(math, {
        displayMode: block,
        throwOnError: false,
        strict: false,
      });
    } catch (err) {
      console.warn('KaTeX render notice:', err);
      return `<code class="font-mono">${math}</code>`;
    }
  }, [math, block]);

  return (
    <span
      className={`loran-math-display ${block ? 'block my-1.5' : 'inline-block'} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
