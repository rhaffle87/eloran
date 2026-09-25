import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';
import https from 'node:https';
import http from 'node:http';
import zlib from 'node:zlib';

// Ensure IPv4 first on platforms like Windows where IPv6 might hang or timeout
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PROVENANCE_PATH = path.join(ROOT_DIR, 'docs', 'PROVENANCE.md');

const httpsAgent = new https.Agent({ family: 4, keepAlive: true });
const httpAgent = new http.Agent({ family: 4, keepAlive: true });

function normalizeWhitespace(str) {
  return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Fetch a URL with automatic redirect following, IPv4 enforcement,
 * and support for CSL JSON content-negotiation on DOI URLs.
 */
async function fetchWithRetry(urlStr, redirectCount = 0) {
  if (redirectCount > 8) {
    throw new Error(`Too many redirects (limit 8) for ${urlStr}`);
  }

  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(urlStr);
    } catch (err) {
      return reject(new Error(`Invalid URL: ${urlStr} (${err.message})`));
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;
    const agent = parsedUrl.protocol === 'https:' ? httpsAgent : httpAgent;

    const isCitationApi = parsedUrl.hostname.includes('doi.org') || parsedUrl.hostname.includes('crossref.org');
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LORAN-LAB-Verifier/1.0',
      'Accept': isCitationApi
        ? 'application/vnd.citationstyles.csl+json, application/json;q=0.9, */*;q=0.1'
        : 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.1',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    const req = client.get(parsedUrl, { agent, headers, timeout: 20000 }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = new URL(res.headers.location, parsedUrl).toString();
        res.resume();
        return resolve(fetchWithRetry(nextUrl, redirectCount + 1));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          buffer: buf,
          text: extractReadableText(buf, res.headers['content-type'] || ''),
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout (20s) fetching ${urlStr}`));
    });
  });
}

/**
 * Extract searchable text from response buffers:
 * - Decompresses PDF FlateDecode streams and extracts literal text
 * - Flattens JSON (CSL or API response) into full text including author names
 * - Decodes HTML/text as UTF-8
 */
function extractReadableText(buf, contentType) {
  // 1. PDF response
  if (contentType.includes('pdf') || buf.slice(0, 5).toString('ascii') === '%PDF-') {
    let pos = 0;
    let inflated = '';
    while (pos < buf.length) {
      const sStart = buf.indexOf('stream', pos);
      if (sStart === -1) break;
      if (sStart >= 3 && buf.slice(sStart - 3, sStart).toString() === 'end') {
        pos = sStart + 6;
        continue;
      }
      let start = sStart + 6;
      if (buf[start] === 13) start++;
      if (buf[start] === 10) start++;
      const sEnd = buf.indexOf('endstream', start);
      if (sEnd === -1) break;
      try {
        const uncompressed = zlib.inflateSync(buf.slice(start, sEnd));
        inflated += uncompressed.toString('latin1') + '\n';
      } catch {
        // stream not deflated or corrupt
      }
      pos = sEnd + 9;
    }

    const textParts = [];
    const textMatches = inflated.match(/\(([^()]+)\)/g);
    if (textMatches) {
      for (const m of textMatches) {
        textParts.push(m.slice(1, -1));
      }
    }
    return textParts.join(' ') + '\n' + inflated + '\n' + buf.toString('latin1');
  }

  // 2. JSON response (CSL citation metadata or REST API)
  if (contentType.includes('json') || buf.slice(0, 1).toString() === '{') {
    try {
      const json = JSON.parse(buf.toString('utf8'));
      let text = JSON.stringify(json);
      // Flatten authors if present
      if (Array.isArray(json.author)) {
        for (const a of json.author) {
          text += ` ${a.given || ''} ${a.family || ''}`;
        }
      }
      return text;
    } catch {
      // fallback to raw text
    }
  }

  // 3. HTML or plain text
  return buf.toString('utf8');
}

/**
 * Parse docs/PROVENANCE.md table in Section 1 to extract rows.
 */
function parseProvenanceMarkdown(content) {
  const lines = content.split('\n');
  const rows = [];
  let inSection1 = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('## 1. Master Citation')) {
      inSection1 = true;
      continue;
    }
    if (inSection1 && line.startsWith('## 2.')) {
      break;
    }

    if (!inSection1 || !line.startsWith('|')) continue;
    if (line.includes('---|---') || line.includes('Citation / Reference')) continue;

    // Split table row by unescaped pipe
    const cols = line.split('|').slice(1, -1).map(c => c.trim());
    if (cols.length < 5) continue;

    const citation = cols[0].replace(/\*\*/g, '').trim();
    const urlMatch = cols[1].match(/\((https?:\/\/[^)]+)\)/);
    const url = urlMatch ? urlMatch[1] : cols[1];
    const evidenceRaw = cols[2];
    const dateDetails = cols[3];
    const status = cols[4];

    // Only verify rows labeled SOURCED
    if (status.toUpperCase().includes('SOURCED')) {
      // Evidence strings can be enclosed in backticks or quotes, separated by `//`
      const evidenceParts = evidenceRaw
        .split('//')
        .map(p => p.replace(/[`"]/g, '').trim())
        .filter(Boolean);

      rows.push({
        citation,
        url,
        evidenceParts,
        dateDetails,
        status,
        lineNum: i + 1,
      });
    }
  }

  return rows;
}

async function main() {
  console.log('='.repeat(78));
  console.log('LORAN LAB — PROVENANCE MACHINE-VERIFICATION AUDIT');
  console.log('='.repeat(78));
  console.log(`Reading register: ${PROVENANCE_PATH}`);

  if (!fs.existsSync(PROVENANCE_PATH)) {
    console.error(`ERROR: File not found: ${PROVENANCE_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(PROVENANCE_PATH, 'utf8');
  const rows = parseProvenanceMarkdown(content);

  console.log(`Found ${rows.length} SOURCED entries to machine-check.\n`);

  let passCount = 0;
  let failCount = 0;
  const auditResults = [];

  for (const row of rows) {
    process.stdout.write(`Checking: ${row.citation.padEnd(38)} ... `);
    try {
      const res = await fetchWithRetry(row.url);
      const normalizedBody = normalizeWhitespace(res.text);

      const missing = [];
      for (const ev of row.evidenceParts) {
        const normEv = normalizeWhitespace(ev);
        if (!normalizedBody.includes(normEv)) {
          missing.push(ev);
        }
      }

      if (res.statusCode >= 200 && res.statusCode < 300 && missing.length === 0) {
        console.log(`PASS [HTTP ${res.statusCode}]`);
        passCount++;
        auditResults.push({
          citation: row.citation,
          status: 'PASS',
          code: res.statusCode,
          url: row.url,
          details: 'All evidence strings confirmed',
        });
      } else {
        const reason = missing.length > 0
          ? `Missing evidence: ${missing.map(m => `"${m}"`).join(', ')}`
          : `HTTP status ${res.statusCode}`;
        console.log(`FAIL [HTTP ${res.statusCode}] - ${reason}`);
        failCount++;
        auditResults.push({
          citation: row.citation,
          status: 'FAIL',
          code: res.statusCode,
          url: row.url,
          details: reason,
        });
      }
    } catch (err) {
      console.log(`FAIL [FETCH ERROR] - ${err.message}`);
      failCount++;
      auditResults.push({
        citation: row.citation,
        status: 'FAIL',
        code: 'ERR',
        url: row.url,
        details: err.message,
      });
    }
  }

  console.log('\n' + '='.repeat(78));
  console.log(`AUDIT SUMMARY: ${passCount} PASSED, ${failCount} FAILED out of ${rows.length} entries.`);
  console.log('='.repeat(78));

  if (failCount > 0) {
    console.error('\nOne or more SOURCED rows failed machine verification!');
    console.error('Per project protocol, any FAIL row must be marked UNVERIFIED.');
    process.exit(1);
  } else {
    console.log('\nAll SOURCED citations verified successfully against retrieved upstream data.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
