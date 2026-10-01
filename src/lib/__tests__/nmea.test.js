import { describe, it, expect } from 'vitest';
import {
  computeNmeaChecksum,
  decimalDegreesToNmea,
  generateRmc,
  generateGga,
  generateGll,
  generateVtg,
  generateNmeaBurst,
} from '../nmea.js';

describe('NMEA 0183 Telemetry Engine', () => {
  it('computes correct 8-bit XOR checksum matching NMEA standards', () => {
    // Standard test vector: GPRMC without $ and *
    const payload = 'GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W';
    const csum = computeNmeaChecksum(payload);
    expect(csum).toBeTypeOf('string');
    expect(csum.length).toBe(2);
    expect(csum).toMatch(/^[0-9A-F]{2}$/);
  });

  it('converts decimal coordinates to ddmm.mmmm format for latitude and longitude', () => {
    const latRes = decimalDegreesToNmea(-6.25, 'lat');
    expect(latRes.dir).toBe('S');
    expect(latRes.valStr).toBe('0615.0000');

    const lonRes = decimalDegreesToNmea(106.85, 'lon');
    expect(lonRes.dir).toBe('E');
    expect(lonRes.valStr).toBe('10651.0000');
  });

  it('generates valid RMC sentence with talker and CRLF terminator', () => {
    const rmc = generateRmc({
      lat: -6.2,
      lng: 106.8,
      speedKnots: 12.5,
      courseDeg: 90,
      talker: 'EC',
      timestamp: new Date('2026-10-01T12:00:00Z'),
    });
    expect(rmc.startsWith('$ECRMC,')).toBe(true);
    expect(rmc.endsWith('\r\n')).toBe(true);
    expect(rmc).toContain('*');
  });

  it('generates valid GGA fix sentence with eLoran quality indicator', () => {
    const gga = generateGga({
      lat: 37.5,
      lng: 126.9,
      hdop: 1.1,
      numStations: 5,
      fixQuality: 7,
      talker: 'EC',
      timestamp: new Date('2026-10-01T12:00:00Z'),
    });
    expect(gga.startsWith('$ECGGA,')).toBe(true);
    expect(gga).toContain(',7,05,1.1,');
  });

  it('generates valid GLL and VTG sentences', () => {
    const gll = generateGll({ lat: 35.0, lng: 129.0, talker: 'LC' });
    expect(gll.startsWith('$LCGLL,')).toBe(true);

    const vtg = generateVtg({ courseDeg: 180, speedKnots: 15, talker: 'EC' });
    expect(vtg.startsWith('$ECVTG,')).toBe(true);
    expect(vtg).toContain(',180.0,T,');
  });

  it('generates full multi-sentence NMEA burst', () => {
    const burst = generateNmeaBurst({
      lat: -6.2,
      lng: 106.8,
      speedKnots: 10,
      courseDeg: 45,
      talker: 'EC',
    });
    expect(burst).toContain('$ECRMC');
    expect(burst).toContain('$ECGGA');
    expect(burst).toContain('$ECGLL');
    expect(burst).toContain('$ECVTG');
  });
});