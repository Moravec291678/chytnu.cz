# Smart Quick Catch: automatic metadata and recovery

## Timestamp priority

`createdAt` records saving, `quickCatch.capturedAt` records the capture/picker event, and `caughtAt` describes the catch. Camera mode uses that event instant. Gallery import uses a valid original EXIF capture date, falling back to creation/modify EXIF tags and finally the event instant when no usable date exists. A future EXIF timestamp beyond five minutes of clock skew, impossible calendar dates, and dates before 1900 are ignored. Separate EXIF `OffsetTimeOriginal` / `OffsetTimeDigitized` and explicit UTC offsets are respected. An offset-free EXIF date is interpreted in the importing device's timezone; the original camera timezone cannot be reconstructed reliably. The normal editor lets the angler correct this. Capture timezone is retained on the Catch by the capture flow.

The original image's EXIF must be read in parallel with photo preparation before the first durable write because normalization deliberately strips original metadata. Reload recovery uses the already saved values, not metadata that no longer exists in the normalized JPEG.

## Trip and water

Only an ongoing trip started at or before the effective catch timestamp contributes its association, explicitly recorded location name, and known method. A historical import predating the trip inherits nothing from it. The actual Trip schema has no bait or linked water ID, so these are not manufactured. No nearest-water guess is committed as a known fishing water.

## Location

Background collection requires the Permissions API to report `granted`; `prompt`, `denied`, unsupported permissions, errors and timeouts leave location missing. No permission dialog is initiated. Only a recent camera capture registered in the originating page session can receive current GPS. The registry contains bounded session-only IDs, not photographs or location data, and is not synchronized. A second signed-in device or a reload must never attach its current position to somebody else's earlier capture. A foreign/reopened session leaves a recent pending GPS job alone for the existing 15-minute evidence window, allowing the originating request to finish; afterward it closes it as unavailable. Weather without coordinates waits for that GPS job to end. Existing application limits apply: at most 150 metres reported accuracy and 15 minutes of age or distance in time from capture. Timestamp, coordinates, and accuracy are retained in the existing `locationEvidence` field. EXIF GPS takes priority when present. GPS failure never prevents capture or upload.

## Weather and moon

The existing `fetchCatchWeather` integration supplies available air temperature, pressure, and wind speed. Quick Catch calls it with an absolute UTC hour and the new optional `timezone: "UTC"` argument so neither the water's timezone nor the reopening device can shift the requested hour. Existing callers retain the previous `auto` behavior. The cache includes timezone. Historical catches keep the existing archive/forecast-history selection. These are model data, not a claim of a weather station measurement. No current weather is substituted for unavailable history. API timezone behavior is documented by [Open-Meteo](https://open-meteo.com/en/docs).

Moon phase is calculated by the existing deterministic utility during initial creation, using the effective catch timestamp. No species or measurements are estimated by this module.

## Provenance, ownership and jobs

`quickCatch.provenance` is a small field-to-source map. The normal editor must mark changed fields `manual`, including an intentional clear. Existing `catchDateTimeSource`, `gpsSource`, and `conditionSources` are also respected. Automatic merging accepts only a fixed field whitelist and only fills unowned missing conditions/coordinates; it cannot change species, measurements, notes, owner, trip, or photo identity.

`quickCatch.enrichment.metadata` and `.weather` store `{status, attempts, nextAttemptAt}` on the ordinary Catch. The coordinator reads and writes through the existing repository and outbox. The repository integration must atomically compare `sync.revision`, never recreate a deleted catch, and preserve existing photo metadata. Each request first claims a 60-second lease through that transaction. A response is accepted only while its claim is still current; weather also checks the requested time/location against the latest record. Manual changes therefore win over a delayed response.

An outbox entry carries a local-only `automaticEnrichment` marker only if all coalesced writes are automatic. Any capture, manual edit or deletion clears it. For such an automatic-only operation, the existing remote-page transaction can accept a newer remote Catch as authoritative and reapply only missing, allowlisted automatic fields; it always preserves remote species, measurements, notes and photo identities. Weather is discarded when the remote time/location changed. A replacement photograph invalidates the old photo's automatic evidence. A newer remote deletion removes the automatic operation and its local photo bytes/uploads, preventing resurrection. Real concurrent manual edits still use the existing explicit conflict flow. No independent sync queue or last-write-wins policy is introduced.

Jobs retry at most three times, with 30/60-second backoff and terminal `failed` state. An interrupted last attempt becomes terminal after its lease expires. Missing GPS or permission produces terminal `unavailable`, without technical user notifications. Weather waits while offline. Reopening or an ordinary application wake calls `run(records)`; up to four records are processed per wake. Calling it repeatedly is safe, and disposal aborts the existing weather request and prevents subsequent writes. No locked-screen execution guarantee is made.

## Validation

`node --test src/features/catches/data/quickCatchEnrichment.test.js src/features/catches/data/photoCaptureMetadata.test.js src/shared/data/catchWeather.test.js` covers timestamps, real EXIF parsing with invalid dates and offsets, GPS permission/timeouts/age/accuracy, trip inheritance, idempotence, offline recovery, bounded retries, terminal leases, manual edits, deletion, changed weather context, concurrent workers, and disposal. Physical iOS/Android permission and PWA lifecycle behavior still require device acceptance testing. Tests use controlled adapters and do not claim a live provider request or physical-device validation.
