# LORAN LAB – Security Architecture & Tradeoffs

## 1. Content Security Policy (CSP)

The deployment serves a strict HTTP Content Security Policy configured in `vercel.json` and mirrored in the Vite preview server:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org; connect-src 'self' blob: https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org; worker-src blob:; child-src blob:; frame-ancestors 'none'; form-action 'none'; base-uri 'self';
```

### Documented Policy Tradeoffs

| Directive | Scope | Rationale & Tradeoff |
|---|---|---|
| `style-src 'unsafe-inline'` | Relaxed | MapLibre GL dynamic DOM styling (markers, popups, scalebars) and React dynamic inline style attributes (telemetry color codes, signal level bars). |
| `script-src 'wasm-unsafe-eval'` | Relaxed | Required exclusively for MapLibre GL WebAssembly modules in WebGL workers. Standard `unsafe-eval` is **forbidden**; code injection via `eval()` remains blocked. |
| `connect-src` / `img-src` | Pinned | Pinned specifically to Carto Dark (`basemaps.cartocdn.com`, `*.basemaps.cartocdn.com`) and OpenStreetMap (`tile.openstreetmap.org`, `*.tile.openstreetmap.org`). Wildcards are scoped to subdomain prefixes only. `api.mapbox.com` is omitted. |
| `worker-src` / `child-src` | `blob:` | Required for MapLibre Web Workers and background math workers (grid/contour generation). |
| `frame-ancestors 'none'` | Strict | Prevents clickjacking by forbidding embedding in foreign iframes. |
| `form-action 'none'` | Strict | Simulator has no form submissions. |

---

## 2. HTTP Strict Transport Security (HSTS) & Preload Notice

The site serves:
```http
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

> [!WARNING]
> **Preload Decision Caution:**
> While `preload` is safe on standard `*.vercel.app` preview deployments, if attaching a custom production domain (e.g., `loranlab.org`), **do NOT submit the domain to the HSTS preload list (`hstspreload.org`) without a deliberate engineering decision**. Inclusion in browser preload lists is permanent and irreversible for months, and will break any internal subdomains that lack valid public HTTPS certificates.
