import { describe, it, expect } from 'vitest';
import {
  parseGpx,
  parseKml,
  parseCsv,
  parseTrajectoryFile,
  exportTrajectoryToGpx,
  exportTrajectoryToCsv,
} from '../trajectoryParser.js';

describe('Trajectory Parser (GPX, KML, CSV)', () => {
  const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="OpenCPN">
  <trk>
    <name>Maasvlakte Entrance Approach</name>
    <trkseg>
      <trkpt lat="51.9860" lon="4.0750">
        <name>WP1</name>
        <speed>7.72</speed>
      </trkpt>
      <trkpt lat="51.9920" lon="4.0880">
        <name>WP2</name>
        <speed>6.17</speed>
      </trkpt>
      <trkpt lat="52.0010" lon="4.1050">
        <name>WP3</name>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

  const sampleKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Europort TSS Channel</name>
    <Placemark>
      <LineString>
        <coordinates>
          4.0750,51.9860,0
          4.0880,51.9920,0
          4.1050,52.0010,0
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

  const sampleCsvWithHeader = `lat,lng,speedKts,label
51.9860,4.0750,15.0,Maas-Center
51.9920,4.0880,12.0,Hook-Light
52.0010,4.1050,8.0,Maasvlakte-Berth`;

  const sampleCsvRaw = `51.9860, 4.0750
51.9920, 4.0880
52.0010, 4.1050`;

  it('parses GPX tracks accurately with coordinates, labels, and speeds', () => {
    const res = parseGpx(sampleGpx);
    expect(res.name).toBe('Maasvlakte Entrance Approach');
    expect(res.waypoints).toHaveLength(3);
    expect(res.waypoints[0].lat).toBeCloseTo(51.986, 4);
    expect(res.waypoints[0].lng).toBeCloseTo(4.075, 4);
    expect(res.waypoints[0].label).toBe('WP1');
    expect(res.waypoints[0].speedKts).toBeGreaterThan(14); // 7.72 m/s ~ 15 kts
    expect(res.waypoints[2].speedKts).toBe(15); // default fallback
  });

  it('parses KML coordinates correctly (lon,lat,alt format)', () => {
    const res = parseKml(sampleKml);
    expect(res.name).toBe('Europort TSS Channel');
    expect(res.waypoints).toHaveLength(3);
    expect(res.waypoints[0].lat).toBeCloseTo(51.986, 4);
    expect(res.waypoints[0].lng).toBeCloseTo(4.075, 4);
    expect(res.waypoints[1].lat).toBeCloseTo(51.992, 4);
    expect(res.waypoints[1].lng).toBeCloseTo(4.088, 4);
  });

  it('parses CSV with headers', () => {
    const res = parseCsv(sampleCsvWithHeader);
    expect(res.waypoints).toHaveLength(3);
    expect(res.waypoints[0].label).toBe('Maas-Center');
    expect(res.waypoints[0].speedKts).toBe(15.0);
    expect(res.waypoints[1].speedKts).toBe(12.0);
    expect(res.waypoints[2].label).toBe('Maasvlakte-Berth');
  });

  it('parses raw headerless lat/lng CSV rows', () => {
    const res = parseCsv(sampleCsvRaw);
    expect(res.waypoints).toHaveLength(3);
    expect(res.waypoints[0].lat).toBeCloseTo(51.986, 4);
    expect(res.waypoints[0].lng).toBeCloseTo(4.075, 4);
    expect(res.waypoints[0].speedKts).toBe(15);
  });

  it('auto-detects format from filename or content in parseTrajectoryFile', () => {
    const gpxRes = parseTrajectoryFile(sampleGpx, 'route.gpx');
    expect(gpxRes.waypoints).toHaveLength(3);

    const kmlRes = parseTrajectoryFile(sampleKml, 'survey.kml');
    expect(kmlRes.waypoints).toHaveLength(3);

    const csvRes = parseTrajectoryFile(sampleCsvWithHeader, 'waypoints.csv');
    expect(csvRes.waypoints).toHaveLength(3);
  });

  it('throws helpful errors when points are insufficient', () => {
    const singlePointCsv = '51.9860, 4.0750';
    expect(() => parseCsv(singlePointCsv)).toThrow(/at least 2 valid coordinates/i);
  });

  it('exports trajectories back to GPX and CSV strings', () => {
    const waypoints = [
      { lat: 51.986, lng: 4.075, speedKts: 15, label: 'WP1' },
      { lat: 52.001, lng: 4.105, speedKts: 10, label: 'WP2' },
    ];
    const gpx = exportTrajectoryToGpx(waypoints, 'Exported Route');
    expect(gpx).toContain('<gpx');
    expect(gpx).toContain('51.986');
    expect(gpx).toContain('4.075');

    const csv = exportTrajectoryToCsv(waypoints);
    expect(csv).toContain('lat,lng,speedKts,label');
    expect(csv).toContain('51.986');
    expect(csv).toContain('4.075');
  });
});