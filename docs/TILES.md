# Map Tile Configuration & Attribution Guide

LORAN LAB renders station networks, geodesic baselines, hyperbolic lines of position (LOPs), and receiver fixes on an interactive MapLibre GL basemap.

---

## 1. Centralized Tile Architecture

All map tile providers and styles are configured in [`src/lib/tiles.js`](../src/lib/tiles.js). The application supports dynamic tile provider switching directly from the map interface:

| Provider | Type | URL Template | Default Attribution | Usage / Limits |
|---|---|---|---|---|
| **Carto Dark** *(Default)* | Raster (PNG) | `https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png` | © OpenStreetMap contributors © CARTO | Non-commercial educational use; dark palette optimized for radar displays |
| **OpenStreetMap Standard** | Raster (PNG) | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | © OpenStreetMap contributors | Standard community fallback basemap; subject to OSM Tile Usage Policy |
| **Offline Radar Canvas** | Vector/Synthetic | `null` (Local client canvas) | LORAN LAB Synthetic Grid | Zero-network fallback; renders pure dark radar canvas with high-contrast station markers and hyperbolic LOPs |

---

## 2. Offline Resilience & Fallback Behavior

LORAN LAB is designed to function reliably in environments with strict network boundaries, offline lab networks, or intermittent internet connectivity:

1. **Automatic Error Handling**: If tile requests encounter 404 or network timeout errors, MapLibre's error listeners intercept them without throwing unhandled exceptions or crashing the React application state.
2. **Offline Basemap Mode**: Selecting **Radar Canvas** removes all external network requests. All LORAN radio-navigation math, including hyperbolic contour computation, GDOP calculations, and multilateration solvers, runs completely locally in browser memory or Web Workers.

---

## 3. Configuring Custom or Self-Hosted Tile Servers

To configure a private tile server or enterprise tile provider (e.g., self-hosted OpenMapTiles, MapTiler, or Stadia Maps), modify or extend `TILE_PROVIDERS` in [`src/lib/tiles.js`](../src/lib/tiles.js):

```javascript
export const TILE_PROVIDERS = {
  'custom-server': {
    id: 'custom-server',
    name: 'Internal Lab Tile Server',
    url: 'https://tiles.internal.lab/{z}/{x}/{y}.png',
    attribution: 'Internal Geographic Survey',
    maxZoom: 18,
    tileSize: 256,
  },
  // ...
};
```

---

## 4. Tile Usage Policies & Attribution Notice

- **CARTO**: Basemaps are provided courtesy of CARTO. Refer directly to the official [CARTO Free Basemap Tiles Terms](https://carto.com/help/working-with-data/carto-free-basemap-tiles/) and [CARTO Legal Terms](https://carto.com/legal/). Commercial or high-volume usage requires a commercial CARTO account.
- **OpenStreetMap**: Map data is copyrighted by OpenStreetMap contributors under the Open Database License (ODbL). All access must comply strictly with the [OpenStreetMap Foundation Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) and attribution rules defined at [OpenStreetMap Copyright & License](https://www.openstreetmap.org/copyright).
