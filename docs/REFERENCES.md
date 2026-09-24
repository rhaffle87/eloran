# Loran-C & eLoran Reference Compendium

This document compiles primary standards, technical reports, PhD and MSc dissertations, peer-reviewed journals, and terminology definitions underpinning the **LORAN LAB** physics engine. Complete verification provenance, retrievable links, and items marked `UNVERIFIED` are maintained in [docs/PROVENANCE.md](PROVENANCE.md).

---

## 1. Primary Standards & Regulatory Documents

| Document Identifier | Issuing Body & Date | Core System Parameters & Usage |
|---|---|---|
| **COMDTINST M16562.4A** | United States Coast Guard (1994) | *Specification of the Transmitted Loran-C Signal*. Standard for transmitted RF pulse shape ($i(t) = A t^2 e^{-2t/65}\sin(2\pi \cdot 0.1 \cdot t)$ with $t$ in $\mu\text{s}$), 3rd zero crossing at $30\ \mu\text{s}$, group repetition intervals, phase codes, and tolerances. |
| **Loran-C User Handbook (COMDTINST P16562.5)** | United States Coast Guard (1992) | Historical station coordinates in WGS 84 (Table B-1), chain geometry, baseline travel time definitions, and operational characteristics. |
| **Loran Data Channel v1.3** | Peterson et al. (2006) | Technical description for the Loran Data Channel (LDC) utilizing 9th-pulse Pulse Position Modulation (PPM) for differential corrections and UTC offsets. |
| **eLoran System Definition** | International Loran Association (ILA, 2007) | Core definition of Enhanced Loran as an independent, resilient terrestrial PNT alternative to GNSS. |
| **Lo et al. (2009)** | ILA-38 Proceedings (2009) | *eLoran Definitions*. Conference definitions paper presenting technical terminology and candidate propagation models (not an official regulatory standard). |
| **ITU-R P.368-10** | International Telecommunication Union (08/2022) | Ground-wave propagation curves for frequencies between $10\text{ kHz}$ and $30\text{ MHz}$, including Millington's mixed-path method. |
| **ITU-R P.832-4** | International Telecommunication Union (08/2023) | World atlas of ground conductivity ($\sigma$) and relative permittivity ($\varepsilon_r$). |
| **ITU-R P.372-17** | International Telecommunication Union (08/2024) | Standard models for atmospheric radio noise, man-made noise, and galactic background in LF bands. |
| **ITU-R M.589-3** | International Telecommunication Union (11/2001) | Technical characteristics of methods of data transmission in the $70\text{–}130\text{ kHz}$ band. |

---

## 2. Foundational Books & Theses

1. **Pierce, J. A., McKenzie, A. A., & Woodward, R. H. (1948).** *LORAN: Long Range Navigation*. MIT Radiation Laboratory Series, Vol. 4. McGraw-Hill.
   - The foundational text establishing pulsed hyperbolic radio-navigation, envelope timing, and geometric dilution of precision.
2. **Forssell, B. (1991 / 2008 reissued).** *Radionavigation Systems*. Artech House.
   - Mathematical treatment of hyperbolic positioning, circular vs. hyperbolic lines of position, GDOP covariance transformations, and skywave contamination.
3. **Pelgrum, W. (2006).** *New Potential of Low-Frequency Radionavigation in the 21st Century*. PhD dissertation, Delft University of Technology.
   - Sourced modern analysis of the error budget (transmitter, mixed-path ASF propagation, H-field antennas, receiver DSP).
4. **Offermans, G. W. A. (2000).** *Integrated Navigation System Eurofix: Vision, Concept, Design, Implementation & Test*. PhD dissertation, Delft University of Technology.
   - Architecture and testing of micro-pulse modulation (pulses 3–8 tri-state modulation) broadcasting DGNSS corrections via Loran pulses.
5. **Helwig, A. W. S. (2001).** *Eurofix: A New Loran-C/GNSS Navigation System*. PhD dissertation, Delft University of Technology.
   - Detailed analysis of Loran/GNSS integration and data transmission reliability.
6. **Hargreaves, C. (2010).** *ASF Measurement and Processing Techniques, to allow Harbour Navigation at High Accuracy with eLoran*. MSc dissertation, University of Nottingham.
   - Spatial modeling of Additional Secondary Factors along coastal navigation approaches.

---

## 3. Topical Research & Papers

### A. ASF Propagation & Mixed Paths
- **Millington, G. (1949).** "Ground-wave propagation over an inhomogeneous smooth earth." *Proc. IEE*, 96(39), 53–64.
- **Monteath, G. D. (1973).** *Applications of the Electromagnetic Reciprocity Principle*. Pergamon Press.
- **Williams, P., & Last, D. (2000).** "Mapping the ASFs of the Northwest European Loran-C System." *The Journal of Navigation*, 53(2), 225–235.
- **Zhou, X., et al. (2013).** "A new method for Loran-C ASF calculation over irregular terrain." *IEEE Transactions on Aerospace and Electronic Systems*, 49(4), 2662–2673.

### B. Receiver DSP, Cycle Selection, & Envelope-to-Cycle Difference (ECD)
- **Boyce, C. (2006).** "Analysis of Noise and Cycle Selection in a Loran Receiver." *Proc. 35th Annual Convention of the International Loran Association (ILA-35)*, Groton, CT.
  - Defines wrong-cycle selection criteria ($|\Delta t| > 10\ \mu\text{s}$, corresponding to a $\sim 3\text{ km}$ range step). Analyzes cycle-selection error rates as a function of SNR and pulse averaging.
- **Lo, S., Peterson, B., & Enge, P. (2005).** "Early Skywave Detection Network: Preliminary Design and Analysis." *Proc. 34th Annual Convention of the International Loran Association (ILA-34)*, Santa Barbara, CA.

### C. Multilateration & Positioning Algorithms
- **Gao, Y., et al. (2025).** "Research on the Loran-C Pseudorange Positioning Method Based on an Ellipsoidal Geodesic Model and an Improved Newton-Raphson Algorithm." *Sensors*, 25(16), 5110.
- **Collins, J. (1980).** *Formulas for Positioning at Sea by Circular, Hyperbolic and Astronomic Methods*. NOAA Technical Report NOS 81, National Oceanic and Atmospheric Administration.
- **Razin, S. (1967).** "Explicit (noniterative) Loran Solution." *NAVIGATION: Journal of The Institute of Navigation*, 14(3), 265–269.

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
