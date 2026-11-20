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
- Changes are local and unpushed. WIP code checkpoint: `cee56ccff78573e00610ce718f4ba4514de3a2df`. Continue through remaining unverified modules; do not deploy or start Stage 9.

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

## Takeover review — 2026-11-19

Reviewed local changes against main and retained earlier Journal/Gallery/Home/account-deletion fixes. Found and fixed: UI-only publication consent; stale-device public-mode restoration; pending photo approval crossing revocation epochs; automatic-publication starvation behind the newest ten catches; local-only misleading profile visibility; Vite restart deleting the new Firebase Admin app; stale offline shell selection and caching error responses. Direct private Firestore access remains denied; publication does not grant XP. No rules/index changes required.

Audit remains PARTIAL: real installed iPhone/Android, offline browser startup and complete authenticated route/visual matrix are not verified. The integrated browser showed an empty offline reopening; a reliable independent Chrome check was prevented when computer-use stopped because it could not determine the browser URL. Do not label this a successful offline/PWA test or infer a confirmed production cause.

## Social stage 9 update — 2026-11-19

Stage 9 in-app social notifications passed local unit, Rules and Auth/Firestore emulator verification. Notices are server-created for friendship transitions, first reactions, new comments and moderation; recipients control synchronized event preferences. Firestore Rules allow only owner reads/writes to the validated preference record and disallow client creation of social notices. Inbox snapshots are bounded to 250 records. Optional server-side browser push delivery remains unimplemented. This checkpoint is not yet released to production; production Firebase project configuration is absent from this checkout.

Stage 9 release follow-up: code commit `1a83e11fbdb2cd9d513af119fec8ecd0582c8cd4` was pushed to `main`; Vercel production READY at that SHA and live Home returned HTTP 200. Verified Vercel project environment names are present without printing values. Firebase project `chutnucz` was identified as ChytnuCz and received only the passing Firestore Rules deployment. No indexes or paid services were changed. Mobile/physical-device verification and server-side browser push delivery remain unverified/inactive.

## Zpráva o kvalitě ChytnuCz · 20. listopadu 2026

**PARTIAL.** Webové opravy prošly lokálním ověřením. Úplná kvalifikace aplikace a nativní vydání zůstávají otevřené.

- **Architektura a data.** Zachovány React/Vite, Firebase, Vercel, Cloudinary a stávající lokální úložiště. Vydání nevyžaduje migraci, změny Firebase Rules ani indexů. Přístup k soukromým datům ověřily existující Rules, Auth a Sync sady v emulátoru. Žádné nové veřejné sociální ani externí AI funkce se v tomto milníku neaktivují.
- **Funkce a UX.** Opraven stav aktivní sekce u vnořených tras a přidány odkazy na Tipy a rady z deníku, Příběh sezóny a Roční souhrn. Lokální analýza používá doložený název metody, když ho má k dispozici. Zachovány původní adresy a vstupní body.
- **PWA a výkon.** Pět neexistujících assetů blokovalo instalaci service workeru. Build nyní validuje všechny odkazy a uchovává HTML pro odpovídající sadu assetů. Chromium po odpojení serveru načetlo Deník, Quick Catch i Galerii a po ukončení a novém spuštění procesu obnovilo offline uložený detail s fotografií. Vite nadále hlásí velké chunky. Měření výkonu na fyzických zařízeních a audity všech živých toků jsou otevřené.
- **Ověření.** 1 184 jednotkových testů, lint, build, product a Git kontrola prošly. Předchozí průchod Rules, Auth, Sync a Photos na témž základu prošel. Závěrečný rozdíl tvoří lokální analýza, Deník a dokumentace. Produkční závislosti měly při kontrole npm audit nula nálezů. V Chromiu prošlo 180 kombinací trasy a šířky, šest offline navigací, tři odkazy z Deníku a obnovení fotografie po restartu.
- **Git a nasazení.** Větev codex/chytnu-release-continuation vyšla z 6587d45. Milníky 81406e2, 951ac12 a 0fe9d8a byly odeslány na main. Vercel pro 0fe9d8a potvrdil produkční stav READY. Na tento milník navazuje commit s Deníkem a touto zprávou. Původní worktree uchovává 27 rozpracovaných souborů.
- **Android a iOS.** Deklarace kamery a polohy odpovídají stávajícím nativním tokům. Android target/compile SDK 36. Pro nativní ověření je potřeba Android SDK a na Macu Xcode 26 nebo novější s iOS 26 SDK. Zůstávají podpisy, reálné kamery, GPS, HEIC, safe areas, testovací balíčky a ověření na fyzických zařízeních. [Google Play](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-en) · [Apple](https://developer.apple.com/news/upcoming-requirements/?id=02032026a).

**Před úplnou akceptací** projít všechny přihlášené uživatelské toky na zařízení, instalovanou PWA na Androidu a iPhonu a živé Cloudinary sdílení s testovacím účtem a snímkem. Tento průchod zahrnoval hostovskou matici v Chromiu a samostatnou bezpečnostní verifikaci přes emulátor. Fyzická zařízení a podepsané buildy nebyly k dispozici.

### Následné ověření vydání

Vercel produkce potvrdila READY pro 65b7f623f6d9dee1dd9ebccb574173aac2ce0c6e. Domů, Deník a service worker vrátily HTTP 200. Na lokálním Vite serveru se skutečným Firebase Auth emulátorem se přihlásil syntetický ověřený účet, dokončil onboarding bez požadavku na GPS a prošel navigaci 14 tras při deseti šířkách. 140 kontrol trasy, aktivní sekce a vodorovného přetečení prošlo. Kompletní přihlášené transakční toky a fyzická zařízení zůstávají mimo tuto matici.
