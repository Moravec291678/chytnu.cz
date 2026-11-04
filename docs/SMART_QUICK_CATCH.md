# Smart Quick Catch

## Capture

Home offers **Rychlý úlovek** (rear-camera preference) and **Z galerie**. One
returned image creates an ordinary Catch without a species/measurement form or
another save button. Canceling the picker creates nothing. The existing normal
creation form remains available through the navigation's plus button.

The provider retains the pending File, operation ID and prepared record across
page navigation and button remounts. Concurrent callbacks are locked; repeated
events for the same completed File are ignored. Retry uses the same IDs and never
overwrites a later edit. A previously persisted and subsequently deleted catch
cannot be recreated by retry.

The existing image preparation supports JPG/PNG/WebP/AVIF/HEIC/HEIF, decodes and
normalizes to JPEG (longest side at most 1920 pixels, quality 0.82). Source limit:
50 MB; normalized/upload limit: 10 MB. These are existing application limits, not
a second upload format. Processing failures keep the source available for retry
or explicit replacement. Very large images are rejected before EXIF reading.

Success **Úlovek uložen** is shown only after the catch/photo/outbox transaction
commits and independently read binary bytes match SHA-256. A session recovery Blob
cannot satisfy that check. Missing/corrupt binary copies can be repaired from the
retained source while preserving catch/photo identity and newer metadata. Quota
and unavailable-storage errors use Czech messages. Do not close the app before
the success message; interruption before durable save cannot guarantee recovery.

## Offline and data ownership

No network request, GPS permission, weather, AI or reward calculation is required
for local success. Reopening reads the existing IndexedDB records and uses the
existing sync/outbox and signed Cloudinary pipeline. PWA offline startup assumes
the application shell has previously been installed/cached successfully. Browser
storage persistence remains best effort, and iOS locked-screen uploads are not
guaranteed. Reconciliation resumes in the foreground.

Explicit scope deletion broadcasts invalidation to open tabs and clears pending
capture references. A generation token stored in the existing appMeta store is
checked inside the capture write transaction, preventing a delayed decoder or
retry from recreating deleted local data. No extra database or upload queue exists.

Unknown species uses an empty catalogue key; missing length/weight are null.
Incomplete catches count as journal entries but not as known species or artificial
personal records. Existing length-first selection and historical weight-only catches
remain supported. Photos use existing Gallery, deletion and cleanup paths.

## Complete later

Journal's optional **Doplnit později** filter selects quick catches missing species
or length; weight stays optional. Catch Detail shows missing details, normal editing
and expandable field provenance. Saving the normal editor makes its submitted fields
authoritative, including intentional clears. No later enrichment overwrites them.
Local backups and cloud export retain quick metadata; backup restore accepts unknown
species only for a validated quick-capture envelope.

See [metadata rules](SMART_QUICK_CATCH_METADATA.md) for timestamp/EXIF/timezone priority,
origin-session GPS, active-trip context, moon phase and historical UTC weather.
The current Trip schema supplies explicit location and method, not water IDs or bait;
the app does not guess those fields or select the nearest water.

## Recovery and synchronization

Metadata and weather jobs live on the Catch, with at most three attempts, lease/backoff
and terminal complete/unavailable/failed states. Up to four catches run concurrently.
They resume at startup, online events, existing outbox events and 30-second foreground
wakes. Each merge checks the latest local revision atomically and preserves photo state.

Only operations proven to contain exclusively automatic enrichment can rebase onto
a newer remote record. Remote manual values, photo replacements and deletion win;
only compatible missing automatic fields can be added. Manual/manual conflicts retain
the established conflict behavior. Normal edits clear the automatic-only marker.

See [wire contract and Firestore rules](SMART_QUICK_CATCH_SYNC.md). No migration/index
is required. Deploy the compatible rules to `chutnucz` before enabling the capture UI.

## Feature flags and AI

`src/product/config/quickCatchFlags.js`: `capture` and `metadata` independently control
new capture and background enrichment. Disabling either preserves ordinary reading,
editing and deletion of saved catches. Roll back by disabling those switches; retain
the backward-compatible Firestore rules and never delete saved user data.

`src/features/ai/aiPolicy.js`: species, diary, recommendations and stories are all
disabled. Supporter remains OFF. No external AI call or paid activation occurred.
Deterministic diary aggregates, validated species suggestions, reviewable story drafts,
consent gates and a server adapter are implemented. No fake AI controls are visible.
See [AI setup, provider research, consent and release blockers](SMART_QUICK_CATCH_AI.md).

## Verification and remaining acceptance

Baseline: 756 tests passed at `58c88b6`. New tests cover durable readback, offline save,
retry/deletion races, null measurements, EXIF/calendar/offsets, GPS permission/timeouts,
weather recovery, leases/concurrency, manual overrides, two isolated device databases,
wire validation, export/restore and disabled/authenticated AI boundaries.

Browser checks used a nonpersonal application icon as a file fixture: automatic save,
one displayed new catch, normal editor save with unknown species, and the incomplete
Journal filter. Layout checked at 390px and the default desktop viewport; 390px had
no horizontal overflow. No real mobile camera or fish recognition was tested.

The integrated browser's attempted reload with its local origin stopped returned a
blank page; that is **not an offline-PWA PASS**. A native Chrome follow-up was stopped
by the computer-use tool because it could not reliably identify the current URL.
Full production-shell offline reload therefore remains a physical/browser acceptance
test. Unit tests prove local capture without network access, not physical PWA startup.

Photo traces now record selection, preparation and verified IndexedDB persistence
using the existing bounded, allowlisted diagnostics. Existing sync traces measure the
later upload/verification path. No physical tap-to-camera, live Cloudinary latency or
real second-device timing is claimed. Emulator READY/delivery timings are synthetic.

Before final acceptance: real iPhone Safari/Home Screen PWA and Android camera/gallery,
airplane-mode save/reload/reconnect, denied/granted location behavior, quota failure,
large/HEIC images, and two signed-in devices with real Cloudinary READY/delivery.
Live production account deletion and actual user-photo deletion were not exercised.

## Final automated gate (2026-11-04)

- `npm run lint`: PASS.
- `npm test`: PASS, 829 tests (baseline 756).
- `npm run build`: PASS, client secret scan PASS; existing large-chunk warnings remain.
- `npm run test:sync`: PASS, including actual Quick Catch creation and two isolated
  device databases with synthetic READY/delivery; no live Cloudinary inference.
- `npm run test:photos`, `npm run test:rules` (13 tests), `npm run test:auth`: PASS.
- `npm run product` and `git diff --check`: PASS.

The final replacement-photo regression also covers a changed hash under the same
photo ID: stale local bytes and pending uploads are removed before delivery.
AI stays source-disabled regardless of server environment configuration.
