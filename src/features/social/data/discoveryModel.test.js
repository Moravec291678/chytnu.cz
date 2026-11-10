import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDiscoveryQuery, buildDiscoveryPrefixes, validateDiscoveryRequest } from "./discoveryModel.js";

const profile = { visibility: "public", discoverable: true, directoryDiscoverable: true, regionDiscoverable: true,
  handle: "jan_rybar", displayName: "Jan Šťastný", specialization: "Přívlač / feeder", favoriteSpecies: "Štika obecná", region: "Jižní Morava", sections: { interests: "public" } };

test("discovery folds Czech accents, case, width and whitespace consistently", () => {
  assert.equal(normalizeDiscoveryQuery("  ŠŤASTNÝ  "), "stastny");
  assert.equal(normalizeDiscoveryQuery("ＪＡＮ＿ＲＹＢＡＲ"), "jan_rybar");
  assert.equal(normalizeDiscoveryQuery("Jižní\t  Morava"), "jizni morava");
  assert.equal(normalizeDiscoveryQuery("ře\u0301ka"), "reka");
});

test("discovery accepts bounded safe text only", () => {
  for (const value of [null, 1, "", "a", "../owner", "<script>", "x@y.test", "a\u0000b", "a".repeat(41), "a".repeat(161)])
    assert.throws(() => normalizeDiscoveryQuery(value), /invalid_search/);
  assert.equal(normalizeDiscoveryQuery("a".repeat(40)), "a".repeat(40));
});

test("public directory indexes full phrase and word prefixes without downloading users", () => {
  const index = buildDiscoveryPrefixes(profile);
  for (const token of ["all:jan_ry", "all:ryba", "all:jan sta", "all:stast", "interests:priv", "interests:feeder", "interests:sti", "region:jizni mo", "region:mora", "directory:new"])
    assert.ok(index.includes(token), token);
  assert.ok(!index.includes("all:tast"), "infix is deliberately not an indexed prefix");
  assert.equal(index.length, new Set(index).size);
});

test("private, friends-only and non-discoverable accounts produce no search index", () => {
  for (const patch of [{ visibility: "private" }, { visibility: "friends" }, { discoverable: false }, { discoverable: "true" }])
    assert.deepEqual(buildDiscoveryPrefixes({ ...profile, ...patch }), []);
  assert.deepEqual(buildDiscoveryPrefixes(null), []);
});

test("legacy handle discovery does not silently enroll public names, interests or regions", () => {
  const index = buildDiscoveryPrefixes({ ...profile, directoryDiscoverable: false });
  assert.ok(index.includes("all:jan_ry"));
  for (const prefix of ["all:stast", "interests:", "region:", "directory:"])
    assert.ok(!index.some(value => value.startsWith(prefix)), prefix);
});

test("general region is indexed only after separate opt-in and public interests consent", () => {
  const noRegion = buildDiscoveryPrefixes({ ...profile, regionDiscoverable: false });
  assert.ok(!noRegion.some(token => token.startsWith("region:") || token.startsWith("all:jizni")));
  assert.ok(noRegion.includes("interests:priv"));
  for (const interests of ["friends", "private", undefined]) {
    const index = buildDiscoveryPrefixes({ ...profile, sections: { interests } });
    assert.ok(index.includes("all:stast"));
    assert.ok(index.includes("directory:new"));
    assert.ok(!index.some(token => token.startsWith("region:") || token.startsWith("interests:") || token === "all:jizni"));
  }
});

test("large public fields yield deterministic bounded indexes and never include source secrets", () => {
  const long = "abcdefghij klmnopqrst uvwxyzabcd efghijklmn opqrstuvwx yzabcdefgh ijklmnopqr stuvwxyzab cdefghijkl mnopqrstuv ".repeat(3);
  const input = { ...profile, displayName: long, specialization: long, favoriteSpecies: long, region: "Morava", notes: "SECRET", email: "SECRET", coordinates: { latitude: 50 } };
  const index = buildDiscoveryPrefixes(input);
  assert.ok(index.length <= 1000); assert.deepEqual(index, buildDiscoveryPrefixes(input));
  assert.ok(index.includes("region:mora"), "every opted-in field keeps an independent budget");
  assert.doesNotMatch(JSON.stringify(index), /SECRET|latitude/);
  assert.ok(index.every(value => value.length <= 50));
});

test("request validation yields canonical query tokens and fixed modes", () => {
  assert.deepEqual(validateDiscoveryRequest({ query: "ŠTIKA", field: "interests" }), { query: "stika", field: "interests", cursor: null, mode: "search", token: "interests:stika" });
  assert.deepEqual(validateDiscoveryRequest({ mode: "new" }), { query: "", field: "all", cursor: null, mode: "new", token: "directory:new" });
  assert.equal(validateDiscoveryRequest({ query: "JAN", cursor: "public-cursor" }).cursor, "public-cursor");
});

test("request validation rejects extra fields, pagination abuse and prototype/accessor input", () => {
  for (const input of [null, [], { query: "jan", limit: 10000 }, { query: "jan", uid: "other" }, { query: "jan", field: "email" },
    { query: "jan", cursor: [] }, { query: "jan", cursor: "" }, { query: "jan", cursor: "x".repeat(1025) },
    { mode: "new", field: "region" }, { mode: "new", query: "jan" }, { mode: "unbounded", query: "jan" },
    JSON.parse('{"query":"jan","__proto__":{"role":"OWNER"}}'), Object.create({ query: "jan" }),
    Object.defineProperty({}, "query", { get() { throw new Error("Getter must not run"); }, enumerable: true })])
    assert.throws(() => validateDiscoveryRequest(input), /invalid_search/);
});
