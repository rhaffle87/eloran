import { describe, it, expect } from 'vitest';
import {
  CHEOLJ_REFERENCE_CHAINS,
  CHEOLJ_PCI_CODES,
  synthesizeCheolJReferenceChain,
} from '../pulse.js';

describe('CheolJ Loran-C Reference Code & Chain PCI Synthesis', () => {
  it('defines all three calibrated reference chains (7430, 8390, 9930)', () => {
    expect(CHEOLJ_REFERENCE_CHAINS).toHaveProperty('7430');
    expect(CHEOLJ_REFERENCE_CHAINS).toHaveProperty('8390');
    expect(CHEOLJ_REFERENCE_CHAINS).toHaveProperty('9930');

    // Chain 7430 (China North Sea)
    const c7430 = CHEOLJ_REFERENCE_CHAINS[7430];
    expect(c7430.griUs).toBe(74300);
    expect(c7430.master.name).toBe('Rongcheng');
    expect(c7430.master.emissionDelayUs).toBe(10000.0);
    expect(c7430.secondaries).toHaveLength(2);
    expect(c7430.secondaries[0].name).toBe('Xuancheng');
    expect(c7430.secondaries[0].emissionDelayUs).toBeCloseTo(13459.70, 2);
    expect(c7430.secondaries[1].name).toBe('Helong');
    expect(c7430.secondaries[1].emissionDelayUs).toBeCloseTo(30852.32, 2);

    // Chain 8390 (China East Sea)
    const c8390 = CHEOLJ_REFERENCE_CHAINS[8390];
    expect(c8390.griUs).toBe(83900);
    expect(c8390.master.name).toBe('Xuancheng');
    expect(c8390.master.emissionDelayUs).toBe(10000.0);
    expect(c8390.secondaries[0].name).toBe('Raoping');
    expect(c8390.secondaries[0].emissionDelayUs).toBeCloseTo(13795.52, 2);
    expect(c8390.secondaries[1].name).toBe('Rongcheng');
    expect(c8390.secondaries[1].emissionDelayUs).toBeCloseTo(31459.70, 2);

    // Chain 9930 (East Asia)
    const c9930 = CHEOLJ_REFERENCE_CHAINS[9930];
    expect(c9930.griUs).toBe(99300);
    expect(c9930.master.name).toBe('Pohang');
    expect(c9930.secondaries).toHaveLength(3);
    expect(c9930.secondaries[0].name).toBe('Kwangju');
    expect(c9930.secondaries[0].emissionDelayUs).toBeCloseTo(11946.97, 2);
    expect(c9930.secondaries[1].name).toBe('Ussuriisk');
    expect(c9930.secondaries[1].emissionDelayUs).toBeCloseTo(54162.44, 2);
    expect(c9930.secondaries[2].name).toBe('Incheon');
    expect(c9930.secondaries[2].emissionDelayUs).toBeCloseTo(81352.00, 2);
  });

  it('provides exact Phase Code Interval (PCI) alternating patterns for GRI A and B', () => {
    // Master: 10 elements (pulse 1..8, 1 ms guard at index 8, pulse 9 at index 9)
    expect(CHEOLJ_PCI_CODES.master.A).toEqual([1, 1, -1, -1, 1, -1, 1, -1, 0, 1]);
    expect(CHEOLJ_PCI_CODES.master.B).toEqual([1, -1, -1, 1, 1, 1, 1, 1, 0, -1]);

    // Secondary: 8 elements
    expect(CHEOLJ_PCI_CODES.secondary.A).toEqual([1, 1, 1, 1, 1, -1, -1, 1]);
    expect(CHEOLJ_PCI_CODES.secondary.B).toEqual([1, -1, 1, -1, 1, 1, -1, -1]);
  });

  it('synthesizes multi-station reference chain across single GRI A period', () => {
    const res = synthesizeCheolJReferenceChain({
      chainId: 7430,
      pciPeriod: 'A',
      sampleRate: 100000, // 100 kHz (10 µs step)
      includeCarrier: true,
    });

    expect(res.durationUs).toBe(74300);
    expect(res.timeUs.length).toBe(7430);
    expect(res.rfSignal.length).toBe(7430);
    expect(res.envelope.length).toBe(7430);
    expect(res.arrivals).toHaveLength(3); // Master + 2 secondaries
    expect(res.arrivals[0].station).toBe('Rongcheng');
    expect(res.arrivals[1].station).toBe('Xuancheng');
    expect(res.arrivals[2].station).toBe('Helong');
  });

  it('synthesizes full Phase Code Interval (2 × GRI) with alternating phase codes', () => {
    const res = synthesizeCheolJReferenceChain({
      chainId: 9930,
      pciPeriod: 'both',
      sampleRate: 100000,
      includeCarrier: true,
    });

    expect(res.durationUs).toBe(99300 * 2);
    expect(res.arrivals).toHaveLength(8); // 4 stations in GRI A + 4 stations in GRI B

    // Period A arrivals
    const periodA = res.arrivals.filter((a) => a.period === 'A');
    expect(periodA).toHaveLength(4);
    expect(periodA[0].edUs).toBe(10000.0);
    expect(periodA[1].edUs).toBeCloseTo(11946.97, 2);

    // Period B arrivals (offset by 1 GRI = 99,300 µs)
    const periodB = res.arrivals.filter((a) => a.period === 'B');
    expect(periodB).toHaveLength(4);
    expect(periodB[0].edUs).toBe(10000.0 + 99300);
    expect(periodB[1].edUs).toBeCloseTo(11946.97 + 99300, 2);
  });

  it('handles envelope-only mode without RF carrier modulation', () => {
    const res = synthesizeCheolJReferenceChain({
      chainId: 8390,
      pciPeriod: 'A',
      sampleRate: 100000,
      includeCarrier: false,
    });

    expect(res.rfSignal).toEqual(res.envelope);
  });

  it('throws descriptive error on invalid chainId', () => {
    expect(() => synthesizeCheolJReferenceChain({ chainId: 9999 })).toThrow(/Unknown CheolJ reference chain ID/);
  });
});
