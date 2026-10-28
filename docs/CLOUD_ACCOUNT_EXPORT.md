# Cloud account export

The account export is a versioned JSON document (`format: "chytnucz-account-export"`,
`version: 1`) assembled from authenticated, owner-scoped Firestore reads. It contains synchronized catches, trips, custom
waters, notifications, progression records, and each Catch's photo metadata.
Available Cloudinary originals are downloaded through the authenticated
`/api/cloudinary/export` endpoint, checked against the stored size and SHA-256,
and embedded as Base64 in the JSON. Cloudinary credentials never enter the
browser or the export.

The endpoint streams one verified image at a time. It does not create a ZIP on
Vercel: doing so would buffer an unbounded account archive in a serverless
request and risk memory, response-size, and execution-time limits. The current
single-file JSON is portable and can be downloaded on desktop and mobile, but
its size is about one third larger than the image bytes and the browser needs
memory for the assembled document. A future large-export mode should use a
manifest plus per-photo authenticated downloads or client-side streaming ZIP;
it must not put Firebase ID tokens or Cloudinary credentials in URLs.

Firestore collections are paginated (200 documents per page by default), with
no total Catch/photo cap. Photo bodies are fetched sequentially through the
authenticated endpoint; each body retains the existing per-photo 10 MiB
product limit, while old Catch with more than four images are not truncated.
Regression coverage includes 0 and 100 Catch, 120 photos, and a legacy Catch
with more than four photos. A very large account can still outgrow the browser
memory needed to assemble one final JSON string/Blob; in that case this format
needs to move to multiple downloadable parts or a streaming client writer,
rather than introducing a low account-wide export cap.

`records.deviceLocal` is a clearly labeled supplement from the currently used
profile scope on this device. It includes profile preferences/privacy settings,
local progression events, local notifications, and pending progression
claims. Those fields may not reflect another device and are not represented as
server-authoritative. Unsynchronized Catch/photo data is deliberately not
merged into the cloud snapshot. Challenges, achievements, mastery, and streak
are included as state derived from the synchronized Catch/trip data, alongside
server-confirmed XP and progression ledger records.

Firestore collections are read sequentially with server reads and pagination;
this is not an atomic point-in-time database snapshot. The portable document
deliberately excludes push subscription endpoints/keys, photo duplicate-claim
hashes, per-catch anti-cheat state, Limited XP cap counters, rate-limit
counters, sync cursors/receipts, provider internals, pending claim queue state,
and all server credentials. The export UI warns that catch locations and photos
may be sensitive personal data and the file should be stored securely.
