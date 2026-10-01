/**
 * Kinematic Trajectory Importer and Exporter for SIMULORAN
 * Parses GPX, KML, and CSV waypoint files for realistic vessel simulation.
 * Pure JS implementation with regex parsing for universal browser and Node.js execution.
 */

import { MS_TO_KNOTS, KNOTS_TO_MS } from './trajectory.js';

const DEFAULT_VESSEL_SPEED_KTS = 15;

export function parseGpx(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('Invalid GPX payload');
  }

  const nameMatch = xmlString.match(/<(?:trk|rte|gpx)[^>]*>[\s\S]*?<name>([^<]+)<\/name>/i);
  const name = nameMatch ? nameMatch[1].trim() : 'Imported GPX Track';

  const waypoints = [];
  const ptRegex = /<(?:trkpt|wpt|rtept)\s+([^>]*?)>([\s\S]*?)<\/(?:trkpt|wpt|rtept)>/gi;
  let match;

  while ((match = ptRegex.exec(xmlString)) !== null) {
    const attrs = match[1];
    const body = match[2];

    const latMatch = attrs.match(/lat=["']([^"']+)["']/i);
    const lonMatch = attrs.match(/lon=["']([^"']+)["']/i);

    if (latMatch && lonMatch) {
      const lat = parseFloat(latMatch[1]);
      const lng = parseFloat(lonMatch[1]);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const labelMatch = body.match(/<name>([^<]+)<\/name>/i);
        const label = labelMatch ? labelMatch[1].trim() : `WP-${waypoints.length + 1}`;

        const speedMatch = body.match(/<speed>([\d.]+)<\/speed>/i);
        let speedKts = DEFAULT_VESSEL_SPEED_KTS;
        if (speedMatch) {
          const speedMs = parseFloat(speedMatch[1]);
          if (Number.isFinite(speedMs) && speedMs > 0) {
            speedKts = Number((speedMs * MS_TO_KNOTS).toFixed(1));
          }
        }

        waypoints.push({ lat, lng, speedKts, label });
      }
    }
  }

  if (waypoints.length === 0) {
    const selfClosingRegex = /<(?:trkpt|wpt|rtept)\s+([^>]*?)\/>/gi;
    while ((match = selfClosingRegex.exec(xmlString)) !== null) {
      const attrs = match[1];
      const latMatch = attrs.match(/lat=["']([^"']+)["']/i);
      const lonMatch = attrs.match(/lon=["']([^"']+)["']/i);
      if (latMatch && lonMatch) {
        const lat = parseFloat(latMatch[1]);
        const lng = parseFloat(lonMatch[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          waypoints.push({
            lat,
            lng,
            speedKts: DEFAULT_VESSEL_SPEED_KTS,
            label: `WP-${waypoints.length + 1}`,
          });
        }
      }
    }
  }

  if (waypoints.length < 2) {
    throw new Error('Trajectory file must contain at least 2 valid coordinates');
  }

  return { name, waypoints };
}

export function parseKml(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('Invalid KML payload');
  }

  const nameMatch = xmlString.match(/<(?:Document|Placemark|kml)[^>]*>[\s\S]*?<name>([^<]+)<\/name>/i);
  const name = nameMatch ? nameMatch[1].trim() : 'Imported KML Path';

  const coordMatch = xmlString.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
  if (!coordMatch) {
    throw new Error('Trajectory file must contain at least 2 valid coordinates');
  }

  const rawCoords = coordMatch[1].trim().split(/\s+/);
  const waypoints = [];

  rawCoords.forEach((tupleStr, idx) => {
    const parts = tupleStr.split(',');
    if (parts.length >= 2) {
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        waypoints.push({
          lat,
          lng,
          speedKts: DEFAULT_VESSEL_SPEED_KTS,
          label: `WP-${idx + 1}`,
        });
      }
    }
  });

  if (waypoints.length < 2) {
    throw new Error('Trajectory file must contain at least 2 valid coordinates');
  }

  return { name, waypoints };
}

export function parseCsv(csvString) {
  if (!csvString || typeof csvString !== 'string') {
    throw new Error('Invalid CSV payload');
  }

  const rawLines = csvString.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) {
    throw new Error('Trajectory file must contain at least 2 valid coordinates');
  }

  const firstLine = rawLines[0].toLowerCase();
  const isHeader = firstLine.includes('lat') || firstLine.includes('lon') || firstLine.includes('lng');

  let latCol = 0;
  let lngCol = 1;
  let speedCol = -1;
  let labelCol = -1;
  let dataLines = rawLines;

  if (isHeader) {
    const headers = rawLines[0].split(/[,\t]/).map((h) => h.trim().toLowerCase());
    headers.forEach((h, idx) => {
      if (h === 'lat' || h.includes('latitude') || h === 'y') latCol = idx;
      if (h === 'lng' || h === 'lon' || h.includes('longitude') || h === 'x') lngCol = idx;
      if (h.includes('speed') || h.includes('spd') || h.includes('knot') || h.includes('kts')) speedCol = idx;
      if (h.includes('label') || h.includes('name') || h.includes('waypoint') || h.includes('wp')) labelCol = idx;
    });
    dataLines = rawLines.slice(1);
  }

  const waypoints = [];
  dataLines.forEach((line) => {
    const cols = line.split(/[,\t]/).map((c) => c.trim());
    if (cols.length >= 2) {
      const lat = parseFloat(cols[latCol]);
      const lng = parseFloat(cols[lngCol]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        let speedKts = DEFAULT_VESSEL_SPEED_KTS;
        if (speedCol !== -1 && cols[speedCol]) {
          const parsedSpeed = parseFloat(cols[speedCol]);
          if (Number.isFinite(parsedSpeed) && parsedSpeed > 0) {
            speedKts = parsedSpeed;
          }
        }
        const label = labelCol !== -1 && cols[labelCol] ? cols[labelCol] : `WP-${waypoints.length + 1}`;
        waypoints.push({ lat, lng, speedKts, label });
      }
    }
  });

  if (waypoints.length < 2) {
    throw new Error('Trajectory file must contain at least 2 valid coordinates');
  }

  return {
    name: 'Imported CSV Route',
    waypoints,
  };
}

export function parseTrajectoryFile(content, fileName = '') {
  const ext = fileName.toLowerCase().split('.').pop();

  if (ext === 'gpx' || content.includes('<gpx') || content.includes('<trkpt')) {
    return parseGpx(content);
  }

  if (ext === 'kml' || content.includes('<kml') || content.includes('<coordinates')) {
    return parseKml(content);
  }

  return parseCsv(content);
}

export function exportTrajectoryToGpx(waypoints, name = 'Simuloran Route') {
  let gpx = '<?xml version="1.0" encoding="UTF-8"?>\r\n';
  gpx += '<gpx version="1.1" creator="SIMULORAN eLoran Simulator">\r\n';
  gpx += '  <trk>\r\n';
  gpx += `    <name>${name}</name>\r\n`;
  gpx += '    <trkseg>\r\n';

  waypoints.forEach((wp, idx) => {
    const speedMs = ((wp.speedKts || DEFAULT_VESSEL_SPEED_KTS) * KNOTS_TO_MS).toFixed(2);
    gpx += `      <trkpt lat="${wp.lat.toFixed(6)}" lon="${wp.lng.toFixed(6)}">\r\n`;
    gpx += `        <name>${wp.label || `WP-${idx + 1}`}</name>\r\n`;
    gpx += `        <speed>${speedMs}</speed>\r\n`;
    gpx += '      </trkpt>\r\n';
  });

  gpx += '    </trkseg>\r\n';
  gpx += '  </trk>\r\n';
  gpx += '</gpx>\r\n';
  return gpx;
}

export function exportTrajectoryToCsv(waypoints) {
  let csv = 'lat,lng,speedKts,label\r\n';
  waypoints.forEach((wp, idx) => {
    csv += `${wp.lat.toFixed(6)},${wp.lng.toFixed(6)},${wp.speedKts || DEFAULT_VESSEL_SPEED_KTS},${wp.label || `WP-${idx + 1}`}\r\n`;
  });
  return csv;
}