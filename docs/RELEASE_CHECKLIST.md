# ChytnuCz release readiness

Audit date: 2026-10-28. This checklist reflects the current workspace and available tooling. Production credentials were unavailable for verification, and no independent physical-device retest was available in this workspace; the supplied iPhone result is included below.

## Release decision

- [ ] Android/native release: blocked until Android SDK/device validation and the deferred native push/active-trip stage are complete.
- [ ] iOS release: blocked until Home Screen PWA and native/device flows are verified on supported iPhones. Native iOS packaging is not available on this Windows host.
- [ ] Web/PWA release: conditional; finish the production-host and physical-device checks below before release.

## BLOCKER

- [ ] **Native release is not validated.** Android SDK/Studio/ADB are absent; iOS hardware and Apple build environment are unavailable. Do not claim native push or lock-screen Vycházka support: those implementations remain deferred and the current platform adapters are web/no-op foundations.
- [ ] **Production configuration is partly unverified.** Firestore rules were compared with the live project and the repository rules were deployed on 2026-10-28. Confirm deployment environment values and server-side Cloudinary credentials in the hosting provider’s secret manager without printing them. `VITE_` variables must contain public values only. Verify Firebase project/auth domains, authorized origins, and API origin.
- [ ] **Real iPhone photo sync remains unreliable.** The supplied physical Home Screen PWA result reports photos missing/delayed and WebKit `NotFoundError` / “The object can not be found here.” Do not sign off a broad production release until the exact iPhone path is reproduced and fixed; local photo tests do not cover that broken Safari Blob case.

## HIGH

- [ ] **iPhone photo/offline retest after the dedicated fix.** Verify capture, reload, queue/retry, framing, logout/login, offline recovery, and Home Screen PWA on a physical supported iPhone. Preserve existing IndexedDB data during investigation.
- [ ] **Guest and account lifecycle on production.** Exercise guest mode, registration, email verification, logout/login, account switching, and recovery on the deployed origin. Emulator tests cannot validate provider/deployment settings.
- [ ] **Push is subscription-only.** In-app inbox and opt-in Web Push subscription foundation exist, but there is no authenticated server sender or configured private VAPID key. Keep push delivery disabled/clearly unavailable until a secured sender and invalid-endpoint cleanup are deployed and tested.

## MEDIUM

- [ ] **Dependency advisories.** `npm audit` has no HIGH/CRITICAL findings after updating Vite and its React plugin; 9 MODERATE findings remain in development/tooling dependencies. `npm audit --omit=dev` reports 2 MODERATE React Router advisories. Review and plan a compatible router migration; current client-only app does not use SSR. Keep CI audit output under review.
- [ ] **Security response headers.** Review the production host’s CSP and HSTS configuration. Add a CSP only after listing the Firebase/Auth, Cloudinary, map, weather, and other required origins and validating the policies against real flows.
- [ ] **Automated accessibility/performance review.** Run Lighthouse/Web Vitals and an axe scan on representative mobile and desktop routes; manually verify keyboard focus, screen-reader announcements, reduced motion, contrast, and safe-area layout.
- [ ] **Migration and recovery drill.** Test an upgrade from a representative older IndexedDB/backup schema, including legacy catches with more than four photos, and verify export/restore on a real browser profile.
- [ ] **Android data boundary.** Capacitor WebView storage is separate from browser storage; verify the signed-in cloud account path and communicate/migrate local-only guest data before any native rollout.

## LOW

- [ ] **Operational monitoring.** Confirm production error reporting, sync failure visibility, and an owner-facing support route. Error boundaries show a safe recovery screen but do not replace telemetry.
- [ ] **Install/update checks.** Verify manifest installability, service-worker update prompt/activation, offline fallback, and cache refresh on Chrome Android, Safari Home Screen, and desktop browsers.
- [ ] **Responsive visual pass.** Check long species names, empty/loading/error states, small screens, landscape orientation, and large text scaling on real devices.

## Validation commands

Run from the repository root and retain the CI logs:

```powershell
npm run lint
npm test
npm run test:auth
npm run test:rules
npm run test:sync
npm run test:photos
npm run build
npm audit
npm audit --omit=dev
git diff --check
```

`npm run build` includes `tools/cloudinary-client-secret-scan.mjs`. `test:rules`, `test:auth`, and `test:sync` use local Firebase emulators. `test:photos` is a local-only IndexedDB/photo metadata test and does not contact Cloudinary or prove physical-device delivery. Run emulator suites sequentially to avoid port conflicts.

## Current workspace results

- [x] `npm run lint`
- [x] `npm test` — 484 tests passed, 0 failed.
- [x] `npm run test:auth` — Firebase Auth Emulator passed.
- [x] `npm run test:rules` — 10 rules tests passed.
- [x] `npm run test:sync` — emulator sync passed, including photo metadata/outbox behavior.
- [x] `npm run test:photos` — local-only photo test passed.
- [x] `npm run build` — passed; Cloudinary client secret scan checked 69 assets. Vite reports large JavaScript chunks (main bundle ~1.21 MB, HEIC converter ~1.35 MB); measure user-facing performance before expanding rollout.
- [x] `git diff --check`
- [x] `npm audit` — 0 HIGH/CRITICAL, 9 MODERATE; `npm audit --omit=dev` — 0 HIGH/CRITICAL, 2 MODERATE.

## Production sync incident — 2026-10-28

- Production Firestore rules differed from repository rules. The live `validCatchContent` allowlist did not include `catchDateTimeSource` or `gpsSource`, while the current Catch sync projection sends both fields. The Rules API comparison and client payload identify Catch upsert create/update commits as the rejected operation class (`users/{uid}/catches/{catchId}`; no user identifiers are retained here).
- Local emulator rules suite passed before deployment. Only Firestore rules were deployed to Firebase project `chutnucz`; a follow-up Rules API comparison matched the repository file.
- Existing user outboxes were not accessed, cleared, or changed. Ask the affected user to retry on the existing installation and confirm the queued Catch sync succeeds.

## Release sign-off

- [ ] Release owner reviewed every BLOCKER/HIGH item and attached evidence for the device and production checks.
- [ ] CI validation commands pass on the final candidate commit.
- [ ] Firestore rules are deployed and verified against the intended production Firebase project.
- [ ] Production secrets/configuration were checked in the hosting console without exposing values.
- [ ] Web/PWA release scope is explicitly distinguished from the unfinished native release scope.
