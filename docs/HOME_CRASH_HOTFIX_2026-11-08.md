# Home startup hotfix — 2026-11-08

Regression introduced in b304a10, present in production 65e64a7:
`TypeError: Cannot read properties of null (reading 'ownerId')` at
`usableHomeAiResult`, homeInsightCache.js:16, called by HomeInsightCard before
its asynchronous IndexedDB cache load. A signed-in owner makes the first
condition truthy; guest rendering short-circuited and concealed the defect.
This is independent of catch count, provider availability, phone or PWA mode.

Reproduced in a real browser with the actual React component and a synthetic
account scope. The regression test failed with the identical exception before
the fix. Absent cache now returns false. A local error boundary isolates optional
Home analysis failures without changing records, consent, storage or sync.

Validation:
- Cache regression test covers null, undefined and incomplete states for guest
  and signed-in owners. Actual component first-render test covers empty,
  legacy and pending Quick Catch diaries under both scopes, plus boundary fallback.
- Browser: synthetic signed-in Firebase emulator login, Home, session reload,
  AI consent settings with unavailable API; separate component fixtures for
  legacy and pending Quick Catch; forced optional-card error leaves sibling UI.
- Built app: guest Home with existing local data, Journal, Catch Detail, Settings.
- Mobile signed-in Home checked at 390 × 844.
- Full quality gate: lint, 939 unit/render tests, build, sync, photos, rules
  (15 tests), auth, product and diff whitespace check.

No production data or Cloudflare inference used. No IndexedDB/localStorage
clearing, queue reset, service-worker removal, schema or Firebase rule change.
Physical iPhone and installed PWA remain unverified. A stopped-preview-server
cache-start attempt produced an empty root in the automation browser; this
does not establish successful offline startup and remains unresolved here.
Production authenticated owner-account acceptance requires David's session;
the automated signed-in startup uses only an isolated emulator test account.
