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

- Authenticated synthetic account A: navigated 47 route paths at the browser's effective 400 px width without page exceptions or persistent loading states. The synthetic `/community/post/audit-post` URL had no fixture and no heading; a real post-detail screen remains unverified. Created a synthetic Catch and Trip, linked them, verified Journal, Catch detail, Statistics, Rewards and Trips, then removed both records.
- Guest responsive browser matrix: 47 routes × 10 widths (320, 360, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px) = 470 checks. No horizontal overflow or persistent loading screen was observed. This matrix was guest-only.
- Confirmed and fixed a 0 px separation between the Home fish-activity detail link and action button at desktop width. The existing compact flex action row now owns both controls; the SSR regression test verifies the shared row and order.
- Browser `/api/social` and `/api/progression/reconcile` requests returned 404 because Vite does not host this repository's Vercel serverless functions. This is a local harness limitation; it does not establish a production backend failure. Authenticated browser social/API flows remain unverified.
- No confirmed privacy leak was identified in this wave. Physical iOS/Android testing remains **MANUAL TEST REQUIRED**.
- Latest validation: unit tests 1,165/1,165, lint, build, `git diff --check`, and the 131-check Stage 8 social Auth/Firestore emulator suite passed.
- Changes are local and unpushed. Continue with a Vercel-compatible local API/emulator harness for authenticated social browser scenarios, then proceed through remaining unverified modules. Do not deploy or start Stage 9.

## 2026-11-19 — AI scope, privacy defaults, and local API safety

Overall audit: **PARTIAL**. Stage 8 remains **PASS** based on its previously recorded emulator evidence. No Stage 9, push, merge, or deployment was performed.

### Verified changes

- Fixed production AI capability policy to retain only user-triggered fishing-story drafts and diary-derived recommendations. Species recognition and standalone diary explanations are disabled; Home insights remain deterministic/local. Old Home AI cache fields are removed without discarding the local insight selection.
- New social posts default to public only in the composer, with an explicit checkbox gating submission. New profile settings default the top-level profile to public while keeping all sections private and discovery disabled; switching a profile/section to public requires confirmation. Server defaults and existing data remain private-first.
- Moved the JPEG metadata rewriter to shared media code so social/admin image paths do not depend on AI modules.
- Local social Vite harness now restores the prior emulator `adminConfig/social` value when it closes; restoration and first-time cleanup have 2 unit tests.

### Test and browser evidence

- `npm test` 1,156/1,156 PASS; lint, build, client secret scan, product inventory, local-only photo test, local API restoration test and `git diff --check` PASS.
- Build still reports existing large chunks; no new performance claim is made.
- Community composer consent behavior was exercised with a synthetic draft and not submitted. `/community` and `/profile/social` showed no horizontal overflow across measured widths 320–1920 px; browser width quantization yielded 1023/1025 instead of exactly 1024 for these authenticated screens.
- Existing guest route matrix and prior synthetic Catch/Trip checks remain as recorded above; this checkpoint did not increase route-count claims.
- Rules/Auth/Sync emulator suites were not re-run because the configured ports were already occupied by the existing local app/emulators. They were not stopped to avoid disturbing the running session. Prior Stage 8 social emulator evidence (131 checks) is historical, not a fresh result.
- Local Vite `api/progression/reconcile` 404 and a later profile API 401 were observed. They are local harness/session limitations; they do not prove production failure. No authenticated profile save or public post was made.

### Findings and residual risk

- No new exploitable vulnerability was confirmed.
- The public checkbox is a client-side consent gate; the API stores the requested visibility but does not persist a separate consent receipt. Assess whether a durable consent record is required before any public release.
- Authenticated API flows, social emulator suites, exact 1024 px authenticated rendering, physical mobile devices and installed-PWA behavior remain unverified. Device checks are **MANUAL TEST REQUIRED**.
- The strategic MVP still excludes social networking and AI. This audit change does not authorize either feature for production release.
