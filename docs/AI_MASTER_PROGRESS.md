# AI master progress

Updated for the resumed full-application audit on `codex/ui-terminology-length-priority`.

## Current state

- Stage 8/18 implementation: **PASS**.
- Overall application audit: **PARTIAL**.
- No Stage 9 work has started.
- Main has been released to the production preview of the prior request only; future audit changes remain on the development branch until explicitly released.
- Baseline on 2026-11-19: lint PASS, 1,161 unit tests PASS, build PASS, production audit 0 advisories.
- Security review: no confirmed exploitable vulnerability found in the reviewed scope.
- Mixed static/dynamic import for `PublicFishingProfile` was corrected.
- Account deletion now recursively removes owned social post comment and reaction subcollections; the fix passed focused unit and emulator coverage.
- Journal sort options are now unique and shared by UI/test code; 7 focused journal tests pass.
- Gallery reset now clears search and structured filters without changing sort; 37 focused catch/gallery tests pass.
- Trips, RIS waters and species/trophy flows passed 73 focused tests.
- Social, settings, privacy and sync audit passed 215 focused unit tests plus Auth/Sync/Photos/Rules emulator suites.
- Final complete unit suite increased to 1,164 passed tests.
- Safe-stop WIP commit `61f9e2c46fe122a4c96194e919c6a13c6617fb3a` is pushed to the development branch; the follow-up documentation update is pushed as well.
- Use `git log -1 --format=%H` to identify the current branch head before resuming.

## Completed

- Reorganized the profile page into clearer, related sections.
- Fixed the unauthenticated community composer crash and added a regression test.
- Added Cloudinary API denial for suspended accounts, alongside the existing account-deletion fence.
- Updated React Router to patched v7.18.6 and aligned Vite SSR imports/tests.
- Updated Firebase Admin to 14.5.1 and the compatible Firestore client to 9.4.1.
- Re-ran the Stage 8 Auth/Firestore emulator suite, including repository cleanup and interaction/moderation scenarios.

## Validation at stop

- Unit tests: 1,161 passed.
- Lint and production build: passed; Cloudinary client-secret scan passed.
- Rules/social emulators, Auth emulator, sync emulator, and photo-sync checks: passed.
- Product inventory and `git diff --check`: passed.
- Production dependency audit: 0 advisories. Full audit: 14 moderate development-tool advisories remain; no high or critical advisories.

Emulator metadata lookup emitted non-fatal `ETIMEDOUT`/`ENOTFOUND` warnings. The Firebase CLI force-fix suggestion would downgrade to 13.11.2 and was not applied.

## Continue tomorrow

1. Continue the broad application audit; record it as PARTIAL until the remaining modules and browser smoke checks are complete.
2. Resume from `docs/PROJECT_AUDIT.md`, `docs/KNOWN_ISSUES.md`, `docs/ROADMAP.md` and `docs/AI_HANDOFF.md`.
3. Review compatible fixes for the Firebase CLI development dependency advisories without forcing a downgrade.
4. Complete emulator and authenticated browser smoke checks.
5. Do not start Stage 9 or deploy to production.

## Latest audit checkpoint — 2026-11-19

- Authenticated local browser QA used a synthetic account. Navigated 47 route paths at 400 px without page exceptions or persistent loading states. The synthetic `/community/post/audit-post` URL had no fixture and no heading; a real post-detail screen remains unverified.
- A synthetic Catch and Trip were created, linked and inspected through Journal, Catch detail, Statistics, Rewards and Trips. Both records were deleted afterward.
- Guest responsive matrix: 47 routes at 320, 360, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px (470 route/width checks), with no horizontal overflow or persistent loading state.
- Fixed the Home fish-activity inactive-state actions touching at desktop width by reusing the compact flex action row; added an SSR regression test.
- Stabilized a photo upload test that incorrectly required parallel uploads to complete in a fixed order. The exact expected photo IDs remain asserted.
- Latest validation: `npm test` 1,165/1,165 PASS; lint, build and `git diff --check` PASS; the Stage 8 social Auth/Firestore emulator suite passed 131 checks.
- Browser limitation: Vite does not serve the Vercel `/api/*` functions. Social/progression browser requests returned local 404s; authenticated browser testing of those API-backed interactions remains unverified.
- This checkpoint is committed locally and unpushed; overall audit remains PARTIAL. No production deployment or Stage 9 work was performed.

## Current checkpoint — 2026-11-19

- Audit remains **PARTIAL**; Stage 8 remains **PASS** from previously documented evidence.
- Branch `codex/ui-terminology-length-priority`, base HEAD `fc86517032629e351a4dff49dec11b3749707102`; current work was not yet committed at checkpoint creation.
- Restricted AI to optional story drafts and diary recommendations; disabled species recognition, standalone diary AI explanations and Home AI requests. Legacy Home AI cache is cleared while local insight state is preserved.
- New social posts have a public form default but cannot submit before confirmation. New profile defaults are public at the top level only; sections and discoverability remain private/off. Historical documents/data are not migrated and server defaults remain private-first.
- Local Vite social harness restores its previous emulator configuration on close.
- Validation: 1,156 unit tests, lint, build and client secret scan, product inventory, local-only photos, two local harness tests, and diff check passed. Build has existing large-chunk warnings.
- Rules/Auth/Sync emulator tests were not re-run because existing app/emulator processes occupied configured ports 5174/9099/8080. Processes were left running. Previously recorded 131 Stage 8 social checks are historical.
- Authenticated composer consent was checked without submitting; two social/profile views had no overflow at measured widths from 320 to 1920 px. The browser could not realize exactly 1024 px. Local `/api/progression/reconcile` 404 and a later profile 401 were not treated as production results.
- No production user data, credentials, push, merge, Stage 9, or deployment was used.
- Next: rerun emulator suites when safely available, decide if public consent must be persisted server-side, continue remaining authenticated module/browser audit, then record the local commit SHA here and in `AI_HANDOFF.md`.
