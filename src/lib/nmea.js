/**
 * NMEA 0183 Radionavigation Telemetry Engine for SIMULORAN
 * Generates standard maritime NMEA sentences for GPS, Loran-C, and eLoran receivers.
 */

export function computeNmeaChecksum(sentenceWithoutDollar) {
  let checksum = 0;
  for (let i = 0; i < sentenceWithoutDollar.length; i++) {
    checksum ^= sentenceWithoutDollar.charCodeAt(i);
  }
  return checksum.toString(16).toUpperCase().padStart(2, '0');
}

export function decimalDegreesToNmea(deg, type) {
  const isLat = type === 'lat';
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  const absDeg = Math.abs(deg);
  const degrees = Math.floor(absDeg);
  const minutes = (absDeg - degrees) * 60;

  const degStr = degrees.toString().padStart(isLat ? 2 : 3, '0');
  const minStr = minutes.toFixed(4).padStart(7, '0');

  return {
    valStr: degStr + minStr,
    dir,
  };
}

export function formatNmeaTime(dateOrSec) {
  const d = dateOrSec instanceof Date ? dateOrSec : (typeof dateOrSec === 'number' ? new Date(dateOrSec * 1000) : new Date());
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  const ms = Math.floor(d.getUTCMilliseconds() / 10).toString().padStart(2, '0');
  return hh + mm + ss + '.' + ms;
}

export function formatNmeaDate(dateOrSec) {
  const d = dateOrSec instanceof Date ? dateOrSec : (typeof dateOrSec === 'number' ? new Date(dateOrSec * 1000) : new Date());
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const yy = (d.getUTCFullYear() % 100).toString().padStart(2, '0');
  return dd + mm + yy;
}

export function wrapNmeaSentence(payload) {
  const csum = computeNmeaChecksum(payload);
  return '$' + payload + '*' + csum + '\r\n';
}

export function generateRmc({
  lat,
  lng,
  speedKnots = 0,
  courseDeg = 0,
  talker = 'EC',
  timestamp,
  mode = 'A',
}) {
  const timeStr = formatNmeaTime(timestamp);
  const dateStr = formatNmeaDate(timestamp);
  const latNmea = decimalDegreesToNmea(lat, 'lat');
  const lonNmea = decimalDegreesToNmea(lng, 'lon');
  const spd = speedKnots.toFixed(1);
  const cog = courseDeg.toFixed(1).padStart(5, '0');

  const payload = talker + 'RMC,' + timeStr + ',A,' + latNmea.valStr + ',' + latNmea.dir + ',' + lonNmea.valStr + ',' + lonNmea.dir + ',' + spd + ',' + cog + ',' + dateStr + ',,,' + mode;
  return wrapNmeaSentence(payload);
}

export function generateGga({
  lat,
  lng,
  hdop = 1.0,
  altitudeM = 0,
  numStations = 4,
  fixQuality = 7,
  talker = 'EC',
  timestamp,
}) {
  const timeStr = formatNmeaTime(timestamp);
  const latNmea = decimalDegreesToNmea(lat, 'lat');
  const lonNmea = decimalDegreesToNmea(lng, 'lon');
  const stCount = numStations.toString().padStart(2, '0');
  const dop = hdop.toFixed(1);
  const alt = altitudeM.toFixed(1);

  const payload = talker + 'GGA,' + timeStr + ',' + latNmea.valStr + ',' + latNmea.dir + ',' + lonNmea.valStr + ',' + lonNmea.dir + ',' + fixQuality + ',' + stCount + ',' + dop + ',' + alt + ',M,0.0,M,,';
  return wrapNmeaSentence(payload);
}

export function generateGll({ lat, lng, talker = 'EC', timestamp }) {
  const timeStr = formatNmeaTime(timestamp);
  const latNmea = decimalDegreesToNmea(lat, 'lat');
  const lonNmea = decimalDegreesToNmea(lng, 'lon');

  const payload = talker + 'GLL,' + latNmea.valStr + ',' + latNmea.dir + ',' + lonNmea.valStr + ',' + lonNmea.dir + ',' + timeStr + ',A,A';
  return wrapNmeaSentence(payload);
}

export function generateVtg({ courseDeg = 0, speedKnots = 0, talker = 'EC' }) {
  const cogT = courseDeg.toFixed(1).padStart(5, '0');
  const spdKn = speedKnots.toFixed(1);
  const spdKm = (speedKnots * 1.852).toFixed(1);

  const payload = talker + 'VTG,' + cogT + ',T,,M,' + spdKn + ',N,' + spdKm + ',K,A';
  return wrapNmeaSentence(payload);
}

export function generateNmeaBurst(navData) {
  return [
    generateRmc(navData),
    generateGga(navData),
    generateGll(navData),
    generateVtg(navData),
  ].join('');
}