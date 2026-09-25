import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('LORAN LAB ErrorBoundary caught exception:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="p-8 my-8 max-w-2xl mx-auto rounded-xl text-center shadow-2xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--status-danger-border)' }}
        >
          <div
            className="inline-flex p-3 rounded-full mb-4"
            style={{ background: 'var(--status-danger-subtle)', color: 'var(--status-danger)' }}
          >
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-xl font-bold font-mono mb-2" style={{ color: 'var(--text-primary)' }}>
            Simulation Subsystem Fault
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            An unhandled runtime error occurred in this module.
          </p>
          <pre
            className="text-xs text-left max-w-xl mx-auto p-4 rounded-lg font-mono overflow-x-auto"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--status-danger)' }}
          >
            {String(this.state.error?.stack || this.state.error)}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 font-semibold text-xs uppercase tracking-wider rounded-lg transition"
            style={{ background: 'var(--accent-eloran)', color: 'var(--bg-canvas)' }}
          >
            <RefreshCw size={14} /> Dismiss &amp; Reset
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
