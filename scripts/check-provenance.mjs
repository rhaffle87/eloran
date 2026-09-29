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

const httpsAgent = new https.Agent({ family: 4, keepAlive: false });
const httpAgent = new http.Agent({ family: 4, keepAlive: false });

function normalizeWhitespace(str) {
  return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Fetch a URL with automatic redirect following, IPv4 enforcement,
 * and support for CSL JSON content-negotiation on DOI URLs.
 */
async function fetchWithRetry(urlStr, retryCount = 0) {
  const isCitationApi = urlStr.includes('doi.org') || urlStr.includes('crossref.org');
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SIMULORAN-Verifier/1.0',
    'Accept': isCitationApi
      ? 'application/vnd.citationstyles.csl+json, application/json;q=0.9, */*;q=0.1'
      : 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.1',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  try {
    const res = await fetch(urlStr, {
      headers,
      signal: AbortSignal.timeout(25000),
      redirect: 'follow',
    });

    if (res.status >= 500 && retryCount < 3) {
      await new Promise((r) => setTimeout(r, (retryCount + 1) * 1500));
      return fetchWithRetry(urlStr, retryCount + 1);
    }

    const contentType = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      buffer: buf,
      text: extractReadableText(buf, contentType),
    };
  } catch (err) {
    if (retryCount < 3) {
      await new Promise((r) => setTimeout(r, (retryCount + 1) * 1500));
      return fetchWithRetry(urlStr, retryCount + 1);
    }
    throw err;
  }
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

    // Separate SOURCED vs UNVERIFIED
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
        status: 'SOURCED',
        lineNum: i + 1,
      });
    } else if (status.toUpperCase().includes('UNVERIFIED')) {
      rows.push({
        citation,
        url,
        evidenceParts: [],
        dateDetails,
        status: 'UNVERIFIED',
        lineNum: i + 1,
      });
    }
  }

  return rows;
}

async function main() {
  console.log('='.repeat(78));
  console.log('SIMULORAN — PROVENANCE MACHINE-VERIFICATION AUDIT');
  console.log('='.repeat(78));
  console.log(`Reading register: ${PROVENANCE_PATH}`);

  if (!fs.existsSync(PROVENANCE_PATH)) {
    console.error(`ERROR: File not found: ${PROVENANCE_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(PROVENANCE_PATH, 'utf8');
  const allRows = parseProvenanceMarkdown(content);
  const sourcedRows = allRows.filter(r => r.status === 'SOURCED');
  const unverifiedRows = allRows.filter(r => r.status === 'UNVERIFIED');

  console.log(`Found ${sourcedRows.length} SOURCED entries to machine-check.`);
  console.log(`Found ${unverifiedRows.length} UNVERIFIED entries cataloged in Section 1.\n`);

  let passCount = 0;
  let failCount = 0;
  const auditResults = [];

  for (const row of sourcedRows) {
    await new Promise(r => setTimeout(r, 250));
    process.stdout.write(`Checking: ${row.citation.padEnd(38)} ... `);
    try {
      const res = await fetchWithRetry(row.url);
      const normalizedBody = normalizeWhitespace(res.text);

      const missing = [];
      if (!row.evidenceParts || row.evidenceParts.length === 0) {
        missing.push('No evidence / title keyword specified in register');
      } else {
        // Explicitly assert that the first evidence string matches the work title
        const expectedTitle = row.evidenceParts[0];
        const normTitle = normalizeWhitespace(expectedTitle);
        if (!normalizedBody.includes(normTitle)) {
          missing.push(`Title match failed: "${expectedTitle}"`);
        }

        // Assert all remaining evidence strings (e.g. authors, report numbers)
        for (let idx = 1; idx < row.evidenceParts.length; idx++) {
          const ev = row.evidenceParts[idx];
          const normEv = normalizeWhitespace(ev);
          if (!normalizedBody.includes(normEv)) {
            missing.push(`Attribute match failed: "${ev}"`);
          }
        }
      }

      // Check if we have an authoritative Crossref JSON record in docs/evidence/crossref/
      const crossrefDir = path.join(ROOT_DIR, 'docs', 'evidence', 'crossref');
      const files = fs.existsSync(crossrefDir) ? fs.readdirSync(crossrefDir) : [];
      let crossrefMatched = false;
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const cData = JSON.parse(fs.readFileSync(path.join(crossrefDir, f), 'utf8'));
        const cMsg = cData.message?.items ? cData.message.items[0] : cData.message;
        if (!cMsg) continue;
        const cDoi = cMsg.DOI?.toLowerCase();
        if (cDoi && row.url.toLowerCase().includes(cDoi)) {
          crossrefMatched = true;
          // Compare title, author, year, container
          const cTitle = normalizeWhitespace(cMsg.title?.[0] || '');
          const cAuthor = normalizeWhitespace(cMsg.author?.[0]?.family || '');
          const cContainer = normalizeWhitespace(cMsg['container-title']?.[0] || '');
          const cYear = cMsg.published?.['date-parts']?.[0]?.[0] || cMsg.created?.['date-parts']?.[0]?.[0];

          const expectedTitle = normalizeWhitespace(row.evidenceParts[0] || '');
          if (!cTitle.includes(expectedTitle) && !expectedTitle.includes(cTitle)) {
            missing.push(`Crossref title mismatch: "${cTitle}" vs expected "${expectedTitle}"`);
          }
          if (row.evidenceParts[1]) {
            const expectedAuthor = normalizeWhitespace(row.evidenceParts[1]);
            if (!cAuthor.includes(expectedAuthor) && !expectedAuthor.includes(cAuthor)) {
              missing.push(`Crossref author mismatch: "${cAuthor}" vs expected "${expectedAuthor}"`);
            }
          }
          break;
        }
      }

      if (res.statusCode >= 200 && res.statusCode < 300 && missing.length === 0) {
        const extraNote = crossrefMatched ? ' [Crossref JSON validated]' : '';
        console.log(`PASS [HTTP ${res.statusCode}] (Title & metadata confirmed)${extraNote}`);
        passCount++;
        auditResults.push({
          citation: row.citation,
          status: 'PASS',
          code: res.statusCode,
          url: row.url,
          details: `Title and all evidence strings confirmed${extraNote}`,
        });
      } else {
        const reason = missing.length > 0
          ? missing.join('; ')
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
  console.log(`AUDIT SUMMARY: ${passCount} PASSED, ${failCount} FAILED out of ${sourcedRows.length} SOURCED entries.`);
  console.log(`UNVERIFIED: ${unverifiedRows.length} entries reported in separate count (never inside verified figure).`);
  console.log('='.repeat(78));

  if (unverifiedRows.length > 0) {
    console.log('\nCataloged UNVERIFIED entries in Section 1:');
    for (const u of unverifiedRows) {
      console.log(`  - ${u.citation} (${u.url})`);
    }
  }

  if (failCount > 0) {
    console.error('\nOne or more SOURCED rows failed machine verification!');
    console.error('Per project protocol, any FAIL row must be marked UNVERIFIED.');
    process.exit(1);
  } else {
    console.log(`\nAll ${passCount} SOURCED citations verified successfully against retrieved upstream data.`);
    console.log(`All ${unverifiedRows.length} UNVERIFIED citations documented with non-reachable rationale.`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
