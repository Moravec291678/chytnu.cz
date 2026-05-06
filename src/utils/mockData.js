export const TEST_CATCHES = [
  // ===== KAPŘI (4x) =====
  {
    id: "catch-001",
    createdAt: new Date("2026-04-10T18:30:00Z"),

    species: "Kapr",
    speciesKey: "carp",
    speciesLatin: "Cyprinus carpio",

    weightKg: 7.8,
    lengthCm: 78,
    girthCm: 52,
    fightMinutes: 12,

    locationName: "Pískovna Hlučín",
    gps: { lat: 49.897, lng: 18.191 },
    waterDepthM: 3.5,
    bottomType: "muddy",

    caughtAt: new Date("2026-04-10T17:50:00Z"),
    tripId: "trip-001",

    method: { key: "feeder", label: "Feeder", isCustom: false },
    baits: [{ key: "boilies", label: "⚫ Boilies", isCustom: false }],
    result: "released",

    conditions: {
      airTempC: 18,
      waterTempC: 12,
      pressureHpa: 1018,
      pressureTrend: "stable",
      windKmh: 10,
      weather: "polojasno",
      moonPhase: "waxingGibbous",
    },

    photos: [],
    notes: "",
    isFavorite: false,

    isPersonalBest: false,
    isSeasonRecord: false,
    isSpeciesBest: false,
  },

  {
    id: "catch-002",
    createdAt: new Date("2026-04-12T18:00:00Z"),

    species: "Kapr",
    speciesKey: "carp",
    speciesLatin: "Cyprinus carpio",

    weightKg: 28,
    lengthCm: 68,
    girthCm: 44,
    fightMinutes: 9,

    locationName: "Těrlická přehrada",
    gps: { lat: 49.746, lng: 18.482 },
    waterDepthM: 2.4,
    bottomType: "sandy",

    caughtAt: new Date("2026-04-12T17:30:00Z"),
    tripId: "trip-002",

    method: { key: "float", label: "Splávek", isCustom: false },
    baits: [{ key: "corn", label: "🌽 Kukuřice", isCustom: false }],
    result: "released",

    conditions: {
      airTempC: 16,
      waterTempC: 13,
      pressureHpa: 1015,
      pressureTrend: "falling",
      windKmh: 12,
      weather: "oblačno",
      moonPhase: "fullMoon",
    },

    photos: [],
    notes: "",
    isFavorite: false,

    isPersonalBest: false,
    isSeasonRecord: false,
    isSpeciesBest: false,
  },

  {
    id: "catch-003",
    createdAt: new Date("2026-04-14T06:40:00Z"),

    species: "Kapr",
    speciesKey: "carp",
    speciesLatin: "Cyprinus carpio",

    weightKg: 9.1,
    lengthCm: 85,
    girthCm: 57,
    fightMinutes: 15,

    locationName: "Pískovna Hlučín",
    gps: { lat: 49.897, lng: 18.191 },
    waterDepthM: 3.2,
    bottomType: "muddy",

    caughtAt: new Date("2026-04-14T06:10:00Z"),
    tripId: "trip-003",

    method: { key: "feeder", label: "Feeder", isCustom: false },
    baits: [{ key: "boilies", label: "⚫ Boilies", isCustom: false }],
    result: "released",

    conditions: {
      airTempC: 11,
      waterTempC: 10,
      pressureHpa: 1021,
      pressureTrend: "rising",
      windKmh: 6,
      weather: "mlha",
      moonPhase: "lastQuarter",
    },

    photos: [],
    notes: "",
    isFavorite: true,

    isPersonalBest: false,
    isSeasonRecord: true,
    isSpeciesBest: true, // největší kapr
  },

  {
    id: "catch-004",
    createdAt: new Date("2026-04-16T19:10:00Z"),

    species: "Kapr",
    speciesKey: "carp",
    speciesLatin: "Cyprinus carpio",

    weightKg: 6.0,
    lengthCm: 72,
    girthCm: 48,
    fightMinutes: 10,

    locationName: "Štěrkovna",
    gps: { lat: 49.88, lng: 18.2 },
    waterDepthM: 2.0,
    bottomType: "sandy",

    caughtAt: new Date("2026-04-16T18:40:00Z"),
    tripId: "trip-004",

    method: { key: "float", label: "Splávek", isCustom: false },
    baits: [{ key: "corn", label: "🌽 Kukuřice", isCustom: false }],
    result: "released",

    conditions: {
      airTempC: 17,
      waterTempC: 13,
      pressureHpa: 1013,
      pressureTrend: "stable",
      windKmh: 9,
      weather: "slunečno",
      moonPhase: "firstQuarter",
    },

    photos: [],
    notes: "",
    isFavorite: false,

    isPersonalBest: false,
    isSeasonRecord: false,
    isSpeciesBest: false,
  },

  // ===== ŠTIKY (2x) =====
  {
    id: "catch-005",
    createdAt: new Date("2026-04-18T07:00:00Z"),

    species: "Štika",
    speciesKey: "pike",
    speciesLatin: "Esox lucius",

    weightKg: 6.5,
    lengthCm: 95,
    fightMinutes: 8,

    locationName: "Odra",
    gps: { lat: 49.84, lng: 18.28 },
    waterDepthM: 3.9,
    bottomType: "weedy",

    caughtAt: new Date("2026-04-18T06:40:00Z"),
    tripId: "trip-005",

    method: { key: "spinning", label: "Přívlač", isCustom: false },
    baits: [{ key: "lure", label: "🪝 Wobbler", isCustom: false }],
    result: "released",

    conditions: {
      airTempC: 10,
      waterTempC: 9,
      pressureHpa: 1020,
      pressureTrend: "stable",
      windKmh: 5,
      weather: "mlha",
      moonPhase: "waningGibbous",
    },

    photos: [],
    notes: "",
    isFavorite: false,

    isPersonalBest: false,
    isSeasonRecord: true,
    isSpeciesBest: true,
  },

  {
    id: "catch-006",
    createdAt: new Date("2026-04-19T17:30:00Z"),

    species: "Štika",
    speciesKey: "pike",
    speciesLatin: "Esox lucius",

    weightKg: 4.2,
    lengthCm: 80,
    fightMinutes: 6,

    locationName: "Štěrkovna",
    gps: { lat: 49.88, lng: 18.2 },
    waterDepthM: 2.5,
    bottomType: "weedy",

    caughtAt: new Date("2026-04-19T17:00:00Z"),
    tripId: "trip-006",

    method: { key: "spinning", label: "Přívlač", isCustom: false },
    baits: [{ key: "lure", label: "🪝 Třpytka", isCustom: false }],
    result: "released",

    conditions: {
      airTempC: 15,
      waterTempC: 12,
      pressureHpa: 1016,
      pressureTrend: "stable",
      windKmh: 7,
      weather: "oblačno",
      moonPhase: "firstQuarter",
    },

    photos: [],
    notes: "",
    isFavorite: false,

    isPersonalBest: false,
    isSeasonRecord: false,
    isSpeciesBest: false,
  },

  // ===== OKOUNI (3x) =====
  {
    id: "catch-007",
    species: "Okoun",
    speciesKey: "perch",
    speciesLatin: "Perca fluviatilis",
    weightKg: 0.8,
    lengthCm: 33,
    fightMinutes: 2,
    locationName: "Ostravice",
    gps: { lat: 49.82, lng: 18.262 },
    waterDepthM: 1.4,
    bottomType: "rocky",
    createdAt: new Date(),
    caughtAt: new Date(),
    tripId: "trip-007",
    method: { key: "spinning", label: "Přívlač", isCustom: false },
    baits: [{ key: "softBait", label: "🪱 Gumová nástraha", isCustom: false }],
    result: "released",
    conditions: {
      airTempC: 14,
      waterTempC: 11,
      pressureHpa: 1017,
      pressureTrend: "stable",
      windKmh: 8,
      weather: "slunečno",
      moonPhase: "firstQuarter",
    },
    photos: [],
    notes: "",
    isFavorite: false,
    isPersonalBest: false,
    isSeasonRecord: false,
    isSpeciesBest: true,
  },

  {
    id: "catch-008",
    species: "Okoun",
    speciesKey: "perch",
    speciesLatin: "Perca fluviatilis",
    weightKg: 0.6,
    lengthCm: 28,
    fightMinutes: 2,
    locationName: "Ostravice",
    gps: { lat: 49.82, lng: 18.262 },
    waterDepthM: 1.2,
    bottomType: "rocky",
    createdAt: new Date(),
    caughtAt: new Date(),
    tripId: "trip-008",
    method: { key: "spinning", label: "Přívlač", isCustom: false },
    baits: [{ key: "softBait", label: "🪱 Gumová nástraha", isCustom: false }],
    result: "released",
    conditions: {
      airTempC: 13,
      waterTempC: 10,
      pressureHpa: 1015,
      pressureTrend: "falling",
      windKmh: 6,
      weather: "oblačno",
      moonPhase: "lastQuarter",
    },
    photos: [],
    notes: "",
    isFavorite: false,
    isPersonalBest: false,
    isSeasonRecord: false,
    isSpeciesBest: false,
  },

  {
    id: "catch-009",
    species: "Okoun",
    speciesKey: "perch",
    speciesLatin: "Perca fluviatilis",
    weightKg: 0.7,
    lengthCm: 31,
    fightMinutes: 3,
    locationName: "Ostravice",
    gps: { lat: 49.82, lng: 18.262 },
    waterDepthM: 1.3,
    bottomType: "rocky",
    createdAt: new Date(),
    caughtAt: new Date(),
    tripId: "trip-009",
    method: { key: "spinning", label: "Přívlač", isCustom: false },
    baits: [{ key: "softBait", label: "🪱 Gumová nástraha", isCustom: false }],
    result: "released",
    conditions: {
      airTempC: 12,
      waterTempC: 10,
      pressureHpa: 1016,
      pressureTrend: "stable",
      windKmh: 5,
      weather: "slunečno",
      moonPhase: "waningCrescent",
    },
    photos: [],
    notes: "",
    isFavorite: false,
    isPersonalBest: false,
    isSeasonRecord: false,
    isSpeciesBest: false,
  },

  // ===== CANDÁT (1x) =====
  {
    id: "catch-010",
    species: "Candát",
    speciesKey: "zander",
    speciesLatin: "Sander lucioperca",
    weightKg: 3.4,
    lengthCm: 67,
    fightMinutes: 5,
    locationName: "Odra",
    gps: { lat: 49.835, lng: 18.292 },
    waterDepthM: 4.0,
    bottomType: "rocky",
    createdAt: new Date(),
    caughtAt: new Date(),
    tripId: "trip-010",
    method: { key: "spinning", label: "Přívlač", isCustom: false },
    baits: [{ key: "liveFish", label: "🐟 Živá rybka", isCustom: false }],
    result: "kept",
    conditions: {
      airTempC: 12,
      waterTempC: 9,
      pressureHpa: 1022,
      pressureTrend: "rising",
      windKmh: 6,
      weather: "zataženo",
      moonPhase: "lastQuarter",
    },
    photos: [],
    notes: "",
    isFavorite: false,
    isPersonalBest: false,
    isSeasonRecord: false,
    isSpeciesBest: true,
  },

  // ===== SUMEC (1x) → PERSONAL BEST =====
  {
    id: "catch-011",
    species: "Sumec",
    speciesKey: "catfish",
    speciesLatin: "Silurus glanis",
    weightKg: 22.5, // NEJVĚTŠÍ
    lengthCm: 160,
    fightMinutes: 30,
    locationName: "Odra",
    gps: { lat: 49.84, lng: 18.28 },
    waterDepthM: 6.0,
    bottomType: "muddy",
    createdAt: new Date(),
    caughtAt: new Date(),
    tripId: "trip-011",
    method: { key: "bottom", label: "Položená", isCustom: false },
    baits: [{ key: "liveFish", label: "🐟 Živá rybka", isCustom: false }],
    result: "released",
    conditions: {
      airTempC: 18,
      waterTempC: 15,
      pressureHpa: 1010,
      pressureTrend: "falling",
      windKmh: 4,
      weather: "noc",
      moonPhase: "fullMoon",
    },
    photos: [],
    notes: "",
    isFavorite: true,

    isPersonalBest: true, // jediný true
    isSeasonRecord: true,
    isSpeciesBest: true,
  },
];
