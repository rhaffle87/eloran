/**
 * Predefined Scenarios and Station Presets for SIMULORAN
 * 
 * All presets are grounded in peer-reviewed research papers, published journal articles,
 * or authoritative maritime standards:
 * 1. Rotterdam Europort Approach: Offermans, Helwig, & van der Marel (2013/2015, IEEE PLANS / RIN).
 * 2. Korea-Yellow Sea Trial: Rhee, Kim, Son, & Seo (2021, Sensors / J. Navigation Table 5).
 * 3. Dover Strait TSS: General Lighthouse Authorities (GLA) & Trinity House (2014-2015).
 * 4. China East Sea Chain (GRI 8390): CheolJ (2020) & NGA Pub 117 Ch. 6.
 * 5. East Asia Chain (GRI 9930): CheolJ (2020) & Korean Ministry of Oceans and Fisheries.
 * 6. North China Sea Chain (GRI 7430): NGA Pub 117 Ch. 6 & China MSA.
 * 7. North Sea Chain (Historical): IALA Guideline 1118 (2015) & GLA NELS Decommissioning Report.
 */

export const PRESET_SCENARIOS = {
  "rotterdam_harbor_approach": {
    "id": "rotterdam_harbor_approach",
    "name": "Rotterdam Europort Harbor Approach (d-Loran Calibrated)",
    "shortName": "Rotterdam Europort Approach",
    "status": "calibrated",
    "description": "Port of Rotterdam deep-water approach fairway past Hook of Holland into Maasvlakte container basin. Calibrated with Hook of Holland d-Loran reference monitor, North Sea transmitters (Sylt, Lessay, Anthorn, Værlandet), and sub-10m HEA (Harbor Entrance and Approach) navigation under Eurofix DDC corrections.",
    "center": [
      4.02,
      51.98
    ],
    "zoom": 10,
    "masters": [
      {
        "role": "master",
        "label": "Sylt-M (6731M)",
        "lat": 54.983333,
        "lng": 8.283333,
        "txDbm": 30,
        "griMs": 6731,
        "offsetSec": 0,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": true,
          "avgMeters": 1.2
        },
        "asfMeters": 4.5
      }
    ],
    "slaves": [
      {
        "role": "slave",
        "label": "Lessay-W (6731W)",
        "lat": 49.15,
        "lng": -1.5,
        "txDbm": 26,
        "griMs": 6731,
        "offsetSec": 0.011,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": true,
          "avgMeters": 1.8
        },
        "asfMeters": 6.2
      },
      {
        "role": "slave",
        "label": "Anthorn-X (6731X)",
        "lat": 54.9125,
        "lng": -3.278333,
        "txDbm": 26,
        "griMs": 6731,
        "offsetSec": 0.026,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": true,
          "avgMeters": 2.1
        },
        "asfMeters": 7.8
      },
      {
        "role": "slave",
        "label": "Værlandet-Y (6731Y)",
        "lat": 61.3,
        "lng": 5.1,
        "txDbm": 26,
        "griMs": 6731,
        "offsetSec": 0.042,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": true,
          "avgMeters": 1.5
        },
        "asfMeters": 5
      }
    ],
    "receivers": [
      {
        "role": "receiver",
        "label": "R1-EuroportVessel",
        "lat": 51.986,
        "lng": 4.075,
        "fuseMode": "fusion"
      }
    ],
    "trajectoryPreset": "rotterdam",
    "dLoranMonitor": {
      "id": "hook_of_holland",
      "name": "Hook of Holland Reference Monitor",
      "lat": 51.9775,
      "lng": 4.1333
    }
  },
  "korea_yellow_sea_trial": {
    "id": "korea_yellow_sea_trial",
    "name": "Korea-Yellow Sea Trial Benchmark (Rhee et al., 2021)",
    "shortName": "Korea-Yellow Sea Trial (2021)",
    "status": "benchmark",
    "description": "Northeast Asia 4-transmitter eLoran chain benchmarked against published field trial data from Rhee, Kim, Son, & Seo (2021, Table 5). Real measured 95% repeatable positioning accuracy across 7 South Korean test locations (Incheon, Pyeongtaek, Dangjin, Andong, Gumi, Jeonju, Gwangju) ranges from 8.49 m to 12.73 m.",
    "center": [
      126.7,
      36.5
    ],
    "zoom": 6,
    "masters": [
      {
        "role": "master",
        "label": "Pohang-M (9930M)",
        "lat": 36.184814,
        "lng": 129.340944,
        "txDbm": 26,
        "griMs": 9930,
        "offsetSec": 0,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": true,
          "avgMeters": 1.5
        },
        "asfMeters": 8
      }
    ],
    "slaves": [
      {
        "role": "slave",
        "label": "Gwangju-W (9930W)",
        "lat": 35.04,
        "lng": 126.540833,
        "txDbm": 26,
        "griMs": 9930,
        "offsetSec": 0.011,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": false,
          "avgMeters": 0
        },
        "asfMeters": 12
      },
      {
        "role": "slave",
        "label": "Rongcheng-M (7430M)",
        "lat": 37.066667,
        "lng": 122.316667,
        "txDbm": 26,
        "griMs": 7430,
        "offsetSec": 0.024,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": false,
          "avgMeters": 0
        },
        "asfMeters": 10
      },
      {
        "role": "slave",
        "label": "Xuancheng-X (7430X)",
        "lat": 31.066667,
        "lng": 118.883333,
        "txDbm": 26,
        "griMs": 7430,
        "offsetSec": 0.038,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": false,
          "avgMeters": 0
        },
        "asfMeters": 16
      }
    ],
    "receivers": [
      {
        "role": "receiver",
        "label": "Incheon-Testbed",
        "lat": 37.4563,
        "lng": 126.7052,
        "fuseMode": "fusion"
      }
    ]
  },
  "dover_strait_tss": {
    "id": "dover_strait_tss",
    "name": "Dover Strait Traffic Separation Scheme (GNSS Jamming Resilience)",
    "shortName": "Dover Strait TSS",
    "status": "resilience",
    "description": "World's busiest maritime transit corridor through the Dover Strait between UK and France. Demonstrates eLoran resilience under localized GNSS spoofing and high-power broadband jamming, maintaining resilient non-satellite PNT with cross-track accuracy < 10m.",
    "center": [
      1.45,
      51.1
    ],
    "zoom": 9,
    "masters": [
      {
        "role": "master",
        "label": "Anthorn-M (6731X)",
        "lat": 54.9125,
        "lng": -3.278333,
        "txDbm": 26,
        "griMs": 6731,
        "offsetSec": 0,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": true,
          "avgMeters": 2
        },
        "asfMeters": 5.4
      }
    ],
    "slaves": [
      {
        "role": "slave",
        "label": "Lessay-W (6731W)",
        "lat": 49.15,
        "lng": -1.5,
        "txDbm": 26,
        "griMs": 6731,
        "offsetSec": 0.012,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": true,
          "avgMeters": 1.6
        },
        "asfMeters": 4.8
      },
      {
        "role": "slave",
        "label": "Sylt-X (6731M)",
        "lat": 54.983333,
        "lng": 8.283333,
        "txDbm": 30,
        "griMs": 6731,
        "offsetSec": 0.028,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": true,
          "avgMeters": 2.5
        },
        "asfMeters": 8.1
      },
      {
        "role": "slave",
        "label": "Soustons-Y (6731Y)",
        "lat": 43.7,
        "lng": -1.333333,
        "txDbm": 26,
        "griMs": 6731,
        "offsetSec": 0.045,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": false,
          "avgMeters": 0
        },
        "asfMeters": 9.4
      }
    ],
    "receivers": [
      {
        "role": "receiver",
        "label": "R1-ChannelFreighter",
        "lat": 51.1,
        "lng": 1.45,
        "fuseMode": "eloran-only"
      }
    ],
    "trajectoryPreset": "dover",
    "dLoranMonitor": {
      "id": "dover_harbor",
      "name": "Dover Harbor Monitor Station",
      "lat": 51.1333,
      "lng": 1.3667
    }
  },
  "china_east_sea_8390": {
    "id": "china_east_sea_8390",
    "name": "China East Sea Chain — GRI 8390 (Calibrated Reference)",
    "shortName": "China East Sea Chain (GRI 8390)",
    "status": "active",
    "description": "Calibrated Chinese East Sea Chain (GRI 8390) reference scenario from CheolJ (2020). Master: Xuancheng (31°04'N 118°53'E). Secondaries: Raoping (X, ED = 13,795.52 µs) and Rongcheng (Y, ED = 31,459.70 µs). Real-world calibrated emission delays across the East China Sea and Taiwan Strait corridor.",
    "center": [
      120,
      29.5
    ],
    "zoom": 6,
    "masters": [
      {
        "role": "master",
        "label": "Xuancheng-M (8390M)",
        "lat": 31.066667,
        "lng": 118.883333,
        "txDbm": 26,
        "griMs": 8390,
        "offsetSec": 0,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": true,
          "avgMeters": 1.8
        },
        "asfMeters": 8
      }
    ],
    "slaves": [
      {
        "role": "slave",
        "label": "Raoping-X (8390X)",
        "lat": 23.7,
        "lng": 116.933333,
        "txDbm": 26,
        "griMs": 8390,
        "offsetSec": 0.01379552,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": false,
          "avgMeters": 0
        },
        "asfMeters": 14
      },
      {
        "role": "slave",
        "label": "Rongcheng-Y (8390Y)",
        "lat": 37.066667,
        "lng": 122.316667,
        "txDbm": 26,
        "griMs": 8390,
        "offsetSec": 0.0314597,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": false,
          "avgMeters": 0
        },
        "asfMeters": 10
      }
    ],
    "receivers": [
      {
        "role": "receiver",
        "label": "EastSea-Patrol",
        "lat": 28.5,
        "lng": 122.5,
        "fuseMode": "fusion"
      }
    ]
  },
  "east_asia_9930": {
    "id": "east_asia_9930",
    "name": "East Asia Chain — GRI 9930 (Calibrated Reference)",
    "shortName": "East Asia Chain (GRI 9930)",
    "status": "active",
    "description": "Calibrated East Asia Chain (GRI 9930) reference scenario from CheolJ (2020). Master: Pohang. Secondaries: Kwangju (W, ED = 11,946.97 µs), Ussuriisk (Z, ED = 54,162.44 µs), and Incheon (P, ED = 81,352.00 µs). Exact emission delays across the Korean Peninsula, Yellow Sea, and Sea of Japan.",
    "center": [
      128,
      38
    ],
    "zoom": 6,
    "masters": [
      {
        "role": "master",
        "label": "Pohang-M (9930M)",
        "lat": 36.1856,
        "lng": 129.3547,
        "txDbm": 26,
        "griMs": 9930,
        "offsetSec": 0,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": true,
          "avgMeters": 1.5
        },
        "asfMeters": 8
      }
    ],
    "slaves": [
      {
        "role": "slave",
        "label": "Kwangju-W (9930W)",
        "lat": 35.0425,
        "lng": 126.7828,
        "txDbm": 26,
        "griMs": 9930,
        "offsetSec": 0.01194697,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": false,
          "avgMeters": 0
        },
        "asfMeters": 12
      },
      {
        "role": "slave",
        "label": "Ussuriisk-Z (9930Z)",
        "lat": 44.05,
        "lng": 131.9833,
        "txDbm": 26,
        "griMs": 9930,
        "offsetSec": 0.05416244,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": false,
          "avgMeters": 0
        },
        "asfMeters": 20
      },
      {
        "role": "slave",
        "label": "Incheon-P (9930P)",
        "lat": 37.4563,
        "lng": 126.7052,
        "txDbm": 26,
        "griMs": 9930,
        "offsetSec": 0.081352,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": false,
          "avgMeters": 0
        },
        "asfMeters": 10
      }
    ],
    "receivers": [
      {
        "role": "receiver",
        "label": "EastSea-Vessel",
        "lat": 37.2,
        "lng": 128.5,
        "fuseMode": "fusion"
      }
    ]
  },
  "bohai_yellow_sea_active": {
    "id": "bohai_yellow_sea_active",
    "name": "North China Sea Chain — GRI 7430 (Active)",
    "shortName": "North China Sea Chain (GRI 7430)",
    "status": "active",
    "description": "Active Chinese eLoran North China Sea Chain (GRI 7430). Master: Rongcheng (37°04'N 122°19'E). Secondaries: Xuancheng (X, 31°04'N 118°53'E) and Helong (Y, 42°43'N 129°06'E). Coordinates from NGA Pub 117 (Radio Aids to Navigation, Chapter 6). Transmits navigation pulses plus 9th-pulse LDC differential corrections. GRI = 7430 (74.3 ms group interval). Note: GRI 6780 is the separate South China Sea chain (Hexian master).",
    "center": [
      121.5,
      36.5
    ],
    "zoom": 6,
    "masters": [
      {
        "role": "master",
        "label": "Rongcheng-M (Active)",
        "lat": 37.066667,
        "lng": 122.316667,
        "txDbm": 26,
        "griMs": 7430,
        "offsetSec": 0,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": true,
          "avgMeters": 1.8
        },
        "asfMeters": 8
      }
    ],
    "slaves": [
      {
        "role": "slave",
        "label": "Xuancheng-X (Active)",
        "lat": 31.066667,
        "lng": 118.883333,
        "txDbm": 26,
        "griMs": 7430,
        "offsetSec": 0.0134597,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": false,
          "avgMeters": 0
        },
        "asfMeters": 15
      },
      {
        "role": "slave",
        "label": "Helong-Y (Active)",
        "lat": 42.716667,
        "lng": 129.1,
        "txDbm": 26,
        "griMs": 7430,
        "offsetSec": 0.03085232,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-14
        },
        "diffCorrections": {
          "enabled": false,
          "avgMeters": 0
        },
        "asfMeters": 22
      }
    ],
    "receivers": [
      {
        "role": "receiver",
        "label": "Cargo-Vessel-Bohai",
        "lat": 38.2,
        "lng": 121,
        "fuseMode": "fusion"
      }
    ]
  },
  "north_sea_historical": {
    "id": "north_sea_historical",
    "name": "North Sea Chain (Historical - Decommissioned Dec 2015)",
    "shortName": "North Sea Chain (Historical)",
    "status": "historical",
    "description": "Historical Northwest European Loran-C/eLoran chain (GRI 6731). Decommissioned on December 31, 2015. Sylt (Germany) and Lessay (France) were permanently shut down. Anthorn (UK) transmitter was retained solely for timing broadcast (UTC transfer). Demonstrates that a single transmitter provides time synchronization but cannot solve for a 2D position fix.",
    "center": [
      3.5,
      53.5
    ],
    "zoom": 5.5,
    "masters": [
      {
        "role": "master",
        "label": "Sylt-Master (Decomm 2015)",
        "lat": 54.960278,
        "lng": 8.293611,
        "txDbm": 24,
        "griMs": 6731,
        "offsetSec": 0,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-13
        },
        "diffCorrections": {
          "enabled": true,
          "avgMeters": 2.1
        },
        "asfMeters": 5,
        "asfFormula": "20 * cos((lng / 5) * pi)"
      }
    ],
    "slaves": [
      {
        "role": "slave",
        "label": "Lessay-Slave (Decomm 2015)",
        "lat": 49.15,
        "lng": -1.503333,
        "txDbm": 24,
        "griMs": 6731,
        "offsetSec": 0.013,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-13
        },
        "diffCorrections": {
          "enabled": false,
          "avgMeters": 0
        },
        "asfMeters": 18
      },
      {
        "role": "slave",
        "label": "Anthorn-Slave (UK Timing Only)",
        "lat": 54.911389,
        "lng": -3.278333,
        "txDbm": 22,
        "griMs": 6731,
        "offsetSec": 0.027,
        "phaseSec": 0,
        "ddsEnabled": true,
        "clock": {
          "type": "cesium",
          "biasSec": 0,
          "driftPerSec": 1e-13
        },
        "diffCorrections": {
          "enabled": false,
          "avgMeters": 0
        },
        "asfMeters": 12
      }
    ],
    "receivers": [
      {
        "role": "receiver",
        "label": "NorthSea-Vessel",
        "lat": 53.8,
        "lng": 3.2,
        "fuseMode": "fusion"
      }
    ]
  }
};
