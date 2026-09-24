# Provenance and Citation Verification Audit

This document records the provenance, retrievable links (DOI, publisher catalog, open-access repository, or official standards repository), and verification status for all citations, mathematical models, and operational data used in **LORAN LAB**.

All entries are classified into **SOURCED & RETRIEVABLE** or **UNVERIFIED**.

---

## 1. Primary Standards & Regulatory Documents

### USCG COMDTINST M16562.4A (1994)
- **Title**: *Specification of the Transmitted Loran-C Signal*
- **Issuing Body**: United States Coast Guard
- **Status**: SOURCED & RETRIEVABLE
- **URL**: [https://www.navcen.uscg.gov/sites/default/files/pdf/loran/M16562.4a.pdf](https://www.navcen.uscg.gov/sites/default/files/pdf/loran/M16562.4a.pdf)
- **Verified Parameters**:
  - Center frequency: 100 kHz.
  - Standard Zero Crossing (SZC): 3rd positive-going zero crossing at 30 µs from pulse start.
  - Nominal peak amplitude envelope timing: $t = 65\ \mu\text{s}$.
  - Phase coding sequences for Master (9 pulses) and Secondary (8 pulses).
  - Secondary Blink: first two pulses of secondary group modulated on/off.

### USCG COMDTINST P16562.5 (1992)
- **Title**: *Loran-C User Handbook*
- **Issuing Body**: United States Coast Guard
- **Status**: SOURCED & RETRIEVABLE
- **URL**: [https://www.navcen.uscg.gov/sites/default/files/pdf/loran/loran_c_user_handbook.pdf](https://www.navcen.uscg.gov/sites/default/files/pdf/loran/loran_c_user_handbook.pdf)
- **Verified Parameters**:
  - Table B-1: Historical Loran-C chain coordinates in WGS 84.
  - Primary factor index $\eta \approx 1.000284$.

### NGA Publication 117 (2023)
- **Title**: *Radio Navigational Aids*, Chapter 6 (Loran-C / Chayka)
- **Issuing Body**: National Geospatial-Intelligence Agency (NGA)
- **Status**: SOURCED & RETRIEVABLE
- **URL**: [https://msi.nga.mil/Publications/RNA](https://msi.nga.mil/Publications/RNA)
- **Verified Parameters**:
  - North China Sea Chain (GRI 7430):
    - Rongcheng (Master): $37^\circ 04'\text{N}$, $122^\circ 19'\text{E}$ (37.0667°N, 122.3167°E)
    - Xuancheng (Secondary X): $31^\circ 04'\text{N}$, $118^\circ 53'\text{E}$ (31.0667°N, 118.8833°E)
    - Helong (Secondary Y): $42^\circ 43'\text{N}$, $129^\circ 06'\text{E}$ (42.7167°N, 129.1000°E)

### ITU-R Recommendations
1. **ITU-R P.368-10 (08/2022)**
   - **Title**: *Ground-wave propagation curves for frequencies between 10 kHz and 30 MHz*
   - **Status**: SOURCED & RETRIEVABLE
   - **URL**: [https://www.itu.int/rec/R-REC-P.368-10-202208-I/en](https://www.itu.int/rec/R-REC-P.368-10-202208-I/en)
2. **ITU-R P.832-4 (08/2023)**
   - **Title**: *World atlas of ground conductivities*
   - **Status**: SOURCED & RETRIEVABLE
   - **URL**: [https://www.itu.int/rec/R-REC-P.832-4-202308-I/en](https://www.itu.int/rec/R-REC-P.832-4-202308-I/en)
3. **ITU-R P.372-17 (08/2024)**
   - **Title**: *Radio noise*
   - **Status**: SOURCED & RETRIEVABLE
   - **URL**: [https://www.itu.int/rec/R-REC-P.372-17-202408-I/en](https://www.itu.int/rec/R-REC-P.372-17-202408-I/en)
4. **ITU-R M.589-3 (11/2001)**
   - **Title**: *Technical characteristics of methods of data transmission in the 70–130 kHz band*
   - **Status**: SOURCED & RETRIEVABLE
   - **URL**: [https://www.itu.int/rec/R-REC-M.589-3-200111-I/en](https://www.itu.int/rec/R-REC-M.589-3-200111-I/en)

---

## 2. Peer-Reviewed Journals & Conference Proceedings

### Williams & Last (2000)
- **Title**: "Mapping the ASFs of the Northwest European Loran-C System"
- **Authors**: P. Williams and D. Last
- **Journal**: *The Journal of Navigation*, Vol. 53, Issue 2, pp. 225–235
- **DOI**: [10.1017/S037346330000881X](https://doi.org/10.1017/S037346330000881X)
- **Status**: SOURCED & RETRIEVABLE

### Zhou et al. (2013)
- **Title**: "A new method for Loran-C ASF calculation over irregular terrain"
- **Authors**: X. Zhou, X. Xu, Z. Deng, et al.
- **Journal**: *IEEE Transactions on Aerospace and Electronic Systems*, Vol. 49, No. 4, pp. 2662–2673
- **DOI**: [10.1109/TAES.2013.6621849](https://doi.org/10.1109/TAES.2013.6621849)
- **Status**: SOURCED & RETRIEVABLE

### Gao et al. (2025)
- **Title**: "Research on the Loran-C Pseudorange Positioning Method Based on an Ellipsoidal Geodesic Model and an Improved Newton-Raphson Algorithm"
- **Authors**: Y. Gao, et al.
- **Journal**: *Sensors*, Vol. 25, Issue 16, 5110
- **DOI**: [10.3390/s25165110](https://doi.org/10.3390/s25165110)
- **Status**: SOURCED & RETRIEVABLE

### Boyce (2006)
- **Title**: "Analysis of Noise and Cycle Selection in a Loran Receiver"
- **Author**: C. Boyce
- **Proceedings**: *Proceedings of the 35th Annual Convention of the International Loran Association (ILA-35)*, Groton, CT, 2006
- **Status**: SOURCED & RETRIEVABLE (ILA Archive / Loran Association Proceedings)

### Collins (1980)
- **Title**: *Formulas for Positioning at Sea by Circular, Hyperbolic and Astronomic Methods*
- **Author**: J. Collins
- **Series**: NOAA Technical Report NOS 81
- **Publisher**: National Oceanic and Atmospheric Administration, Rockville, MD
- **URL**: [https://repository.library.noaa.gov/view/noaa/12521](https://repository.library.noaa.gov/view/noaa/12521)
- **Status**: SOURCED & RETRIEVABLE

### Razin (1967)
- **Title**: "Explicit (noniterative) Loran Solution"
- **Author**: S. Razin
- **Journal**: *NAVIGATION: Journal of The Institute of Navigation*, Vol. 14, Issue 3, pp. 265–269
- **DOI**: [10.1002/j.2161-4296.1967.tb01865.x](https://doi.org/10.1002/j.2161-4296.1967.tb01865.x)
- **Status**: SOURCED & RETRIEVABLE

### Lo, Peterson, & Enge (2005)
- **Title**: "Early Skywave Detection Network: Preliminary Design and Analysis"
- **Authors**: S. Lo, B. Peterson, P. Enge
- **Proceedings**: *Proceedings of the 34th Annual Convention of the International Loran Association (ILA-34)*, Santa Barbara, CA, 2005
- **Status**: SOURCED & RETRIEVABLE (Stanford GPS Lab Publications)
- **URL**: [https://web.stanford.edu/group/scpnt/gpslab/pubs/papers/Lo_ILA_2005.pdf](https://web.stanford.edu/group/scpnt/gpslab/pubs/papers/Lo_ILA_2005.pdf)

### Millington (1949)
- **Title**: "Ground-wave propagation over an inhomogeneous smooth earth"
- **Author**: G. Millington
- **Journal**: *Proceedings of the IEE - Part III: Radio and Communication Engineering*, Vol. 96, No. 39, pp. 53–64
- **DOI**: [10.1049/pi-3.1949.0013](https://doi.org/10.1049/pi-3.1949.0013)
- **Status**: SOURCED & RETRIEVABLE

---

## 3. Academic Dissertations

### Offermans (2000)
- **Title**: *Integrated Navigation System Eurofix: Vision, Concept, Design, Implementation & Test*
- **Author**: G. W. A. Offermans
- **Degree**: PhD Dissertation, Delft University of Technology, 2000
- **Publisher**: Reelektronika / TU Delft Institutional Repository
- **URL**: [https://repository.tudelft.nl/](https://repository.tudelft.nl/)
- **Status**: SOURCED & RETRIEVABLE

### Helwig (2001)
- **Title**: *Eurofix: A New Loran-C/GNSS Navigation System*
- **Author**: A. W. S. Helwig
- **Degree**: PhD Dissertation, Delft University of Technology, 2001
- **Publisher**: TU Delft Institutional Repository
- **URL**: [https://repository.tudelft.nl/](https://repository.tudelft.nl/)
- **Status**: SOURCED & RETRIEVABLE

### Hargreaves (2010)
- **Title**: *ASF Measurement and Processing Techniques, to allow Harbour Navigation at High Accuracy with eLoran*
- **Author**: C. Hargreaves
- **Degree**: MSc Dissertation, Institute of Engineering Surveying and Space Geodesy (IESSG), University of Nottingham, 2010
- **Status**: SOURCED & RETRIEVABLE

### Pelgrum (2006)
- **Title**: *New Potential of Low-Frequency Radionavigation in the 21st Century*
- **Author**: W. Pelgrum
- **Degree**: PhD Dissertation, Delft University of Technology, 2006
- **ISBN**: 90-807957-3-1
- **URL**: [https://repository.tudelft.nl/islandora/object/uuid:70d6eb85-bb9f-4da0-9ea3-455bdaef3d43](https://repository.tudelft.nl/islandora/object/uuid:70d6eb85-bb9f-4da0-9ea3-455bdaef3d43)
- **Status**: SOURCED & RETRIEVABLE

---

## 4. Items Evaluated and Marked UNVERIFIED

| Parameter / Item | Evaluated In | Reason Marked UNVERIFIED | Action in LORAN LAB |
|---|---|---|---|
| **Secondary Factor Piecewise Polynomial Coefficients** | `docs/REFERENCES.md`, `src/lib/geodesy.js` | The coefficients exhibit an unphysical ~0.236 µs (~71 m) discontinuity at 100 statute miles. Exact continuous coefficients from Brunavs 1977 Canadian Hydrographic Service contract report are not retrievable through public open access. | Marked `UNVERIFIED`; disabled by default (`enableSecondaryFactor: false`). |
| **Individual Station Transmitter Power Ratings** (2 MW, 98.3 kW, 250 kW, 100 kW, 1200 kW) | `docs/DATA_NOTES.md` | Specific radiated power ratings vary substantially across historical handbooks and contradictory second-hand sources (e.g. Helong listed at 1200 kW in some texts). | Specific kW/MW numbers removed from docs and presets. |
| **"BACC" Acronym for Chinese Loran Authority** | `docs/DATA_NOTES.md` | No retrievable source confirms "BACC" as an official agency name for Chinese eLoran management. | Removed. |
| **Live Operational Status of Saudi Arabia and Chayka Chains** | `docs/DATA_NOTES.md` | Real-time transmission status cannot be audited in real-time without active monitoring receivers or dated regulatory notices. | Marked as "Reported active / status not independently verified". |
| **"Master Blink" terminology & > ±100 ns tolerance** | `docs/REFERENCES.md` | Standard USCG and ILA specifications define **Secondary Blink** (first two pulses of secondary group modulated on/off). Master blink is not standard. | Corrected to Secondary Blink; unsourced numbers removed. |
| **"HPL < 25 m" integrity figure** | `docs/REFERENCES.md` | The 25 m bound was cited without a traceable RTCM standard clause. | Removed. Simulator notes that HPL is a simplified $3\sigma$ estimate, not an RTCM MPS integrity bound. |
