/**
 * Empirical Field Trial Benchmark Datasets for SIMULORAN
 * 
 * Sourced directly from peer-reviewed publications with confirmed provenance:
 * 1. Korean Nationwide eLoran Testbed Campaign (Rhee et al., 2021)
 *    Published in IEEE Access / arXiv:2108.06008. SOURCED in docs/PROVENANCE.md.
 * 2. Maoming Inland Mountainous Field Trial (Gao et al., 2025)
 *    Published in Sensors, 25(16), 5110; DOI: 10.3390/s25165110. SOURCED in docs/PROVENANCE.md.
 * 
 * Validation Tier Classification:
 * - Tier 1 (Raw streaming TOA pulse time-series logs): UNVERIFIED / Out-of-Scope (not published in open repositories).
 * - Tier 2 (Published empirical field measurement summary statistics): SOURCED & Verified.
 */

export const KOREA_TRIAL_2021 = {
  id: 'korea_trial_2021',
  name: 'Korean Nationwide eLoran Testbed (Rhee et al., 2021)',
  citation: 'Rhee, J. H., Kim, M., Son, P. W., & Seo, J. (2021). Enhanced Accuracy Simulator for a Future Korean Nationwide eLoran System. IEEE Access, 9, 116803–116814.',
  url: 'https://arxiv.org/abs/2108.06008',
  status: 'SOURCED',
  validationTier: 'Tier 2 (Published Empirical Summary Statistics)',
  description: 'Multi-station field evaluation measuring 95% repeatable horizontal positioning accuracy across 7 South Korean test locations receiving 4 transmitters (Pohang, Gwangju, Rongcheng, Xuancheng).',
  transmitters: [
    {
      id: 'pohang',
      label: 'Pohang (9930M)',
      role: 'master',
      // Coordinates: Rhee et al. (2021) Table 1 / Korean KRISO facility records
      lat: 36.184814,
      lng: 129.340944,
      txDbm: 26,
      griMs: 9930,
      chain: 'Korean Chain (GRI 9930)',
      estimatedJitterMeters: 2.11, // Rhee et al. Table 3 average (TOR measurement estimate)
    },
    {
      id: 'gwangju',
      label: 'Gwangju (9930W)',
      role: 'slave',
      // Coordinates: Rhee et al. (2021) Table 1
      lat: 35.040000,
      lng: 126.540833,
      txDbm: 26,
      griMs: 9930,
      chain: 'Korean Chain (GRI 9930)',
      estimatedJitterMeters: 3.21, // Rhee et al. Table 3 average (TOR measurement estimate)
    },
    {
      id: 'rongcheng',
      label: 'Rongcheng (7430M)',
      role: 'slave',
      // Coordinates: NGA Pub 117 (2023) Ch. 6 — 37°04'N 122°19'E → 37.066667°N, 122.316667°E
      // (matches bohai_yellow_sea_active preset; NOT sourced from Rhee Table 1 which lists Korean stations only)
      lat: 37.066667,
      lng: 122.316667,
      txDbm: 26,
      griMs: 7430,
      chain: 'North China Sea Chain (GRI 7430)',
      estimatedJitterMeters: 2.13, // Rhee et al. Table 3 average (TOR measurement estimate)
    },
    {
      id: 'xuancheng',
      label: 'Xuancheng (7430X)',
      role: 'slave',
      // Coordinates: NGA Pub 117 (2023) Ch. 6 — 31°04'N 118°53'E → 31.066667°N, 118.883333°E
      // (matches bohai_yellow_sea_active preset; NOT sourced from Rhee Table 1 which lists Korean stations only)
      lat: 31.066667,
      lng: 118.883333,
      txDbm: 26,
      griMs: 7430,
      chain: 'North China Sea Chain (GRI 7430)',
      estimatedJitterMeters: 5.38, // Rhee et al. Table 3 average (TOR measurement estimate)
    },
  ],
  // Table 5: Comparison of 95% repeatable accuracy [m] at seven locations in Korea
  sites: [
    {
      name: 'Incheon',
      lat: 37.4563,
      lng: 126.7052,
      measured95m: 10.16,
      rheeSim6mMeters: 20.83,
      rheeSim4mMeters: 14.04,
      rheeProposedMeters: 12.10,
    },
    {
      name: 'Pyeongtaek',
      lat: 36.9921,
      lng: 127.1129,
      measured95m: 8.72,
      rheeSim6mMeters: 18.19,
      rheeSim4mMeters: 12.24,
      rheeProposedMeters: 10.43,
    },
    {
      name: 'Dangjin',
      lat: 36.8932,
      lng: 126.6289,
      measured95m: 10.09,
      rheeSim6mMeters: 17.98,
      rheeSim4mMeters: 12.11,
      rheeProposedMeters: 8.67,
    },
    {
      name: 'Andong',
      lat: 36.5684,
      lng: 128.7294,
      measured95m: 12.73,
      rheeSim6mMeters: 22.41,
      rheeSim4mMeters: 15.36,
      rheeProposedMeters: 10.88,
    },
    {
      name: 'Gumi',
      lat: 36.1195,
      lng: 128.3443,
      measured95m: 8.87,
      rheeSim6mMeters: 20.94,
      rheeSim4mMeters: 14.28,
      rheeProposedMeters: 9.86,
    },
    {
      name: 'Jeonju',
      lat: 35.8242,
      lng: 127.1480,
      measured95m: 8.49,
      rheeSim6mMeters: 15.36,
      rheeSim4mMeters: 10.31,
      rheeProposedMeters: 6.88,
    },
    {
      name: 'Gwangju',
      lat: 35.1595,
      lng: 126.8526,
      measured95m: 12.13,
      rheeSim6mMeters: 18.61,
      rheeSim4mMeters: 12.84,
      rheeProposedMeters: 11.50,
    },
  ],
  // Table 2: Comparison of signal strength [dB(µV/m)] at 5 monitoring locations
  signalStrengthMeasurements: [
    { site: 'Incheon', pohangTxMeasuredDb: 56.25, gwangjuTxMeasuredDb: 57.45 },
    { site: 'Pyeongtaek', pohangTxMeasuredDb: 58.54, gwangjuTxMeasuredDb: 57.50 },
    { site: 'Okcheon', pohangTxMeasuredDb: 70.39, gwangjuTxMeasuredDb: 61.32 },
    { site: 'Gimcheon', pohangTxMeasuredDb: 75.04, gwangjuTxMeasuredDb: 59.56 },
    { site: 'Daegu', pohangTxMeasuredDb: 77.37, gwangjuTxMeasuredDb: 57.08 },
  ],
};

export const MAOMING_TRIAL_2025 = {
  id: 'maoming_trial_2025',
  name: 'Maoming Inland Geodesic Test (Gao et al., 2025)',
  citation: 'Gao, A., Ji, B., Wu, M., Chang, S., Zheng, G., Yu, D., & Li, W. (2025). Research on the Loran-C Pseudorange Positioning Method Based on an Ellipsoidal Geodesic Model and Its Application in Inland Areas. Sensors, 25(16), 5110.',
  url: 'https://doi.org/10.3390/s25165110',
  status: 'SOURCED',
  validationTier: 'Tier 2 (Published Empirical Summary Statistics)',
  location: {
    region: 'Maoming, Guangdong Province, China',
    terrain: 'Inland complex mountainous terrain',
    lat: 21.6630,
    lng: 110.9175,
  },
  publishedResults: {
    sphericalHyperbolaPositioningRmseMeters: 417.2,
    ellipsoidalPseudorangePositioningRmseMeters: 43.1,
    accuracyImprovementPercent: 89.7,
    coverageAreaImprovementPercent: '129.1% to 284.6%',
  },
  theoreticalMechanism: 'Spherical approximations distort great-circle arcs over long baselines (>500 km) and high elevations, introducing hundreds of meters of geometric projection error. Ellipsoidal geodesics (WGS84) eliminate this distortion, reducing positioning RMSE from 417.2m down to 43.1m.',
};
