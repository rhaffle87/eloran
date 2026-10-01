export const BASE_URL = 'https://simuloran.vercel.app';

export const ROUTE_METADATA = {
  '/': {
    title: 'SIMULORAN — Loran-C & eLoran Hyperbolic Radionavigation Simulator',
    description: 'Interactive Loran-C and eLoran radio navigation engineering simulator. Real-time TDOA hyperbolic LOP calculation, live GDOP analysis, pseudorange solver with clock bias, differential corrections (ASF), and 100 kHz RF waveform synthesis.',
    breadcrumbName: 'Home',
    schemaType: 'WebApplication',
  },
  '/loran-c': {
    title: 'Loran-C Hyperbolic Multilateration Simulator — SIMULORAN',
    description: 'Explore hyperbolic Lines of Position (LOP), baseline extension singularities, Gauss-Newton receiver position fixes, and real-time 2D GDOP heatmaps for 100 kHz Loran-C chains.',
    breadcrumbName: 'Loran-C Classic',
    schemaType: 'WebApplication',
  },
  '/eloran': {
    title: 'eLoran Precision Suite (ASF, d-Loran, EKF, PNT Fusion) — SIMULORAN',
    description: 'Next-generation sovereign terrestrial PNT testbed. High-fidelity Additional Secondary Factor (ASF) ground conductivity models, differential eLoran (d-Loran), 6-state kinematic EKF, and resilient GNSS backup fusion.',
    breadcrumbName: 'eLoran Precision Suite',
    schemaType: 'WebApplication',
  },
  '/waveforms': {
    title: '100 kHz RF Waveform & Cycle Selection Lab — SIMULORAN',
    description: 'Interactive dual-channel digital oscilloscope, USCG pulse synthesis, ionospheric skywave multipath separation, Phase Code Interval (PCI) coding, and Boyce (2006) envelope-to-cycle discrepancy (ECD) wrong-cycle risk modeling.',
    breadcrumbName: 'RF Waveform Lab',
    schemaType: 'WebApplication',
  },
  '/learn': {
    title: 'Radionavigation Theory & Mathematical Formulations — SIMULORAN',
    description: 'Comprehensive engineering documentation and mathematical derivations: Sommerfeld numerical distance, Millington mixed-path groundwave phase propagation, Bancroft closed-form TDOA, and Kalman filtering for assured PNT.',
    breadcrumbName: 'Theory & Formulations',
    schemaType: 'TechArticle',
  },
  '/about': {
    title: 'System Specifications & Empirical Provenance — SIMULORAN',
    description: 'Architectural overview, scientific references, field benchmark datasets (Korea Port eLoran trials, Maoming field trials), and provenance specifications for the SIMULORAN radionavigation simulator.',
    breadcrumbName: 'About & Provenance',
    schemaType: 'AboutPage',
  },
};
