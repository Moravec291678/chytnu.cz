import test from "node:test";
import assert from "node:assert/strict";
import { buildDiaryInsights } from "./diaryInsights.js";

const now = new Date("2026-11-04T12:00:00Z");
const catchRecord = (id, fields = {}) => ({ id, caughtAt: "2026-10-01T10:00:00Z", speciesKey: "commonCarp", species: "Starý název",
  lengthCm: null, weightKg: null, method: null, baits: [], ...fields });
const build = (records, options = {}) => buildDiaryInsights(records, { now, ...options });
const fact = (result, id) => result.facts.find((row) => row.id === id);

test("empty diary has useful Czech local fallback and no fabricated measurements or patterns", () => {
  const result = build([]);
  assert.equal(result.mode, "deterministic");
  assert.equal(result.statistics.count, 0);
  assert.equal(result.statistics.longestCm, null);
  assert.equal(result.statistics.meanLengthCm, null);
  assert.deepEqual(result.evidenceIds, []);
  assert.deepEqual(result.insights, []);
  assert.equal(result.recommendations[0].id, "start");
  assert.match(result.summary, /zatím nejsou/);
  assert.equal(build(null).statistics.count, 0);
});

test("one real catch is descriptive, catalog label wins and missing values remain missing", () => {
  const result = build([catchRecord("c1")]);
  assert.equal(fact(result, "species").value[0].label, "Kapr obecný");
  assert.equal(result.dataQuality.missingLength, 1);
  assert.equal(result.dataQuality.missingMeasuredWeight, 1);
  assert.equal(result.dataQuality.smallSample, true);
  assert.match(result.summary, /Vzorek je zatím malý/);
  assert.equal(fact(result, "length"), undefined);
  assert.equal(result.recommendations.some((row) => row.id === "observe-hours"), false);
  assert.equal(result.recommendations.some((row) => row.id === "build-sample"), true);
});

test("unknown species and unconfirmed suggestions do not become a confirmed catalogue species", () => {
  const records = ["", "unknown", " UNKNOWN ", "unspecified", "unidentified", null].map((speciesKey, i) => catchRecord(`u${i}`, { speciesKey }));
  records.push(catchRecord("ai", { quickCatch: { provenance: { speciesKey: "ai_suggestion" } } }));
  records.push(catchRecord("manual", { speciesKey: "northernPike", species: "Neaktuální popisek", quickCatch: { provenance: { speciesKey: "manual" } } }));
  const result = build(records);
  assert.equal(result.dataQuality.missingSpecies, 7);
  assert.equal(result.dataQuality.confirmedSpeciesCount, 1);
  assert.equal(result.distributions.species[0].key, "northernPike");
  assert.equal(result.distributions.species[0].label, "Štika obecná");
  assert.equal(result.distributions.species[0].count, 1);
});

test("duplicates, deleted, invalid dates, impossible calendar days, future dates and missing IDs are counted safely", () => {
  const record = catchRecord("valid");
  const result = build([record, record, catchRecord("deleted", { deleted: true }), catchRecord("bad", { caughtAt: "invalid" }),
    catchRecord("rollover", { caughtAt: "2026-02-31T10:00:00Z" }), catchRecord("future", { caughtAt: "2027-01-01T00:00:00Z" }),
    catchRecord(""), null]);
  assert.equal(result.statistics.count, 1);
  assert.equal(result.dataQuality.duplicateCount, 1);
  assert.equal(result.dataQuality.deletedCount, 1);
  assert.equal(result.dataQuality.invalidDateCount, 2);
  assert.equal(result.dataQuality.futureDateCount, 1);
  assert.equal(result.dataQuality.missingIdCount, 2);
  assert.deepEqual(result.evidenceIds, ["valid"]);
});

test("actual positive lengths determine mean/maximum; weight-only catches remain valid and estimated weight isn't measured", () => {
  const result = build([catchRecord("a", { lengthCm: 60, weightKg: 4 }), catchRecord("b", { lengthCm: 40, weightKg: 2, weightSource: "estimated" }),
    catchRecord("c", { lengthCm: 0, weightKg: 3 }), catchRecord("d", { lengthCm: -1 }), catchRecord("e", { lengthCm: "80" }),
    catchRecord("f", { lengthCm: Infinity }), catchRecord("g", { lengthCm: 9000 })]);
  assert.equal(result.statistics.count, 7);
  assert.deepEqual(fact(result, "length").value, { meanCm: 50, longestCm: 60 });
  assert.deepEqual(fact(result, "length").evidenceIds, ["a", "b"]);
  assert.equal(result.dataQuality.missingLength, 5);
  assert.equal(result.dataQuality.missingMeasuredWeight, 5);
  assert.ok(!JSON.stringify(result.recommendations).includes("doplň hmotnost"));
});

test("real water IDs and explicitly linked trips provide labels without nearest-water inference", () => {
  const result = build([catchRecord("a", { waterId: "w", locationName: "Starý název" }), catchRecord("b", { tripId: "t" }), catchRecord("c")], {
    waters: [{ id: "w", name: "Moje voda", coordinates: { latitude: 50, longitude: 14 } }],
    trips: [{ id: "t", locationName: "Labe" }],
  });
  assert.equal(result.distributions.waters.find((row) => row.key === "water:w").label, "Moje voda");
  assert.equal(result.distributions.waters.find((row) => row.key === "name:Labe").count, 1);
  assert.equal(result.dataQuality.missingWater, 1);
  assert.equal(fact(result, "trips").value, 1);
  assert.ok(!JSON.stringify(result).includes("latitude"));
});

test("methods and baits count catches per stable key, not repeated bait entries; malformed baits don't crash", () => {
  const records = [catchRecord("a", { method: { key: "float", label: "Plavaná" }, baits: [{ key: "corn", label: "Kukuřice" }, { key: "corn", label: "Kukuřice" }] }),
    catchRecord("b", { method: { key: "float", label: "Plavaná" }, baits: { key: "corn" } }), catchRecord("c", { baits: [null, false, "bad", {}] })];
  const result = build(records);
  assert.equal(result.distributions.methods[0].count, 2);
  assert.equal(result.distributions.baits[0].count, 1);
  assert.equal(fact(result, "methods").value[0].label, "Plavaná");
});

test("time-zone boundaries and historical periods use catch date rather than save time", () => {
  const records = [catchRecord("old", { caughtAt: "2020-12-31T23:30:00Z", createdAt: now.toISOString() }),
    catchRecord("out", { caughtAt: "2021-02-01T00:00:00Z" })];
  const result = build(records, { from: "2020-12-31T23:00:00Z", to: "2021-01-31T23:00:00Z", timeZone: "Europe/Prague" });
  assert.equal(result.statistics.count, 1);
  assert.deepEqual(result.evidenceIds, ["old"]);
  assert.equal(result.distributions.hours[0].key, "00");
  assert.equal(result.statistics.months["2021-01"], 1);
  assert.equal(result.dataQuality.outsidePeriodCount, 1);
  const utc = build(records, { from: "2020-12-31T23:00:00Z", to: "2021-01-31T23:00:00Z", timeZone: "UTC" });
  assert.equal(utc.distributions.hours[0].key, "23");
  assert.equal(utc.statistics.months["2020-12"], 1);
});

test("many catches yield evidence-backed observations with no efficacy or guaranteed outcome claim", () => {
  const records = Array.from({ length: 12 }, (_, i) => catchRecord(`c${i}`, { method: { key: "float", label: "Plavaná" }, lengthCm: 40 + i }));
  const result = build(records);
  assert.equal(result.dataQuality.smallSample, false);
  const observation = result.recommendations.find((row) => row.id === "observe-hours");
  assert.equal(observation.evidenceIds.length, 12);
  assert.match(observation.text, /sama neříká/);
  assert.match(result.limitations.join(" "), /Bez úplného času/);
  for (const row of [...result.facts, ...result.insights, ...result.recommendations]) {
    assert.ok(row.evidenceIds.every((id) => records.some((record) => record.id === id)));
  }
});

test("weather observations use finite in-range measurements, retain sources and explicitly deny causality", () => {
  const records = [catchRecord("a", { conditions: { airTempC: 10, windKmh: 0 }, conditionSources: { airTempC: "manual" } }),
    catchRecord("b", { conditions: { airTempC: 20, pressureHpa: 1000 }, conditionSources: { airTempC: "auto" } }),
    catchRecord("c", { conditions: { airTempC: 15 } }), catchRecord("bad", { conditions: { airTempC: 999, pressureHpa: null, windKmh: -1 } })];
  const result = build(records);
  const weather = result.dataQuality.weather.airTempC;
  assert.deepEqual({ count: weather.count, mean: weather.mean, min: weather.min, max: weather.max }, { count: 3, mean: 15, min: 10, max: 20 });
  assert.deepEqual(weather.sourceCounts, { manual: 1, automatic: 1, unspecified: 1 });
  assert.deepEqual(weather.evidenceIds, ["a", "b", "c"]);
  assert.match(result.insights.find((row) => row.id === "weather-airTempC").text, /nikoli důkaz/);
  assert.equal(result.dataQuality.weather.windKmh.min, 0);
  assert.equal(result.insights.some((row) => row.id === "weather-pressureHpa"), false);
});

test("period comparison counts real records with bounded evidence and equal-duration zero-safe arithmetic", () => {
  const records = [catchRecord("p", { caughtAt: "2026-09-01T10:00:00Z" }), catchRecord("a"), catchRecord("b")];
  const result = build(records, { from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z",
    comparison: { from: "2026-09-01T00:00:00Z", to: "2026-09-02T00:00:00Z" } });
  assert.equal(result.comparison.currentCount, 2);
  assert.equal(result.comparison.previousCount, 1);
  assert.equal(result.comparison.changePercent, 100);
  assert.deepEqual(result.comparison.previousEvidenceIds, ["p"]);
  assert.equal(result.comparison.meanLengthChangeCm, null);
  const emptyPrevious = build(records, { from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z",
    comparison: { from: "2026-08-01T00:00:00Z", to: "2026-08-02T00:00:00Z" } });
  assert.equal(emptyPrevious.comparison.changePercent, null);
  assert.equal(emptyPrevious.comparison.previousCount, 0);
});

test("unequal or overlapping periods never imply a comparable percent or length trend", () => {
  const records = Array.from({ length: 4 }, (_, i) => catchRecord(`c${i}`, { lengthCm: 40 }));
  for (const comparison of [{ from: "2026-09-01", to: "2026-09-03" }, { from: "2026-10-01", to: "2026-10-02" }]) {
    const result = build(records, { from: "2026-10-01", to: "2026-10-02", comparison });
    assert.equal(result.comparison.comparable, false);
    assert.equal(result.comparison.changePercent, null);
    assert.equal(result.comparison.meanLengthChangeCm, null);
  }
});

test("comparison of measured lengths needs three actual lengths in each comparable period", () => {
  const records = [0, 1, 2].flatMap((i) => [catchRecord(`p${i}`, { caughtAt: "2026-09-01T10:00:00Z", lengthCm: 40 }), catchRecord(`c${i}`, { lengthCm: 50 })]);
  const result = build(records, { from: "2026-10-01", to: "2026-10-02", comparison: { from: "2026-09-01", to: "2026-09-02" } });
  assert.equal(result.comparison.meanLengthChangeCm, 10);
  assert.match(result.comparison.limitation, /různé druhy/);
});

test("deterministic insights never call network, mutate catches or expose original notes/photos/GPS", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail("No external request allowed");
  try {
    const records = [catchRecord("private", { notes: "MY_PRIVATE_NOTES", photos: [{ blob: "MY_PHOTO_BYTES" }], coordinates: { latitude: 50.123456, longitude: 14.654321 } })];
    const snapshot = structuredClone(records);
    const a = build(records), b = build(records);
    assert.deepEqual(a, b);
    assert.deepEqual(records, snapshot);
    for (const secret of ["MY_PRIVATE_NOTES", "MY_PHOTO_BYTES", "50.123456", "14.654321"]) assert.ok(!JSON.stringify(a).includes(secret));
  } finally { globalThis.fetch = originalFetch; }
});

test("invalid periods/timezone/clock fail explicitly instead of returning fabricated summaries", () => {
  assert.throws(() => build([], { from: "bad" }), TypeError);
  assert.throws(() => build([], { from: "2026-11-02", to: "2026-11-01" }), TypeError);
  assert.throws(() => build([], { timeZone: "Invalid/Zone" }), RangeError);
  assert.throws(() => build([], { now: "bad" }), TypeError);
});
