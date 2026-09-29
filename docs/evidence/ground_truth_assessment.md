# Ground Truth Assessment
# Evidence source: docs/evidence/2026-09-28T12_19_07Z/
# HEAD when collected: 0669f1619fb80baf9cf3a75ddc0becf0bb9ffe8c
# Collected: 2026-09-28T12:19:07Z

## STATUS OF PRIOR REPORTS

### "Unvarnished Evidence Audit" report
STATUS: **SUPERSEDED** — contradicts the filesystem on multiple facts (see below).

### "Consolidated Report" (simuloran_consolidated_report.md)
STATUS: **PARTIALLY SUPERSEDED** — counts and DOIs match the filesystem, but contains unverified
claims presented as proven. Claims below are annotated with their status.

---

## ITEM-BY-ITEM RECONCILIATION

### 1. Test file layout and count
EVIDENCE: docs/evidence/2026-09-28T12_19_07Z/vitest.txt
FACT: 9 test files, 181 tests, all under src/lib/__tests__/

  src/lib/__tests__/chainDesign.test.js   (20 tests)
  src/lib/__tests__/grwave.test.js        (9 tests)
  src/lib/__tests__/stations.test.js      (3 tests)
  src/lib/__tests__/trialValidation.test.js (11 tests)
  src/lib/__tests__/dds.test.js           (33 tests)
  src/lib/__tests__/temporalAsf.test.js   (32 tests)
  src/lib/__tests__/tiles.test.js         (6 tests)
  src/lib/__tests__/geoAsf.test.js        (15 tests)
  src/lib/__tests__/physics.test.js       (52 tests)
  TOTAL: 181

"Unvarnished Audit" claimed: src/lib/loran/__tests__/, 8 files, 178 tests.
VERDICT: Unvarnished Audit is WRONG. src/lib/loran/ does not exist in this repo.
Consolidated Report (9 files, 181) matches the filesystem.

### 2. Provenance entry count and set
EVIDENCE: docs/evidence/2026-09-28T12_19_07Z/provenance.txt
FACT: 16 SOURCED entries, 4 UNVERIFIED (ITU-R only)

SOURCED entries (as parsed and checked by check-provenance.mjs at this HEAD):
  Boyce, Lo, Powell & Enge (2006)
  Lo, Morris & Enge (2005)
  Boyce (2007)
  Pelgrum (2006)
  Collins (1980)
  Williams & Last (2000)
  Zhou et al. (2013)
  Gao et al. (2025)
  USCG COMDTINST M16562.4A (1994)
  Rhee, Kim, Son & Seo (2021)
  Song & Son (2025)
  Natural Earth Vector (2022)
  Sommerfeld (1909)
  Norton (1936)
  Millington (1949)
  Smith & Weintraub (1953)

"Unvarnished Audit" listed: Gao 2019, Yan 2021, Hargreaves 2017 (not present in this repo).
VERDICT: Unvarnished Audit described a different version of the file (or fabricated entries).
Consolidated Report's 16-entry list matches the filesystem.

CAVEAT (from user's Prompt 4): check-provenance.mjs passes 16/16 because it checks URLs that are
already in PROVENANCE.md — it does not independently discover DOIs via author+title+year Crossref
queries. Whether each URL resolves to the paper it claims is a separate question. This is
NOT yet resolved and is logged as an open item under Prompt 4.

### 3. DOIs for Norton 1936, Millington 1949, Rhee 2021
EVIDENCE: docs/evidence/2026-09-28T12_19_07Z/git-head.txt + direct read of docs/PROVENANCE.md

Norton (1936): https://doi.org/10.1109/JRPROC.1936.227360
  "Unvarnished Audit" stated: 10.1109/JRPROC.1936.227443
  Consolidated Report stated: 10.1073/pnas.22.3.192 (a PNAS URL — clearly wrong for Proc. IRE)
  ACTUAL in PROVENANCE.md: 10.1109/JRPROC.1936.227360
  VERDICT: Both prior reports stated wrong DOIs. The file has a third value.
  OPEN: Whether 10.1109/JRPROC.1936.227360 actually resolves to the correct Norton 1936 paper
  titled "The Propagation of Radio Waves over the Surface of the Earth and in the Upper
  Atmosphere" (Proc. IRE, Vol. 24, Issue 10) is pending Prompt 4 Crossref verification.

Millington (1949): https://doi.org/10.1049/pi-3.1949.0013
  Both consolidated report and PROVENANCE.md agree: 10.1049/pi-3.1949.0013
  "Unvarnished Audit" stated: 10.1049/ibot.1949.0010
  VERDICT: Unvarnished Audit was wrong.

Rhee et al. (2021): https://arxiv.org/abs/2108.06008
  This is an arXiv preprint (IEEE Access, Vol. 9). Title in PROVENANCE.md:
  "Enhanced Accuracy Simulator for a Future Korean Nationwide eLoran System"
  "Unvarnished Audit" described a *Reliability Engineering & System Safety* DOI.
  VERDICT: Unvarnished Audit was wrong.

### 4. style.load on diffed setStyle
EVIDENCE: No empirical event-log file exists in docs/evidence/2026-09-28T12_19_07Z/
This was NOT collected by collect-evidence.mjs (Playwright run was omitted from the script
to keep runtime under 10 minutes).

Consolidated Report stated: style.load fires at +3.7ms on diffed setStyle.
Unvarnished Audit stated: style.load "does not fire" on diffed setStyle.
VERDICT: UNRESOLVED. Neither claim has a timestamped event log in docs/evidence/.
This is an open item under Prompt B.

### 5. Git history linearity
EVIDENCE: docs/evidence/2026-09-28T12_19_07Z/git-head.txt
Verbatim git log --oneline --graph -25 output (first 12 shown):
  * 0669f16 feat(map): add Live GDOP Coverage Overlay heatmap layer...
  * 6373fc5 refactor(sidebar): declutter asf panel...
  * 7181989 fix(map, sidebar): eliminate style diff warning...
  * 44634b1 chore(branding): holistically rename application...
  * 5adddf7 fix(hud-waveforms): unify map HUD spacing...
  ...

Every line begins with * (single parent). No merge commits visible in top 25.
VERDICT: History is linear at HEAD. "Non-linear graph with merges" (Unvarnished Audit) was wrong.

CAVEAT: `git log` only shows the current branch tip. Force-push history cannot be read from
`git log` alone. `git reflog` was not run in this session. This remains an open item.

### 6. __maplibreInstance and hooks in production bundle
EVIDENCE: docs/evidence/2026-09-28T12_19_07Z/dist-grep.txt
FACT (verbatim from file):
  ChainDesignPanel-BOlpcxix.js contains __SIMULORAN_E2E__, __LORAN_E2E__, __maplibreInstance

  Exact context:
  window.__SIMULORAN_E2E__||window.__LORAN_E2E__)&&(window.__maplibreInstance=s)

VERDICT: The prior claim "absent from production visitor execution" was WRONG about the bundle
contents. All three hook names ARE present in the production bundle. The gating condition
(window.__SIMULORAN_E2E__||window.__LORAN_E2E__) means they are only ACTIVATED if a page script
sets one of those flags first — but the strings are present and the branch is live in the bundle.

This is the issue the user flagged: "window.__SIMULORAN_E2E__ can be set by any page to expose
the map." That remains accurate. This is an open item under Prompt B (compile-time flag).

---

## TASK.MD STATUS

task.md was reviewed. It contains only action items with no pre-filled answers.
It is acceptable as-is for tracking remaining work.

---

## EVIDENCE CITATION REQUIREMENT (from Prompt 1, item 4)

From this point forward, any claim in a report must cite a file path under docs/evidence/.
Claims without an evidence citation are labelled UNVERIFIED.

---

## OPEN ITEMS (no expected answers)

Prompt A:
- [ ] Crossref bibliographic verification (author+title+year query) for all 16 SOURCED DOIs
- [ ] Verify norton 10.1109/JRPROC.1936.227360 resolves to correct Proc. IRE Oct 1936 paper
- [ ] git reflog check for force-push history
- [ ] git diff 7181989 -- scripts/check-provenance.mjs docs/PROVENANCE.md

Prompt B:
- [ ] Empirical event log for style.load/styledata/idle (initial, full-replace, diffed)
- [ ] Revert persistence fix -> paste failing spec output -> restore -> paste green run
- [ ] Direct setStyle spec (bypassing app helper)
- [ ] Mocked vector provider spec (Playwright route interception)
- [ ] Compile-time E2E flag (vite --mode e2e) to remove hooks from normal production bundle
- [ ] Remove __LORAN_E2E__ legacy flag
- [ ] Playwright run against npm run preview (not dev server) with 2-4 workers
- [ ] 3 consecutive zero-flake runs against preview build

Prompt C:
- [ ] git grep inventory for loran lab / eloran / loranlab variants
- [ ] Real legacy fixture from earliest exportScenario commit
- [ ] Storage key sunset decision
- [ ] OG image, favicons, manifest regeneration
- [ ] ACTIFE branch with actual git diff
- [ ] CHANGELOG entry and package.json version alignment
- [ ] Trademark: replace "clear for use" with plain search list + whois results
- [ ] Screenshots at 360/768/1440px

Prompt 4:
- [ ] Crossref bibliographic queries (author+title+year, not DOI guessing) for all 16 SOURCED
- [ ] Save raw JSON responses to docs/evidence/crossref/<key>.json
- [ ] check-provenance.mjs: compare title+first author+year+container against saved JSON