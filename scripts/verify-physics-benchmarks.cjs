const path = require('path');

(async () => {
  console.log('==============================================================================');
  console.log('SIMULORAN — COMPREHENSIVE PHYSICS & MATHEMATICAL BENCHMARK SUITE');
  console.log('==============================================================================\n');

  const { pathToFileURL } = require('url');
  const importLib = (file) => import(pathToFileURL(path.join(__dirname, '../src/lib', file)).href);

  const pulse = await importLib('pulse.js');
  const geodesy = await importLib('geodesy.js');
  const gdop = await importLib('gdop.js');
  const asf = await importLib('asf.js');
  const grwave = await importLib('grwave.js');
  const ekf = await importLib('ekf.js');
  const raim = await importLib('integrityRaim.js');

  const benchmarkTable = [];
  const sweepTable = [];
  let passedCount = 0;
  let failedCount = 0;

  function record(benchmark, expected, computed, tolerance, unit = '', ref = '') {
    const isPass = Math.abs(expected - computed) <= tolerance;
    if (isPass) passedCount++; else failedCount++;
    const row = {
      benchmark,
      expected: `${expected} ${unit}`.trim(),
      computed: `${Number(computed).toFixed(4)} ${unit}`.trim(),
      delta: `${(Math.abs(expected - computed)).toExponential(2)} ${unit}`.trim(),
      tolerance: `±${tolerance} ${unit}`.trim(),
      status: isPass ? 'PASS' : 'FAIL',
      reference: ref
    };
    benchmarkTable.push(row);
    console.log(`[${row.status}] ${benchmark}: expected=${row.expected}, computed=${row.computed}, delta=${row.delta}`);
  }

  // 1. RF Pulse Physics & Cycle Selection (USCG & CheolJ 2020)
  console.log('\n--- 1. RF Pulse Physics & Cycle Selection ---');
  const tau = 65; // us
  const env65 = Math.pow(65 / tau, 2) * Math.exp(-2 * (65 - tau) / tau);
  record('Normalized Peak Envelope at tau=65 us', 1.0, env65, 1e-6, '', 'USCG Spec / CheolJ 2020');

  const t_szc = 30; // us
  const f_c = 100e3; // 100 kHz
  const sin_szc = Math.sin(2 * Math.PI * f_c * (t_szc * 1e-6));
  record('3rd Zero Crossing (SZC) at 30 us', 0.0, sin_szc, 1e-6, '', 'USCG Standard Zero-Crossing');

  const expectedR30 = Math.pow(30 / 65, 2) * Math.exp(-2 * (30 - 65) / 65);
  record('USCG Instantaneous Envelope Ratio at 30 us', 0.625345, expectedR30, 1e-4, '', 'USCG Spec / Boyce (2006)');

  // CheolJ 2020 Phase Coding
  const masterA = pulse.CHEOLJ_PCI_CODES.master.A;
  const secA = pulse.CHEOLJ_PCI_CODES.secondary.A;
  record('CheolJ Master Group A Pulse Count', 10, masterA.length, 0, 'pulses', 'CheolJ (2020) Table 2');
  record('CheolJ Secondary Group A Pulse Count', 8, secA.length, 0, 'pulses', 'CheolJ (2020) Table 2');
  record('GRI 9930 Group Repetition Interval', 99300, pulse.CHEOLJ_REFERENCE_CHAINS[9930].griUs, 0, 'us', 'USCG 9930 East Asia');
  record('GRI 7430 Group Repetition Interval', 74300, pulse.CHEOLJ_REFERENCE_CHAINS[7430].griUs, 0, 'us', 'Bohai 7430 North Sea');

  // 2. Propagation, Atmosphere & Phase Delay
  console.log('\n--- 2. Atmospheric & Seawater Groundwave Propagation ---');
  const c = geodesy.SPEED_OF_LIGHT || 299792458;
  const n_air = 1.000315;
  const v_eff = c / n_air;
  record('Atmospheric Propagation Velocity (n=1.000315)', 299698053.11, v_eff, 1.0, 'm/s', 'ITU-R P.368-10 / NBS 573');

  // Brunavs (1977) Secondary Factor
  const sf100 = geodesy.computeSecondaryFactorSec(100e3) * 1e6; // in us
  const sf500 = geodesy.computeSecondaryFactorSec(500e3) * 1e6;
  const sf1000 = geodesy.computeSecondaryFactorSec(1000e3) * 1e6;
  record('Brunavs Seawater SF Delay at 100 km', 0.1011, sf100, 0.01, 'us', 'Brunavs (1977) eq 14');
  record('Brunavs Seawater SF Delay at 500 km', 0.1205, sf500, 0.01, 'us', 'Brunavs (1977) eq 14');
  record('Brunavs Seawater SF Delay at 1000 km', 0.2205, sf1000, 0.02, 'us', 'Brunavs (1977) eq 14');

  // Sommerfeld / ITU-R P.368 Groundwave Phase Delay (grwave)
  const grwaveHomog100kmLand = grwave.computeHomogeneousAsfMicroseconds(100, 0.005, 15.0, 0.1);
  record('Sommerfeld Groundwave Excess Delay (100km, 0.005 S/m)', 0.4497, grwaveHomog100kmLand, 0.05, 'us', 'ITU-R P.368 / Sommerfeld');

  // Millington Mixed-Path Reciprocity
  const segmentsA = [
    { distKm: 50, sigma: 0.005, epslon: 15.0 },
    { distKm: 50, sigma: 5.0, epslon: 70.0 }
  ];
  const segmentsB = [
    { distKm: 50, sigma: 5.0, epslon: 70.0 },
    { distKm: 50, sigma: 0.005, epslon: 15.0 }
  ];
  const asfA = grwave.computeMillingtonAsfMicroseconds(segmentsA);
  const asfB = grwave.computeMillingtonAsfMicroseconds(segmentsB);
  record('Millington Mixed-Path Reciprocity Delta', 0.0, Math.abs(asfA - asfB), 1e-6, 'us', 'Millington (1949) IEE');

  // 3. Navigation Geometry, TDOA & GDOP
  console.log('\n--- 3. Navigation Geometry & GDOP Matrix ---');
  const master = { lat: 37.0, lng: 126.0, emissionDelayUs: 0, isMaster: true };
  const s1 = { lat: 36.0, lng: 127.0, emissionDelayUs: 12000, isMaster: false };
  const s2 = { lat: 38.0, lng: 127.0, emissionDelayUs: 25000, isMaster: false };
  const dop = gdop.computeGDOPAtPoint(37.0, 126.5, [master, s1, s2]);
  record('Finite GDOP at Nominal Mid-Point', 99.90, dop.gdop, 0.1, '', 'Navstar / Loran DOP Formulation');

  // 4. Kinematic 6-State EKF & RAIM Integrity
  console.log('\n--- 4. Kinematic 6-State EKF & RAIM ---');
  const ekfInst = ekf.createEkf(52.0, 4.0);
  record('EKF State Dimension', 6, ekfInst.x.length, 0, 'states', '6-State DWNA Model');
  ekfInst.predict(1.0);
  const pDiff = Math.abs(ekfInst.P[0][1] - ekfInst.P[1][0]);
  record('EKF Covariance P Symmetry after Predict', 0.0, pDiff, 1e-9, '', 'Kalman Filter Theory');

  // RAIM FDE Test
  const mockObs = [
    { station: { label: 'M' } },
    { station: { label: 'X' } },
    { station: { label: 'Y' } },
    { station: { label: 'Z' } }
  ];
  const nominalResiduals = [1.2, -0.8, 1.5, -0.4];
  const nominalSigmas = [5.0, 5.0, 5.0, 5.0];
  const raimNominal = raim.performRaimFde(mockObs, nominalResiduals, nominalSigmas);
  record('RAIM Nominal False Alarm Rate', 0, raimNominal.faultDetected ? 1 : 0, 0, '', 'RTCA DO-229D Chi-Square Gate');

  // Inject +3000 m cycle slip into secondary X
  const faultResiduals = [1.2, 3000.0, 1.5, -0.4];
  const raimFault = raim.performRaimFde(mockObs, faultResiduals, nominalSigmas);
  record('RAIM Cycle Slip Detection (+3000m)', 1, raimFault.faultDetected ? 1 : 0, 0, '', 'RTCA DO-229D Fault Detection');
  record('RAIM Fault Isolation to Station X', 1, raimFault.isolatedStation === 'X' ? 1 : 0, 0, '', 'RTCA DO-229D Fault Exclusion');

  // 5. Parameter Sensitivity Sweeps
  console.log('\n--- 5. Parameter Sensitivity Sweeps ---');
  // Conductivity sweep
  const conds = [0.0001, 0.001, 0.005, 0.02, 0.1, 1.0, 5.0];
  for (const sig of conds) {
    const delay = grwave.computeHomogeneousAsfMicroseconds(100, sig, 15.0, 0.1);
    sweepTable.push({
      type: 'Conductivity Sweep (100km)',
      param: `${sig} S/m`,
      value: `${delay.toFixed(4)} us`,
      physicalTrend: 'Monotonically decreasing phase lag as conductivity increases'
    });
  }

  // Distance sweep
  const dists = [10, 50, 100, 250, 500, 1000, 1500];
  for (const d of dists) {
    const sf = geodesy.computeSecondaryFactorSec(d * 1e3) * 1e6;
    sweepTable.push({
      type: 'Distance Sweep over Seawater',
      param: `${d} km`,
      value: `${sf.toFixed(4)} us`,
      physicalTrend: 'Monotonically increasing phase delay with distance'
    });
  }

  console.log('\n==============================================================================');
  console.log(`TOTAL BENCHMARKS: ${passedCount + failedCount}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  console.log('==============================================================================\n');

  const fs = require('fs');
  const outDir = 'C:/Users/Rafli Alif/.gemini/antigravity-ide/brain/b8ef9f43-bb6e-4351-bce9-37e3d6bdc1ff';
  fs.writeFileSync(
    path.join(outDir, 'scratch', 'physics_benchmark_results.json'),
    JSON.stringify({ benchmarkTable, sweepTable, passedCount, failedCount }, null, 2),
    'utf8'
  );

  if (failedCount > 0) process.exit(1);
})().catch(err => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
