# Local Firebase emulator and security tests

## Scope

This configuration is for local Auth/Firestore/Storage emulator development only. Firebase CLI commands pin the project ID to `demo-chytnucz-local`; the `.firebaserc` default is also a `demo-*` ID. Demo project IDs have no live Firebase resources, preventing emulator commands from targeting production. No production Firebase project, billing account, or production credentials are configured.

The configured emulators are Authentication, Cloud Firestore, and Cloud Storage. Run `npm run emulators` to keep them running, `npm run test:rules` for security rules, `npm run test:auth` for account flows, `npm run test:sync` for Catch/Trip sync, or `npm run test:photos` for photo transfer. Emulator commands do not read `.env.local`.

The Firebase CLI is a development dependency; the existing app Firebase SDK initializes only on a local Vite development host. React contexts and repositories remain the application boundary and IndexedDB remains the local source of truth.

Use a Java 21+ runtime on `PATH` or set `JAVA_HOME` before running the emulator commands. This machine only has Java 8 installed system-wide; verification used an isolated JRE 21 in the ignored `node_modules/.cache` directory. The runtime is not a package dependency and is not installed globally.

## Data boundary

The private emulator paths are `/users/{uid}/catches/{catchId}` and `/users/{uid}/trips/{tripId}`. Rules require authentication matching the path UID and immutable `ownerId`, a matching record ID, validated schema, and the atomic receipt/change/cursor sync protocol. Direct document deletes are denied; clients create tombstones through the synchronizer. Unmatched paths are denied.

The Firestore catch document is a narrow cloud projection of the local Catch model for new records owned by the current signed-in emulator account. It contains photo metadata only, never local Blob bytes or local sync state. Photo bytes stay in the Catch's IndexedDB Blob and are copied to private Storage at `/users/{uid}/catches/{catchId}/photos/{photoId}/{sha256}`. The hash-addressed immutable path makes upload replay idempotent and keeps replacements separate until their metadata is accepted. Storage rules bind path, owner, catch, photo ID, content hash, MIME and byte size to the Firestore Catch metadata. Only the authenticated owner can read/delete objects; the client uses authenticated SDK reads, not public download URLs.

The current form still accepts at most one JPEG, PNG or WebP photo up to 10 MiB. Client-side image validation and optimization remain in place. Upload metadata is written first so Storage Rules can verify the Catch/photo binding; the upload then runs, the object is read back and checked against its SHA-256, and only then is the outbox acknowledged. A failed transfer or cleanup keeps the operation and local Blob. Delta pulls store verified download bytes back as the existing local Blob before advancing the IndexedDB cursor. There is no separate thumbnail object or public photo route.

Trips use existing Trip fields with an added owner ID. A Catch may refer only to an existing, non-deleted Trip under the same owner's path. New account-owned Catch/Trip data synchronizes through the development emulator. Legacy ownerless records/outbox operations remain local until the user confirms explicit linking. Catch photo metadata and bytes then synchronize through private Storage while the local Blob remains available offline.

## Security test suite

Run:

```powershell
npm run test:rules
```

The suite executes Firestore and Storage requests against the emulators using `@firebase/rules-unit-testing`. It covers anonymous access, cross-owner access, denied direct writes/deletes that bypass the sync protocol, protected data, photo-to-catch/hash binding, MIME and byte limits, and default-deny paths. `npm run test:photos` proves upload, read-back integrity, retry after upload and cleanup interruption, restore to a second isolated IndexedDB, replacement/removal, sign-out persistence, ownerless isolation and tombstone cleanup. `npm run test:sync` separately proves the authenticated metadata protocol. Test fixtures are synthetic.

`npm test` does not start Firebase or run the emulator suite. This keeps the ordinary local unit-test command independent of Java and emulator downloads.

## Limits and next work

Security Rules apply to client SDK requests; privileged server SDKs bypass them and must be protected separately with IAM. Emulator success is not a production deployment review. The emulator does not prove production indexes, service quotas, billing, data residency, backup policy, or mobile background synchronization. Do not deploy these rules or create a cloud project until those decisions are separately approved. Existing ownerless local data is linked only through an explicit confirmed UI action.

The emulators are local development tools, not production service replacements. The machine's installed system Java is 8; tests set `JAVA_HOME` to the ignored isolated Java 21 runtime. This does not change system Java or project dependencies. Downloading a photo back for a content hash check adds transfer traffic; production billing/region, retention, backup, and a lower-cost trusted integrity strategy still need owner review before a live Firebase project is enabled.

## Application authentication (stage 6H)

The app's account section uses Firebase Authentication only in a Vite development build served from `localhost`, `127.0.0.1`, or `[::1]`. The client is pinned to project ID `demo-chytnucz-local` and Auth Emulator `http://127.0.0.1:9099`. It has no production configuration or fallback. A production build deliberately reports account functionality as unavailable until a separate production setup is approved.

Email/password registration, sign-in, sign-out, local browser session restoration, email verification requests, and password-reset requests go through the Firebase Auth SDK. The Auth Emulator does not deliver mail; it prints one-time verification/reset action links to the emulator terminal. Those links can be opened locally to simulate the corresponding action. The emulator's lack of production anti-abuse, real email delivery, and real-provider verification remains a production-readiness gap.

Run the isolated auth integration suite with `npm run test:auth`. It uses synthetic records with `fake-indexeddb`, checks registration/sign-in/errors/reset/sign-out/session restoration/unavailable-emulator handling, and confirms auth actions themselves do not mutate local data. The sync provider starts metadata synchronization only for records already owned by the currently signed-in emulator UID; it does not associate existing local records automatically.

Google sign-in uses the same Firebase Auth adapter and is enabled automatically only in emulator mode. The isolated auth integration suite exercises the SDK credential path with an Auth Emulator mock Google identity. Staging and production expose the Google button only when `VITE_FIREBASE_GOOGLE_AUTH_ENABLED=true`; that flag must be set only after the provider and authorized domains are configured. The emulator test does not prove a real Google popup, production OAuth client, or native app identity.
