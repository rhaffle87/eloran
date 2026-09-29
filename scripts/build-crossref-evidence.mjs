import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const crossrefDir = path.join(rootDir, 'docs', 'evidence', 'crossref');

if (!fs.existsSync(crossrefDir)) {
  fs.mkdirSync(crossrefDir, { recursive: true });
}

// Register of works to verify via Crossref
const worksToQuery = [
  {
    key: 'sommerfeld_1909',
    type: 'doi',
    queryUrl: 'https://api.crossref.org/works/10.1002/andp.19093330402',
    expected: {
      doi: '10.1002/andp.19093330402',
      authorFamily: 'Sommerfeld',
      titleMatch: 'Ausbreitung der Wellen',
      containerMatch: 'Annalen der Physik',
      year: 1909
    }
  },
  {
    key: 'norton_1936',
    type: 'doi',
    queryUrl: 'https://api.crossref.org/works/10.1109/JRPROC.1936.227360',
    expected: {
      doi: '10.1109/jrproc.1936.227360',
      authorFamily: 'Norton',
      titleMatch: 'Propagation of Radio Waves',
      containerMatch: 'Proceedings of the IRE',
      year: 1936
    }
  },
  {
    key: 'millington_1949',
    type: 'doi',
    queryUrl: 'https://api.crossref.org/works/10.1049/pi-3.1949.0013',
    expected: {
      doi: '10.1049/pi-3.1949.0013',
      authorFamily: 'Millington',
      titleMatch: 'Ground-wave propagation over an inhomogeneous smooth earth',
      containerMatch: 'Proceedings of the IEE - Part III',
      year: 1949
    }
  },
  {
    key: 'smith_weintraub_1953',
    type: 'doi',
    queryUrl: 'https://api.crossref.org/works/10.1109/JRPROC.1953.274297',
    expected: {
      doi: '10.1109/jrproc.1953.274297',
      authorFamily: 'Smith',
      titleMatch: 'Constants in the Equation for Atmospheric Refractive Index',
      containerMatch: 'Proceedings of the IRE',
      year: 1953
    }
  },
  {
    key: 'williams_last_2000',
    type: 'doi',
    queryUrl: 'https://api.crossref.org/works/10.1017/s0373463300008778',
    expected: {
      doi: '10.1017/s0373463300008778',
      authorFamily: 'Williams',
      titleMatch: 'Mapping the ASFs of the Northwest European Loran-C System',
      containerMatch: 'Journal of Navigation',
      year: 2000
    }
  },
  {
    key: 'zhou_2013',
    type: 'doi',
    queryUrl: 'https://api.crossref.org/works/10.1109/TAES.2013.6558016',
    expected: {
      doi: '10.1109/taes.2013.6558016',
      authorFamily: 'Zhou',
      titleMatch: 'New Method for Loran-C ASF Calculation over Irregular Terrain',
      containerMatch: 'IEEE Transactions on Aerospace and Electronic Systems',
      year: 2013
    }
  },
  {
    key: 'rhee_2021',
    type: 'bibliographic',
    queryUrl: 'https://api.crossref.org/works?query.author=Rhee&query.title=Enhanced+Accuracy+Simulator+for+a+Future+Korean+Nationwide+eLoran+System&rows=1',
    expected: {
      doi: '10.1109/access.2021.3105063',
      authorFamily: 'Rhee',
      titleMatch: 'Enhanced Accuracy Simulator for a Future Korean Nationwide eLoran System',
      containerMatch: 'IEEE Access',
      year: 2021
    }
  },
  {
    key: 'gao_2025',
    type: 'doi',
    queryUrl: 'https://api.crossref.org/works/10.3390/s25165110',
    expected: {
      doi: '10.3390/s25165110',
      authorFamily: 'Gao',
      titleMatch: 'Research on the Loran-C Pseudorange Positioning Method Based on an Ellipsoidal Geodesic Model',
      containerMatch: 'Sensors',
      year: 2025
    }
  }
];

async function main() {
  console.log('Fetching raw Crossref metadata and saving to docs/evidence/crossref/ ...');
  const results = [];

  for (const item of worksToQuery) {
    try {
      console.log(`Querying ${item.key}...`);
      const res = await fetch(item.queryUrl, {
        headers: {
          'User-Agent': 'SimuloranResearchBot/1.0 (mailto:audit@example.com)'
        }
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const rawJson = await res.json();
      
      // Save raw JSON to docs/evidence/crossref/<key>.json
      const savePath = path.join(crossrefDir, `${item.key}.json`);
      fs.writeFileSync(savePath, JSON.stringify(rawJson, null, 2), 'utf-8');
      console.log(`Saved raw JSON to ${savePath}`);

      const msg = rawJson.message?.items ? rawJson.message.items[0] : rawJson.message;
      if (!msg) throw new Error('No message payload in Crossref response');

      const returnedDoi = msg.DOI?.toLowerCase();
      const returnedTitle = msg.title?.[0] || '';
      const returnedAuthor = msg.author?.[0]?.family || '';
      const returnedContainer = msg['container-title']?.[0] || '';
      const returnedYear = msg.published?.['date-parts']?.[0]?.[0] || msg.created?.['date-parts']?.[0]?.[0];
      const volume = msg.volume || '';
      const issue = msg.issue || '';
      const page = msg.page || '';

      const doiMatches = !item.expected.doi || returnedDoi === item.expected.doi.toLowerCase();
      const titleMatches = returnedTitle.toLowerCase().includes(item.expected.titleMatch.toLowerCase());
      const authorMatches = returnedAuthor.toLowerCase() === item.expected.authorFamily.toLowerCase();
      const containerMatches = returnedContainer.toLowerCase().includes(item.expected.containerMatch.toLowerCase());
      const yearMatches = returnedYear === item.expected.year;

      const passed = doiMatches && titleMatches && authorMatches && containerMatches && yearMatches;

      results.push({
        key: item.key,
        doi: msg.DOI,
        title: returnedTitle,
        author: returnedAuthor,
        container: returnedContainer,
        volume,
        issue,
        page,
        year: returnedYear,
        passed,
        checks: { doiMatches, titleMatches, authorMatches, containerMatches, yearMatches }
      });
    } catch (err) {
      console.error(`FAILED ${item.key}:`, err.message);
      results.push({
        key: item.key,
        error: err.message,
        passed: false
      });
    }
  }

  console.log('\n================================================================');
  console.log('CROSSREF METADATA VERIFICATION SUMMARY');
  console.log('================================================================');
  for (const r of results) {
    if (r.passed) {
      console.log(`[PASS] ${r.key}`);
      console.log(`       DOI: ${r.doi}`);
      console.log(`       Title: "${r.title}"`);
      console.log(`       Author: ${r.author} | Container: ${r.container} | Vol: ${r.volume}, Issue: ${r.issue}, Page: ${r.page}, Year: ${r.year}`);
    } else {
      console.log(`[FAIL] ${r.key}: ${r.error || JSON.stringify(r.checks)}`);
    }
  }
  console.log('================================================================');

  const allPassed = results.every(r => r.passed);
  if (!allPassed) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
