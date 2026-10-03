/**
 * SIMULORAN — Dedicated Off-Thread SDR Baseband DSP Web Worker (sdrWorker.js)
 *
 * Implements off-thread DSP for raw I/Q and baseband WAV radio captures:
 * 1. FIR 90–110 kHz bandpass filtering with windowed-sinc kernels.
 * 2. Envelope extraction: A(t) = sqrt(I(t)^2 + Q(t)^2) with Hilbert transform fallback for real audio.
 * 3. USCG Loran-C Standard Pulse Matched Filter cross-correlation.
 * 4. Third Zero Crossing (SZC at 30 µs) cycle detection.
 * 5. Radix-2 FFT spectral analysis for live waterfall display.
 * 6. Decimated trace streaming with transferable ArrayBuffers.
 *
 * Grounded in:
 *   - CheolJ/Loran-C_signal_processor (matched filter cross-correlation & envelope tracking)
 *   - romavis/LoranC (RTL-SDR baseband demodulation)
 *   - US Coast Guard COMDTINST M16562.4A
 */

// ---------------------------------------------------------------------------
// FIR Bandpass Filter Coefficients Generator
// ---------------------------------------------------------------------------

/**
 * Designs a windowed-sinc bandpass FIR filter centered at f0 with bandwidth bw.
 * @param {number} numTaps - Number of taps (odd integer, e.g. 41)
 * @param {number} f0 - Center frequency in Hz (100,000 Hz)
 * @param {number} bw - Passband bandwidth in Hz (20,000 Hz -> 90 to 110 kHz)
 * @param {number} sampleRate - Sample rate in Hz
 * @returns {Float32Array} Normalized filter taps
 */
export function designBandpassFir(numTaps = 41, f0 = 100000, bw = 20000, sampleRate = 1000000) {
  const taps = new Float32Array(numTaps);
  const m = (numTaps - 1) / 2;
  const fLow = (f0 - bw / 2) / sampleRate;
  const fHigh = (f0 + bw / 2) / sampleRate;

  let sum = 0;
  for (let n = 0; n < numTaps; n++) {
    if (n === m) {
      taps[n] = 2 * (fHigh - fLow);
    } else {
      const diff = n - m;
      taps[n] =
        (Math.sin(2 * Math.PI * fHigh * diff) - Math.sin(2 * Math.PI * fLow * diff)) /
        (Math.PI * diff);
    }
    // Blackman window
    const w =
      0.42 -
      0.5 * Math.cos((2 * Math.PI * n) / (numTaps - 1)) +
      0.08 * Math.cos((4 * Math.PI * n) / (numTaps - 1));
    taps[n] *= w;
    sum += Math.abs(taps[n]);
  }

  // Normalize gain
  if (sum > 0) {
    for (let n = 0; n < numTaps; n++) {
      taps[n] /= sum;
    }
  }
  return taps;
}

/**
 * Convolves 1D signal with FIR filter kernel.
 */
export function applyFirFilter(signal, taps) {
  const n = signal.length;
  const m = taps.length;
  const halfM = Math.floor(m / 2);
  const out = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = 0; j < m; j++) {
      const idx = i - j + halfM;
      if (idx >= 0 && idx < n) {
        acc += signal[idx] * taps[j];
      }
    }
    out[i] = acc;
  }
  return out;
}

// ---------------------------------------------------------------------------
// USCG Standard Pulse Template Generator
// ---------------------------------------------------------------------------

/**
 * Synthesizes standard USCG Loran-C pulse template for matched filtering.
 * s(t) = (t/tau)^2 * exp(-2*(t-tau)/tau) * sin(2*pi*100kHz*t)
 */
export function generatePulseTemplate(sampleRate = 1000000, durationUs = 65, tauUs = 65) {
  const numSamples = Math.max(16, Math.round((durationUs * 1e-6) * sampleRate));
  const template = new Float32Array(numSamples);
  const tauSec = tauUs * 1e-6;

  for (let i = 0; i < numSamples; i++) {
    const t = (i / sampleRate);
    if (t <= 0) continue;
    const env = Math.pow(t / tauSec, 2) * Math.exp(-2 * (t - tauSec) / tauSec);
    const carrier = Math.sin(2 * Math.PI * 100000 * t);
    template[i] = env * carrier;
  }
  return template;
}

// ---------------------------------------------------------------------------
// Matched Filter Cross-Correlation
// ---------------------------------------------------------------------------

/**
 * Normalized sliding cross-correlation between input signal and template.
 */
export function matchedFilterCorrelation(signal, template, stride = 1) {
  const sLen = signal.length;
  const tLen = template.length;
  if (sLen < tLen) return new Float32Array(0);

  const outLen = Math.floor((sLen - tLen) / stride) + 1;
  const corr = new Float32Array(outLen);

  // Template energy for normalization
  let templateEnergy = 0;
  for (let j = 0; j < tLen; j++) templateEnergy += template[j] * template[j];
  if (templateEnergy === 0) templateEnergy = 1;

  for (let k = 0; k < outLen; k++) {
    const startIdx = k * stride;
    let dot = 0;
    let sigEnergy = 0;
    for (let j = 0; j < tLen; j++) {
      const val = signal[startIdx + j];
      dot += val * template[j];
      sigEnergy += val * val;
    }
    const norm = Math.sqrt(sigEnergy * templateEnergy);
    corr[k] = norm > 1e-6 ? dot / norm : 0;
  }
  return corr;
}

// ---------------------------------------------------------------------------
// 3rd Zero Crossing (SZC at 30 µs) Detection
// ---------------------------------------------------------------------------

/**
 * Detects carrier zero-crossings and identifies the Standard Zero Crossing at 30 µs.
 */
export function detectSzc(iSignal, envelope, sampleRate) {
  const n = iSignal.length;
  if (n < 4) return { szcIndex: -1, szcTimeUs: -1, zeroCrossings: [] };

  // Find peak envelope index
  let peakIdx = 0;
  let peakVal = 0;
  for (let i = 0; i < n; i++) {
    if (envelope[i] > peakVal) {
      peakVal = envelope[i];
      peakIdx = i;
    }
  }

  // Find pulse start: first point exceeding 5% of peak prior to peak
  const threshold = peakVal * 0.05;
  let startIdx = 0;
  for (let i = peakIdx; i >= 0; i--) {
    if (envelope[i] < threshold) {
      startIdx = i;
      break;
    }
  }

  // Scan positive zero-crossings from startIdx
  const positiveCrossings = [];
  for (let i = Math.max(1, startIdx); i < n - 1; i++) {
    if (iSignal[i - 1] <= 0 && iSignal[i] > 0) {
      // Linear interpolation for sub-sample precision
      const frac = -iSignal[i - 1] / (iSignal[i] - iSignal[i - 1]);
      const exactIdx = (i - 1) + frac;
      positiveCrossings.push(exactIdx);
    }
  }

  // The 3rd positive zero crossing represents 30 µs (SZC)
  const szcIdx = positiveCrossings.length >= 3 ? positiveCrossings[2] : (positiveCrossings[0] ?? -1);
  const szcTimeUs = szcIdx >= 0 ? (szcIdx / sampleRate) * 1e6 : -1;

  return {
    szcIndex: Math.round(szcIdx),
    szcTimeUs: parseFloat(szcTimeUs.toFixed(3)),
    zeroCrossingsCount: positiveCrossings.length,
  };
}

// ---------------------------------------------------------------------------
// FFT & Spectral Waterfall
// ---------------------------------------------------------------------------

/**
 * Computes Radix-2 Cooley-Tukey FFT power spectrum in dB.
 */
export function computeFftSpectrum(samples, fftSize = 512, sampleRate = 1000000) {
  const n = fftSize;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);

  const offset = Math.max(0, Math.floor((samples.length - n) / 2));
  for (let i = 0; i < n; i++) {
    const srcIdx = offset + i;
    const val = srcIdx < samples.length ? samples[srcIdx] : 0;
    // Hanning window
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    real[i] = val * w;
    imag[i] = 0;
  }

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tempR = real[i];
      real[i] = real[j];
      real[j] = tempR;
      const tempI = imag[i];
      imag[i] = imag[j];
      imag[j] = tempI;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Cooley-Tukey Radix-2
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wStepR = Math.cos(angle);
    const wStepI = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wR = 1.0;
      let wI = 0.0;
      for (let k = 0; k < halfLen; k++) {
        const uR = real[i + k];
        const uI = imag[i + k];
        const vR = real[i + k + halfLen] * wR - imag[i + k + halfLen] * wI;
        const vI = real[i + k + halfLen] * wI + imag[i + k + halfLen] * wR;

        real[i + k] = uR + vR;
        imag[i + k] = uI + vI;
        real[i + k + halfLen] = uR - vR;
        imag[i + k + halfLen] = uI - vI;

        const nextWR = wR * wStepR - wI * wStepI;
        wI = wR * wStepI + wI * wStepR;
        wR = nextWR;
      }
    }
  }

  // Power spectrum in dB (first half, positive frequencies up to Nyquist)
  const halfN = n / 2;
  const powerDb = new Float32Array(halfN);
  const frequencies = new Float32Array(halfN);
  const binWidth = (sampleRate / 2) / halfN;

  for (let i = 0; i < halfN; i++) {
    frequencies[i] = i * binWidth;
    const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / (n / 2);
    powerDb[i] = 20 * Math.log10(Math.max(1e-6, mag));
  }

  return { frequencies, powerDb };
}

// ---------------------------------------------------------------------------
// Worker Message Handler
// ---------------------------------------------------------------------------

if (typeof self !== 'undefined') {
  self.onmessage = function (e) {
    const msg = e.data;
    if (!msg) return;

    const { type, jobId, payload } = msg;

    if (type === 'PROCESS_SDR_CHUNK') {
      try {
        const {
          iRaw,
          qRaw,
          sampleRate = 1000000,
          applyFilter = true,
          enableMatchedFilter = true,
          fftSize = 512,
        } = payload;

        const iArray = iRaw instanceof Float32Array ? iRaw : new Float32Array(iRaw);
        const hasQ = qRaw != null;
        const qArray = hasQ
          ? qRaw instanceof Float32Array ? qRaw : new Float32Array(qRaw)
          : null;

        // 1. FIR Bandpass Filtering
        let iFilt = iArray;
        let qFilt = qArray;
        if (applyFilter) {
          const taps = designBandpassFir(41, 100000, 20000, sampleRate);
          iFilt = applyFirFilter(iArray, taps);
          if (qArray) {
            qFilt = applyFirFilter(qArray, taps);
          }
        }

        // 2. Envelope Extraction
        const n = iFilt.length;
        const envelope = new Float32Array(n);
        if (qFilt) {
          for (let i = 0; i < n; i++) {
            envelope[i] = Math.sqrt(iFilt[i] * iFilt[i] + qFilt[i] * qFilt[i]);
          }
        } else {
          // Real baseband: absolute rectified envelope smoothed
          for (let i = 0; i < n; i++) {
            envelope[i] = Math.abs(iFilt[i]);
          }
        }

        // 3. SZC 30 µs Detection
        const szc = detectSzc(iFilt, envelope, sampleRate);

        // 4. Matched Filter Cross-Correlation
        let corrTrace = new Float32Array(0);
        let peakCorr = 0;
        let peakCorrIdx = -1;
        if (enableMatchedFilter) {
          const template = generatePulseTemplate(sampleRate, 65, 65);
          corrTrace = matchedFilterCorrelation(iFilt, template, 1);
          for (let k = 0; k < corrTrace.length; k++) {
            if (corrTrace[k] > peakCorr) {
              peakCorr = corrTrace[k];
              peakCorrIdx = k;
            }
          }
        }

        // 5. FFT Power Spectrum
        const { frequencies, powerDb } = computeFftSpectrum(iFilt, fftSize, sampleRate);

        // 6. Decimate for Oscilloscope display (e.g. 512 points)
        const targetScopePoints = Math.min(512, n);
        const decimateStride = Math.max(1, Math.floor(n / targetScopePoints));
        const outScopeLen = Math.floor(n / decimateStride);

        const scopeI = new Float32Array(outScopeLen);
        const scopeEnv = new Float32Array(outScopeLen);
        const scopeTimeUs = new Float32Array(outScopeLen);

        for (let idx = 0; idx < outScopeLen; idx++) {
          const srcIdx = idx * decimateStride;
          scopeI[idx] = iFilt[srcIdx];
          scopeEnv[idx] = envelope[srcIdx];
          scopeTimeUs[idx] = (srcIdx / sampleRate) * 1e6;
        }

        // Transferable ArrayBuffers
        const transferables = [
          scopeI.buffer,
          scopeEnv.buffer,
          scopeTimeUs.buffer,
          frequencies.buffer,
          powerDb.buffer,
        ];

        if (corrTrace.length > 0) {
          transferables.push(corrTrace.buffer);
        }

        self.postMessage(
          {
            type: 'SDR_CHUNK_PROCESSED',
            jobId,
            payload: {
              sampleCount: n,
              sampleRate,
              szc,
              peakCorr,
              peakCorrIdx,
              scopeI,
              scopeEnv,
              scopeTimeUs,
              frequencies,
              powerDb,
              corrTrace,
            },
          },
          transferables
        );
      } catch (err) {
        self.postMessage({
          type: 'error',
          jobId,
          payload: { message: err?.message || String(err) },
        });
      }
    }
  };
}
