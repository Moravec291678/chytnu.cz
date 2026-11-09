# Shared RIS waters catalogue

Imported 2026-11-09 from the completed user-provided RIS export dated 2026-11-08: **1,451 waters and 1,451 complete source details**. Every source field (including full text, tables and headings) was compared with the original export and preserved exactly. No live fishing regulations are inferred from this snapshot.

## Data and identity

The read-only public catalogue is shipped as versioned UTF-8 JSON assets: one index and 16 detail buckets. This keeps 12.4 MB of sourced data out of JavaScript bundles, startup requests and PWA shell precaching. Catalogue/detail requests occur only when visited, are deduplicated in memory and cached in IndexedDB for subsequent offline use. A never-opened detail needs an initial connection. No Firestore bulk writes or paid infrastructure are needed.

Catalogue identity is `ris-` plus 24 hex characters of SHA-256 of the canonical RIS source URL. Re-importing identical input changes zero output bytes. Distinct URLs remain separate: Huryšák 3 and Huryšák I both have number `4 510 091`. Names or water numbers alone must not collapse them. A future RIS URL change requires explicit source-identity reconciliation; it must not silently rewrite private records.

Rebuild a verified complete export with:

```
node tools/import-ris-waters.mjs <path-to-complete-export.json>
```

The importer checks declared completeness/counts, distinct URLs, source coordinates/dimensions, tables and headings. A new version updates only public assets and the bundled manifest. Previously selected private waters, notes, favourites and catch/trip references are not rewritten.

## Private selection

`/waters` exposes the catalogue to regular authenticated accounts (and existing local guests). `/waters/catalogue` supports Czech accent-insensitive text search, spaced/unspaced water numbers, fishery type, territorial union and known-coordinate filtering. Details preserve the snapshot date and link to the official RIS page.

Selection uses the existing private Water repository and outbox. A local transaction reuses the catalogue binding or an unambiguous matching legacy water, preserving its ID and manual fields; repeated/concurrent local clicks do not duplicate it. Each account owns its own record. New records use ordinary private UUIDs and optional `catalogueId`; re-adding a deliberately deleted water creates a fresh identity rather than resurrecting a sync tombstone. Selection on two devices before either has synchronized is still two explicit private creations and is not silently merged. Normal repeated selection after synchronization reuses the binding.

Missing source data: **188 coordinates, 124 areas, 582 watercourse lengths**. All waters have full detail text. Source fishery classes: 975 non-trout and 476 trout waters. Physical water-body type is `Neuvedeno` on initial private selection because fishery class does not establish river/pond/reservoir type. Coordinates are source points, not boundaries or private catch positions. Regulations labelled “Dnes” remain quoted source text from the export, not a current legal check.

## Validation

All 1,451 records/fields were checked against the source file; a second importer run produced identical file hashes. Six targeted tests cover completeness/identity, Czech search/filters, durable offline cache/retry, atomic owner-scoped selection, preservation of legacy IDs/manual edits/catch references, deletion/re-addition and account-cleanup fencing. Authenticated Firestore sync verifies `catalogueId` on the simulated second device and rules reject malformed references/cross-owner reads. Browser QA verified regular-user Profile → Waters → catalogue → detail → save → same private ID on repeated selection, plus mobile 390 × 844 filters/tables without page overflow. Full quality-gate results are recorded in the release report.
