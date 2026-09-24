# Global Station Data & Operational Status Notes

This document provides context on the operational status, history, and geographical coordinates of Loran-C and eLoran transmitter networks used throughout **LORAN LAB**.

---

## 1. Global Operational Status Overview

| Region / Country | Network Type | Operational Status | Key Transmitters & Notes |
|---|---|---|---|
| **United States & Canada** | Loran-C | **Decommissioned (2010)** | Terminated by US Coast Guard and Canadian Coast Guard on February 8, 2010. Infrastructure decommissioned; subsequent R&D testing intermittently explored under government backup PNT initiatives. |
| **Northwest Europe** | Loran-C / eLoran | **Decommissioned (Dec 31, 2015)** | The Northwest European chain (Sylt, Lessay, Værlandet, Bø) ceased transmissions at 23:59 UTC on December 31, 2015 when France, Germany, and Norway terminated funding. (Note: The Ejde station in the Faroe Islands ceased Loran-C transmissions earlier, at the end of 1995). |
| **United Kingdom** | eLoran (Timing) | **Timing broadcast preserved post-2015** | Following the Northwest European chain shutdown on December 31, 2015, the **Anthorn** transmitter (Cumbria, UK) was retained to broadcast sovereign national time (UTC(NPL)) as an independent timing reference. Single-station reception provides time synchronization but cannot compute a 2D hyperbolic position fix. (Status beyond 2015 based on UK General Lighthouse Authorities reports; ongoing commercial operation unverified). |
| **China** | eLoran | **Reported active (unverified real-time status)** | Operates regional chains (including North China Sea chain GRI 7430, South China Sea chain GRI 6780) managed under national navigation authorities. Solid-state transmitters with 9th-pulse Loran Data Channel (LDC) differential corrections. |
| **Russian Federation** | Chayka (RSDN) | **Reported active (unverified real-time status)** | Operates pulse chains (Chayka systems, compatible in principle with standard Loran pulse timing) covering the Baltic, Northern Sea Route, and Far East. |
| **South Korea** | eLoran | **Active development & upgrade** | Modernization initiatives from Loran-C to eLoran with differential reference stations and testbeds (Incheon, Pohang) reported to counter GNSS vulnerability. |
| **Saudi Arabia** | Loran-C | **Operational status not independently verified** | Historically operated internal chains across the Red Sea and Arabian Gulf. |

---

## 2. Presets in LORAN LAB

### 1. `north_sea_historical` (Historical — Decommissioned Dec 31, 2015)
- **Status**: Historical simulation based on published chain records.
- **Chain**: Northwest European Chain (GRI 6731).
- **Transmitters**:
  - **Sylt (Master)**: Lat `54.9603° N`, Lng `8.2936° E` (Germany) — *Ceased transmissions Dec 31, 2015*
  - **Lessay (Secondary)**: Lat `49.1500° N`, Lng `-1.5033° E` (France) — *Ceased transmissions Dec 31, 2015*
  - **Anthorn (Secondary)**: Lat `54.9114° N`, Lng `-3.2783° E` (United Kingdom) — *Retained post-2015 for UTC timing broadcast*
- **Significance**: Demonstrates why a hyperbolic chain requires $\ge 3$ active stations with appropriate geometry for horizontal positioning. Following the shutdown of Sylt and Lessay, Anthorn alone provides time synchronization but cannot resolve a 2D position fix.

### 2. `bohai_yellow_sea_active` / North China Sea Chain (GRI 7430)
- **Status**: Active operational chain model.
- **Chain**: North China Sea Chain (GRI 7430). (Note: GRI 6780 is the distinct South China Sea chain with Hexian master).
- **Transmitters** (Coordinates from NGA Publication 117, Chapter 6):
  - **Rongcheng (Master)**: `37°04' N`, `122°19' E` $\rightarrow$ Lat `37.0667° N`, Lng `122.3167° E`
  - **Xuancheng (Secondary X)**: `31°04' N`, `118°53' E` $\rightarrow$ Lat `31.0667° N`, Lng `118.8833° E`
  - **Helong (Secondary Y)**: `42°43' N`, `129°06' E` $\rightarrow$ Lat `42.7167° N`, Lng `129.1000° E`
- **Significance**: Demonstrates eLoran multi-station positioning with differential corrections.

### 3. `jakarta_baseline` (Synthetic Maritime Testbed)
- **Status**: Synthetic illustrative scenario.
- **Transmitters**: Tanjung Priok, Tangerang, Bekasi.
- **Significance**: Illustrates harbor entrance and approach (HEA) geometry and mixed-path land/sea conductivity transitions around the Java Sea and Sunda Strait.

---

## 3. Coordinate Systems & Geodetic Standards

- All geographic positions reference the **WGS 84** ellipsoid (semi-major axis $a = 6,378,137\text{ m}$, flattening $f = 1 / 298.257223563$).
- Great-circle transmitter-receiver ranges are computed in LORAN LAB using the spherical Haversine formula with mean Earth radius $R = 6,371,000\text{ m}$. Rigorous ellipsoidal geodesic distances (such as Vincenty 1975 or Karney 2013) can be evaluated where millimeter-level geodesic fidelity is needed.
- Planar map projections utilize Web Mercator (**EPSG:3857**) for raster basemap display.
