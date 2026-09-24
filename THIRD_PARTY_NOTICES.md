# Third-Party Software Notices and Licenses

LORAN LAB incorporates open-source libraries, geospatial projection engines, development toolchains, and typography assets. This document acknowledges the respective authors and provides copyright and license notices for these third-party components.

---

## 1. Runtime Production Dependencies

### MapLibre GL JS
- **Version**: ^5.10.0
- **License**: BSD-3-Clause
- **Copyright**: (c) 2020 MapLibre contributors, (c) 2014-2020 Mapbox, Inc.
- **Website**: [https://maplibre.org/](https://maplibre.org/)
- **Usage**: WebGL-accelerated vector and raster geospatial rendering for transmitter networks, basemaps, and hyperbolic LOPs.

### Proj4js
- **Version**: ^2.19.10
- **License**: MIT
- **Copyright**: (c) 2014, Mike Adair, Richard Greenwood, Didier Richard, Stephen Irons, Olivier Terral and Calvin Metcalf
- **Website**: [https://github.com/proj4js/proj4js](https://github.com/proj4js/proj4js)
- **Usage**: High-precision cartographic coordinate transformations between WGS 84 (EPSG:4326) and Spherical Mercator (EPSG:3857).

### PapaParse
- **Version**: ^5.5.3
- **License**: MIT
- **Copyright**: (c) 2015 Matthew Holt
- **Website**: [https://www.papaparse.com/](https://www.papaparse.com/)
- **Usage**: High-throughput in-browser CSV parsing and serialization for station network datasets.

### @turf/turf
- **Version**: ^7.2.0
- **License**: MIT
- **Copyright**: (c) 2019 Morgan Herlocker and Turf Authors
- **Website**: [https://turfjs.org/](https://turfjs.org/)
- **Usage**: Geospatial analysis, bounding box calculations, and planar geometric operations.

### Zustand
- **Version**: ^5.0.3
- **License**: MIT
- **Copyright**: (c) 2019 Paul Henschel
- **Website**: [https://github.com/pmndrs/zustand](https://github.com/pmndrs/zustand)
- **Usage**: Client-side reactive simulation state management.

### Lucide React
- **Version**: ^0.546.0
- **License**: ISC
- **Copyright**: (c) 2022 Lucide Contributors / Eric Fennis
- **Website**: [https://lucide.dev/](https://lucide.dev/)
- **Usage**: UI iconography.

### React & React DOM
- **Version**: ^19.1.1
- **License**: MIT
- **Copyright**: (c) Meta Platforms, Inc. and affiliates
- **Website**: [https://react.dev/](https://react.dev/)
- **Usage**: Declarative UI component tree and rendering lifecycle.

### React Router DOM
- **Version**: ^7.9.4
- **License**: MIT
- **Copyright**: (c) Remix Software Inc.
- **Website**: [https://reactrouter.com/](https://reactrouter.com/)
- **Usage**: Single-page client-side application routing.

---

## 2. Development & Testing Dependencies

### Vite
- **License**: MIT
- **Copyright**: (c) 2019-present Evan You & Vite Contributors
- **Website**: [https://vite.dev/](https://vite.dev/)

### Vitest
- **License**: MIT
- **Copyright**: (c) 2021-present Anthony Fu & Vitest Contributors
- **Website**: [https://vitest.dev/](https://vitest.dev/)

### Playwright Test (@playwright/test)
- **License**: Apache-2.0
- **Copyright**: (c) Microsoft Corporation
- **Website**: [https://playwright.dev/](https://playwright.dev/)

### ESLint & Plugins
- **ESLint**: MIT License, (c) OpenJS Foundation and Nicholas C. Zakas
- **eslint-plugin-react**: MIT License, (c) Yannick Croissant
- **eslint-plugin-react-hooks**: MIT License, (c) Meta Platforms, Inc.
- **eslint-plugin-react-refresh**: MIT License, (c) Arnaud Barré

### Tailwind CSS & PostCSS
- **Tailwind CSS**: MIT License, (c) Tailwind Labs, Inc.
- **PostCSS**: MIT License, (c) Andrey Sitnik
- **Autoprefixer**: MIT License, (c) Andrey Sitnik

---

## 3. Typography & Web Fonts

### Space Grotesk
- **License**: SIL Open Font License, Version 1.1 (OFL-1.1)
- **Copyright**: (c) 2020 The Space Grotesk Project Authors (Florian Karsten)
- **Repository**: [https://github.com/floriankarsten/space-grotesk](https://github.com/floriankarsten/space-grotesk)

### JetBrains Mono
- **License**: SIL Open Font License, Version 1.1 (OFL-1.1)
- **Copyright**: (c) 2020 JetBrains s.r.o.
- **Repository**: [https://github.com/JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono)

---

## 4. Government & Geographic Specifications

- **USCG Loran Signal Specifications**: Transmitted RF pulse envelope parameters are derived from public domain United States Coast Guard specification COMDTINST M16562.4A.
- **USCG Loran-C User Handbook**: Station coordinates and chain baseline definitions are derived from public domain USCG Loran-C User Handbook (COMDTINST P16562.5, Table B-1).
- **NGA Publication 117**: Modern North China Sea chain station coordinates are derived from National Geospatial-Intelligence Agency public domain Publication 117 (Radio Navigational Aids, Chapter 6).
- **OpenStreetMap**: Map data is © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, licensed under the Open Database License (ODbL).
- **CARTO**: Basemap styling and raster tiles are © [CARTO](https://carto.com/attributions).
