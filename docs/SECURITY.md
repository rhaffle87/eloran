# LORAN LAB – Security Architecture & Tradeoffs

## 1. Content Security Policy (CSP)

The deployment serves a strict HTTP Content Security Policy configured in `vercel.json` and mirrored in the Vite preview server:

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://tiles.openfreemap.org https://*.openfreemap.org; img-src 'self' data: blob: https://tiles.openfreemap.org https://*.openfreemap.org https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com; connect-src 'self' blob: https://tiles.openfreemap.org https://*.openfreemap.org https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com; worker-src 'self' blob:; child-src 'self' blob:; frame-ancestors 'none'; form-action 'none'; base-uri 'self';
```

### Documented Policy Directives & Tradeoffs

| Directive | Scope | Rationale & Tradeoff |
|---|---|---|
| `script-src 'self'` | Strict | All dynamic evaluation (`eval()`, `Function()`, WASM dynamic compilation) is strictly forbidden. MapLibre GL JS functions with pure JavaScript rendering. |
| `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` | Pinned + Relaxed | `'unsafe-inline'` is required for MapLibre GL dynamic canvas/DOM styling (markers, popups, scalebars) and React dynamic inline style attributes. Pinned to Google Fonts for external font stylesheets. |
| `font-src 'self' https://fonts.gstatic.com https://tiles.openfreemap.org https://*.openfreemap.org` | Pinned | Pinned specifically to Google Fonts CDN (`fonts.gstatic.com`) for Space Grotesk/JetBrains Mono fonts, and OpenFreeMap for PBF vector map glyphs/fonts. |
| `connect-src` / `img-src` | Pinned | Pinned to OpenFreeMap (`tiles.openfreemap.org`, `*.openfreemap.org`), OpenStreetMap (`tile.openstreetmap.org`, `*.tile.openstreetmap.org`), and Carto (`basemaps.cartocdn.com`, `*.basemaps.cartocdn.com`). Wildcards are scoped to subdomain prefixes only. `api.mapbox.com` is omitted. |
| `worker-src` / `child-src` | `'self' blob:` | Required for MapLibre background workers (`blob:`) and off-thread Vite Web Workers (`'self' blob:`) computing 2D hyperbolic LOP grids and spatial ASF simulations. |
| `frame-ancestors 'none'` | Strict | Prevents clickjacking by forbidding embedding in foreign iframes. |
| `form-action 'none'` | Strict | Simulator has no form submissions. |
| `base-uri 'self'` | Strict | Prevents base tag hijacking attacks. |

---

## 2. HTTP Strict Transport Security (HSTS) & Preload Notice

The site serves:
```http
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

> [!WARNING]
> **Preload Decision Caution:**
> While `preload` is safe on standard `*.vercel.app` preview deployments, if attaching a custom production domain (e.g., `loranlab.org`), **do NOT submit the domain to the HSTS preload list (`hstspreload.org`) without a deliberate engineering decision**. Inclusion in browser preload lists is permanent and irreversible for months, and will break any internal subdomains that lack valid public HTTPS certificates.

---

## 3. Window Debug Globals & Testability Exposure Policy

To maintain a clean production namespace while supporting automated sub-pixel regression testing:

- **Gating Mechanism**: Inspection hooks `window.__maplibreInstance` and `window.__baselineGeoJson` are strictly gated in `src/components/map/MapView.jsx` behind:
  ```javascript
  if (typeof window !== 'undefined' && (import.meta.env.DEV || window.__LORAN_E2E__)) {
    window.__maplibreInstance = mapInstance;
  }
  ```
- **Production Visitor Experience**: In production builds (`npm run build`), `import.meta.env.DEV` is `false`. Normal visitors to `https://eloran-one.vercel.app` will have `window.__maplibreInstance === undefined` and `window.__baselineGeoJson === undefined`.
- **E2E Automation Hook**: Automated test suites (Playwright) explicitly inject `window.__LORAN_E2E__ = true` via `page.addInitScript()` before page navigation to inspect map coordinate projection accuracy and worker layer readiness.
- **Threat Model & State Exposure**: The simulator contains no user authentication, no database, no session credentials, and no PII. All data structures represent synthetic radio navigation physics (TDOA, ECD, ASF, transmitter coords). Tampering with the MapLibre instance or GeoJSON layer via console does not expose private data or present any security privilege escalation.
