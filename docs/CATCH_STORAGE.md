# Local catch storage

## Scope

Catch and trip records live in the browser's IndexedDB database `chytnu-local`, in separate `catches` and `trips` object stores. Database version 4 adds `outbox`, `syncConflicts`, and `syncState` stores additively; existing Catch/Trip records and photo Blobs are preserved. Repositories wait for the IndexedDB transaction to commit before reporting success or updating React state. Read/write/delete failures are surfaced to the user, so a failed write is not displayed as saved.

The initial store is empty. `src/features/catches/data/mockCatches.js` remains an unused fixture module; its records are not imported into the catch context and cannot overwrite local user records.

## Record contract

Records use `schemaVersion: 1` and include a stable `id`, ISO `createdAt`, `updatedAt`, ISO `caughtAt`, species key and labels, nullable measurements, location text, optional legacy GPS text, optional structured `coordinates`, method, bait list, result, notes, favorite state and photos. Sync metadata tracks ownership, revision and queue state. Unset measurements remain `null` and are omitted from detail views.

Photos are stored as Blob objects inside the catch record's IndexedDB value. Accepted source files are JPEG, PNG and WebP, up to 10 MB. When `createImageBitmap` is available, the app resizes the longest edge to at most 1920 px and encodes JPEG at quality 0.82 before saving. Browsers without that API store the accepted source unchanged. Deleting a catch deletes its embedded photo data in the same IndexedDB record operation.

## Current limits

- Data belongs to this browser installation/profile until the user explicitly links ownerless records to an emulator account; local export and restore remain the recovery path.
- Browser storage can be cleared by the user or evicted by the platform; local export and restore are available.
- Catch/Trip/photo sync, conflict-resolution UI and explicit ownerless account linking are available only in the local development emulator. Production sync, tombstone retention and account deletion are not implemented.
- Only one photo per catch is available in the current form.
- GPS is optional. The form requests browser geolocation only after an explicit click and stores validated latitude/longitude; denial, timeout or unavailability never blocks saving. A manually entered unambiguous dot-decimal pair can be parsed, while ambiguous legacy text is kept without inventing coordinates.
- Catches may optionally reference a trip by stable `tripId`; a catch without a trip remains a complete independent record.
- Trips use a separate local record with `schemaVersion`, stable `id`, `createdAt`, `updatedAt`, `startedAt`, nullable `endedAt`, optional title/location/method and reserved local sync metadata. Trip fields can be edited without changing ID, ownership or Catch links. Trip catch counts and measurements are derived from linked catches, never stored as mock statistics.
- Only one active trip may be started at a time; the uniqueness check and insertion happen in the same IndexedDB read/write transaction. Finishing a trip stores an `endedAt` timestamp; completed trips remain in history.
- Empty trips may be deleted after confirmation. The deletion transaction checks the catches store; linked trips are refused to avoid orphaned records.

## Local export backup

The Profile tab exports the current catches and trips from one read-only IndexedDB transaction across both stores. This gives the backup a consistent local snapshot and does not mutate the stored records. The JSON document uses format `chytnucz-local-backup`, format version `1`, and an ISO `createdAt` value. It preserves every catch and trip field, including stable IDs, schema versions, nullable values, sync revision metadata and catch-to-trip `tripId` references.

Each stored photo Blob is represented by its existing metadata plus `blobSize` and its original bytes in `dataBase64`. Export fails visibly if any photo is not a readable Blob; it never silently drops a photo. Base64 makes the JSON portable without a new dependency or a separate archive reader, at the cost of roughly one-third more photo data and additional memory while preparing the file. The backup is plain JSON, not encrypted. It can include precise fishing locations, notes and photos, so the user is asked to store it safely. Export and restore do not upload data or configure a cloud backup.

## Local restore

The Profile tab accepts only JSON backups in supported format/version 1. The entire file is parsed and validated before any write: catch/trip schemas, timestamps, nullable measurements, unique IDs, trip references, and photo Base64, byte count, MIME type and image signature. Files over 100 MB and photos over the current 10 MB limit are rejected. Invalid or unsupported data is not auto-corrected and cannot partially modify the journal.

Before applying a valid backup, the user sees its catch, trip and photo counts and the number of IDs already present. **Merge** adds new IDs, skips records whose content matches, and rejects the whole operation if the same ID contains different data or if the result would contain multiple active trips. Repeating a successful merge is safe. **Replace** explicitly replaces both stores and requires a separate browser confirmation. Both modes use one read/write IndexedDB transaction over `catches` and `trips`; a failed transaction rolls both stores back. IndexedDB transaction atomicity preserves the prior records unless every operation completes.

Preview conflict checks compare photo Blob bytes. The write transaction compares synchronously, including photo MIME type/size and the other record metadata (including `updatedAt`); normal app photo edits update `updatedAt`. Direct external mutation of IndexedDB without updating metadata is outside the supported app flow. After commit, a local event makes the catch and trip contexts reload. The backup remains unencrypted and potentially sensitive.

## Local synchronization outbox and metadata sync

IndexedDB remains the local source of truth. Database version 3 added the `outbox`; version 4 adds `syncConflicts` and `syncState`. Each Catch/Trip create, update, or delete and its pending outbox operation are committed in one read-write transaction. Existing records are not assigned an owner or given synthetic upload operations during upgrade. Backup JSON format remains unchanged.

Each outbox entry has a generated operation ID, nullable `ownerId`, entity type and ID, `upsert`/`delete` operation, local revision, nullable base server revision, ordered sequence, timestamps, retry count, status and last error. There is one pending entry per entity and owner scope. Repeated local upserts coalesce to the latest revision. A delete replaces an earlier pending upsert with a tombstone; a later explicit upsert replaces it at a higher local revision. Operations are listed in sequence order and remain stored until an exact operation ID and local revision is acknowledged. A stale acknowledgement cannot remove a newer coalesced change.

New records created while signed in receive that account's UID. Existing ownerless records and queue entries are not linked automatically and are never sent as the currently signed-in user. A separate explicit action shows counts and, after confirmation, atomically assigns the chosen UID while preserving IDs, Trip links and Blobs. The active development sender is available only against the local Firebase Emulator; production Firebase is not configured.

The emulator synchronizer retains operations until an idempotent server acknowledgement confirms the same operation ID and local revision. Retry transient failures with bounded exponential backoff; errors remain visible in the account section and the queue remains durable. Online and local outbox events can trigger a retry, but network availability is not proof that a write succeeded.

Server revisions use compare-and-set updates. If the server has a revision newer than the local base, both versions and the queued local change are preserved as an unresolved conflict; no automatic last-writer choice is made. Remote deletions are durable tombstones with owner, record ID, revision and operation ID. No tombstone/receipt cleanup is implemented yet, preventing stale offline clients from resurrecting a deleted record.

The Profile page lists unresolved Catch and Trip conflicts and lets the user keep the local or remote version. Choosing local rebases the queued operation on the remote revision; choosing remote replaces/removes the local entity. A local version opposed by a remote tombstone is preserved under a new ID, and Trip Catch links are updated together.

Photo metadata now includes the private Storage path and SHA-256 in addition to ID/name/MIME/size; it never includes Blob bytes. For account-owned catches, the sync service prepares the deterministic path `users/{uid}/catches/{catchId}/photos/{photoId}/{sha256}`, writes the Catch metadata, uploads the local Blob, verifies remote metadata and downloaded bytes, removes objects no longer referenced by the Catch, then acknowledges the existing outbox entry. A failure at any of those steps retains the outbox operation and local Blob for retry. Identical upload retries reuse the same object path. Downloads verify size, MIME, custom hash metadata and SHA-256 before storing the Blob in IndexedDB. The form still limits a Catch to one optimized JPEG/PNG/WebP image up to 10 MB. Ownerless records are not uploaded. No public photo or location sharing exists.

The local database remains at version 4; no migration or parallel photo store was needed. Replacement uploads a new content-addressed object before stale objects are cleaned up. Photo removal updates the Catch metadata before cleanup. Catch deletion writes the existing Firestore tombstone before recursively deleting that Catch's Storage objects, so stale offline Catch data cannot restore them. Storage reads use the authenticated Firebase SDK rather than public URLs. A fully read-back SHA check currently adds an extra download of uploaded bytes; its production cost/latency needs review before enabling live Storage.

Firebase is used only as a local development emulator. No production cloud project, billing, region, account deployment, retention window, paid tier, or data migration is configured. Provider, region, free-tier and billing review, backup policy and migration path require separate review and owner approval before production is enabled.

## Verification

Run `npm test`, `npm run lint` and `npm run build`. Browser smoke checks created a temporary catch with an image, verified detail/photo after refresh, then deleted the record through the app confirmation dialog. They also started, associated, ended, reloaded and removed an empty test trip. Test records were removed from the in-app browser profile and are not part of the project or production data.
