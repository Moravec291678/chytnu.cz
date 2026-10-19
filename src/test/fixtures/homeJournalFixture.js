export function createHomeJournalFixture(now = new Date()) {
  const day = (daysAgo, hour = 8) => {
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };

  const trips = [
    {
      id: "qa-trip-finished",
      title: "Dokončená ranní výprava",
      locationName: "Řeka",
      startedAt: day(8, 5),
      endedAt: day(8, 12),
      methodKey: "spinning",
      notes: "",
    },
    {
      id: "qa-trip-active",
      title: "Aktuální výprava",
      locationName: "Jezero",
      startedAt: new Date(now.getTime() - 95 * 60 * 1000).toISOString(),
      endedAt: null,
      methodKey: "feeder",
      notes: "",
    },
  ];

  const catches = [
    ["carp", "Kapr obecný", 12.4, 86, "Jezero", 0, "qa-trip-active", "feeder"],
    ["pike", "Štika obecná", 5.2, 79, "Řeka", 2, null, "spinning"],
    ["zander", "Candát obecný", 3.1, 68, "Řeka", 3, null, "spinning"],
    ["perch", "Okoun říční", 0.8, 34, "Jezero", 5, null, "float"],
    ["carp", "Kapr obecný", 7.6, 72, "Řeka", 8, "qa-trip-finished", "feeder"],
    ["roach", "Plotice obecná", 0.4, 26, "Kanál", 12, null, "float"],
    ["pike", "Štika obecná", 4.3, 75, "Jezero", 15, null, "spinning"],
    ["carp", "Kapr obecný", 9.8, 78, "Kanál", 19, null, "feeder"],
  ].map(([speciesKey, species, weightKg, lengthCm, locationName, daysAgo, tripId, methodKey], index) => ({
    schemaVersion: 1,
    id: `qa-catch-${index + 1}`,
    createdAt: day(daysAgo),
    updatedAt: day(daysAgo),
    caughtAt: index === 0 ? now.toISOString() : day(daysAgo),
    speciesKey,
    species,
    speciesLatin: null,
    weightKg,
    lengthCm,
    girthCm: null,
    fightMinutes: null,
    locationName,
    waterNumber: null,
    gpsLocation: "",
    coordinates: null,
    waterDepthM: null,
    bottomType: null,
    tripId,
    method: { key: methodKey, label: methodKey === "spinning" ? "Přívlač" : methodKey === "feeder" ? "Feeder" : "Plavaná" },
    baits: [],
    result: "released",
    photos: [],
    notes: "",
    isFavorite: index === 3,
    sync: { status: "local", revision: 1 },
  }));

  return { catches, trips };
}
