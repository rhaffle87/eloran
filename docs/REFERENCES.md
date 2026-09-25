# Loran-C & eLoran Reference Compendium

This document compiles primary standards, technical reports, PhD and MSc dissertations, peer-reviewed journals, and terminology definitions underpinning the **LORAN LAB** physics engine. Complete verification provenance, retrievable links, and items marked `UNVERIFIED` are maintained in [docs/PROVENANCE.md](PROVENANCE.md).

---

## 1. Primary Standards & Regulatory Documents

| Document Identifier | Issuing Body & Date | Core System Parameters & Usage |
|---|---|---|
| **COMDTINST M16562.4A** | United States Coast Guard (1994) | *Specification of the Transmitted Loran-C Signal*. Standard for transmitted RF pulse shape ($i(t) = A t^2 e^{-2t/65}\sin(2\pi \cdot 0.1 \cdot t)$ with $t$ in $\mu\text{s}$), 3rd zero crossing at $30\ \mu\text{s}$, group repetition intervals, phase codes, and tolerances. Retrievable at NAVCEN. |
| **Loran-C User Handbook (COMDTINST P16562.5)** | United States Coast Guard (1992) | Historical station coordinates in WGS 84 (Table B-1), chain geometry, baseline travel time definitions, and operational characteristics. *Marked UNVERIFIED (historical publication; NAVCEN URL decommissioned in 2010).* |
| **Loran Data Channel v1.3** | Peterson et al. (2006) | Technical description for the Loran Data Channel (LDC) utilizing 9th-pulse Pulse Position Modulation (PPM) for differential corrections and UTC offsets. |
| **eLoran System Definition** | International Loran Association (ILA, 2007) | Core definition of Enhanced Loran as an independent, resilient terrestrial PNT alternative to GNSS. |
| **Lo et al. (2009)** | ILA-38 Proceedings (2009) | *eLoran Definitions*. Conference definitions paper presenting technical terminology and candidate propagation models (not an official regulatory standard). |
| **ITU-R P.368-10** | International Telecommunication Union (08/2022) | Ground-wave propagation curves for frequencies between $10\text{ kHz}$ and $30\text{ MHz}$, including Millington's mixed-path method. |
| **ITU-R P.832-4** | International Telecommunication Union (07/2015) | World atlas of ground conductivity ($\sigma$) and relative permittivity ($\varepsilon_r$). Approved July 2015. |
| **ITU-R P.372-17** | International Telecommunication Union (08/2024) | Standard models for atmospheric radio noise, man-made noise, and galactic background in LF bands. |
| **ITU-R M.589-3** | International Telecommunication Union (08/2001) | Technical characteristics of methods of data transmission and interference protection for radionavigation services in the $70\text{–}130\text{ kHz}$ band. |

---

## 2. Foundational Books & Theses

1. **Pierce, J. A., McKenzie, A. A., & Woodward, R. H. (1948).** *LORAN: Long Range Navigation*. MIT Radiation Laboratory Series, Vol. 4. McGraw-Hill.
   - The foundational text establishing pulsed hyperbolic radio-navigation, envelope timing, and geometric dilution of precision.
2. **Forssell, B. (1991 / 2008 reissued).** *Radionavigation Systems*. Artech House.
   - Mathematical treatment of hyperbolic positioning, circular vs. hyperbolic lines of position, GDOP covariance transformations, and skywave contamination.
3. **Pelgrum, W. J. (2006).** *New Potential of Low-Frequency Radionavigation in the 21st Century*. PhD dissertation, Delft University of Technology. SOURCED from TU Delft Repository (uuid:90450409-f146-4c45-839c-a4b484f723ff).
   - Analysis of the modern error budget (transmitter, mixed-path ASF propagation, H-field antennas, receiver DSP).
4. **Offermans, G. W. A., & Helwig, A. W. S. (2003).** *Integrated Navigation System Eurofix: Vision, Concept, Design, Implementation & Test*. Joint PhD dissertation, Delft University of Technology, defended 13 October 2003, ISBN 90-901-7418-4. Reelektronika / TU Delft.
   - Architecture and testing of micro-pulse modulation (pulses 3–8 tri-state modulation) broadcasting DGNSS corrections via Loran pulses. *Marked UNVERIFIED (secondary citation from literature; repository record not retrievable online).*
5. **Hargreaves, C. (2010 / 2014).** *ASF Measurement and Processing Techniques, to allow Harbour Navigation at High Accuracy with eLoran*. MSc dissertation, Institute of Engineering Surveying and Space Geodesy (IESSG), University of Nottingham.
   - Spatial modeling of Additional Secondary Factors along coastal navigation approaches. *Marked UNVERIFIED (secondary citation; year differs across secondary sources: 2010 MSc thesis vs. 2014 citation; Nottingham repository record not retrievable; erroneous DOI 10.3390/s19143110 removed).*
6. **Boyce, C. O. L. Jr. (2007).** *Atmospheric Noise Mitigation for Loran*. PhD dissertation, Department of Aeronautics and Astronautics, Stanford University. SOURCED from Stanford GPS Lab.
   - Characterization and non-linear filtering of non-Gaussian atmospheric impulsive noise.

---

## 3. Topical Research & Papers

### A. ASF Propagation & Mixed Paths
- **Millington, G. (1949).** "Ground-wave propagation over an inhomogeneous smooth earth." *Proc. IEE - Part III*, 96(39), 53–64. *Marked UNVERIFIED (publisher digital library behind Cloudflare 403 bot challenge).*
- **Monteath, G. D. (1973).** *Applications of the Electromagnetic Reciprocity Principle*. Pergamon Press.
- **Williams, P., & Last, D. (2000).** "Mapping the ASFs of the Northwest European Loran-C System." *The Journal of Navigation*, Cambridge University Press, 53(2), 225–235. DOI: [10.1017/s0373463300008778](https://doi.org/10.1017/s0373463300008778). SOURCED.
- **Zhou, L., Xi, X., Zhang, J., & Pu, Y. (2013).** "A new method for Loran-C ASF calculation over irregular terrain." *IEEE Transactions on Aerospace and Electronic Systems*, 49(3), 1738–1744. DOI: [10.1109/TAES.2013.6558016](https://doi.org/10.1109/TAES.2013.6558016). SOURCED.

### B. Receiver DSP, Cycle Selection, & Envelope-to-Cycle Difference (ECD)
- **Boyce, C. O. L. Jr., Lo, S. C., Powell, J. D., & Enge, P. K. (2006).** "Analysis of Noise and Cycle Selection in a Loran Receiver." *Proc. 35th Annual Convention of the International Loran Association (ILA-35)*, Groton, CT. SOURCED from Stanford GPS Lab.
  - **SNR definition**: Ratio of pulse amplitude at the standard sampling point ($25\ \mu\text{s}$) to noise.
  - **Ratio test**: Receiver compares envelope samples $15\ \mu\text{s}$ apart ($\tau$ and $\tau - 15\ \mu\text{s}$). The ideal ratio at the standard zero crossing ($30\ \mu\text{s}$) is approximately $0.4$.
  - **Analytic threshold**: A wrong cycle occurs when the ratio moves outside the values at $25\ \mu\text{s}$ and $35\ \mu\text{s}$ ($\pm 5\ \mu\text{s}$ excursion, half a carrier cycle).
  - **Simulation threshold**: The $10\ \mu\text{s}$ figure ($|\Delta t| > 10\ \mu\text{s}$, a whole carrier cycle slip) is the paper's simulation counting criterion.
  - **Empirical Austron approximation**: ECD standard deviation of $\approx 42/\sqrt{N \cdot \text{SNR}}\ \mu\text{s}$, or $\approx 28/\sqrt{N \cdot \text{SNR}}\ \mu\text{s}$ with newer receivers, where $N \cdot \text{SNR}$ is total averaged SNR.
- **Lo, S., Morris, P. B., & Enge, P. (2005).** "Early Skywave Detection Network: Preliminary Design and Analysis." *Proc. 34th Annual Convention of the International Loran Association (ILA-34)*, Santa Barbara, CA. SOURCED from Stanford GPS Lab.

### C. Multilateration & Positioning Algorithms
- **Gao, A., Ji, B., Wu, M., Chang, S., Zheng, G., Yu, D., & Li, W. (2025).** "Research on the Loran-C Pseudorange Positioning Method Based on an Ellipsoidal Geodesic Model and Its Application in Inland Areas." *Sensors*, 25(16), 5110. DOI: [10.3390/s25165110](https://doi.org/10.3390/s25165110). SOURCED.
- **Collins, J. (1980).** *Formulas for Positioning at Sea by Circular, Hyperbolic, and Astronomic Methods*. NOAA Technical Report NOS 81, National Oceanic and Atmospheric Administration, National Ocean Survey, Rockville, MD. SOURCED from NOAA Institutional Repository (record 30820).
- **Razin, S. (1967).** "Explicit (noniterative) Loran Solution." *NAVIGATION: Journal of The Institute of Navigation*. *Marked UNVERIFIED (publisher page behind Cloudflare 403; ION abstract index lacks valid page; unconfirmed identifiers removed).*

---

## 4. Formula Sheet (provenance in PROVENANCE.md)

### 1. RF Pulse Envelope & Instantaneous Current
When time $t$ is expressed in **microseconds** ($\mu\text{s}$) from pulse start ($t \ge 0$):
$$i(t) = A \cdot t^2 \cdot e^{-2t / 65} \cdot \sin(2\pi \cdot 0.1 \cdot t + PC) = A \cdot t^2 \cdot e^{-2t / 65} \cdot \sin(0.2\pi \cdot t + PC)$$
- $t$: Time in microseconds ($\mu\text{s}$).
- Carrier frequency: $f_0 = 100\text{ kHz} = 0.1\text{ cycles}/\mu\text{s}$ (carrier period $T_c = 10\ \mu\text{s}$).
- When time $t_s$ is expressed in **seconds**:
  $$\sin(2\pi \cdot f_0 \cdot t_s + PC) = \sin(2\pi \cdot 10^5 \cdot t_s + PC)$$
- Peak envelope amplitude occurs at $t = 65\ \mu\text{s}$:
  $$\frac{d}{dt}\left(t^2 e^{-2t/65}\right) = \left(2t - \frac{2t^2}{65}\right) e^{-2t/65} = 0 \implies t = 65\ \mu\text{s}$$
- Standard Zero Crossing (SZC): 3rd positive-going zero crossing at $t = 30\ \mu\text{s}$ ($3 \times 10\ \mu\text{s}$).
- $PC$: Phase code ($0$ or $\pi$ radians).

### 2. Groundwave Propagation Time
$$t = PF + SF + ASF$$
- **Primary Factor (PF)**: Propagation delay through the standard atmosphere:
  $$PF = \frac{\eta \cdot d}{c}$$
  - $c = 299,792,458\text{ m/s}$ (vacuum speed of light).
  - $\eta = 1.000338$ (RTCM SC-127 standard atmospheric refractive index).
  - $\eta = 1.000284$ (USCG Loran-C User Handbook standard).
  - $\eta = 1.000315$ (China Academy of Sciences eLoran standard).
- **Secondary Factor (SF)**: Sourced in concept as the excess delay over all-seawater paths ($\sigma \approx 5\text{ S/m}$, $\varepsilon_r \approx 80$).
  > [!WARNING]
  > **UNVERIFIED COEFFICIENTS**: The piecewise polynomial coefficients below (historically cited in older handbooks) exhibit an unphysical $\approx 0.236\ \mu\text{s}$ ($\approx 71\text{ m}$) step discontinuity at the $100\text{ statute mile}$ ($160,934.4\text{ m}$) boundary:
  > - For $d_{sm} \le 100\text{ statute miles}$: $SF(\mu\text{s}) = \frac{-0.4076}{d_{sm}} + 0.08182 + 0.003914 \cdot d_{sm}$
  > - For $d_{sm} > 100\text{ statute miles}$: $SF(\mu\text{s}) = \frac{-107.8}{d_{sm}} + 1.297 + 0.000139 \cdot d_{sm}$
  >
  > Because these coefficients fail continuity testing, they are **UNVERIFIED and disabled by default** in LORAN LAB.
- **Additional Secondary Factor (ASF)**: Overland excess phase delay due to sub-surface conductivity variations and terrain impedance ($\sigma \approx 0.0001\text{ to }0.01\text{ S/m}$).

### 3. Pseudorange Observation Model
$$TOA_i = T_{tx,i} + \frac{\eta \cdot d_i}{c} + SF(d_i) + ASF_i + b_{rx} + \varepsilon_i$$
Observed pseudorange:
$$\rho_i = c \cdot (TOA_i - T_{tx,i}) = d_i + c \cdot b_{rx} + c \cdot \left( \frac{\eta - 1}{c} d_i + SF_i + ASF_i \right) + \tilde{\varepsilon}_i$$
State vector: $\mathbf{x} = [x, y, c \cdot b_{rx}]^T$.

Normal Equations (Gauss-Newton):
$$\Delta \mathbf{x} = (H^T W H)^{-1} H^T W \mathbf{r}$$
where the $i$-th row of design matrix $H$ is:
$$H_i = \left[ \frac{x - x_i}{d_i}, \quad \frac{y - y_i}{d_i}, \quad 1 \right]$$

### 4. Dilution of Precision (DOP)
Covariance matrix: $Q = (H^T H)^{-1}$.
- $HDOP = \sqrt{Q_{11} + Q_{22}}$
- $TDOP = \sqrt{Q_{33}}$
- $GDOP = \sqrt{\text{trace}(Q)} = \sqrt{Q_{11} + Q_{22} + Q_{33}}$

### 5. Measurement Noise & Cycle Slip Criteria
$$\sigma_i^2 = \sigma_{\text{jitter}}^2 + \frac{337.5^2}{N_{\text{pulses}} \cdot SNR_i}$$
- Baseline transmitter timing jitter: Prior literature assumed baseline uncertainty on the order of $4\text{–}6\text{ meters}$, corresponding to approximately $13\text{–}20\text{ ns}$ in one-way propagation time.
- Wrong-Cycle Selection: Occurs when tracking error exceeds $|\Delta TOA| > 10\ \mu\text{s}$, shifting the measurement by $\pm 1$ carrier cycle ($\sim 2,998\text{ meters} \approx 3\text{ km}$).

---

## 5. Standard Terminology

- **GRI (Group Repetition Interval)**: The time interval between successive master pulse group transmissions, expressed in microseconds divided by 10 (e.g., GRI 7430 = $74,300\ \mu\text{s}$).
- **ECD (Envelope-to-Cycle Difference)**: The phase difference between the $100\text{ kHz}$ carrier wave and the pulse amplitude envelope. Path dispersion shifts ECD, which receivers track to maintain lock on the standard 3rd zero crossing.
- **SZC (Standard Zero Crossing)**: The designated tracking point on the Loran pulse, defined at the 3rd positive-going zero crossing ($30\ \mu\text{s}$ after pulse onset), where groundwave amplitude is developed and early skywaves have not yet arrived.
- **SGR (Skywave-to-Groundwave Ratio)**: Ratio of ionospheric reflected signal amplitude to line-of-sight groundwave amplitude.
- **Secondary Blink**: An integrity warning transmitted by a secondary station when its timing or phase synchronization exceeds operational tolerance. The station modulates the first two pulses of the secondary group on and off in an established cadence (e.g. 0.25 s on, 0.25 s off), warning receivers that the baseline is unusable for navigation.
- **HEA (Harbor Entrance and Approach)**: Strict IMO maritime navigation accuracy standard (typically requiring horizontal positioning accuracy better than $10\text{ meters}$ at 95% confidence).
- **HPL (Horizontal Protection Level)**: In LORAN LAB, computed as a simplified $k \cdot \sigma$ estimate ($3\sigma$), not a certified integrity bound per RTCM MPS.
- **DLoran (Differential Loran)**: Ground monitor stations measuring local real-time ASF deviations and broadcasting pseudorange / position corrections via the 9th pulse to nearby vessels.
- **LDC (Loran Data Channel)**: Low-rate digital data channel modulated onto the 9th pulse (or pulses 3–8 via Eurofix) transmitting differential GPS/GNSS corrections, UTC leap second warnings, and station integrity flags.
