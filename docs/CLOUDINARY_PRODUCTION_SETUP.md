# Cloudinary production setup

Cloud photo storage is enabled only when the production Vercel server has every required server-only variable. Until then, the app keeps its local-first `none` provider behavior.

## Vercel environment

Configure these variables for **Production** in the Vercel project settings. Do not prefix any variable with `VITE_`, and do not place secrets in client environment settings:

| Variable | Value |
| --- | --- |
| `PHOTO_CLOUD_PROVIDER` | `cloudinary` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret (server only) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full Firebase Admin service account JSON for project `chutnucz` |

The service account must have Firebase Auth token verification and Firestore access to verify ownership, inspect Catch/photo documents, and write the `serverRateLimits` collection. The API refuses to enable if the service account project ID does not equal `chutnucz`. Keep these values in Vercel's encrypted server environment; never paste them into source, a client variable, issue, or chat.

After configuration, a new Vercel production deployment is required before the capability endpoint reports enabled. This repository change does not configure Vercel or deploy anything.

## Cloudinary asset behavior

Uploads are signed by the server and use `authenticated` image assets at the server-derived path `chytnucz/users/{uid}/catches/{catchId}/photos/{photoId}/original`. The browser does not choose an arbitrary remote public ID. A delivery endpoint verifies the Firebase identity and owner, then issues a five-minute private download URL. Firestore contains metadata and deterministic object keys, never a public asset URL or a temporary delivery grant.

Cloudinary documents authenticated assets as access-controlled. Its private download URLs are bearer links while valid and bypass the CDN, with additional bandwidth use. Signed upload timestamps may remain valid for up to an hour, so a stolen grant could overwrite only its same owner-derived asset during that window. [Access control](https://cloudinary.com/documentation/control_access_to_media), [signed uploads](https://cloudinary.com/documentation/upload_images).

The client checks a 10 MiB maximum and the server verifies uploaded resource size against the matching Firestore photo metadata. Cloudinary does not support a per-upload-preset size limit; confirm the account-level upload limit in Cloudinary settings before production use. A malicious authenticated client can tamper with multipart bytes after obtaining its own signed grant, so the application check is not a hard provider-side size cap. [Upload presets](https://cloudinary.com/documentation/upload_presets).

The current local image preparation remains authoritative. The normal browser path re-encodes supported images, while its compatibility fallback may preserve source metadata; this integration performs no additional EXIF stripping or image transformation. Do not claim GPS metadata is always removed until that local fallback is addressed.

## Verification boundary

Automated tests use an injected fake Cloudinary API and do not contact the provider. A real upload, authenticated delivery, and deletion must be verified after configuring the production environment and deploying. No real Cloudinary asset is created by local tests.
