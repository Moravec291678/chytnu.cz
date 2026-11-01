> **Closure update, 2026-11-02.** The legal copy blocker was corrected in the Privacy Policy and Terms and verified by focused tests. The live Firestore ruleset for `chutnucz` matches `firestore.rules` exactly; deployed composite indexes and field overrides match `firestore.indexes.json` after normalizing Firebase-generated fields. Emulator owner-isolation and auth tests pass. The remaining gate is the physical iPhone plus PC photo acceptance test. The findings below record the earlier audit state and are superseded for these two closed items.

# Final release audit — 2026-11-02

## Executive verdict

**NOT READY FOR PUBLIC LAUNCH.** Automated checks pass and the production deployment is ready. Public legal copy contradicts the account export and deletion flows. Authenticated production use, physical device behavior, and visual layouts remain unverified.

## Release summary

- Commit `2326e01397d39a5e32fe41c5a2e38008d6d342d1`, branch `codex/ui-terminology-length-priority`, equals `origin/main` at audit start. Working tree was clean. No tracked secrets, credentials, `.env.local`, or production dumps found by filename review. Client Cloudinary secret scan passed. This is a scoped check, not a complete secret history scan.
- Production Vercel deployment `dpl_F192KfLZYTFjBr16o1a51GYZNfvM` was READY and assigned to `chytnu-cz.vercel.app`. GET `/`, `/login`, `/journal`, `/add`, `/gallery`, `/settings`, `/privacy`, `/terms`, `/notifications` returned HTTP 200 with the SPA shell. Authenticated route rendering and browser boot were not demonstrated by these responses.
- `npm run lint` PASS. `npm test` PASS, 739 tests, 0 failures. `npm run build` PASS with Cloudinary client secret scan, 123 assets. `npm run test:sync`, `npm run test:photos`, `npm run test:rules`, `npm run test:auth`, and `npm run product` PASS. `git diff --check` PASS before report creation.
- `npm audit --omit=dev --json` reported 0 critical, 0 high, 8 moderate. Direct moderate findings include `react-router-dom`, while seven are transitive. Evaluate upstream fixes with targeted regression tests. No forced dependency upgrade was made.

## P0 blockers

1. **Published account rights copy is false.** `src/pages/legalDocuments.js` says complete cloud export and automated account deletion are unavailable. `src/pages/SettingsPage.jsx` exposes both, backed by `cloudAccountExport.js` and `/api/account/delete`. A public user receives contradictory instructions about export and deletion. Update Privacy Policy sections on export and deletion and Terms sections 11 and 13 to describe the current flows, their asynchronous cleanup and local only limitations. Recheck product wording and publish the corrected pages before launch.
2. **Real account and multi device photo flow remains unverified for launch.** Recent user reports describe missing photos after batch upload and a receiving PC stuck on retry. The latest code has regression coverage, but there was no authenticated production two device run with actual phone library images. Exact next action is to use a test account on a phone and PC, select four mixed date photos including HEIC/JPEG, save, interrupt/reopen, verify four Cloudinary originals and Firestore READY records, confirm four PC images, pending zero, and deletion cleanup. Fix any observed failure before launch. This is a validation blocker, not a claim that the current code fails.

## P1 issues

- **Moderate production dependencies.** Determine which advisory paths are runtime reachable and update compatible packages without breaking routing or Firebase. The audit reported eight moderate and no high/critical.
- **Export size and memory.** Cloud export paginates Firestore but assembles photos and final output in memory. Exercise a large test account, set a supported size limit or stream/export in parts, and show a specific user error on exhaustion.
- **Diagnostics.** Sync and photo traces exist, yet no centralized production incident view was verified. Add privacy safe aggregated error monitoring and alerting, then test a failed upload and cleanup job.
- **Local legacy scope.** Privacy text acknowledges old unscoped records may survive scoped deletion. Add an owner safe migration or a separate clearly labeled device reset after reviewing cross account data risk.
- **Photo proxy scaling.** Each delivered original traverses Vercel and reads full bytes for digest verification. Load test large accounts and compare transfer, memory and function limits. Preserve signed owner checks and digest verification.

## P2 improvements

- Audit all 44 px touch targets and color contrast. Review initial bundle size and lazy loading. `heic2any` build chunk is 1,352.90 kB, gzip 341.25 kB. Continue reducing unnecessary repeated Firestore reads. Consider a clear per photo retry status in Journal and Gallery.

## Feature matrix

| Feature | Result | Evidence and limit |
|---|---|---|
| Auth | UNVERIFIED | Auth emulator PASS; production Google login, restore and reauthentication need live test |
| Home | UNVERIFIED | Route shell served; authenticated render not tested |
| Journal | UNVERIFIED | Route shell served; filters, sort and grouping need browser test |
| Add Catch | UNVERIFIED | Photo input and catch unit tests pass; real phone flow pending |
| Edit Catch | UNVERIFIED | Code and tests present; live flow pending |
| Delete Catch | UNVERIFIED | Automated contracts present; live cleanup pending |
| Length first behavior | PASS | Unit/product code tests, legacy weight support in repository |
| Photos | UNVERIFIED | 739 unit tests and photo contract PASS; real upload/delivery pending |
| Gallery | UNVERIFIED | Route shell served |
| Realtime sync | UNVERIFIED | Sync emulator PASS; live cross device pending |
| Offline | UNVERIFIED | Offline code/tests present; real reload/reconnect pending |
| Multi device | UNVERIFIED | Emulator covers second device; physical test pending |
| Trips | UNVERIFIED | Sync emulator PASS; product UI pending |
| Waters | UNVERIFIED | Sync emulator PASS; product UI pending |
| Fish Activity | UNVERIFIED | Code present; live external service test pending |
| GPS | UNVERIFIED | Permission and failure paths need physical device |
| Weather | UNVERIFIED | Code/tests present; live service failure handling pending |
| Notifications | UNVERIFIED | Route shell served; resolved alert behavior needs live test |
| Export | UNVERIFIED | Service tests present; owner and large account production test pending |
| Local delete | UNVERIFIED | Scoped implementation present; legacy migration needs review |
| Account delete | UNVERIFIED | Server tests present; production destructive test intentionally skipped |
| Photo cleanup | UNVERIFIED | Rules/API tests and cron configuration present; live job lifecycle pending |
| Privacy | FAIL | Published copy contradicts Settings export/deletion |
| Terms | FAIL | Published copy contradicts Settings export/deletion |
| Supporter | PASS | Feature flag false; no billing changes |
| PWA | UNVERIFIED | Build exists; install, offline and service worker update pending |
| Native iOS foundation | UNVERIFIED | Swift plugin source exists; REQUIRES MAC/XCODE for native release |

## Production infrastructure

Vercel production is READY, and the Cloudinary cleanup cron is configured for `0 0 * * *`. Production variables named `CRON_SECRET`, Firebase service account, and Cloudinary credentials exist as encrypted entries. Their values were not exposed. The Firebase CLI default is `demo-chytnucz-local`, so every production Firebase command must specify `--project chutnucz`. A read-only `npx firebase firestore:indexes --project chutnucz` succeeded and listed account deletion and photo cleanup indexes. Deployed rules were not independently fetched during this audit; emulator rules tests passed. Verify deployed rules match `firestore.rules` before public launch. Billing was untouched.

## Security

Owner, photo identity, and authentication checks exist on Cloudinary endpoints, and account deletion uses a verified UID. Local rules and API tests passed. No production penetration test or destructive real user test was performed. Review debug diagnostics and token logging under a test account before launch. No client Cloudinary secret marker appeared in built assets.

## Privacy and legal consistency

The policy names David Moravec, contact email, Firebase, Cloudinary, Vercel, Open-Meteo and OSM. It describes approximate photo cleanup and the limits of deleting legacy local data. Its export/deletion claims are outdated. This is a content consistency finding, not legal certification.

## Performance and scalability

The build flags large chunks. Photo originals pass through Vercel and are buffered for hash verification. Firestore listeners, account sync deltas, Cloudinary delivery and cleanup could accrue reads and bandwidth as accounts grow. Stress tests for large galleries and high account counts remain unverified. No paid plan or billing change was made.

## Manual tests still required

1. At 320, 375, 390, 430, tablet and 1366 px inspect Home, Journal, Add Catch, detail, Gallery, Notifications, Settings, Login and legal pages for overflow, controls, focus, contrast, dialogs and safe area.
2. On physical iPhone Home Screen and desktop, sign in with the same test account, create/edit/delete a catch, add four mixed date images, suspend/reopen, test offline/reconnect, verify Cloudinary, Firestore READY, pending zero and PC display. Include one failed image and a slow network.
3. Verify Google login, expired token, logout, account switching, manual sync, export completeness, local delete, reauthentication and account delete with a dedicated disposable test account. Do not delete real user data.
4. Exercise cleanup pagination above 100 jobs, retry/backoff, missing Cloudinary object, orphan photo document and account deletion receipt using emulators or disposable staging data. Confirm production cron success through safe logs.
5. For App Store release, build/run on Mac/Xcode and test native background upload, relaunch registry, interruption and deletion. This is not a blocker for PWA launch.

## Launch checklist

### MUST DO BEFORE PUBLIC LAUNCH

- Correct and publish the Privacy Policy and Terms export/deletion language, then verify visible production copy.
- Complete the physical two device photo acceptance test above and resolve any failing case.
- Compare deployed Firestore rules with repository rules and run an owner isolation check with test accounts.

### SHOULD DO SOON AFTER LAUNCH

- Triage moderate dependency advisories, large account export limits and centralized privacy safe monitoring.

### OPTIONAL LATER

- Optimize image proxy memory, bundle size, touch targets and account scale.

## FINAL

NOT READY FOR PUBLIC LAUNCH — outdated legal copy and unverified real multi device photo flow
