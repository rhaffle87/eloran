/**
 * SIMULORAN — Local Network WebSocket & Signal K Streaming Bridge (networkStream.js)
 *
 * Implements:
 * 1. Signal K JSON Delta specification (v1.5.0) formatting for marine IoT integration.
 * 2. Real-time NMEA 0183 raw ASCII and Signal K WebSocket client streamer.
 * 3. Browser BroadcastChannel inter-tab streaming bridge (zero daemon required).
 * 4. Automatic reconnection with exponential backoff and telemetry accounting.
 *
 * References:
 *   - Signal K Specification v1.5.0: https://signalk.org/specification/1.5.0/
 *   - NMEA 0183 Standard for Interfacing Marine Electronic Devices
 *   - OpenCPN Network Connections Guide: TCP/UDP/WebSocket on port 10110
 */

export const STREAM_PROTOCOLS = {
  NMEA0183: 'nmea0183',
  SIGNAL_K: 'signalk',
  DUAL: 'dual',
};

export const CONNECTION_STATUS = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  ERROR: 'ERROR',
};

export const DEFAULT_STREAM_CONFIG = {
  endpointUrl: 'ws://localhost:10110',
  protocol: STREAM_PROTOCOLS.NMEA0183,
  vesselUrn: 'vessels.urn:mrn:signalk:uuid:simuloran-vessel-01',
  autoReconnect: false, // Strictly user-initiated by default; avoids localhost connection spam
  reconnectIntervalMs: 3000,
  maxReconnectAttempts: 3,
  broadcastChannelName: 'simuloran_marine_telemetry',
};

/**
 * Converts speed in knots to meters per second (SI unit for Signal K).
 */
export function knotsToMps(knots = 0) {
  return knots * 0.514444444;
}

/**
 * Converts course in degrees to radians (SI unit for Signal K).
 */
export function degreesToRadians(degrees = 0) {
  return (degrees * Math.PI) / 180.0;
}

/**
 * Formats a navigation fix into a standard Signal K Delta JSON structure.
 *
 * @param {object} navData
 * @param {number} navData.lat - Latitude in decimal degrees
 * @param {number} navData.lng - Longitude in decimal degrees
 * @param {number} [navData.speedKnots=0] - Speed over ground in knots
 * @param {number} [navData.courseDeg=0] - Course over ground in true degrees
 * @param {number} [navData.hdop=1.0] - Horizontal Dilution of Precision
 * @param {string} [navData.talker='EC'] - NMEA talker (EC = eLoran, GP = GPS)
 * @param {Date|number} [navData.timestamp] - Fix timestamp
 * @param {string} [vesselUrn] - Target vessel context
 * @returns {object} Standard Signal K Delta JSON object
 */
export function formatSignalKDelta(navData, vesselUrn = DEFAULT_STREAM_CONFIG.vesselUrn) {
  const ts = navData.timestamp instanceof Date
    ? navData.timestamp.toISOString()
    : typeof navData.timestamp === 'number'
    ? new Date(navData.timestamp).toISOString()
    : new Date().toISOString();

  const values = [
    {
      path: 'navigation.position',
      value: {
        latitude: parseFloat(navData.lat.toFixed(6)),
        longitude: parseFloat(navData.lng.toFixed(6)),
      },
    },
    {
      path: 'navigation.courseOverGroundTrue',
      value: parseFloat(degreesToRadians(navData.courseDeg || 0).toFixed(4)),
    },
    {
      path: 'navigation.speedOverGround',
      value: parseFloat(knotsToMps(navData.speedKnots || 0).toFixed(3)),
    },
    {
      path: 'navigation.gnss.methodQuality',
      value: navData.talker === 'EC' ? 'eLoran' : navData.talker === 'LC' ? 'Loran-C' : 'GNSS',
    },
    {
      path: 'navigation.gnss.horizontalDilution',
      value: parseFloat((navData.hdop || 1.0).toFixed(2)),
    },
  ];

  if (typeof navData.altitudeM === 'number') {
    values.push({
      path: 'navigation.gnss.antennaAltitude',
      value: parseFloat(navData.altitudeM.toFixed(1)),
    });
  }

  return {
    context: vesselUrn,
    updates: [
      {
        source: {
          label: 'SIMULORAN',
          type: 'eLoran/Radionavigation-Sim',
          talker: navData.talker || 'EC',
        },
        timestamp: ts,
        values,
      },
    ],
  };
}

/**
 * Creates a reactive Network Streamer instance managing WebSocket and BroadcastChannel transmissions.
 *
 * @param {object} [userConfig]
 * @param {function} [onStatusChange]
 * @returns {object} Controller interface
 */
export function createNetworkStreamer(userConfig = {}, onStatusChange = null) {
  const config = { ...DEFAULT_STREAM_CONFIG, ...userConfig };

  let ws = null;
  let broadcastChannel = null;
  let status = CONNECTION_STATUS.DISCONNECTED;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let isExplicitlyClosed = false;

  const stats = {
    bytesSent: 0,
    messagesSent: 0,
    nmeaSent: 0,
    signalkSent: 0,
    connectedAt: null,
    lastError: null,
  };

  // Initialize BroadcastChannel if available in browser environment
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      broadcastChannel = new BroadcastChannel(config.broadcastChannelName);
    } catch {
      broadcastChannel = null;
    }
  }

  function setStatus(newStatus, error = null) {
    status = newStatus;
    if (error) stats.lastError = error;
    if (newStatus === CONNECTION_STATUS.CONNECTED) {
      stats.connectedAt = Date.now();
      reconnectAttempts = 0;
    }
    if (typeof onStatusChange === 'function') {
      onStatusChange(status, { ...stats });
    }
  }

  function connect() {
    isExplicitlyClosed = false;
    if (typeof WebSocket === 'undefined') {
      setStatus(CONNECTION_STATUS.ERROR, 'WebSocket API is not supported in this runtime');
      return;
    }

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setStatus(CONNECTION_STATUS.CONNECTING);

    try {
      ws = new WebSocket(config.endpointUrl);

      ws.onopen = () => {
        setStatus(CONNECTION_STATUS.CONNECTED);
      };

      ws.onclose = () => {
        ws = null;
        if (!isExplicitlyClosed) {
          setStatus(CONNECTION_STATUS.DISCONNECTED);
          scheduleReconnect();
        } else {
          setStatus(CONNECTION_STATUS.DISCONNECTED);
        }
      };

      ws.onerror = (evt) => {
        const msg = evt?.message || 'WebSocket connection error';
        setStatus(CONNECTION_STATUS.ERROR, msg);
      };
    } catch (err) {
      setStatus(CONNECTION_STATUS.ERROR, err?.message || 'Failed to initialize WebSocket');
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (!config.autoReconnect || isExplicitlyClosed || reconnectAttempts >= config.maxReconnectAttempts) return;
    reconnectAttempts += 1;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connect();
    }, config.reconnectIntervalMs);
  }

  function disconnect() {
    isExplicitlyClosed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      try {
        ws.close();
      } catch {
        /* noop */
      }
      ws = null;
    }
    setStatus(CONNECTION_STATUS.DISCONNECTED);
  }

  /**
   * Transmits data payload across the active stream channels.
   *
   * @param {object} payload
   * @param {string} [payload.nmea] - Raw NMEA 0183 ASCII string
   * @param {object} [payload.navData] - Raw navigation telemetry object for Signal K
   */
  function send({ nmea, navData }) {
    let payloadStr = '';
    const sendsNmea = config.protocol === STREAM_PROTOCOLS.NMEA0183 || config.protocol === STREAM_PROTOCOLS.DUAL;
    const sendsSignalK = config.protocol === STREAM_PROTOCOLS.SIGNAL_K || config.protocol === STREAM_PROTOCOLS.DUAL;

    if (sendsNmea && nmea) {
      payloadStr += nmea;
      stats.nmeaSent += 1;
    }

    let skJson = null;
    if (sendsSignalK && navData) {
      skJson = formatSignalKDelta(navData, config.vesselUrn);
      const skStr = JSON.stringify(skJson) + '\r\n';
      payloadStr += skStr;
      stats.signalkSent += 1;
    }

    if (!payloadStr) return false;

    // 1. Send via local BroadcastChannel
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({
          type: 'SIMULORAN_TELEMETRY',
          nmea: nmea || null,
          signalK: skJson || null,
          timestamp: Date.now(),
        });
      } catch {
        /* noop */
      }
    }

    // 2. Send via WebSocket if connected
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payloadStr);
        stats.bytesSent += payloadStr.length;
        stats.messagesSent += 1;
        return true;
      } catch (err) {
        stats.lastError = err?.message || 'Failed to send packet';
        return false;
      }
    }

    return false;
  }

  function updateConfig(newConfig) {
    const prevUrl = config.endpointUrl;
    Object.assign(config, newConfig);
    if (newConfig.endpointUrl && newConfig.endpointUrl !== prevUrl && status === CONNECTION_STATUS.CONNECTED) {
      disconnect();
      connect();
    }
  }

  function getStats() {
    return {
      ...stats,
      status,
      config: { ...config },
      uptimeSec: stats.connectedAt ? Math.round((Date.now() - stats.connectedAt) / 1000) : 0,
    };
  }

  return {
    connect,
    disconnect,
    send,
    updateConfig,
    getStats,
    getStatus: () => status,
  };
}
