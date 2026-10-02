import { describe, it, expect, vi } from 'vitest';
import {
  STREAM_PROTOCOLS,
  CONNECTION_STATUS,
  knotsToMps,
  degreesToRadians,
  formatSignalKDelta,
  createNetworkStreamer,
} from '../networkStream.js';

describe('Local Network WebSocket & Signal K Streaming Bridge', () => {
  describe('Unit Conversions', () => {
    it('converts knots to meters per second accurately', () => {
      expect(knotsToMps(0)).toBe(0);
      expect(knotsToMps(10)).toBeCloseTo(5.144, 3);
      expect(knotsToMps(20)).toBeCloseTo(10.2889, 3);
    });

    it('converts degrees to radians accurately', () => {
      expect(degreesToRadians(0)).toBe(0);
      expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2, 5);
      expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 5);
      expect(degreesToRadians(360)).toBeCloseTo(2 * Math.PI, 5);
    });
  });

  describe('Signal K Delta Formatting', () => {
    it('generates standard compliant Signal K JSON delta for eLoran', () => {
      const navData = {
        lat: 37.456321,
        lng: 126.705234,
        speedKnots: 14.5,
        courseDeg: 95.0,
        hdop: 1.25,
        altitudeM: 5.2,
        talker: 'EC',
        timestamp: new Date('2026-10-02T10:00:00.000Z'),
      };

      const delta = formatSignalKDelta(navData);

      expect(delta).toBeDefined();
      expect(delta.context).toBe('vessels.urn:mrn:signalk:uuid:simuloran-vessel-01');
      expect(Array.isArray(delta.updates)).toBe(true);
      expect(delta.updates.length).toBe(1);

      const update = delta.updates[0];
      expect(update.source.label).toBe('SIMULORAN');
      expect(update.source.talker).toBe('EC');
      expect(update.timestamp).toBe('2026-10-02T10:00:00.000Z');

      const values = update.values;
      const posVal = values.find((v) => v.path === 'navigation.position');
      expect(posVal).toBeDefined();
      expect(posVal.value.latitude).toBeCloseTo(37.456321, 6);
      expect(posVal.value.longitude).toBeCloseTo(126.705234, 6);

      const cogVal = values.find((v) => v.path === 'navigation.courseOverGroundTrue');
      expect(cogVal.value).toBeCloseTo(degreesToRadians(95.0), 3);

      const sogVal = values.find((v) => v.path === 'navigation.speedOverGround');
      expect(sogVal.value).toBeCloseTo(knotsToMps(14.5), 3);

      const qualVal = values.find((v) => v.path === 'navigation.gnss.methodQuality');
      expect(qualVal.value).toBe('eLoran');

      const hdopVal = values.find((v) => v.path === 'navigation.gnss.horizontalDilution');
      expect(hdopVal.value).toBe(1.25);

      const altVal = values.find((v) => v.path === 'navigation.gnss.antennaAltitude');
      expect(altVal.value).toBe(5.2);
    });

    it('assigns Loran-C and GNSS quality indicators based on talker', () => {
      const lcDelta = formatSignalKDelta({ lat: 35, lng: 135, talker: 'LC' });
      expect(lcDelta.updates[0].values.find((v) => v.path === 'navigation.gnss.methodQuality').value).toBe('Loran-C');

      const gpDelta = formatSignalKDelta({ lat: 35, lng: 135, talker: 'GP' });
      expect(gpDelta.updates[0].values.find((v) => v.path === 'navigation.gnss.methodQuality').value).toBe('GNSS');
    });
  });

  describe('createNetworkStreamer', () => {
    it('initializes with default disconnected state and configuration', () => {
      const streamer = createNetworkStreamer();
      expect(streamer.getStatus()).toBe(CONNECTION_STATUS.DISCONNECTED);

      const stats = streamer.getStats();
      expect(stats.status).toBe(CONNECTION_STATUS.DISCONNECTED);
      expect(stats.bytesSent).toBe(0);
      expect(stats.messagesSent).toBe(0);
      expect(stats.nmeaSent).toBe(0);
      expect(stats.signalkSent).toBe(0);
    });

    it('tracks message counters during send operations', () => {
      const streamer = createNetworkStreamer({
        protocol: STREAM_PROTOCOLS.DUAL,
      });

      const navData = {
        lat: 37.4,
        lng: 126.7,
        speedKnots: 10,
        courseDeg: 45,
      };
      const nmea = '$ECRMC,100000.00,A,3724.0000,N,12642.0000,E,10.0,045.0,021026,,,A*00\r\n';

      // Send when disconnected (should update counters and not throw)
      streamer.send({ nmea, navData });

      const stats = streamer.getStats();
      expect(stats.nmeaSent).toBe(1);
      expect(stats.signalkSent).toBe(1);
    });

    it('triggers onStatusChange callbacks when provided', () => {
      const onStatus = vi.fn();
      const streamer = createNetworkStreamer({}, onStatus);

      streamer.disconnect();
      expect(onStatus).toHaveBeenCalled();
      expect(onStatus).toHaveBeenCalledWith(CONNECTION_STATUS.DISCONNECTED, expect.any(Object));
    });

    it('updates configuration dynamically', () => {
      const streamer = createNetworkStreamer();
      streamer.updateConfig({
        protocol: STREAM_PROTOCOLS.SIGNAL_K,
        vesselUrn: 'vessels.urn:mrn:signalk:custom-vessel',
      });

      const stats = streamer.getStats();
      expect(stats.config.protocol).toBe(STREAM_PROTOCOLS.SIGNAL_K);
      expect(stats.config.vesselUrn).toBe('vessels.urn:mrn:signalk:custom-vessel');
    });
  });
});
