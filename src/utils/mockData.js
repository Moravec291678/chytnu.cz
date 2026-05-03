export const TEST_CATCHES = [
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
    revierNumber: "471 123",
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

    photos: ["https://example.com/catch1.jpg"],
    notes: "Záběr při západu slunce.",
    isFavorite: true,

    isPersonalBest: true,
    isSeasonRecord: true,
    isSpeciesBest: false,
  },

  {
    id: "catch-002",
    createdAt: new Date("2026-04-12T09:10:00Z"),

    species: "Candát",
    speciesKey: "zander",
    speciesLatin: "Sander lucioperca",

    weightKg: 3.2,
    lengthCm: 65,
    fightMinutes: 5,

    locationName: "Řeka Odra",
    gps: { lat: 49.835, lng: 18.292 },
    waterDepthM: 4.2,
    bottomType: "rocky",

    caughtAt: new Date("2026-04-12T08:45:00Z"),
    tripId: "trip-002",

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

    photos: ["https://example.com/catch2.jpg"],
    notes: "Záběr u dna, pomalé vedení.",
    isFavorite: false,

    isPersonalBest: false,
    isSeasonRecord: false,
    isSpeciesBest: true,
  },

  {
    id: "catch-003",
    createdAt: new Date("2026-04-15T14:00:00Z"),

    species: "Pstruh",
    speciesKey: "trout",
    speciesLatin: "Salmo trutta",

    weightKg: 1.1,
    lengthCm: 42,
    fightMinutes: 3,

    locationName: "Beskydský potok",
    waterDepthM: 1.2,
    bottomType: "sandy",

    caughtAt: new Date("2026-04-15T13:40:00Z"),
    tripId: "trip-003",

    method: { key: "flyFishing", label: "Muškaření", isCustom: false },
    baits: [{ key: "worms", label: "🔴 Červi", isCustom: false }],
    result: "released",

    conditions: {
      airTempC: 10,
      waterTempC: 8,
      pressureHpa: 1015,
      pressureTrend: "falling",
      windKmh: 4,
      weather: "déšť",
      moonPhase: "waningCrescent",
    },

    photos: [],
    notes: "Menší kus, chycen na mělčině.",
    isFavorite: false,

    isPersonalBest: false,
    isSeasonRecord: false,
    isSpeciesBest: false,
  },
];
