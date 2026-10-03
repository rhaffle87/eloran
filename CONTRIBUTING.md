# Contributing to SIMULORAN

Thank you for your interest in contributing to SIMULORAN. As an engineering and scientific simulation suite, SIMULORAN maintains strict standards of mathematical rigor, test-driven validation, and clean software architecture.

---

## 1. Code of Conduct
Please review and adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). We expect all contributors to maintain a professional, respectful, and collaborative environment.

---

## 2. Core Quality Gates
All contributions must pass our comprehensive local and continuous integration quality gates with **zero defects**:

1. **Zero Secret Leaks**: No API keys, credentials, or sensitive tokens may be committed (`npm run check:secrets`).
2. **Strict UTF-8 Validity**: All source files must be 100% valid UTF-8 with zero byte errors and zero `U+FFFD` replacement characters (`npm run test:utf8`).
3. **Accessibility (WCAG 2.1 AA)**: Zero critical or serious accessibility violations; CLS must remain under 0.1 across all themes (`npm run test:a11y`).
4. **Citation Provenance Verification**: Every academic, governmental, or technical citation must be cataloged in `docs/PROVENANCE.md` and verified via automated HTTP/DOI checks or authenticated archival evidence (`npm run check:provenance`).
5. **Zero ESLint Warnings**: ESLint must exit with zero errors and zero warnings (`npm run lint -- --max-warnings 0`).
6. **Physics Test Suite**: All 37 test suites and 435 unit tests, along with empirical physics benchmarks, must pass (`npm test -- --run --reporter=verbose`).
7. **Production Build**: The static bundle must compile cleanly without build errors (`npm run build`).

> [!TIP]
> Run the all-in-one verification gate before pushing:
> ```bash
> npm run verify:all
> ```

---

## 3. Development Workflow

### Getting Started
```bash
# 1. Clone the repository
git clone https://github.com/rhaffle87/simuloran.git
cd simuloran

# 2. Install dependencies (ensures pre-commit secret hooks are installed)
npm install

# 3. Start local development server
npm run dev

# 4. Run full test suite
npm test
```

### Branching & Commits
- Use feature branches branched from `main`: `git checkout -b feat/your-feature-name` or `fix/your-bugfix`.
- Format commit messages following [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat(physics): add ionospheric D-layer diurnal reflection height model`
  - `fix(solver): resolve matrix singularity in collinear transmitter geometry`
  - `docs(validation): document empirical flight trial methodology`
  - `test(ldc): add parity checks for 9th-pulse PPM modulation`

### Pull Requests
- Ensure all CI checks pass.
- Link relevant issues in the PR description.
- Include empirical evidence, formulas, or academic citations for any changes affecting physics algorithms.
