# ChytnuCz — Final Release Readiness Audit

**Audit date:** 2026-10-28
**Scope:** read-only release readiness audit of the current `origin/main` code and the production site.
**Verdict: NOT READY FOR PRODUCTION RELEASE.** Four release blockers remain. No application code, production configuration, Firestore rules, or deployment was changed. This report is the only intended workspace change.

## Executive summary

The checked-out commit is `55f79e0fce2e4e7cf8dbef07a486c099a108669f`, equal to `origin/main` at audit time. Lint, unit tests, build, Firestore rules emulator, auth emulator, sync, photo contract, and product configuration validation passed. Production Vercel is READY and public SPA endpoints and Cloudinary capability endpoint return HTTP 200.

Release is blocked because (1) users cannot fully delete their remote account/data or obtain a complete server export through the product, (2) local deletion leaves photo binary and Add Catch draft stores, (3) no user-facing legal privacy policy/terms and controller/support identity were found, and (4) production Firebase rules/auth configuration could not be independently verified. Additional high-priority risks include client-influenced progression reconciliation, feature flags that do not actually gate routes, incomplete backup coverage, and absent server-side Web Push delivery.

This is an engineering audit, not a legal opinion, a penetration test, or proof of behavior on physical iPhone/Android devices. No test accounts were used in production.

## Release gate

| Area | Status | Evidence / limitation |
|---|---|---|
| Git baseline | PASS | clean before audit; HEAD equals fetched `origin/main` |
| Lint / test / build | PASS | results below |
| Production web | PASS with limits | Vercel `READY`; HTTP 200 routes; public login rendered |
| Firebase local rules/auth | PASS | emulator suites pass |
| Production Firebase security config | UNVERIFIED — BLOCKER | no safe authenticated read of deployed rules/IAM/auth settings |
| Data deletion/export | FAIL — BLOCKER | no cloud deletion/export flow; local deletion misses stores |
| Privacy/legal transparency | FAIL — BLOCKER | no policy/terms/controller/support details located |
| Progression anti-cheat | HIGH RISK | reconcile accepts client-influenced local baseline |
| Photo pipeline | AUTOMATED PASS / DEVICE UNVERIFIED | contracts/sync tests pass; no real multi-device transfer performed |
| PWA | PARTIAL | production SW/manifest served; no physical install/offline/update matrix |
| Mobile/desktop visual | PARTIAL | production login inspected only; full route/viewport matrix not completed |
| Billing | PASS | Supporter flag disabled; no live payment integration found in audited scope |

## P0 — release blockers

### 1. Account deletion and full export are not available

Settings explains that local deletion does not remove the online account/data and directs the user to support; no authenticated account-deletion endpoint/workflow was found. Backup snapshot code reads local data only, so it is not a complete export of remote state. This leaves users without a self-service full lifecycle operation.

**Evidence:** `src/pages/SettingsPage.jsx`, `src/features/settings/data/localDataDeletion.js`, `docs/ACCOUNT_DATA_LIFECYCLE.md`, backup snapshot implementation.
**Required before release:** provide a verified owner-scoped account deletion process (including Firebase Auth, Firestore, Cloudinary references/assets and orphan handling) and complete export, or clearly establish and document an operational support process with response/retention details. Test ownership isolation and deletion completion. Do not delete production data as part of this audit.

### 2. Local “delete data” leaves private local stores behind

`localDataDeletion.js` removes primary catch/trip/water, outbox, conflict, privacy, progression, notification and sync data, but it does not include the `photoBinaries` IndexedDB store nor the separate `chytnu-catch-drafts` database. Thus the operation can report success while leaving photos and draft content on the device.

**Required before release:** define whether delete means all local user data; include photo binaries and draft DB in the owner-scoped deletion operation, handle blocked/open IndexedDB connections safely, and add regression tests proving both stores are cleared without touching another account’s scope. Keep the existing photo recovery pipeline intact.

### 3. No adequate public privacy/legal information found

`/privacy` is a preference screen, not a privacy policy. The app handles precise GPS, catch/photo metadata, account identifiers, sync data and Cloudinary assets. A privacy notice, terms, data controller/operator identity, contact and retention/deletion information were not found in the reviewed app/docs. Local weather requests include coordinates to Open-Meteo; maps contact tile providers.

**Required before release:** owner/legal review and accessible, accurate public notice covering data, purposes, processors/transfers, retention, user rights, deletion/export, support contact, and relevant third-party providers. This is not a legal conclusion; obtain appropriate owner/legal review.

### 4. Production Firebase rules/configuration not verified

Firestore rules tests pass against the local emulator, and local rules include owner scoping/schema checks/default deny. The deployed rules version and production Firebase Auth settings (including authorized domains/providers) were not safely readable in this audit. Do not infer that local tests prove production configuration.

**Required before release:** an authorized operator should inspect deployed rules and Auth settings for project `chutnucz`, compare the deployed rules revision with reviewed source, verify Admin SDK IAM/service identity and production indexes, and record the result. No rules were deployed.

## P1 — high priority

### Progression is not fully server-authoritative

Catch reward claim API accepts a `catchId` and calculates new Catch rewards server-side, but reconciliation accepts client-provided `localProgressionXp` and `pendingCatchXp`; the server derives a legacy baseline from those client totals. This allows a modified client to inflate the baseline when the relevant mode is active. Challenge/achievement progression also remains in client/local logic. Tests that reject an explicit `xp` argument do not demonstrate that client totals are trustworthy.

**Action:** keep shadow/legacy compatibility explicit; never treat a client-derived baseline as verified server XP. Establish a bounded, migration-reviewed legacy baseline and make new reward events authoritative. Verify production `SERVER_PROGRESSION_SHADOW` state. Do not reset old XP.

### Feature flags do not consistently gate features

Product flags are configured false, but the `isFeatureEnabled` call appears limited (notably Stats AI copy); route/page declarations remain available. “OFF” therefore does not guarantee a feature is unavailable. Audit all routes, actions and APIs against server/client flag semantics before enabling or describing these flags as access controls.

### Backup/restore is incomplete for local data

Backup covers catches/photos references, trips, privacy, progression and notifications, but does not include the separate local custom waters database, Add Catch drafts, and all user preferences. Restored catches may retain a `waterId` without the corresponding custom Water. Define backup scope and test old/new round trips, including unresolved references.

### Web Push is a subscription foundation, not a delivery system

User-initiated subscription and service-worker receipt/click plumbing exist, but no server-side push sender was found in `api/`. Several notification types have no producers. If the CTA is visible/configured, it can imply delivery that is not implemented. Keep the state and copy truthful; actual delivery requires an authenticated sender, invalid-subscription cleanup, and tests.

### Official Waters directory is absent

`/waters` displays user-created waters; repository contains no imported official water dataset, importer, or source API. If product copy promises a national/official directory, that promise is currently unmet. Otherwise label it as the user’s saved waters. Do not assert a national count without an authoritative source/data set.

### Operations, cost and retention controls need owner validation

Progression reconciliation reads the server events collection, with work increasing as history grows; photo-hash duplicate lookup can use a collection-group query. Cloudinary retention/quota/orphan cleanup controls were not evident in reviewed code. Establish expected scale, limits, monitoring, alerting and cleanup ownership. No runaway loop was demonstrated by the automated suites.

### Security headers are incomplete

Production response showed HSTS, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`. No CSP or frame restriction (`frame-ancestors`/`X-Frame-Options`) was observed. Define a CSP compatible with Firebase/Cloudinary/maps before enforcing, then add framing protection and verify it against real flows.

### Bundle and offline precache are heavy

Build succeeds with Vite large-chunk warnings. HEIC conversion is about 1,321 KiB raw (~341 KiB gzip); another JS chunk is ~519 KiB raw, app bundle ~424 KiB and Leaflet ~146 KiB. Generated SW precaches built assets, including lazy routes and the HEIC asset, increasing first-install transfer/storage. Measure on mobile networks and split/avoid eagerly precaching rarely used heavy features without regressing offline flows.

### Dependency audit reports moderate advisories

`npm audit --omit=dev` reports two moderate React Router advisories; full audit reports nine moderate findings, including transitive tooling. No high/critical findings were reported. Review advisory reachability and compatible upgrades; do not force major upgrades without regression coverage.

### Physical-device confidence is incomplete

No authenticated production test, physical iPhone Home Screen photo transfer, Android shell build, or multi-device photo transfer was performed. Android SDK is unavailable in this environment; iOS native build is not available on Windows. Automated local auth/sync/photo tests pass but do not prove device behavior.

### Observability/recovery needs an owner check

No end-to-end production monitoring/alerting evidence was found for auth, sync backlog, Cloudinary upload/recovery, push delivery or progression claims. Confirm error reporting, privacy-safe logs, alert thresholds and a runbook. Avoid logging tokens, exact location or photo content.

## P2 — medium priority / follow-up

- `README.md` remains the default Vite template; `docs/KNOWN_ISSUES.md` includes stale photo-limit and bundle figures. Refresh owner-facing operating docs.
- `package.json` version is `0.0.0`; define release/versioning and rollback procedure.
- Native Android wrapper is present but cannot be built here without Android SDK; no iOS project is present (Windows constraint). Keep native launch claims out of release status until verified.
- Offline app shell and service-worker update path are structurally present, but no real offline install/update matrix was exercised. SW uses same-origin static assets and avoids API/cross-origin caching; do not broaden caching casually.
- Map uses OpenStreetMap standard tiles with attribution. No offline bulk download observed. OSM tile service has no SLA and requires compliant caching; capacity/availability planning is needed for scale.
- Weather uses direct Open-Meteo requests with coordinates, a five-minute in-memory cache and 12-second timeout. UI has attribution/heuristic wording. Owner should confirm intended non-commercial/commercial use and usage limits before scaling.
- Two equivalent map routes (`/map`, `/journal/map`) exist; no dedicated search route found in the route inventory. Confirm this matches intended product navigation.

## Product and route inventory reviewed

App routes include `/`, `/login`, `/onboarding`, `/journal`, `/journal/calendar`, `/journal/map`, `/challenges`, `/achievements`, `/levels`, `/streak`, `/fish-activity`, `/species/:speciesKey/mastery`, `/species/:speciesKey`, `/album`, `/map`, `/add`, `/catch/:id/reward`, `/catch/:id/share`, `/catch/:id`, `/catch/:id/edit`, `/gallery`, `/stats`, `/profile`, `/privacy`, `/settings`, `/notifications`, `/insights`, `/season-story`, `/year-summary`, `/supporter`, `/trips`, `/trips/new`, `/trips/:id`, `/trips/:id/edit`, `/waters`, `/waters/new`, `/waters/:waterId/edit`, `/waters/:waterId`, `/waters/:waterId/chat`, `/hotspots`, `/community`, `/community/catch/:catchId`, `/community/:postId/report`, `/nearby`, `/crew`, and a wildcard Not Found route. Global route protection is present except public landing/login. Production checks returned SPA HTTP 200 for representative routes; this does not prove each page renders successfully after authenticated navigation.

Product catalog validation found zero errors. Configured challenge families include daily catch/species/trip, weekly species/water, and seasonal winter/spring/summer/autumn. Autumn offers carp, predator and salmonid/other paths. Achievement catalog contains 20 configured IDs across first catch/trophy/volume/species/waters/season/streak/night/long trip. Supporter feature flag is OFF and no live payment provider was found in audited scope. Product details/conditions/rewards are documented in `docs/PRODUCT_CATALOG.generated.md`.

## Data lifecycle and security review

- Catch, trip and water synchronization uses owner-scoped records, envelopes, replay/idempotency, tombstones and conflict handling; local sync emulator tests pass.
- Firestore rules locally enforce owner checks, schema constraints and default deny. Photo references allow the new four-photo limit while retaining legacy >4 references. Photo binaries are not stored in Firestore.
- Cloudinary endpoints present: `/api/cloudinary/capability`, `/sign`, `/verify-upload`, `/delivery`, `/delete`, `/metadata`. Build-time client secret scan passed. Owner checks/input validation/rate limits were found in reviewed endpoints. This does not substitute for production auth/rules verification or a live transfer test.
- `npm run test:photos` validates local binary/metadata contract only. No real authenticated cross-device Cloudinary upload/download/recovery was performed. Do not treat it as physical production sync proof.
- Service worker is generated by Vite, registered in production and excluded in native Capacitor environment. It precaches build output; same-origin navigation uses network-first/offline fallback; non-GET and cross-origin/API requests bypass static cache.
- Secret checks: tracked environment example only; `.env.local` absent; Cloudinary build scan passed; safe reachable-history filename/private-key pattern scan found no matches. `gitleaks` executable was unavailable, so this is not a comprehensive secret scan. No credentials or secret values were printed.

## Verification performed

Runtime: Node `v22.20.0`, npm `10.9.3`, Java `21.0.12`.

| Check | Result | Notes |
|---|---|---|
| `npm run lint` | PASS | |
| `npm test` | PASS | 598 tests, 0 failed |
| `npm run build` | PASS | large chunk warnings; client secret scan passed |
| `npm run test:rules` | PASS | 11 local Firebase emulator tests |
| `npm run test:auth` | PASS | local auth emulator flows incl. login/session/logout/isolation |
| `npm run test:sync` | PASS | local authenticated Catch/Trip/Water, photos metadata, replay/delta/idempotency/tombstones/conflicts/outbox |
| `npm run test:photos` | PASS | local photo binary/metadata contract; not device E2E |
| Product config validation | PASS | 0 errors |
| `git diff --check` | PASS before report | report whitespace checked separately |
| `npm audit --omit=dev` | WARN/FAIL gate | 2 moderate React Router advisories |
| Full `npm audit` | WARN | 9 moderate findings, no high/critical in output |
| Vercel production | PASS | current deployment READY; no deployment made |
| Production HTTP | PASS with limits | `/`, `/login`, `/journal`, `/add`, `/gallery`, `/waters`, `/trips`, `/challenges`, `/notifications`, `/stats`, `/profile`, `/settings`, `/sw.js`, manifest returned 200 |
| Cloudinary capability | PASS | production endpoint 200, enabled; capability only, no upload performed |
| Progression claim GET | EXPECTED | 405, endpoint is not a GET resource |
| Browser smoke | PARTIAL | production login UI rendered; no account login or full route/console matrix |
| Responsive screenshots | NOT RUN | required viewport matrix was not completed |
| iPhone/Android physical | NOT RUN | no physical-device session; Android SDK absent |
| Deployed Firestore rules | UNVERIFIED | local rules tests only; no deploy/read performed |

## Recommended next work, in order

1. Close the four P0 blockers: complete deletion/export; clear all local stores; approve/publish privacy/terms/contact; verify deployed Firebase rules/Auth/IAM/indexes in `chutnucz`.
2. Prevent client-influenced progression baselines from becoming authoritative; document legacy XP migration and test tampered multi-device reconciliation.
3. Make feature flags real gates or rename/document them as presentation flags; verify each API independently.
4. Define complete backup scope and round-trip tests for waters, drafts and preferences.
5. Either implement authenticated server push delivery or ensure UI says subscription is only a foundation and does not promise delivery.
6. Confirm Waters product promise; add authoritative source/import pipeline if an official directory is expected.
7. Add operational limits, monitoring and cleanup for photo assets/progression; establish privacy-safe incident runbooks.
8. Address CSP/frame protection, dependency advisories and mobile bundle/precache weight.
9. Complete authenticated visual/responsive QA at 390×844, 430×932, 1366×768 and physical iPhone Home Screen / Android workflows.
10. Repeat release gate against the verified production configuration and actual supported devices.

## Final decision

**BLOCKED — NOT READY FOR PRODUCTION RELEASE.** Automated code checks and the public web smoke passed, but user data lifecycle/privacy and production Firebase configuration remain release blockers. Production photo transport, authenticated routes, full visual matrix and physical-device behavior are not proven. No fixes, commits, pushes, deploys, rules changes, or production data changes were made.

## References

- Firebase Security Rules and server Admin SDK boundary: https://firebase.google.com/docs/firestore/security/rules-conditions
- Open-Meteo terms: https://open-meteo.com/en/terms
- Open-Meteo API/pricing limits: https://open-meteo.com/en/pricing
- OpenStreetMap tile usage policy: https://operations.osmfoundation.org/policies/tiles/
- WebKit Web Push / Home Screen web apps: https://webkit.org/blog/13878/
