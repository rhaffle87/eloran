# Global Station Data & Operational Status Notes

This document provides context on the operational status, history, and geographical coordinates of Loran-C and eLoran transmitter networks used throughout **LORAN LAB**.

---

## 1. Global Operational Status Overview (2026)

| Region / Country | Network Type | Current Operational Status | Key Transmitters & Notes |
|---|---|---|---|
| **United States & Canada** | Loran-C | **Decommissioned (2010)** | Terminated by US Coast Guard and Canadian Coast Guard on February 8, 2010. Infrastructure dismantled; occasional R&D testing conducted under DARPA/DHS backup PNT initiatives. |
| **Northwest Europe** | Loran-C / eLoran | **Decommissioned (Dec 31, 2015)** | The European chain (Sylt, Lessay, Værlandet, Bø, Ejde) ceased transmissions at 23:59 UTC on December 31, 2015. France, Germany, and Norway terminated funding. |
| **United Kingdom** | eLoran (Timing) | **Active (Timing Sovereign)** | The **Anthorn** transmitter (Cumbria, UK; 100 kW) was preserved after the 2015 closure to broadcast sovereign national time (UTC(NPL)) as an uninterruptible timing reference. Single-station reception provides sub-microsecond time synchronization, but cannot compute a 2D position fix. The UK Government has initiated renewed eLoran resilience studies. |
| **China** | eLoran (National) | **Active & Expanding** | Operates three high-power regional chains (Northern, Eastern, Southern) coordinated by the National Time Service Center (NTSC) and BACC. Fully modernized solid-state transmitters with LDC (Loran Data Channel) differential corrections. |
| **Russian Federation** | Chayka | **Active** | Operates modern pulse chains (compatible with standard Loran receivers) covering the Baltic, Northern Sea Route, and Far East under the RSDN-20 / Chayka program. |
| **South Korea** | eLoran | **Active & Upgrading** | Upgraded from Loran-C to high-precision eLoran with differential reference stations and HEA harbor approach testbeds in Incheon and Pohang to counter regional GPS jamming. |
| **Saudi Arabia** | Loran-C | **Active** | Operates dual internal chains across the Red Sea and Arabian Gulf. |

---

## 2. Presets in LORAN LAB

### 1. `north_sea_historical` (Historical - Dec 2015)
- **Status**: Historical Simulation.
- **Transmitters**:
  - **Sylt (Master)**: Lat `54.960278° N`, Lng `8.293611° E` (Germany, 98.3 kW) - *Shut down 2015*
  - **Lessay (Secondary)**: Lat `49.150000° N`, Lng `-1.503333° E` (France, 250 kW) - *Shut down 2015*
  - **Anthorn (Secondary)**: Lat `54.911389° N`, Lng `-3.278333° E` (UK, 100 kW) - *Retained for UTC timing*
- **Significance**: Demonstrates why a multi-nation hyperbolic chain requires $\ge 3$ active stations for trilateration. Following the shutdown of Sylt and Lessay, Anthorn can provide UTC timing but not horizontal vessel position.

### 2. `bohai_sea_active` (Active Operational - GRI 6780)
- **Status**: Active Real-World System.
- **Transmitters**:
  - **Rongcheng (Master)**: Lat `37.1500° N`, Lng `122.2333° E` (Shandong, 2 MW ERP)
  - **Xuancheng (Secondary)**: Lat `30.8833° N`, Lng `118.8500° E` (Anhui)
  - **Helong (Secondary)**: Lat `42.7167° N`, Lng `128.9167° E` (Jilin)
- **Significance**: Demonstrates active high-power eLoran PNT operating alongside satellite GNSS with 9th-pulse LDC differential broadcast.

### 3. `jakarta_baseline` (Synthetic Maritime Testbed)
- **Status**: Synthetic Simulation Scenario.
- **Transmitters**: Tanjung Priok, Tangerang, Bekasi.
- **Significance**: Illustrates harbor entrance and approach (HEA) geometry and mixed-path land/sea conductivity transitions around the Java Sea and Sunda Strait.

---

## 3. Coordinate Systems & Geodetic Standards

- All geographic calculations assume the **WGS 84** reference ellipsoid (semi-major axis $a = 6,378,137\text{ m}$, flattening $f = 1 / 298.257223563$).
- Baseline ranges are computed using spherical great-circle / Vincenty approximations with mean Earth radius $R = 6,371,000\text{ m}$.
- Planar map projections utilize Spherical Mercator **EPSG:3857** for seamless integration with MapLibre tile raster pyramids.
