# Loran-C & eLoran Reference Compendium

This document compiles primary standards, technical reports, PhD and MSc dissertations, peer-reviewed journals, and terminology definitions underpinning the **SIMULORAN** physics engine. Complete verification provenance, retrievable links, and items marked `UNVERIFIED` are maintained in [docs/PROVENANCE.md](PROVENANCE.md).

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
| **ITU-R P.526-15** | International Telecommunication Union (10/2019) | *Propagation by diffraction*. Standard methods for predicting diffraction loss over terrain obstacles, spherical Earth, and knife-edge geometry. Section 4.1 knife-edge model utilized for eLoran signal path blockage. |
| **ITU-R M.589-3** | International Telecommunication Union (08/2001) | Technical characteristics of methods of data transmission and interference protection for radionavigation services in the $70\text{–}130\text{ kHz}$ band. |
| **RTCA DO-229D** | RTCA Inc. (12/2006) / DO-316 | *Minimum Operational Performance Standards for GPS/WAAS Airborne Equipment*. Establishes the 4-quadrant Stanford Diagram integrity containment framework (Normal Operations, System Unavailable, MI, HMI) and HPL/HAL alert boundaries. |
| **ICAO Annex 10** | International Civil Aviation Organization | *Aeronautical Telecommunications, Vol. 1: Radio Navigation Aids*. Mandates alert limits for APV-I (40 m) and RNAV RNP 0.3 (556 m) containment. |
| **RTCM 10410.1** | Radio Technical Commission for Maritime Services | *Standard for Differential Loran-C / eLoran Receiver Equipment*. Specifies d-Loran spatial decorrelation, reference station broadcasting, and 32-PPM 9th-pulse LDC telemetry frames. |

---

## 2. Foundational Books & Theses

1. **Pierce, J. A., McKenzie, A. A., & Woodward, R. H. (1948).** *LORAN: Long Range Navigation*. MIT Radiation Laboratory Series, Vol. 4. McGraw-Hill. SOURCED.
   - Foundational treatise establishing pulsed hyperbolic radionavigation, envelope timing, station synchronization, and GDOP error ellipses.
   - **Chapter 3 (§3.1–3.4)**: "Selection of Station Sites and Baselines". Establishes the mathematical derivation of coding delay floors ($CD \ge 10,000\,\mu\text{s}$) to avoid envelope ambiguity, seawater baseline limits ($1,000\text{ nmi} \approx 1,852\text{ km}$), and hyperbolic gradient factor $K = \frac{c}{2 \sin(\theta/2)}$ with baseline extension hazard cones (Sitterly 1948).
2. **Forssell, B. (1991 / 2008 reissued).** *Radionavigation Systems*. Artech House.
   - Mathematical treatment of hyperbolic positioning, circular vs. hyperbolic lines of position, GDOP covariance transformations, and skywave contamination.
3. **Pelgrum, W. J. (2006).** *New Potential of Low-Frequency Radionavigation in the 21st Century*. PhD dissertation, Delft University of Technology. SOURCED from TU Delft Repository (uuid:90450409-f146-4c45-839c-a4b484f723ff).
   - Analysis of the modern error budget (transmitter, mixed-path ASF propagation, H-field antennas, receiver DSP).
4. **Offermans, G. W. A., Helwig, A. W. S., & van Willigen, D. (2000).** "Eurofix: A New Low-Cost High-Accuracy Positioning and Communication System." *NAVIGATION: Journal of The Institute of Navigation*, 47(1), 11–22. DOI: [10.1002/j.2161-4296.2000.tb00194.x](https://doi.org/10.1002/j.2161-4296.2000.tb00194.x). SOURCED.
   - Peer-reviewed foundational journal paper specifying the Eurofix data link: 6-pulse ternary modulation (pulses 3–8, ±1 µs shift), balanced 128-of-141 zero-sum ternary codewords ($T(6) = 141$), 30-GRI/210-bit frames, and RS(70,56) FEC.
   - Accompanying doctoral thesis: Offermans & Helwig (2003), Delft University of Technology, ISBN 90-901-7418-4.
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
  - **SNR definition**: Ratio of pulse amplitude at the standard sampling point (25 µs) to noise.
  - **Ratio test**: Receiver compares envelope samples $15\ \mu\text{s}$ apart ($\tau$ and $\tau - 15\ \mu\text{s}$). The ideal ratio at the standard zero crossing ($30\ \mu\text{s}$) is approximately $0.4$.
  - **Analytic threshold**: A wrong cycle occurs when the ratio moves outside the values at 25 µs and 35 µs (±5 µs excursion, half a carrier cycle).
  - **Simulation threshold**: The $10\ \mu\text{s}$ figure ($|\Delta t| > 10\ \mu\text{s}$, a whole carrier cycle slip) is the paper's simulation counting criterion.
  - **Empirical Austron approximation**: ECD standard deviation of $\approx 42/\sqrt{N \cdot \text{SNR}}\ \mu\text{s}$, or $\approx 28/\sqrt{N \cdot \text{SNR}}\ \mu\text{s}$ with newer receivers, where $N \cdot \text{SNR}$ is total averaged SNR.
- **Lo, S., Morris, P. B., & Enge, P. (2005).** "Early Skywave Detection Network: Preliminary Design and Analysis." *Proc. 34th Annual Convention of the International Loran Association (ILA-34)*, Santa Barbara, CA. SOURCED from Stanford GPS Lab.

### C. Receiver Noise, Terrain Diffraction, & Multi-Sensor Fusion
- **Rhee, J. H., Kim, J., Son, P. W., & Seo, J. (2021).** "Enhanced Loran (eLoran) Positioning Accuracy Assessment Under Transmitter and Receiver Noise." *IEEE Access*, 9, 116248–116259. DOI: [10.1109/ACCESS.2021.3105739](https://doi.org/10.1109/ACCESS.2021.3105739). SOURCED.
  - **Noise model**: Establishes the empirical TOA standard deviation $\sigma_i^2 = J_i^2 + K^2 / (N \cdot \text{SNR}_i)$, with transmitter jitter $J_i = 6.0\text{ m}$ and receiver measurement constant $K = 337.5\text{ m}$ (1.125 µs).
- **COST 231 Project (1999).** *Digital Mobile Radio Towards Future Generation Systems*. Final Report, COST Action 231, European Commission, Brussels.
  - **Nurul-Saunders approximation**: Closed-form piecewise polynomial approximation to the Fresnel-Kirchhoff diffraction integral $J(v)$, accurate within ±0.5 dB across $v \in [-0.7, 2.4]$.
- **Kay, S. M. (1993).** *Fundamentals of Statistical Signal Processing: Estimation Theory*. Prentice Hall.
  - Mathematical basis for Best Linear Unbiased Estimator (BLUE) multi-sensor fusion combining eLoran and GNSS covariance matrices.

### C. Multilateration & Positioning Algorithms
- **Gao, A., Ji, B., Wu, M., Chang, S., Zheng, G., Yu, D., & Li, W. (2025).** "Research on the Loran-C Pseudorange Positioning Method Based on an Ellipsoidal Geodesic Model and Its Application in Inland Areas." *Sensors*, 25(16), 5110. DOI: [10.3390/s25165110](https://doi.org/10.3390/s25165110). SOURCED.
- **Collins, J. (1980).** *Formulas for Positioning at Sea by Circular, Hyperbolic, and Astronomic Methods*. NOAA Technical Report NOS 81, National Oceanic and Atmospheric Administration, National Ocean Survey, Rockville, MD. SOURCED from NOAA Institutional Repository (record 30820).
- **Razin, S. (1967).** "Explicit (noniterative) Loran Solution." *NAVIGATION: Journal of The Institute of Navigation*. *Marked UNVERIFIED (publisher page behind Cloudflare 403; ION abstract index lacks valid page; unconfirmed identifiers removed).*

### D. Reference Signal Architecture & Calibrated Chains
- **Cheol, J. (2020).** *Loran-C Reference Signal Generator and Northeast Asia Chain Calibration Architecture*. GitHub Repository: [CheolJ/Loran-c-reference-code](https://github.com/CheolJ/Loran-c-reference-code). SOURCED.
  - Python open-source reference implementation for standard Phase Code Interval (PCI) signal synthesis, group timing structures, and calibrated emission delays for operational Northeast Asia Loran-C chains: China North Sea (GRI 7430), China East Sea (GRI 8390), and East Asia (GRI 9930).
  - Encodes the standard USCG Loran-C phase alternation sequences:
    - Master ($GRI_A$): `[+1, +1, -1, -1, +1, -1, +1, -1, 0, +1]` (10 pulses with 2 ms blanking interval before 9th pulse)
    - Master ($GRI_B$): `[+1, -1, -1, +1, +1, +1, +1, +1, 0, -1]`
    - Secondary ($GRI_A$): `[+1, +1, +1, +1, +1, -1, -1, +1]` (8 pulses)
    - Secondary ($GRI_B$): `[+1, -1, +1, -1, +1, +1, -1, -1]`
  - Calibrated reference station coordinates and emission delays ($ED$):
    - **China North Sea (GRI 7430)**: Rongcheng-M ($10,000.00\ \mu\text{s}$), Xuancheng-X ($13,459.70\ \mu\text{s}$), Helong-Y ($30,852.32\ \mu\text{s}$).
    - **China East Sea (GRI 8390)**: Xuancheng-M ($10,000.00\ \mu\text{s}$), Raoping-X ($13,795.52\ \mu\text{s}$), Rongcheng-Y ($31,459.70\ \mu\text{s}$).
    - **East Asia (GRI 9930)**: Pohang-M ($10,000.00\ \mu\text{s}$), Kwangju-W ($11,946.97\ \mu\text{s}$), Ussuriisk-Z ($54,162.44\ \mu\text{s}$), Incheon-P ($81,352.00\ \mu\text{s}$).

---

## 4. Formula Sheet (provenance in PROVENANCE.md)

### 1. RF Pulse Envelope & Instantaneous Current

When time $t$ is expressed in **microseconds** ($\mu\text{s}$) from pulse start ($t \ge 0$):

$$
i(t) = A \cdot t^2 \cdot e^{-2t / 65} \cdot \sin(2\pi \cdot 0.1 \cdot t + PC) = A \cdot t^2 \cdot e^{-2t / 65} \cdot \sin(0.2\pi \cdot t + PC)
$$

Where:
- $t$: Time in microseconds ($\mu\text{s}$).
- Carrier frequency: $f_0 = 100\text{ kHz} = 0.1\text{ cycles}/\mu\text{s}$ (carrier period $T_c = 10\ \mu\text{s}$).
- When time $t_s$ is expressed in **seconds**:

  $$
  \sin(2\pi \cdot f_0 \cdot t_s + PC) = \sin(2\pi \cdot 10^5 \cdot t_s + PC)
  $$

- Peak envelope amplitude occurs at $t = 65\ \mu\text{s}$:

  $$
  \frac{d}{dt}\left(t^2 e^{-2t/65}\right) = \left(2t - \frac{2t^2}{65}\right) e^{-2t/65} = 0 \implies t = 65\ \mu\text{s}
  $$

- Standard Zero Crossing (SZC): 3rd positive-going zero crossing at $t = 30\ \mu\text{s}$ (3 × 10 µs).
- $PC$: Phase code ($0$ or $\pi$ radians).

### 2. Groundwave Propagation Time

$$
t = \mathrm{PF} + \mathrm{SF} + \mathrm{ASF}
$$

- **Primary Factor (PF)**: Propagation delay through the standard atmosphere:

  $$
  \mathrm{PF} = \frac{\eta \cdot d}{c}
  $$

  - $c = 299,792,458\text{ m/s}$ (vacuum speed of light).
  - $\eta = 1.000338$ (RTCM SC-127 standard atmospheric refractive index).
  - $\eta = 1.000284$ (USCG Loran-C User Handbook standard).
  - $\eta = 1.000315$ (China Academy of Sciences eLoran standard).
- **Secondary Factor (SF)**: **SOURCED Continuous Physical Model (Brunavs 1977)**.
  The excess phase delay over all-seawater paths ($\sigma = 5.0\text{ S/m}$, $\varepsilon_r = 80$) is computed using Paul Brunavs' continuous closed-form formula developed for the Canadian Hydrographic Service (*Int. Hydrogr. Rev.* 1978; validated in Rhee et al. 2021 and Seo et al. 2020):

  $$
  (\mathrm{PF} + \mathrm{SF})_{\text{meters}} = -111.0 + 98.2 D + (13.0 D + 113.0) e^{-D/2} + \frac{2.277}{D}
  $$

  where $D$ is geodesic distance in Megameters (1 Mm = 1,000 km = $10^6$ m).
  The resulting delay in seconds is:

  $$
  \tau_{\mathrm{SF}}(d) = \frac{(\mathrm{PF} + \mathrm{SF})_{\text{meters}}}{c}
  $$

  This continuous model eliminates the unphysical ~0.236 µs (71 m) step discontinuity present in historical USCG piecewise handbooks (boundary step is < 0.0001 µs across 100 statute miles). The historical piecewise formula is retained in SIMULORAN solely under an optional `'legacy'` comparison flag.
- **Additional Secondary Factor (ASF)**: Overland excess phase delay due to sub-surface conductivity variations and terrain impedance ($\sigma \approx 0.0001\text{ to }0.01\text{ S/m}$).

### 3. Pseudorange Observation Model

$$
\mathrm{TOA}_i = T_{tx,i} + \frac{\eta \cdot d_i}{c} + \mathrm{SF}(d_i) + \mathrm{ASF}_i + b_{\text{rx}} + \varepsilon_i
$$

Observed pseudorange:

$$
\rho_i = c \cdot (\mathrm{TOA}_i - T_{tx,i}) = d_i + c \cdot b_{\text{rx}} + c \cdot \left( \frac{\eta - 1}{c} d_i + \mathrm{SF}_i + \mathrm{ASF}_i \right) + \tilde{\varepsilon}_i
$$

State vector: $\mathbf{x} = [x, y, c \cdot b_{rx}]^T$.

Normal Equations (Gauss-Newton):

$$
\Delta \mathbf{x} = (H^T W H)^{-1} H^T W \mathbf{r}
$$

where the $i$-th row of design matrix $H$ is:

$$
H_i = \left[ \frac{x - x_i}{d_i}, \quad \frac{y - y_i}{d_i}, \quad 1 \right]
$$

### 4. Dilution of Precision (DOP)

Covariance matrix:

$$
Q = (H^T H)^{-1}
$$

Dilution of precision metrics:

- Horizontal Dilution of Precision:

  $$
  \mathrm{HDOP} = \sqrt{Q_{11} + Q_{22}}
  $$

- Time Dilution of Precision:

  $$
  \mathrm{TDOP} = \sqrt{Q_{33}}
  $$

- Geometric Dilution of Precision:

  $$
  \mathrm{GDOP} = \sqrt{\mathrm{Tr}(Q)} = \sqrt{Q_{11} + Q_{22} + Q_{33}}
  $$

### 5. Measurement Noise & Cycle Slip Criteria

$$
\sigma_i^2 = \sigma_{\text{jitter}}^2 + \frac{337.5^2}{N_{\text{pulses}} \cdot \mathrm{SNR}_i}
$$

- Baseline transmitter timing jitter: Prior literature assumed baseline uncertainty on the order of $4\text{–}6\text{ meters}$, corresponding to approximately $13\text{–}20\text{ ns}$ in one-way propagation time.
- Wrong-Cycle Selection: Occurs when tracking error exceeds $|\Delta TOA| > 10\ \mu\text{s}$, shifting the measurement by ±1 carrier cycle (~2,998 m ≈ 3 km).

### 6. Phase Code Interval (PCI) Signal Synthesis (CheolJ 2020)

The radiated continuous-time signal $s_{\text{PCI}}(t)$ over a Phase Code Interval (PCI) encompassing group intervals $GRI_A$ and $GRI_B$ ($T_{\text{PCI}} = 2 \times T_{\text{GRI}}$) is given by:

$$
s_{\text{PCI}}(t) = \sum_{p \in \{A, B\}} \sum_{s \in \mathcal{S}} \sum_{k=0}^{K_s - 1} c_{s, p}[k] \cdot E\left(t - t_{s, p}[k]\right) \cdot \sin\left(2\pi f_0 (t - t_{s, p}[k])\right)
$$

where:
- $\mathcal{S}$ is the set of transmitting stations in the chain (Master $M$ and secondaries $X, Y, Z, \dots$).
- $c_{s, p}[k] \in \{+1, -1\}$ is the phase coding coefficient for pulse $k$ of station $s$ during group interval $p \in \{A, B\}$.
- For Master ($K_M = 10$), $c_{M, p}[8] = 0$ represents the $1000\ \mu\text{s}$ blanking interval preceding the 9th identification pulse at $k = 9$ ($t = ED + 10,000\ \mu\text{s}$).
- $t_{s, p}[k] = T_{\text{period}}[p] + ED_s + \Delta t_k$, where $ED_s$ is the calibrated Emission Delay of station $s$, and $\Delta t_k = k \times 1000\ \mu\text{s}$ (with $\Delta t_9 = 10,000\ \mu\text{s}$ for Master).
- $E(t)$ is the standard Loran-C envelope function ($E(t) = A_s (t/\tau)^2 e^{-2(t-\tau)/\tau}$ for $t \ge 0$).

---

## 5. Standard Terminology

- **GRI (Group Repetition Interval)**: The time interval between successive master pulse group transmissions, expressed in microseconds divided by 10 (e.g., GRI 7430 = $74,300\ \mu\text{s}$).
- **ECD (Envelope-to-Cycle Difference)**: The phase difference between the $100\text{ kHz}$ carrier wave and the pulse amplitude envelope. Path dispersion shifts ECD, which receivers track to maintain lock on the standard 3rd zero crossing.
- **SZC (Standard Zero Crossing)**: The designated tracking point on the Loran pulse, defined at the 3rd positive-going zero crossing ($30\ \mu\text{s}$ after pulse onset), where groundwave amplitude is developed and early skywaves have not yet arrived.
- **SGR (Skywave-to-Groundwave Ratio)**: Ratio of ionospheric reflected signal amplitude to line-of-sight groundwave amplitude.
- **Secondary Blink**: An integrity warning transmitted by a secondary station when its timing or phase synchronization exceeds operational tolerance. The station modulates the first two pulses of the secondary group on and off in an established cadence (e.g. 0.25 s on, 0.25 s off), warning receivers that the baseline is unusable for navigation.
- **HEA (Harbor Entrance and Approach)**: Strict IMO maritime navigation accuracy standard (typically requiring horizontal positioning accuracy better than $10\text{ meters}$ at 95% confidence).
- **HPL (Horizontal Protection Level)**: In SIMULORAN, computed as a simplified $k \cdot \sigma$ estimate (3σ), not a certified integrity bound per RTCM MPS.
- **DLoran (Differential Loran)**: Ground monitor stations measuring local real-time ASF deviations and broadcasting pseudorange / position corrections via the 9th pulse to nearby vessels.
- **LDC (Loran Data Channel)**: Low-rate digital data channel modulated onto the 9th pulse (or pulses 3–8 via Eurofix) transmitting differential GPS/GNSS corrections, UTC leap second warnings, and station integrity flags.
