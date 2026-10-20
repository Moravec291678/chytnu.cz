# ChytnuCz — functional repair report

Date: 2026-10-19

## Completed repairs

- Added explicit guest and account data scopes and enforced them in Catch, Trip, outbox, sync, backup, privacy and progression access.
- Migrated IndexedDB to version 5 without assigning legacy ownerless records to a signed-in account.
- Added explicit guest-to-account import; sign-in alone never claims guest data.
- Added stale-result guards so account switching cannot render results loaded for the previous scope.
- Added a central privacy model with private defaults, photo visibility, location precision, private-spot override and separate nearby/heatmap opt-ins.
- Restricted the public catch projection to an allowlist. It excludes internal account IDs, exact coordinates, notes, private Storage paths and photo bytes.
- Added persistent scoped privacy settings and the `/privacy` screen.
- Added a persistent, deterministic and idempotent local progression event ledger for catch creation, photo/context tiers and first species.
- Extended backup/restore to include scoped privacy and immutable progression events while keeping legacy backups readable. Restore remains a single IndexedDB transaction and always targets an explicit guest scope.
- Updated the share card to render the catch photo as the background with a dark overlay and thumbnail, with a branded no-photo fallback. Web Share receives the rendered PNG when supported.
- Kept unfinished public/social features behind disabled feature flags.

## Verification

- ESLint: passed.
- Unit suite: passed, 161/161.
- Production Vite build: passed and generated `dist/sw.js`.
- Auth Emulator: passed registration/login/verification/reset/session/sign-out/isolation scenarios.
- Firestore rules, sync and photo emulator suites: blocked before execution because the installed Java runtime is 8 and the installed Firebase Tools requires Java 21 or newer.
- `git diff --check`: passed; Git reported line-ending conversion notices only.
- Browser QA: Home at 390 px, Journal at 430 px, Add Catch at 487 px, Profile at 1280 px, and Privacy at 390 px rendered without a blank screen or horizontal-overflow regression. The privacy checkbox layout was corrected and rechecked visually.

## Known limitations

- The progression ledger is local only and is not yet a Firestore create-only entity. Several progression screens still calculate totals from current records, so the ledger is not yet the sole UI source of truth.
- Per-catch privacy controls are represented in the model but are not exposed in the catch editor. Current records therefore remain safely private by default.
- Rules/sync/photo emulator evidence must be rerun on Java 21+.
- Real-device photo picker, camera, GPS permissions, Web Share target, offline install and iOS/Android standalone-mode behavior remain unverified.
- Waters, community, nearby, heatmaps, chat, comments, reactions, friends and crew remain disabled until their backend, moderation and aggregate privacy requirements exist.
- Dedicated insights, season story, year summary, notifications, Supporter and onboarding reference screens are not implemented.

## Release assessment

The local journal MVP foundation is materially safer and its automated local checks pass. The repository is not ready for a public release because production Firebase configuration/rules evidence, Java 21 emulator verification, device QA, progression cloud semantics and the explicit remaining reference screens are incomplete. No production deployment was performed.

## Recovery completion addendum — 2026-10-19

- Recovered the Vite build failure in `src/pages/AddCatchPage.jsx`: the full-record notes and per-catch privacy sections were adjacent JSX siblings inside one conditional. Wrapped both in a fragment and retained all privacy controls.
- Corrected the ledger's GPS/weather tier check to use the same recorded-weather predicate as the shared progression calculator. A moon phase alone no longer counts as weather; a regression test covers this case.
- Reward pages now claim the new ledger event IDs from the save navigation state once per browser session. Direct URLs and history/reload re-entry do not present previously claimed XP as newly earned; the ledger total remains unchanged.
- Resolved the current ESLint failures in Hotspots, Streak and the three local Water screens. Water favorite-save errors now appear in the UI instead of being silently swallowed.
- Scoped local water-chat reads to the active `scopeKey`, preserving guest/account isolation. The chat composer stays disabled until the selected water is loaded and is unavailable for a missing or out-of-scope water.
- Browser smoke checks visited Home, Add Catch validation/full form, Journal, Calendar, Map, Trips, Stats, Profile, Privacy and invalid Catch/Reward routes. Empty and not-found states rendered; no catch was created during manual QA.
- Final local verification for this addendum: ESLint passed; `npm test` passed 170/170; `npm run build` passed and generated `dist/sw.js`.
