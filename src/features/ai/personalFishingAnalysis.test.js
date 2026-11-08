import test from "node:test";
import assert from "node:assert/strict";
import { buildPersonalFishingAnalysis, selectPersonalInsight } from "./personalFishingAnalysis.js";

const now = Date.parse("2026-11-08T12:00:00Z");
const build = (records, options) => buildPersonalFishingAnalysis(records, { now, ...options });
function record(id, day, hour, overrides = {}) {
  return { id, caughtAt: `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`, speciesKey: "commonCarp", species: "Kapr obecný",
    method: { key: "feeder", label: "Feeder" }, lengthCm: 50, ...overrides };
}
const timeFixture = () => [
  ...Array.from({ length: 8 }, (_, i) => record(`evening${i}`, 1 + i, 17)),
  ...Array.from({ length: 6 }, (_, i) => record(`morning${i}`, 1 + i, 6, { method: { key: "float", label: "Plavaná" } })),
];
test("time-method insight calculates both composition denominators for the same species and cites real records", () => {
  const report = build(timeFixture());
  const finding = report.candidates.find(item => item.family === "species-time-method" && item.numbers.methodInWindow === 8);
  assert.deepEqual(finding.numbers, { windowCatches: 8, speciesCatches: 14, methodInWindow: 8, knownInWindow: 8, methodOutside: 0, knownOutside: 6, shareDifferencePoints: 100 });
  assert.match(finding.observation, /8 z 14/);
  assert.match(finding.uncertainty, /není úspěšnost za hodinu/);
  assert.equal(finding.evidenceIds.length, 14);
  assert.ok(report.candidates.length > 1);
});
test("a single day and insufficient comparison group never masquerade as a supported pattern", () => {
  const sameDay = timeFixture().map(item => ({ ...item, caughtAt: item.caughtAt.replace(/2026-10-\d\d/, "2026-10-01") }));
  const result = build(sameDay);
  assert.equal(result.strongest.isInsight, false);
  assert.equal(result.providerSummary.candidates.length, 0);
  assert.match(result.strongest.experiment, /dvě stejně dlouhé části/);
});
test("method-length and weather-length comparisons hold species constant and use valid recorded weather only", () => {
  const records = [
    ...Array.from({ length: 4 }, (_, i) => record(`cold${i}`, i + 1, 10, { lengthCm: 70, conditions: { airTempC: 8 } })),
    ...Array.from({ length: 4 }, (_, i) => record(`warm${i}`, i + 6, 10, { lengthCm: 45, conditions: { airTempC: 23 } })),
    ...Array.from({ length: 4 }, (_, i) => record(`float${i}`, i + 12, 10, { lengthCm: 30, method: { key: "float", label: "Plavaná" } })),
    record("other-species", 25, 10, { speciesKey: "pike", lengthCm: 130, conditions: { airTempC: 1000 } }),
  ];
  const report = build(records);
  const weather = report.candidates.find(item => item.family === "species-method-weather-length");
  assert.ok(weather);
  assert.equal(weather.numbers.countA, 4);
  assert.equal(weather.numbers.countB, 4);
  assert.equal(weather.numbers.differenceCm, 25);
  assert.ok(weather.evidenceIds.every(id => !id.startsWith("float") && id !== "other-species"));
  assert.match(weather.uncertainty, /meteorologického modelu/);
});
test("water-bait pattern remains private: model receives numeric comparisons without names, coordinates, IDs or notes", () => {
  const records = Array.from({ length: 12 }, (_, i) => record(`private-id-${i}`, i + 1, 12, { waterId: i < 6 ? "secret-water-A" : "secret-water-B",
    locationName: "Soukromá tůň", baits: [{ key: i < 6 ? "worm" : "corn", label: "Tajný recept" }], notes: "private note", coordinates: { latitude: 50, longitude: 14 } }));
  const report = build(records, { waters: [{ id: "secret-water-A", name: "Soukromá tůň" }] });
  assert.ok(report.candidates.some(item => item.family === "species-water-bait"));
  const sent = JSON.stringify(report.providerSummary);
  for (const secret of ["private-id", "secret-water", "Soukromá", "Tajný", "private note", "latitude", "longitude", "worm", "corn"]) assert.ok(!sent.includes(secret), secret);
});
test("trip effort denominator includes zero-catch completed trips and excludes active/overlapping trips", () => {
  const trips = Array.from({ length: 6 }, (_, i) => ({ id: `trip${i}`, methodKey: i < 3 ? "feeder" : "float",
    startedAt: `2026-10-${String(i + 1).padStart(2, "0")}T06:00:00Z`, endedAt: `2026-10-${String(i + 1).padStart(2, "0")}T08:00:00Z` }));
  const records = Array.from({ length: 9 }, (_, i) => record(`effort${i}`, 1 + i % 3, 7, { tripId: `trip${i % 3}` }));
  const report = build(records, { trips: [...trips, { id: "active", methodKey: "feeder", startedAt: "2026-10-20T00:00:00Z" }] });
  const finding = report.candidates.find(item => item.family === "recorded-trip-effort" && item.numbers.countA === 9);
  assert.equal(finding.numbers.hoursA, 6);
  assert.equal(finding.numbers.hoursB, 6);
  assert.equal(finding.numbers.countB, 0);
  assert.equal(finding.numbers.recordedRateA, 1.5);
  assert.match(finding.uncertainty, /přestávky/);
  const overlap = build(records, { trips: [...trips, { ...trips[0], id: "overlap" }] });
  assert.equal(overlap.candidates.some(item => item.family === "recorded-trip-effort"), false);
});
test("fingerprint ignores ordering and sync noise but changes on actual source edits and deletions", () => {
  const records = timeFixture();
  const first = build(records);
  assert.equal(first.fingerprint, build([...records].reverse().map(item => ({ ...item, updatedAt: "later", sync: { revision: 999, serverRevision: 99 } }))).fingerprint);
  assert.notEqual(first.fingerprint, build(records.map((item, i) => i ? item : { ...item, lengthCm: 72 })).fingerprint);
  assert.notEqual(first.fingerprint, build(records.map((item, i) => i ? item : { ...item, deleted: true })).fingerprint);
  assert.equal(first.fingerprint, build([...records, records[0]]).fingerprint);
});
test("unknown/unconfirmed species, future/invalid catches and absent lengths do not invent records or PB", () => {
  const report = build([record("unknown", 1, 12, { speciesKey: "", lengthCm: null, aiSpeciesSuggestion: { speciesKey: "commonCarp" } }),
    record("future", 2, 12, { caughtAt: "2099-01-01T00:00:00Z" }), record("invalid", 2, 12, { caughtAt: "nonsense" }),
    record("deleted", 3, 12, { deleted: true })]);
  assert.equal(report.recordCount, 1);
  assert.equal(report.strongest.numbers.measuredLengths, 0);
  assert.equal(report.strongest.isInsight, false);
});
test("selection keeps the current finding stable and offers unseen evidence before repeating", () => {
  const candidates = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(selectPersonalInsight(candidates, ["a"]).id, "b");
  assert.equal(selectPersonalInsight(candidates, ["a", "b"], "a").id, "a");
  assert.equal(selectPersonalInsight(candidates, ["a", "b", "c"]).id, "a");
});
