import React, { useState, useEffect } from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';

export function EducationalDisclaimerBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('loran_edu_notice_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    setDismissed(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('loran_edu_notice_dismissed', 'true');
      }
    } catch {
      // ignore
    }
  };

  if (dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Educational Disclaimer"
      className="border-b px-4 py-1.5 text-xs font-mono flex items-center justify-between z-30 select-none"
      style={{
        background: 'var(--banner-edu-bg)',
        borderColor: 'var(--banner-edu-border)',
        color: 'var(--banner-edu-text)',
      }}
    >
      <div className="flex items-center gap-2 max-w-7xl mx-auto flex-1">
        <ShieldAlert size={14} className="shrink-0" style={{ color: 'var(--banner-edu-title)' }} />
        <span className="font-semibold" style={{ color: 'var(--banner-edu-title)' }}>EDUCATIONAL NOTICE:</span>
        <span className="text-[11px] hidden sm:inline" style={{ opacity: 0.9 }}>
          SIMULORAN is a scientific research and educational simulator. Not certified for real maritime navigation or safety-critical PNT operations.
        </span>
        <span className="text-[11px] sm:hidden" style={{ opacity: 0.9 }}>
          Educational simulator. Not for real navigation.
        </span>
      </div>
      <button
        onClick={handleDismiss}
        className="p-0.5 rounded transition opacity-80 hover:opacity-100 cursor-pointer"
        style={{ color: 'var(--banner-edu-title)' }}
        title="Dismiss notice"
        aria-label="Dismiss educational notice"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function SystemCapabilityBanner() {
  const [issues, setIssues] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== 'undefined' && (
        localStorage.getItem('loran_capability_notice_dismissed') === 'true' ||
        sessionStorage.getItem('loran_capability_notice_dismissed') === 'true'
      );
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    setDismissed(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('loran_capability_notice_dismissed', 'true');
        sessionStorage.setItem('loran_capability_notice_dismissed', 'true');
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const detected = [];

    // Test WebGL
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        detected.push('WebGL hardware acceleration is unavailable (Map rendering may fall back to CPU or 2D radar canvas).');
      }
    } catch {
      detected.push('Unable to initialize WebGL graphics context.');
    }

    // Test Web Workers
    if (typeof window.Worker === 'undefined') {
      detected.push('Web Workers are unavailable in this environment (Calculations will execute on the main thread).');
    }

    setIssues(detected);
  }, []);

  if (dismissed || issues.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="System Capability Degraded Warning"
      className="border-b px-4 py-2 text-xs font-mono flex items-center justify-between z-30 select-none"
      style={{
        background: 'var(--status-danger-subtle)',
        borderColor: 'var(--status-danger-border)',
        color: 'var(--status-danger)',
      }}
    >
      <div className="flex items-start gap-2 max-w-7xl mx-auto flex-1">
        <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--status-danger)' }} />
        <div>
          <span className="font-bold" style={{ color: 'var(--status-danger)' }}>SYSTEM CAPABILITY DEGRADED:</span>
          <ul className="list-disc list-inside text-[11px] mt-0.5 space-y-0.5" style={{ opacity: 0.9 }}>
            {issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="p-1 rounded cursor-pointer transition hover:opacity-75" style={{ color: 'var(--status-danger)' }}
        title="Dismiss warning"
        aria-label="Dismiss warning"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function MultiMasterWarningBanner({ masterCount }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== 'undefined' && sessionStorage.getItem('loran_multimaster_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    setDismissed(true);
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('loran_multimaster_dismissed', 'true');
      }
    } catch {
      // ignore
    }
  };

  if (dismissed || masterCount <= 1) return null;

  return (
    <div
      role="region"
      aria-label="Multi-Master Warning"
      className="border-b px-4 py-1.5 text-xs font-mono flex items-center justify-between z-30 select-none"
      style={{
        background: 'var(--banner-edu-bg)',
        borderColor: 'var(--banner-edu-border)',
        color: 'var(--banner-edu-text)',
      }}
    >
      <div className="flex items-center gap-2 max-w-7xl mx-auto flex-1">
        <AlertTriangle size={14} className="shrink-0" style={{ color: 'var(--banner-edu-title)' }} />
        <span className="font-semibold" style={{ color: 'var(--banner-edu-title)' }}>MULTI-MASTER LIMITATION:</span>
        <span className="text-[11px]">
          Scenario defines {masterCount} masters; only the first is used. Multi-chain scenarios are not yet supported.
        </span>
      </div>
      <button
        onClick={handleDismiss}
        className="p-0.5 rounded cursor-pointer transition hover:opacity-75" style={{ color: 'var(--banner-edu-title)' }}
        title="Dismiss warning"
        aria-label="Dismiss warning"
      >
        <X size={14} />
      </button>
    </div>
  );
}
