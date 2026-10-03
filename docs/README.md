# SIMULORAN Documentation Directory

Welcome to the SIMULORAN scientific and engineering documentation catalog. This directory contains the technical specifications, mathematical foundations, empirical validation benchmarks, citation provenance registers, and operational guides for the simulation suite.

---

## Technical Specifications & Research Literature

| Document | Description | Target Audience | Primary Standards |
|---|---|---|---|
| [**VISUAL_USER_GUIDE.md**](VISUAL_USER_GUIDE.md) | Dedicated illustrated visual guide covering every layout, control panel, navigation mode, RF waveform lab, telemetry console, and step-by-step user workflows with high-res screenshots. | Users, Operators, Engineers | UI/UX, Operational Protocols |
| [**LORAN_MATHEMATICAL_PHYSICS_MANUAL.md**](LORAN_MATHEMATICAL_PHYSICS_MANUAL.md) | Rigorous mathematical physics manual formalizing hyperbolic TDOA, Millington mixed-path ASF, ionospheric skywave reflections, Allan variance oscillator drift, and WLS/BLUE solvers. | Navigation Scientists, Mathematicians | USCG M16562.4A, ITU-R P.368, RTCM 12700.1 |
| [**WHITEPAPER.md**](WHITEPAPER.md) | Master technical whitepaper (v1.6.0) detailing the complete mathematical formulation of 100 kHz pulse synthesis, groundwave propagation, TDOA multilateration, EKF tracking, and RAIM integrity. | Physicists, Navigation Engineers, Academics | USCG M16562.4A, ITU-R P.368, RTCM MPS |
| [**VALIDATION.md**](VALIDATION.md) | Empirical field trial benchmarks from historical and modern trials (Korean Nationwide eLoran Testbed 2021, Maoming Inland Geodesic Test 2025), error budgets, and validation harness. | QA Engineers, Researchers | Rhee et al. (2021), Gao et al. (2025) |
| [**PROVENANCE.md**](PROVENANCE.md) | Machine-verified citation registry providing retrievable URLs, DOIs, and authenticated archival evidence for all referenced publications with strict zero-hallucination tracking. | Librarians, Peer Reviewers, Auditors | Crossref API, ITU-R Archive |
| [**REFERENCES.md**](REFERENCES.md) | Exhaustive bibliography of foundational radionavigation textbooks, Coast Guard technical reports, and academic papers. | Researchers, Students | USCG, RTCM, ILA |
| [**DATA_NOTES.md**](DATA_NOTES.md) | Operational transmitter chain parameters, station coordinates, radiation power, baseline distances, and GRI rates for global Loran-C/eLoran constellations. | Systems Engineers, Operators | USCG Constellation Tables |
| [**EXTRACTION_NOTES.md**](EXTRACTION_NOTES.md) | Notes on mathematical parameter extraction, groundwave attenuation tables, and Sommerfeld curve approximations. | Algorithmic Developers | Sommerfeld (1909), Norton (1936) |
| [**TILES.md**](TILES.md) | Architectural documentation for MapLibre vector tile integration, keyless OpenFreeMap basemaps, and zero-network offline canvas radar fallbacks. | Frontend Engineers | MapLibre GL, OpenFreeMap |
| [**SECURITY.md**](SECURITY.md) | Security policy, threat model, Content-Security-Policy (CSP) enforcement, and vulnerability reporting procedures. | Security Auditors, DevOps | OCI, OWASP Top 10 |
| [**UX_AUDIT.md**](UX_AUDIT.md) | Comprehensive WCAG 2.1 AA accessibility audit, cumulative layout shift (CLS) benchmarks, and interactive controls review. | UI/UX Designers, Accessibility Testers | WCAG 2.1 AA |

---

## Subdirectories

- **[assets/screenshots/](assets/screenshots/)**: Official high-resolution screenshot catalog illustrating all 20 layouts, modal dialogues, and engineering workbenches.
- **[evidence/](evidence/)**: Machine-readable JSON records of authenticated primary sources used by the automated provenance checking harness (`check-provenance.mjs`).
- **[verification/screenshots/](verification/screenshots/)**: Visual regression archives, export datasets, and automated multi-viewport verification screenshots proving simulation correctness across releases.
