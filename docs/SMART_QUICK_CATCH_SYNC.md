# Quick Catch synchronization contract

Quick catches use the existing catch ID, owner scope, photo identities, binary store,
outbox, signed upload and Firestore adapter. Unknown species has an empty `speciesKey`;
missing length/weight remain `null`. Catch counts include these records, while species
counts/mastery omit unknown quick species. Legacy custom names retain their fallback.

`captureMode: "quick"` is optional and backward compatible. Locally, `quickCatch` is a
readable object with capture time, input source, timezone, fixed-field provenance and
the independently retryable metadata/weather jobs. Manual provenance is preserved.

On Firestore only, `quickCatch` is a JSON string limited to 4,096 characters. The shared
`normalizeQuickCatchMetadata` validates timestamps, timezone bounds, known provenance
fields/sources, job status and retry bounds before serialization. The adapter decodes
and validates again on read; malformed, oversized or unsupported bookkeeping is omitted
without dropping the catch/photos or blocking its normal editor. Cloud export decodes
this field back into its local object representation. No executable content is evaluated.

Firestore rules deliberately validate ownership, the existing catch/photo schema and
the bookkeeping string's type/size. Its JSON is untrusted owner-authored metadata,
not an authorization decision or verified evidence. Storing this optional envelope as
JSON avoids Firestore's 1,000-expression limit for fully populated existing catches.
The condition validator uses equivalent local bindings/defaults, and condition sources
use fixed allowed keys/values; original numeric types and exact ranges remain enforced.

Rules tests cover a full legacy/current ten-field weather document; Quick Catch with
all provenance fields; photo creation; canonical weather updates; missing measurements;
wrong-owner access; non-string/oversized bookkeeping; and invalid weather types/ranges.
This contract requires deploying the updated Firestore rules before enabling Quick Catch
in production. No index or data migration is required.
