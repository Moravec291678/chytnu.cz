# Full application audit checkpoint

## Status

**PARTIAL — the application-wide audit is not complete.** This checkpoint records verified findings and changes only. Stage 8/18 remains **PASS**; no Stage 9 work has started.

## Git checkpoint

- Safe-stop WIP commit: `61f9e2c46fe122a4c96194e919c6a13c6617fb3a`.
- The commit and follow-up documentation update are pushed to `origin/codex/ui-terminology-length-priority`.
- The current branch head is discoverable with `git log -1 --format=%H`.

## Verified and fixed

- Baseline lint, 1,161 unit tests and build pass on 2026-11-19.
- Baseline guest browser smoke passed for `/`, `/journal`, `/add`, `/trips`, `/profile`, `/settings`, `/community`, `/waters`, `/stats` and `/gallery` with guest confirmation and no horizontal overflow.
- Security review found no confirmed exploitable vulnerability in the reviewed application scope.
- Mixed static/dynamic import of `PublicFishingProfile` was removed to reduce build ambiguity.
- 2026-11-19 account-deletion fix: owned `socialPosts` documents recursively delete comments and reactions. Other users' posts remain. Verified with focused account-deletion unit cases and the 131-check social interaction emulator suite.
- 2026-11-19 journal audit fix: duplicate `longest` sort option removed and all sort keys centralized in `JOURNAL_SORTS`; 7 focused journal tests PASS.
- 2026-11-19 gallery audit fix: active filter reset now clears text search and all panel criteria without resetting sort; 37 focused catch/gallery tests PASS.
- 2026-11-19 trips/waters/species audit: 15 trip tests, 38 water/RIS tests and 20 species/trophy tests PASS.
- 2026-11-19 social/settings/sync audit: 129 social unit tests, 86 notification/privacy/settings/sync unit tests, Auth/Sync/Photos emulators and the complete rules emulator suite PASS.
- Final complete unit suite: 1,164/1,164 PASS.
- Guest access to `/community` could dereference an absent action state. The busy flag now requires an authenticated UID, with an SSR regression test.
- The production Cloudinary API checked `accountDeletions/{uid}` but did not check `accountSuspensions/{uid}`. It now checks both markers and responds with HTTP 403 before attempting photo access. Regression tests verify neither blocked state reads photo data.
- The profile layout was consolidated into clearer, related sections.
- React Router 6 had moderate security advisories. The app now uses patched v7.18.6; the Vite alias and SSR test updates keep existing routing behavior compatible.
- Firebase Admin and its Firestore client were updated to compatible patched releases (14.5.1 and 9.4.1).

## Security and dependency state

- `npm audit --omit=dev`: **0 vulnerabilities** after dependency updates.
- Full `npm audit`: **14 moderate advisories** remain in the Firebase CLI/development dependency tree; there are no high or critical advisories.
- The reported force-fix would replace Firebase CLI 15.34.0 with 13.11.2. This breaking downgrade was not applied; investigate a compatible upstream fix before changing emulator tooling.
- Stage 8 emulator verification passed for Auth/Firestore rules, visibility, ownership, interaction counters, moderation, deletion cleanup, and private-data boundaries. This does not constitute a complete application-wide security review.
- No production deployment, merge, or production Firebase change was performed.

## Test evidence

- `npm test`: 1,161 passed, 0 failed.
- `npm run lint`: passed.
- `npm run build`: passed; client secret scan passed for 160 assets. The mixed static/dynamic `PublicFishingProfile` warning was removed; large HEIC/Leaflet/main chunks remain as performance warnings.
- `npm run test:rules`: passed, including the 44-check social repository suite and 131-check social interaction suite.
- `npm run test:auth`: passed.
- `npm run test:sync`: passed.
- `npm run test:photos`: passed.
- `npm run product`: passed.
- `git diff --check`: passed after documentation edits and before commits.

Firebase emulators emitted non-fatal metadata lookup warnings (`ETIMEDOUT`/`ENOTFOUND`); all listed emulator commands exited successfully.

## Remaining audit work

1. Continue review of application modules and user-facing routes; do not treat this checkpoint as a complete audit.
2. Authenticated browser smoke remains unverified; account-specific behavior must not be inferred from guest smoke.
3. Find a compatible resolution for the 14 development-tool advisories without a forced Firebase CLI downgrade.
4. Reconcile any further evidence with existing audit documents and tests.
5. Do not start Stage 9 or deploy to production without explicit approval.

## 2026-11-19 — authenticated and responsive browser QA checkpoint

Status remains **PARTIAL**. This wave did not start Stage 9 or change the overall visual identity.

- Authenticated synthetic account A: 47 routes rendered at the browser's effective 400 px width without page exceptions or persistent loading states. Created a synthetic Catch and Trip, linked them, verified Journal, Catch detail, Statistics, Rewards and Trips, then removed both records.
- Guest responsive browser matrix: 47 routes × 10 widths (320, 360, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px) = 470 checks. No horizontal overflow or persistent loading screen was observed. This matrix was guest-only.
- Confirmed and fixed a 0 px separation between the Home fish-activity detail link and action button at desktop width. The existing compact flex action row now owns both controls; the SSR regression test verifies the shared row and order.
- Browser `/api/social` and `/api/progression/reconcile` requests returned 404 because Vite does not host this repository's Vercel serverless functions. This is a local harness limitation; it does not establish a production backend failure. Authenticated browser social/API flows remain unverified.
- No confirmed privacy leak was identified in this wave. Physical iOS/Android testing remains **MANUAL TEST REQUIRED**.
- Latest validation: unit tests 1,165/1,165, lint, build, `git diff --check`, and the 131-check Stage 8 social Auth/Firestore emulator suite passed.
- Changes are local and unpushed. Continue with a Vercel-compatible local API/emulator harness for authenticated social browser scenarios, then proceed through remaining unverified modules. Do not deploy or start Stage 9.
