/**
 * SIMULORAN — SDR Baseband Ingestion & Waveform Playback Library (sdrPlayback.js)
 *
 * Implements decoding, parsing, and streaming for raw radio captures:
 * 1. Raw I/Q Ingestion: uint8 (RTL-SDR), int16 (HackRF/SDRplay), float32.
 * 2. WAV Baseband Audio: Stereo I/Q or mono RF downconverted audio streams.
 * 3. Synthetic Benchmark Generator: 100 kHz pulse trains with calibrated noise/SNR.
 * 4. Off-Thread Worker Client: Dispatches chunked buffers to sdrWorker.js without UI lag.
 *
 * Grounded in:
 *   - CheolJ/Loran-C_signal_processor
 *   - romavis/LoranC
 *   - US Coast Guard COMDTINST M16562.4A
 */

// ---------------------------------------------------------------------------
// 1. Raw I/Q Ingestion Decoders
// ---------------------------------------------------------------------------

/**
 * Decodes raw interleaved I/Q binary buffers into normalized Float32 arrays [-1.0 .. +1.0].
 *
 * @param {ArrayBuffer} buffer - Binary payload
 * @param {'uint8' | 'int16' | 'float32'} [format='uint8'] - I/Q encoding format
 * @param {number} [maxSamples=1048576] - Safety limit (default 1M complex samples)
 * @returns {{ iSamples: Float32Array, qSamples: Float32Array, sampleCount: number }}
 */
export function parseRawIQ(buffer, format = 'uint8', maxSamples = 1048576) {
  if (!buffer || buffer.byteLength < 2) {
    return { iSamples: new Float32Array(0), qSamples: new Float32Array(0), sampleCount: 0 };
  }

  let iSamples;
  let qSamples;
  let sampleCount = 0;

  if (format === 'uint8') {
    const bytes = new Uint8Array(buffer);
    sampleCount = Math.min(maxSamples, Math.floor(bytes.length / 2));
    iSamples = new Float32Array(sampleCount);
    qSamples = new Float32Array(sampleCount);
    for (let k = 0; k < sampleCount; k++) {
      // 0..255 unsigned with 127.5 midpoint -> [-1.0 .. +1.0]
      iSamples[k] = (bytes[k * 2] - 127.5) / 127.5;
      qSamples[k] = (bytes[k * 2 + 1] - 127.5) / 127.5;
    }
  } else if (format === 'int16') {
    const shorts = new Int16Array(buffer);
    sampleCount = Math.min(maxSamples, Math.floor(shorts.length / 2));
    iSamples = new Float32Array(sampleCount);
    qSamples = new Float32Array(sampleCount);
    for (let k = 0; k < sampleCount; k++) {
      iSamples[k] = shorts[k * 2] / 32768.0;
      qSamples[k] = shorts[k * 2 + 1] / 32768.0;
    }
  } else if (format === 'float32') {
    const floats = new Float32Array(buffer);
    sampleCount = Math.min(maxSamples, Math.floor(floats.length / 2));
    iSamples = new Float32Array(sampleCount);
    qSamples = new Float32Array(sampleCount);
    for (let k = 0; k < sampleCount; k++) {
      iSamples[k] = floats[k * 2];
      qSamples[k] = floats[k * 2 + 1];
    }
  } else {
    throw new Error(`Unsupported SDR format: ${format}`);
  }

  return { iSamples, qSamples, sampleCount };
}

// ---------------------------------------------------------------------------
// 2. Baseband WAV Ingestion
// ---------------------------------------------------------------------------

/**
 * Parses PCM WAV audio container (mono or stereo I/Q).
 *
 * @param {ArrayBuffer} buffer - Binary WAV buffer
 * @returns {{ iSamples: Float32Array, qSamples: Float32Array|null, sampleRate: number, numChannels: number, sampleCount: number }}
 */
export function parseWavAudio(buffer) {
  const view = new DataView(buffer);

  // Check RIFF header
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));

  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Invalid WAV file: missing RIFF/WAVE header signature');
  }

  // Find 'fmt ' and 'data' chunks
  let offset = 12;
  let numChannels = 1;
  let sampleRate = 48000;
  let bitsPerSample = 16;
  let dataOffset = 0;
  let dataLength = 0;

  while (offset < buffer.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'fmt ') {
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataLength = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
  }

  if (dataOffset === 0) {
    throw new Error('Invalid WAV file: data chunk not found');
  }

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(dataLength / (bytesPerSample * numChannels));
  const iSamples = new Float32Array(totalSamples);
  const qSamples = numChannels >= 2 ? new Float32Array(totalSamples) : null;

  for (let k = 0; k < totalSamples; k++) {
    const sampleByteOffset = dataOffset + k * numChannels * bytesPerSample;
    if (bitsPerSample === 16) {
      iSamples[k] = view.getInt16(sampleByteOffset, true) / 32768.0;
      if (qSamples) {
        qSamples[k] = view.getInt16(sampleByteOffset + 2, true) / 32768.0;
      }
    } else if (bitsPerSample === 24) {
      const b0 = view.getUint8(sampleByteOffset);
      const b1 = view.getUint8(sampleByteOffset + 1);
      const b2 = view.getInt8(sampleByteOffset + 2);
      const val24 = (b2 << 16) | (b1 << 8) | b0;
      iSamples[k] = val24 / 8388608.0;
      if (qSamples) {
        const q0 = view.getUint8(sampleByteOffset + 3);
        const q1 = view.getUint8(sampleByteOffset + 4);
        const q2 = view.getInt8(sampleByteOffset + 5);
        const qval24 = (q2 << 16) | (q1 << 8) | q0;
        qSamples[k] = qval24 / 8388608.0;
      }
    } else if (bitsPerSample === 8) {
      iSamples[k] = (view.getUint8(sampleByteOffset) - 128) / 128.0;
      if (qSamples) {
        qSamples[k] = (view.getUint8(sampleByteOffset + 1) - 128) / 128.0;
      }
    }
  }

  return {
    iSamples,
    qSamples,
    sampleRate,
    numChannels,
    sampleCount: totalSamples,
  };
}

// ---------------------------------------------------------------------------
// 3. Synthetic Benchmark Capture Generator
// ---------------------------------------------------------------------------

/**
 * Synthesizes calibrated raw I/Q samples of a standard 100 kHz Loran-C pulse group
 * with additive white Gaussian noise and phase code modulation.
 *
 * @param {object} [params]
 * @param {number} [params.sampleRate=1000000] - Sample rate in Hz (e.g. 1 MSPS)
 * @param {number} [params.durationMs=3.0] - Duration in milliseconds
 * @param {number} [params.numPulses=8] - Pulse count (8 for secondary, 9/10 for master)
 * @param {number} [params.snrDb=15] - Signal-to-noise ratio in dB
 * @param {number} [params.tauUs=65] - USCG envelope peak parameter (65 µs)
 * @returns {{ iSamples: Float32Array, qSamples: Float32Array, sampleRate: number, durationMs: number, snrDb: number }}
 */
export function generateSyntheticSdrCapture({
  sampleRate = 1000000,
  durationMs = 3.0,
  numPulses = 8,
  snrDb = 15,
  tauUs = 65,
} = {}) {
  const totalSamples = Math.round((durationMs * 1e-3) * sampleRate);
  const iSamples = new Float32Array(totalSamples);
  const qSamples = new Float32Array(totalSamples);

  const tauSec = tauUs * 1e-6;
  const pulseDurationSec = 0.0003; // 300 µs
  const pulseIntervalSec = 0.001;  // 1000 µs standard interpulse spacing
  const startOffsetSec = 0.0002;   // 200 µs initial delay

  // Phase Code A for secondary [+ + + - + + - -]
  const phaseCode = [1, 1, 1, -1, 1, 1, -1, -1, 1, 1];

  // 1. Synthesize Loran-C Pulse Train
  for (let p = 0; p < numPulses; p++) {
    const pulseStartSec = startOffsetSec + p * pulseIntervalSec;
    const sign = phaseCode[p % phaseCode.length];

    for (let k = 0; k < totalSamples; k++) {
      const t = k / sampleRate;
      const dt = t - pulseStartSec;
      if (dt >= 0 && dt <= pulseDurationSec) {
        const env = Math.pow(dt / tauSec, 2) * Math.exp(-2 * (dt - tauSec) / tauSec);
        const carrierI = Math.sin(2 * Math.PI * 100000 * dt);
        const carrierQ = Math.cos(2 * Math.PI * 100000 * dt);
        iSamples[k] += sign * env * carrierI;
        qSamples[k] += sign * env * carrierQ;
      }
    }
  }

  // 2. Add White Gaussian Noise calibrated by SNR
  // snrLinear = P_signal / P_noise => sigma_noise = 1 / sqrt(2 * 10^(snrDb/10))
  const snrLinear = Math.pow(10, snrDb / 10);
  const noiseSigma = 1.0 / Math.sqrt(2 * Math.max(0.01, snrLinear));

  // Box-Muller Gaussian generator
  for (let k = 0; k < totalSamples; k += 2) {
    const u1 = Math.max(1e-12, Math.random());
    const u2 = Math.random();
    const mag = noiseSigma * Math.sqrt(-2.0 * Math.log(u1));
    const z0 = mag * Math.cos(2.0 * Math.PI * u2);
    const z1 = mag * Math.sin(2.0 * Math.PI * u2);

    iSamples[k] += z0;
    qSamples[k] += z1;
    if (k + 1 < totalSamples) {
      iSamples[k + 1] += z1;
      qSamples[k + 1] += z0;
    }
  }

  return { iSamples, qSamples, sampleRate, durationMs, snrDb };
}

// ---------------------------------------------------------------------------
// 4. Off-Thread SDR Worker Dispatcher
// ---------------------------------------------------------------------------

let _workerInstance = null;
let _nextJobId = 1;
const _pendingJobs = new Map();

export function getSdrWorker() {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!_workerInstance) {
    try {
      _workerInstance = new Worker(new URL('../workers/sdrWorker.js', import.meta.url), {
        type: 'module',
      });
      _workerInstance.onmessage = (e) => {
        const msg = e.data;
        if (!msg) return;
        const { type, jobId, payload } = msg;
        const cb = _pendingJobs.get(jobId);
        if (cb) {
          _pendingJobs.delete(jobId);
          if (type === 'error') {
            cb.reject(new Error(payload?.message || 'Worker processing error'));
          } else {
            cb.resolve(payload);
          }
        }
      };
    } catch (err) {
      console.warn('Failed to initialize sdrWorker:', err);
      return null;
    }
  }
  return _workerInstance;
}

/**
 * Dispatches a raw I/Q chunk to the background DSP worker.
 *
 * @param {object} params
 * @param {Float32Array} params.iRaw
 * @param {Float32Array|null} [params.qRaw]
 * @param {number} [params.sampleRate=1000000]
 * @param {boolean} [params.applyFilter=true]
 * @param {boolean} [params.enableMatchedFilter=true]
 * @param {number} [params.fftSize=512]
 * @returns {Promise<object>} Processed scope, waterfall, and correlation metrics
 */
export function processSdrChunkAsync({
  iRaw,
  qRaw = null,
  sampleRate = 1000000,
  applyFilter = true,
  enableMatchedFilter = true,
  fftSize = 512,
}) {
  const worker = getSdrWorker();
  if (!worker) {
    // If running in environment without Web Worker, reject gracefully
    return Promise.reject(new Error('Web Workers not available in this environment'));
  }

  return new Promise((resolve, reject) => {
    const jobId = _nextJobId++;
    _pendingJobs.set(jobId, { resolve, reject });

    // Transferable ArrayBuffers
    const transferables = [iRaw.buffer];
    if (qRaw) transferables.push(qRaw.buffer);

    worker.postMessage(
      {
        type: 'PROCESS_SDR_CHUNK',
        jobId,
        payload: {
          iRaw,
          qRaw,
          sampleRate,
          applyFilter,
          enableMatchedFilter,
          fftSize,
        },
      },
      transferables
    );
  });
}
