export const MOCK_TRIPS = [
  {
    id: "trip-001",

    title: "Jižní záliv",

    locationName: "Máchovo jezero",
    createdAt: "2026-03-10T08:00:00",
    startedAt: "2026-03-01T06:00:00",
    endedAt: "2026-03-01T14:00:00",

    methodKey: "spinning",

    coverPhoto: null,

    isPublic: true,

    speciesKeys: ["zander", "perch", "trout"],

    stats: {
      catchesCount: 7,
      speciesCount: 3,
      biggestCatchKg: 4.7,
    },
  },

  {
    id: "trip-002",

    title: "Večerní feeder pod mostem",

    locationName: "Labe",
    createdAt: "2026-03-10T08:00:00",
    startedAt: "2026-03-05T17:30:00",
    endedAt: "2026-03-05T23:10:00",

    methodKey: "feeder",

    coverPhoto: null,

    isPublic: true,

    speciesKeys: ["carp", "bream", "roach", "barbel"],

    stats: {
      catchesCount: 14,
      speciesCount: 4,
      biggestCatchKg: 6.1,
    },
  },

  {
    id: "trip-003",

    title: "Noční výprava u stromů",

    locationName: "Pískovna Hlučín",
    createdAt: "2026-03-10T08:00:00",
    startedAt: "2026-03-09T18:00:00",
    endedAt: "2026-03-10T07:20:00",

    methodKey: "carp",

    coverPhoto: null,

    isPublic: false,

    speciesKeys: ["carp", "grass_carp"],

    stats: {
      catchesCount: 5,
      speciesCount: 2,
      biggestCatchKg: 12.8,
    },
  },

  {
    id: "trip-004",

    title: "Ranní okouni",

    locationName: "Odra",
    createdAt: "2026-03-10T08:00:00",
    startedAt: "2026-03-12T05:40:00",
    endedAt: "2026-03-12T09:15:00",

    methodKey: "ultralight",

    coverPhoto: null,

    isPublic: true,

    speciesKeys: ["perch", "pike"],

    stats: {
      catchesCount: 19,
      speciesCount: 2,
      biggestCatchKg: 1.3,
    },
  },

  {
    id: "trip-005",

    title: "Deep jig hrany",

    locationName: "Slezská Harta",
    createdAt: "2026-03-10T08:00:00",
    startedAt: "2026-03-18T08:10:00",
    endedAt: "2026-03-18T15:40:00",

    methodKey: "vertical_jigging",

    coverPhoto: null,

    isPublic: true,

    speciesKeys: ["zander", "perch"],

    stats: {
      catchesCount: 8,
      speciesCount: 2,
      biggestCatchKg: 5.9,
    },
  },

  {
    id: "trip-006",

    title: "Muškaření pod splavem",

    locationName: "Moravice",
    createdAt: "2026-03-10T08:00:00",
    startedAt: "2026-03-22T06:15:00",
    endedAt: "2026-03-22T11:30:00",

    methodKey: "fly_fishing",

    coverPhoto: null,

    isPublic: true,

    speciesKeys: ["trout", "grayling"],

    stats: {
      catchesCount: 11,
      speciesCount: 2,
      biggestCatchKg: 1.6,
    },
  },
];
