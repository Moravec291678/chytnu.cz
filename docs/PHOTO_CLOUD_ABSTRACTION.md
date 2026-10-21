# Cloud photo storage abstraction

## Architecture decision

Keep IndexedDB as the source of truth. Each Catch continues to own its ordered photo metadata and original Blob; Gallery, detail, Share Card, backup and restore continue to use that local model. A selected cloud provider is an optional adapter behind `PhotoCloudProvider`. The default `none` provider reports unavailable and performs no network access.

Cloud work reuses the existing IndexedDB `outbox` store and its scope, idempotency, attempt and retry fields, with a separate `photoCloud` operation type and worker. The Catch/Trip/Water sync worker ignores that operation type. Upload intent is discovered from local Catch photos when a provider is available, which also recovers work after an app restart between Catch save and upload scheduling. Photo removal and Catch deletion enqueue remote deletion in the same IndexedDB transaction as the local mutation.

Cloud operation identity is `(ownerId, catchId, photoId, operation, sha256)`. The deterministic object key is `users/{uid}/catches/{catchId}/photos/{photoId}/original`; it contains no email, display name, coordinates or notes. Re-uploading the same bytes writes the same key. Crop and primary selection remain metadata-only and do not enqueue uploads.

Persistent photo states are `localOnly`, `pendingUpload`, `uploadFailed`, `synced`, and `pendingDelete`. The outbox is authoritative for retries. An interrupted in-flight upload remains a pending or failed durable job and is safe to retry. Provider metadata is restricted to provider ID, deterministic object key and SHA-256; signed URLs, grants and secrets are never persisted in Catch or Firestore.

The Cloudinary provider uses short-lived upload grants from same-origin Vercel functions. Firebase ID tokens authenticate every function call; the server verifies the token, Catch/photo ownership and Firestore photo metadata before signing. Uploads use Cloudinary `authenticated` assets and deterministic, server-derived public IDs. The API secret and Firebase Admin service account are server-only. See `CLOUDINARY_PRODUCTION_SETUP.md` for the required production configuration. Local development keeps the `none` provider unless the application is explicitly configured by the production bootstrap.

`preparePhotoForCloud` is a non-destructive image pipeline seam: its default returns the original Blob as the original variant. Future display/thumbnail variants may be added without replacing local original bytes. Downloads are attempted only when local bytes are absent, checked against recorded size, MIME and hash, then cached into the matching account-scoped Catch.

## Trade-offs and limits

- A Catch remains local-first; saving never waits for a provider.
- The existing generic outbox table is reused to avoid a second retry protocol or another IndexedDB migration. The dedicated `photoCloud` discriminator prevents the Firestore entity worker from treating object operations as Catch writes.
- No upload occurs with the `none` provider. The fake provider exists only in tests.
- A provider must implement overwrite-at-deterministic-key semantics and treat delete of a missing object as successful for retry safety.
- Firestore stores provider-independent object metadata only after upload success; no public URL is stored.
- This integration requests authenticated originals and issues five-minute private download URLs only after an authenticated, owner-checked request. Such URLs are bearer links during their lifetime; Cloudinary documents that private downloads bypass its CDN and use additional bandwidth. Signed upload grants are timestamped and can be replayed during Cloudinary's signature validity window, but target only the same authenticated, owner-derived asset. [Cloudinary access control](https://cloudinary.com/documentation/control_access_to_media), [signed uploads](https://cloudinary.com/documentation/upload_images).
- The app rejects photo Blobs over 10 MiB before upload and verifies Cloudinary's resulting size against Firestore metadata. Cloudinary's upload presets do not provide a per-preset file-size limit, so account-level limits must be checked separately; a malicious authenticated client may tamper with multipart bytes after obtaining a grant. [Cloudinary upload presets](https://cloudinary.com/documentation/upload_presets).
- The existing local image preparation pipeline is unchanged. It normally re-encodes supported images, but its browser fallback can preserve source metadata; this integration adds no extra metadata stripping or Cloudinary transformations.
