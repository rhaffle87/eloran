import { describe, it, expect } from 'vitest';
import {
  parseRawIQ,
  parseWavAudio,
  generateSyntheticSdrCapture,
} from '../sdrPlayback.js';
import {
  designBandpassFir,
  applyFirFilter,
  generatePulseTemplate,
  matchedFilterCorrelation,
  detectSzc,
  computeFftSpectrum,
} from '../../workers/sdrWorker.js';

describe('SDR Baseband Ingestion & Signal Processing Pipeline', () => {
  describe('Raw I/Q Binary Decoders', () => {
    it('decodes uint8 RTL-SDR interleaved bytes to normalized float32 [-1.0 .. +1.0]', () => {
      // 4 bytes = 2 complex I/Q samples: [I0, Q0, I1, Q1]
      // 127.5 -> 0.0, 255 -> ~1.0, 0 -> -1.0
      const buffer = new Uint8Array([127, 128, 255, 0]).buffer;
      const res = parseRawIQ(buffer, 'uint8');

      expect(res.sampleCount).toBe(2);
      expect(res.iSamples.length).toBe(2);
      expect(res.qSamples.length).toBe(2);

      expect(res.iSamples[0]).toBeCloseTo(0.0, 1);
      expect(res.qSamples[0]).toBeCloseTo(0.0, 1);
      expect(res.iSamples[1]).toBeCloseTo(1.0, 2);
      expect(res.qSamples[1]).toBeCloseTo(-1.0, 2);
    });

    it('decodes int16 HackRF signed 16-bit little-endian buffers', () => {
      // 2 complex samples = 4 shorts (8 bytes)
      const buffer = new Int16Array([0, 16384, 32767, -32768]).buffer;
      const res = parseRawIQ(buffer, 'int16');

      expect(res.sampleCount).toBe(2);
      expect(res.iSamples[0]).toBe(0);
      expect(res.qSamples[0]).toBeCloseTo(0.5, 2);
      expect(res.iSamples[1]).toBeCloseTo(1.0, 2);
      expect(res.qSamples[1]).toBe(-1.0);
    });

    it('handles empty or malformed buffers gracefully', () => {
      const res = parseRawIQ(new ArrayBuffer(0));
      expect(res.sampleCount).toBe(0);
      expect(res.iSamples.length).toBe(0);
    });
  });

  describe('Baseband WAV Parser', () => {
    it('throws error when buffer lacks RIFF/WAVE signature', () => {
      const corrupt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer;
      expect(() => parseWavAudio(corrupt)).toThrow(/Invalid WAV file/);
    });

    it('correctly parses a minimal synthetic 16-bit PCM WAV container', () => {
      // Build minimal 44-byte standard PCM WAV header + 4 samples
      const numSamples = 4;
      const buffer = new ArrayBuffer(44 + numSamples * 2);
      const view = new DataView(buffer);

      // 'RIFF'
      view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
      view.setUint32(4, 36 + numSamples * 2, true);
      // 'WAVE'
      view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
      // 'fmt '
      view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
      view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
      view.setUint16(20, 1, true);  // AudioFormat (1 = PCM)
      view.setUint16(22, 1, true);  // NumChannels (1 = Mono)
      view.setUint32(24, 100000, true); // SampleRate (100 kHz)
      view.setUint32(28, 200000, true); // ByteRate
      view.setUint16(32, 2, true);  // BlockAlign
      view.setUint16(34, 16, true); // BitsPerSample
      // 'data'
      view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
      view.setUint32(40, numSamples * 2, true);

      // Audio data: [0, 16384, -16384, 32767]
      view.setInt16(44, 0, true);
      view.setInt16(46, 16384, true);
      view.setInt16(48, -16384, true);
      view.setInt16(50, 32767, true);

      const parsed = parseWavAudio(buffer);
      expect(parsed.sampleRate).toBe(100000);
      expect(parsed.numChannels).toBe(1);
      expect(parsed.sampleCount).toBe(4);
      expect(parsed.iSamples[0]).toBe(0);
      expect(parsed.iSamples[1]).toBeCloseTo(0.5, 2);
      expect(parsed.iSamples[2]).toBeCloseTo(-0.5, 2);
    });
  });

  describe('Synthetic Benchmark Generator', () => {
    it('generates calibrated 100 kHz pulse train with non-zero energy', () => {
      const capture = generateSyntheticSdrCapture({
        sampleRate: 500000,
        durationMs: 2.0,
        numPulses: 2,
        snrDb: 20,
      });

      expect(capture.sampleRate).toBe(500000);
      expect(capture.durationMs).toBe(2.0);
      expect(capture.iSamples.length).toBe(1000);
      expect(capture.qSamples.length).toBe(1000);

      let energy = 0;
      for (let k = 0; k < capture.iSamples.length; k++) {
        energy += capture.iSamples[k] * capture.iSamples[k];
      }
      expect(energy).toBeGreaterThan(1.0);
    });
  });

  describe('DSP Worker Algorithms', () => {
    it('designs bandpass FIR with normalized peak gain and symmetry', () => {
      const taps = designBandpassFir(41, 100000, 20000, 1000000);
      expect(taps.length).toBe(41);

      // Check center tap symmetry
      expect(taps[0]).toBeCloseTo(taps[40], 5);
      expect(taps[10]).toBeCloseTo(taps[30], 5);

      let sum = 0;
      for (let i = 0; i < taps.length; i++) sum += Math.abs(taps[i]);
      expect(sum).toBeCloseTo(1.0, 3);
    });

    it('filters 100 kHz signal through FIR without attenuation while attenuating DC', () => {
      const taps = designBandpassFir(41, 100000, 20000, 1000000);
      const n = 200;
      const sig100k = new Float32Array(n);
      const dcSig = new Float32Array(n).fill(1.0);

      for (let i = 0; i < n; i++) {
        sig100k[i] = Math.sin(2 * Math.PI * 100000 * (i / 1000000));
      }

      const out100k = applyFirFilter(sig100k, taps);
      const outDc = applyFirFilter(dcSig, taps);

      // 100 kHz passes through center (check peak amplitude of filtered AC wave)
      let maxAmp100k = 0;
      for (let i = 40; i < 160; i++) {
        if (Math.abs(out100k[i]) > maxAmp100k) maxAmp100k = Math.abs(out100k[i]);
      }
      expect(maxAmp100k).toBeGreaterThan(0.2);

      // DC is heavily attenuated by bandpass
      expect(Math.abs(outDc[100])).toBeLessThan(0.05);
    });

    it('identifies Standard Zero Crossing (SZC) near 30 µs on standard pulse', () => {
      const sampleRate = 1000000; // 1 MSPS (1 µs per sample)
      const durationSamples = 100;
      const iSig = new Float32Array(durationSamples);
      const env = new Float32Array(durationSamples);
      const tau = 65e-6;

      for (let k = 0; k < durationSamples; k++) {
        const t = k * 1e-6;
        env[k] = Math.pow(t / tau, 2) * Math.exp(-2 * (t - tau) / tau);
        iSig[k] = env[k] * Math.sin(2 * Math.PI * 100000 * t);
      }

      const szc = detectSzc(iSig, env, sampleRate);
      expect(szc.szcIndex).toBeGreaterThanOrEqual(25);
      expect(szc.szcIndex).toBeLessThanOrEqual(35);
      expect(szc.szcTimeUs).toBeCloseTo(30.0, 0); // ~30 µs
    });

    it('cross-correlates standard pulse template and finds sharp matched-filter peak', () => {
      const sampleRate = 1000000;
      const template = generatePulseTemplate(sampleRate, 65, 65);
      expect(template.length).toBe(65);

      // Test signal with pulse placed at sample 50
      const sig = new Float32Array(200);
      for (let j = 0; j < template.length; j++) {
        sig[50 + j] = template[j];
      }

      const corr = matchedFilterCorrelation(sig, template, 1);
      expect(corr.length).toBeGreaterThan(50);

      // Peak should be at sample 50
      let maxK = 0;
      let maxVal = -1;
      for (let k = 0; k < corr.length; k++) {
        if (corr[k] > maxVal) {
          maxVal = corr[k];
          maxK = k;
        }
      }
      expect(maxK).toBe(50);
      expect(maxVal).toBeCloseTo(1.0, 2);
    });

    it('computes FFT power spectrum with peak around 100 kHz', () => {
      const sampleRate = 1000000;
      const n = 512;
      const sig = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        sig[i] = Math.sin(2 * Math.PI * 100000 * (i / sampleRate));
      }

      const spec = computeFftSpectrum(sig, 512, sampleRate);
      expect(spec.frequencies.length).toBe(256);
      expect(spec.powerDb.length).toBe(256);

      // Find frequency bin with maximum power
      let maxBin = 0;
      let maxDb = -999;
      for (let i = 0; i < spec.powerDb.length; i++) {
        if (spec.powerDb[i] > maxDb) {
          maxDb = spec.powerDb[i];
          maxBin = i;
        }
      }

      const peakFreq = spec.frequencies[maxBin];
      expect(peakFreq).toBeGreaterThanOrEqual(95000);
      expect(peakFreq).toBeLessThanOrEqual(105000);
    });
  });
});
