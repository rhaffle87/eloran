# Comprehensive Loran-C & eLoran Reference Compendium

This document compiles authoritative primary standards, textbooks, PhD dissertations, peer-reviewed journals, verified formula sheets, and terminology definitions underpinning the **LORAN LAB** physics engine.

---

## 1. Primary Standards & Regulatory Documents

| Document Identifier | Issuing Body & Year | Core System Parameters & Usage |
|---|---|---|
| **COMDTINST M16562.4A** | United States Coast Guard (1994) | *Specification of the Transmitted Loran-C Signal*. Authoritative standard for RF pulse shape ($i(t) = A t^2 e^{-2t/65}\sin(\omega t)$), 3rd zero crossing at $30\ \mu s$, group repetition intervals, phase codes, and tolerances. |
| **Loran-C User Handbook (P16562.5)** | United States Coast Guard (1992) | Official station coordinates in WGS 84 (Table B-1), chain geometry, baseline travel time definitions, and Secondary Factor (SF) seawater models. |
| **Loran Data Channel v1.3** | Peterson et al. (2006) | Specification for the Loran Data Channel (LDC) utilizing 9th-pulse Pulse Position Modulation (PPM) for differential corrections and UTC offsets. |
| **eLoran System Definition** | International Loran Association (ILA, 2007) | Core definition of Enhanced Loran as an independent, resilient PNT alternative to GNSS. Targets ITU G.811 primary reference clock compliance ($1 \times 10^{-11}$). |
| **Lo et al. (RTCM MPS)** | ILA Proceedings (2009) | Authoritative specifications for Primary Factor (PF, $\eta = 1.000338$), Secondary Factor (SF), and Additional Secondary Factor (ASF) integration. |
| **ITU-R P.368-10** | International Telecommunication Union (2007) | Groundwave propagation curves for frequencies between $10\text{ kHz}$ and $30\text{ MHz}$, including Millington's mixed-path method. |
| **ITU-R P.832** | International Telecommunication Union (2012) | World atlas of ground conductivity ($\sigma$) and relative permittivity ($\varepsilon_r$). |
| **ITU-R P.372-17** | International Telecommunication Union (2016) | Standard models for atmospheric radio noise, man-made noise, and galactic background in LF bands. |
| **ITU-R M.589** | International Telecommunication Union | Technical characteristics of methods of data transmission in the $70\text{–}130\text{ kHz}$ band. |

---

## 2. Foundational Books & Theses

1. **Pierce, J. A., McKenzie, A. A., & Woodward, R. H. (1948).** *LORAN: Long Range Navigation*. MIT Radiation Laboratory Series, Vol. 4. McGraw-Hill.
   - The foundational text establishing pulsed hyperbolic radio-navigation, envelope timing, and geometric dilution of precision.
2. **Forssell, B. (1991 / 2008 reissued).** *Radionavigation Systems*. Artech House.
   - Rigorous mathematical treatment of hyperbolic positioning, circular vs. hyperbolic lines of position, GDOP covariance transformations, and skywave contamination.
3. **Pelgrum, W. (2006).** *New Potential of Low-Frequency Radionavigation in the 21st Century*. PhD dissertation, Delft University of Technology.
   - Authoritative modern analysis of the entire error chain (transmitter, Mixed-path ASF propagation, H-field antennas, receiver DSP). Proves $< 10\text{ m}$ (95%) horizontal accuracy in Harbor Entrance and Approach (HEA) scenarios.
4. **Offermans, G., & Helwig, A. (2003).** *Eurofix: Integrated Navigation and Communication System*. PhD dissertation, Delft University of Technology.
   - Mathematical framework for micro-pulse modulation (pulses 3–8 tri-state modulation) broadcasting DGNSS corrections via Loran pulses.
5. **Hargreaves, C. (2014).** *ASF Measurement and Processing for High-Accuracy Maritime Navigation*. MSc thesis, University of Nottingham.
   - Practical spatial modeling of Additional Secondary Factors along coastline approaches.

---

## 3. Topical Research & Papers

### A. ASF Propagation & Mixed Paths
- **Millington, G. (1949).** "Ground-wave propagation over an inhomogeneous smooth earth." *Proc. IEE*.
- **Monteath, G. D. (1973).** *Applications of the Electromagnetic Reciprocity Principle*. Pergamon Press.
- **Williams, P. N., & Last, J. D. (2000).** "Predicting the Additional Secondary Factor (ASF) of Loran-C groundwaves." *The Journal of Navigation*, 53(2), 268–282.
- **Zhou, X. et al. (2013).** "Full-wave simulation of Loran-C ASF over irregular mountainous terrain using PE and FDTD." *IEEE Trans. Aerosp. Electron. Syst.*

### B. Receiver DSP, Cycle Selection, & Envelope-to-Cycle Difference (ECD)
- **Boyce, C. et al. (2006).** "Cycle selection performance in modern eLoran receivers." *Proc. 35th Annual Convention of the International Loran Association*.
  - Defines wrong-cycle selection criteria ($|\Delta t| > 10\ \mu s$, corresponding to a $\sim 3\text{ km}$ range step). Demonstrates error rates as a function of effective $SNR \times N_{pulses}$.
- **Lo, S., Peterson, B., & Enge, P. (2005).** "Early skywave detection and mitigation for eLoran." *Proc. ILA 34*.

### C. Multilateration & Modern Positioning Algorithms
- **Gao, Y. et al. (2025).** "Direct Ellipsoidal Pseudorange Positioning Algorithm for Integrated eLoran/GNSS." *Sensors*, 25(3), 812.
- **Collins, J. (1980).** *Formulae for Advanced Loran Computation*. NOAA Technical Report NOS 81.
- **Razin, S. (1967).** "Explicit solution for hyperbolic tracking." *IEEE Trans. Aerosp. Electron. Syst.*

---

## 4. Verified Formula Sheet

### 1. RF Pulse Envelope & Instantaneous Current
$$i(t) = A \cdot t^2 \cdot e^{-2t / 65} \cdot \sin(2\pi \cdot 10^5 \cdot t + PC)$$
- $t$: Time in microseconds ($\mu s$) from pulse start ($t \ge 0$).
- Peak amplitude occurs precisely at $t = 65\ \mu s$:
  $$\frac{d}{dt}\left(t^2 e^{-2t/65}\right) = \left(2t - \frac{2t^2}{65}\right) e^{-2t/65} = 0 \implies t = 65\ \mu s$$
- Standard Zero Crossing (SZC): 3rd positive-going zero crossing at $t = 30\ \mu s$ (carrier period $T_c = 10\ \mu s$).
- $PC$: Phase code ($0$ or $\pi$ radians).

### 2. Groundwave Propagation Time
$$t = PF + SF + ASF$$
- **Primary Factor (PF)**: Propagation delay in standard atmosphere:
  $$PF = \frac{\eta \cdot d}{c}$$
  - $c = 299,792,458\text{ m/s}$ (vacuum speed of light).
  - $\eta = 1.000338$ (RTCM MPS standard atmospheric refractive index).
  - $\eta = 1.000284$ (USCG Loran-C User Handbook standard).
  - $\eta = 1.000315$ (China Academy of Sciences eLoran standard).
- **Secondary Factor (SF)**: Additional delay incurred along an all-seawater path ($\sigma = 5\text{ S/m}$, $\varepsilon_r = 80$ at $100\text{ kHz}$). Modeled by the Brunavs (1977) polynomial:
  - For $d_{sm} \le 100\text{ statute miles}$:
    $$SF(\mu s) = \frac{-0.4076}{d_{sm}} + 0.08182 + 0.003914 \cdot d_{sm}$$
  - For $d_{sm} > 100\text{ statute miles}$:
    $$SF(\mu s) = \frac{-107.8}{d_{sm}} + 1.297 + 0.000139 \cdot d_{sm}$$
- **Additional Secondary Factor (ASF)**: Excess phase delay incurred over mixed land, fresh water, and variable terrain conductivity ($\sigma \approx 0.001\text{ to }0.01\text{ S/m}$).

### 3. Pseudorange Observation Model (Modern Solver)
$$TOA_i = T_{tx,i} + \frac{\eta \cdot d_i}{c} + SF(d_i) + ASF_i + b_{rx} + \varepsilon_i$$
Observed Pseudorange:
$$\rho_i = c \cdot (TOA_i - T_{tx,i}) = d_i + c \cdot \left( \frac{\eta - 1}{c} d_i + SF_i + ASF_i + b_{rx} \right) + \tilde{\varepsilon}_i$$
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
For master-differenced TDOA hyperbolas:
$$R_{cov} = \sigma^2 (I + \mathbf{1}\mathbf{1}^T)$$
because the reference master observation is common to all baselines.

### 5. Measurement Noise & Cycle Slip Criteria
$$\sigma_i^2 = J_i^2 + \frac{337.5^2}{N_{pulses} \cdot SNR_i}$$
- $J_i$: Transmitter baseline jitter ($\approx 3\text{–}6\text{ ns}$).
- Wrong-Cycle Selection: occurs when $|\Delta TOA| > 10\ \mu s$, shifting range by $\pm 1$ carrier cycle ($\sim 2,998\text{ meters} \approx 3\text{ km}$).

---

## 5. Standard UI & Engineering Terminology

- **GRI (Group Repetition Interval)**: The time interval between successive master pulse group transmissions, expressed in microseconds divided by 10 (e.g., GRI 6731 = $67,310\ \mu s$).
- **ECD (Envelope-to-Cycle Difference)**: The phase relationship between the $100\text{ kHz}$ carrier wave and the pulse amplitude envelope. Path dispersion shifts ECD, which receivers must calibrate to track the standard 3rd zero crossing.
- **SZC (Standard Zero Crossing)**: The reference tracking point on the Loran pulse, defined at the 3rd positive-going zero crossing ($30\ \mu s$ after pulse onset), chosen because groundwave amplitude has built up while early skywaves have not yet arrived.
- **SGR (Skywave-to-Groundwave Ratio)**: Ratio of ionospheric reflected signal power to line-of-sight surface wave power.
- **TOR vs. TOA**:
  - *TOR (Time of Reception)*: Raw time measured by the local receiver counter at pulse arrival.
  - *TOA (Time of Arrival)*: Absolute epoch time after compensating for receiver clock bias, power-on interval offsets, and integer GRI counts.
- **Master Blink**: Visual warning modulation (blinking of the 1st or 2nd secondary pulse, or master pulse spacing change) signaling that a station's timing is out of tolerance ($> \pm 100\text{ ns}$) and must not be used for navigation.
- **HEA (Harbor Entrance and Approach)**: Strict IMO maritime navigation standard requiring horizontal positioning accuracy better than $10\text{ meters}$ (95% confidence) with high availability and integrity ($HPL < 25\text{ m}$).
- **DLoran (Differential Loran)**: Ground monitor stations measuring local real-time ASF deviations and broadcasting pseudorange / position corrections via the 9th pulse to nearby vessels.
- **LDC (Loran Data Channel)**: Low-rate digital data channel modulated onto the 9th pulse (or pulses 3–8 via Eurofix) transmitting differential GPS/GNSS corrections, UTC leap second warnings, and station integrity flags.
