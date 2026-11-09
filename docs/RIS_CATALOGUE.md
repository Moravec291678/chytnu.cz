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

## Shared ČRS selector

The green “Vybrat revír z ČRS” button now opens the same inline autocomplete in Water creation, My waters, Trip creation/editing and Catch creation/editing. Name/number search uses a cached normalized index, accepts Czech accents/case and spaced or partial numbers, shows bounded results and supports arrows, Enter, Escape and touch. Personal favourites and recent trip waters precede catalogue results. Personal records load independently of catalogue delivery. There is no catalogue request until the selector is opened; existing IndexedDB caching supports offline searches after the index has been loaded.

Selection materializes/reuses the ordinary owner-scoped Water through the existing atomic repository. Canonical `waterId` links trips, catches, statistics and gallery filters; `catalogueId` keeps the reference to full public source descriptions, fishery type, rules and public coordinates. Public coordinates are retained only on the saved Water, never copied into catch/trip GPS. Physical body type remains unknown where the source does not establish it. Manual locality, number, notes, measurements and editor changes are preserved; blank/previously inherited form fields are prefilled. Rules are linked instead of overwriting private notes.

Quick Catch continues without a selector step and uses the active trip's selected Water. Whitespace-formatted RIS numbers now transfer correctly. Catch navigation preselection is consumed once and persisted with the draft, so list refresh/reopen cannot restore an obsolete water over the user's later selection. Freeform locality editing no longer drops the chosen canonical relation; users explicitly clear the saved-water dropdown to remove it. Interrupted privacy-default loading is retryable rather than leaving Save permanently disabled.

Additional tests cover autocomplete, ordering, manual/GPS preservation, dirty editor fields, draft reopen and the full Water → Trip → Quick Catch → gallery reference flow. Browser QA exercised keyboard selection, mobile touch at 390 × 844, source field prefilling with a retained manual note, saved trip/catch links, replacement of an initial navigation water, and retention of the new relation/manual locality after reload. No source re-import, Firebase rule change, admin modification or paid service is involved in this extension.
