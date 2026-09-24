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
        <div className="p-8 my-8 max-w-2xl mx-auto bg-zinc-900 border border-red-500/30 rounded-xl text-center shadow-2xl">
          <div className="inline-flex p-3 rounded-full bg-red-500/10 text-red-400 mb-4">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-xl font-bold text-zinc-100 font-mono mb-2">Simulation Subsystem Fault</h2>
          <p className="text-sm text-zinc-400 mb-4">
            An unhandled runtime error occurred in this module.
          </p>
          <pre className="text-xs text-left max-w-xl mx-auto p-4 bg-zinc-950 border border-zinc-800 rounded-lg text-red-300 font-mono overflow-x-auto">
            {String(this.state.error?.stack || this.state.error)}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs uppercase tracking-wider rounded-lg transition"
          >
            <RefreshCw size={14} /> Dismiss & Reset
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
