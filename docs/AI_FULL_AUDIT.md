# Full application audit checkpoint

## Status

**PARTIAL — the application-wide audit is not complete.** This checkpoint records verified findings and changes only. Stage 8/18 remains **PASS**; no Stage 9 work has started.

## Git checkpoint

- Safe-stop WIP commit: `61f9e2c46fe122a4c96194e919c6a13c6617fb3a`.
- The commit and follow-up documentation update are pushed to `origin/codex/ui-terminology-length-priority`.
- The current branch head is discoverable with `git log -1 --format=%H`.

## Verified and fixed

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
- `npm run build`: passed; client secret scan passed for 160 assets. Existing mixed static/dynamic import and large chunk warnings remain.
- `npm run test:rules`: passed, including the 44-check social repository suite and 131-check social interaction suite.
- `npm run test:auth`: passed.
- `npm run test:sync`: passed.
- `npm run test:photos`: passed.
- `npm run product`: passed.
- `git diff --check`: passed after documentation edits and before commits.

Firebase emulators emitted non-fatal metadata lookup warnings (`ETIMEDOUT`/`ENOTFOUND`); all listed emulator commands exited successfully.

## Remaining audit work

1. Continue review of application modules and user-facing routes; do not treat this checkpoint as a complete audit.
2. Run browser smoke checks after the React Router v7 upgrade.
3. Find a compatible resolution for the 14 development-tool advisories without a forced Firebase CLI downgrade.
4. Reconcile any further evidence with existing audit documents and tests.
5. Do not start Stage 9 or deploy to production without explicit approval.
