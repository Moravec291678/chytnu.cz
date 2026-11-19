# AI handoff — safe stop and audit checkpoint

## Status

- **Stage 8/18: PASS.** The Stage 8 implementation remains complete; the real Auth/Firestore emulator suite passed again, including repository cleanup and six-account interactions.
- **Overall application audit: PARTIAL.** No Stage 9 work was started. This checkpoint does not authorize production deployment, merge, or changes to `main`.

## Resumed audit checkpoint

- 2026-11-19 baseline: lint PASS, unit tests 1,161/1,161 PASS, build PASS.
- Guest browser route smoke passed for the main MVP and community routes; authenticated account flows remain unverified.
- Security review found no confirmed exploitable vulnerability.
- Removed the mixed static/dynamic `PublicFishingProfile` import; build verification passed and the mixed-import warning is gone.
- Fixed account deletion so owned social posts recursively remove comments and reactions while preserving other owners' posts.
- Fixed the duplicate journal sort option and centralized the sort list.
- Fixed gallery filter reset so text and structured filters both clear without changing sort.
- Completed continuing audit waves for trips, waters/RIS, species/progression, social interactions and settings/sync.
- Final unit suite: 1,164/1,164 PASS; lint/build/product checks PASS.
- `npm run test:auth`, `npm run test:sync`, `npm run test:photos` and `npm run test:rules` were rerun for the resume checkpoint; suites passed when run without emulator-instance overlap.

## Git checkpoint

- Branch: `codex/ui-terminology-length-priority`
- Base before this safe-stop checkpoint: `4efa902`
- Safe-stop WIP commit: `61f9e2c46fe122a4c96194e919c6a13c6617fb3a`.
- Push: verified on `origin/codex/ui-terminology-length-priority`; the remote ref matches the safe-stop commit. This document update is also pushed as a follow-up.
- Retrieve the latest branch `HEAD` with `git log -1 --format=%H`.

## Completed in this checkpoint

- Consolidated the profile page into clearer sections while preserving the previous profile work.
- Fixed the guest community composer null dereference and added a regression test.
- Fixed Cloudinary photo API authorization so both account deletion and suspension markers deny access with HTTP 403 before photo access is read.
- Updated React Router to patched v7.18.6; added the Vite alias and adjusted SSR tests to use a consistent Router module.
- Updated Firebase Admin to 14.5.1 and its compatible Firestore client to 9.4.1.
- Confirmed `npm audit --omit=dev` reports zero production advisories. The full audit still reports 14 moderate advisories in the Firebase CLI/development dependency tree; the suggested forced downgrade to `firebase-tools@13.11.2` was not applied.

## Changed files

- `package.json`
- `package-lock.json`
- `vite.config.js`
- `src/features/admin/AdminDashboard.test.js`
- `src/features/catches/data/catchGallery.test.js`
- `src/features/home/components/HomeInsightCard.test.js`
- `src/features/social/components/CommunityEntryComposer.jsx`
- `src/features/social/components/SocialFeed.test.js`
- `src/features/trips/components/TripCatchMap.test.js`
- `src/pages/ProfilePage.jsx`
- `src/pages/ProfilePage.css`
- `src/server/cloudinaryApi.js`
- `src/server/cloudinaryApi.test.js`
- `docs/AI_MASTER_PROGRESS.md`
- `docs/AI_FULL_AUDIT.md`
- `docs/AI_HANDOFF.md`
- `src/app/App.jsx`
- `docs/PROJECT_AUDIT.md`
- `docs/PRODUCT_SCOPE_MVP.md`
- `docs/ARCHITECTURE_DECISION.md`
- `docs/KNOWN_ISSUES.md`
- `docs/ROADMAP.md`

## Validation

- `npm test` — 1,161 passed, 0 failed.
- `npm run lint` — passed.
- `npm run build` — passed; Cloudinary client-secret scan passed for 160 client assets.
- `npm run test:rules` — passed, including 44 repository checks and 131 social interaction checks with real emulator accounts.
- `npm run test:auth` — passed.
- `npm run test:sync` — passed.
- `npm run test:photos` — passed.
- `npm run product` — passed; generated inventory was unchanged.
- `npm audit --omit=dev` — 0 vulnerabilities; full `npm audit` — 14 moderate development-tool advisories, 0 high/critical.
- `git diff --check` — passed after documentation edits and before commits.

Firebase emulator runs emitted non-fatal metadata lookup warnings (`ETIMEDOUT`/`ENOTFOUND`); the emulator suites completed successfully. The production build still reports existing mixed-import and large-chunk warnings.

## Next session

1. Read this file, `docs/AI_MASTER_PROGRESS.md`, and `docs/AI_FULL_AUDIT.md`; confirm branch and latest commit before editing.
2. Continue the application audit as **PARTIAL**; do not begin Stage 9.
3. Review the 14 development-tool advisories and identify a compatible Firebase CLI dependency path; do not force-downgrade Firebase CLI.
4. Perform browser smoke checks after the Router v7 upgrade and continue the uncompleted route/module audit.
5. Keep production deployment, merge, and any push to `main` off-limits without explicit approval.

## Resumed browser QA checkpoint — 2026-11-19

Overall audit remains **PARTIAL**; Stage 8 remains **PASS**. No Stage 9, merge, push, or deployment was performed in this wave.

### Completed

- Authenticated the app with a synthetic Firebase Auth emulator account. Navigated 47 route paths at the browser's effective 400 px width; no page exception or persistent loading state was observed. The synthetic `/community/post/audit-post` URL had no fixture and no heading, so real post-detail behavior remains unverified.
- Created a synthetic Catch and Trip, linked them, checked Journal, Catch detail, Statistics, Rewards and Trips, then deleted both test records.
- Tested 47 guest routes at ten exact widths: 320, 360, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px (470 route/width checks). No horizontal overflow or persistent loading state was observed.
- Fixed the Home fish-activity inactive card's touching detail link and button by placing both in the existing responsive compact action row. Added an SSR regression test.
- Corrected a flaky photo upload test assertion to compare the exact photo IDs rather than relying on nondeterministic parallel completion order.

### Validation

- `npm test`: 1,165/1,165 PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS; existing large-chunk warnings remain.
- `git diff --check`: PASS.
- Photo cloud service tests: 39/39 PASS; fish-activity regression: 1/1 PASS.
- Stage 8 Auth/Firestore social emulator suite: 131 checks PASS across six synthetic accounts.

### Limitations and next steps

- The integrated browser remained at 400 px despite viewport requests; only the guest matrix has exact 320–1920 px coverage.
- Vite does not host Vercel serverless `/api/*` functions. Local social/progression browser requests returned 404; this harness limitation leaves authenticated social browser interactions unverified. Configure a safe Vercel-compatible local API/emulator harness, then exercise A/B/C visibility and mutations through direct API calls and the browser.
- Physical iOS/Android and installed-PWA service-worker behavior: **MANUAL TEST REQUIRED**.
- Continue the remaining module audit after API-backed browser coverage; preserve overall PARTIAL until verified. Do not start Stage 9 or deploy.

### Current checkpoint files

- `src/features/home/components/FishActivity.jsx`
- `src/features/home/components/FishActivity.test.js`
- `src/features/catches/data/photoCloudService.test.js`
- `docs/AI_MASTER_PROGRESS.md`
- `docs/AI_FULL_AUDIT.md`
- `docs/AI_VISUAL_QA.md`
- `docs/AI_TEST_EVIDENCE.md`
- `docs/AI_HANDOFF.md`

Implementation/test checkpoint commit: `eb1aa8d129d29aca943cbd331c04b20672628089` (local only). The documentation clarification is committed separately. Nothing has been pushed or deployed.

## Aktuální pokračování — 2026-11-19

Celkový audit zůstává **PARTIAL**. Stage 8 zůstává **PASS** podle dříve dokončených kontrol; tato práce nezačala Stage 9 ani nezměnila `main`, produkci nebo vzdálenou větev.

### Git a zachování práce

- Větev: `codex/ui-terminology-length-priority`.
- Základní HEAD před touto sadou změn: `fc86517032629e351a4dff49dec11b3749707102`.
- Pracovní strom obsahuje necommitnutou práci uvedenou níže; žádné změny nebyly zahozeny ani přepsány.
- Push, merge a produkční deployment: neprovedeny.

### Dokončeno

- Produkční AI capability jsou pevně omezené: povoleny zůstávají pouze dobrovolné `stories` a `recommendations`; `species` a samostatné `diary` vysvětlování jsou vypnuté. Automatické rozpoznávání, Home AI volání a jejich klientská UI integrace byly odstraněny. Historické výsledky AI na Home se při načtení lokální cache odstraní; ostatní lokální výběr postřehu zůstává.
- Nové příspěvky ve formuláři předvolí „Pro všechny“, ale odesílací tlačítko zůstane zakázané do výslovného potvrzení. Nový profil může mít veřejnou viditelnost; jeho sekce zůstávají soukromé, vyhledatelnost vypnutá a přechod do veřejného stavu vyžaduje potvrzení. Serverové výchozí hodnoty i uložená historická data zůstávají beze změny private-first; žádná migrace dat neproběhla.
- Lokální sociální Vite harness odmítá cloudové/pro produkční credentials a při zavření obnovuje předchozí `adminConfig/social`; přidány dva cílené testy obnovy.
- JPEG metadata helper byl přesunut do neutrální sdílené media vrstvy a nadále se používá pro sociální/admin fotografie.
- Composer byl v browseru ověřen se syntetickým textem: bez souhlasu je tlačítko zakázané, po potvrzení povolené, po odvolání opět zakázané. Příspěvek nebyl odeslán.

### Ověření tohoto checkpointu

- `npm test`: **1 156/1 156 PASS**.
- `npm run lint`: PASS.
- `npm run build`: PASS; klientský scan tajemství prošel pro 161 assetů. Zůstává upozornění na velké JS chunky (největší HEIC chunk).
- `npm run product`: PASS.
- `npm run test:photos`: PASS (local-only photo sync).
- `node --test tools/local-social-api-plugin.test.mjs`: **2/2 PASS**.
- `git diff --check`: PASS.
- `npm run test:rules`, `npm run test:auth` a `npm run test:sync` nebyly v tomto checkpointu spuštěny: existující browser a Auth/Firestore emulátory již používaly porty 5174, 9099 a 8080. Nebyly zastaveny ani přepsány. Historický výsledek Stage 8 sociálního emulator suite 131 checks PASS zůstává zaznamenán v předchozí části; není vydáván za nový běh.
- Browser responsive kontrola `/community` a `/profile/social`: bez horizontálního overflow na měřených šířkách od 320 do 1920 px. Propojený browser zaokrouhluje 1024 px na 1023/1025 px; plný desetibodový exact matrix zůstává doložen jen pro dřívější guest smoke. Nový profil se neukládal.
- Lokální `/api/progression/reconcile` v obyčejném Vite harnessu vrací 404; později browser zobrazil nepřihlášený stav a profilová API odpověděla 401, ale příčina není ověřena. Jde o omezení lokálního harnessu/session, nikoli důkaz produkčního selhání. Fyzické iOS/Android a instalovaná PWA: **MANUAL TEST REQUIRED**.

### Změněné soubory v této sadě

- `docs/AI_HANDOFF.md`
- `docs/AI_FULL_AUDIT.md`
- `docs/AI_MASTER_PROGRESS.md`
- `docs/AI_TEST_EVIDENCE.md`
- `docs/AI_VISUAL_QA.md`
- `docs/PRODUCT_SCOPE_MVP.md`
- `docs/FIREBASE_EMULATOR.md`
- `package.json`
- `vite.config.js`
- `tools/local-social-api-plugin.js`
- `tools/local-social-api-plugin.test.mjs` (nový)
- `tools/local-social-dev.mjs`
- `src/shared/media/jpegMetadata.js` (nový)
- `src/features/admin/server/adminPhotoProxy.js`
- `src/features/ai/AiSettings.jsx`
- `src/features/ai/AutomaticSpeciesStatus.jsx` (smazán)
- `src/features/ai/CatchAiAssistance.jsx`
- `src/features/ai/DiaryAiExplanation.jsx`
- `src/features/ai/aiClient.js`
- `src/features/ai/aiClient.test.js`
- `src/features/ai/aiFoundation.test.js`
- `src/features/ai/aiPolicy.js`
- `src/features/ai/approveSpeciesInEditor.js` (smazán)
- `src/features/ai/approveSpeciesInEditor.test.js` (smazán)
- `src/features/ai/automaticSpecies.js` (smazán)
- `src/features/ai/automaticSpecies.test.js` (smazán)
- `src/features/ai/personalFishingAnalysis.js`
- `src/features/ai/personalFishingAnalysis.test.js`
- `src/features/ai/server/aiApplicationApi.js`
- `src/features/ai/server/aiApplicationApi.test.js`
- `src/features/ai/server/cloudflareProvider.js`
- `src/features/ai/server/cloudflareProvider.test.js`
- `src/features/ai/server/productionApplicationApi.js`
- `src/features/ai/server/productionSpeciesApi.js`
- `src/features/catches/components/CatchCard.jsx`
- `src/features/catches/context/CatchContext.jsx`
- `src/features/home/components/HomeInsightCard.jsx`
- `src/features/home/utils/homeInsightCache.js`
- `src/features/home/utils/homeInsightCache.test.js`
- `src/features/map/data/tripCatchMap.js`
- `src/features/map/data/tripCatchMap.test.js`
- `src/features/social/components/CommunityEntryComposer.jsx`
- `src/features/social/components/SocialProfileSettings.jsx`
- `src/features/social/data/entryComposerModel.js`
- `src/features/social/data/entryComposerModel.test.js`
- `src/features/social/data/profileSettingsModel.js` (nový)
- `src/features/social/data/profileSettingsModel.test.js` (nový)
- `src/features/social/server/socialAvatar.js`
- `src/features/social/server/socialPhoto.js`
- `src/pages/AddCatchPage.jsx`
- `src/pages/CatchDetailPage.jsx`
- `src/pages/SettingsPage.jsx`

### Bezpečnost a otevřené body

- V této sadě nebyla potvrzena nová bezpečnostní zranitelnost; produkční přihlášení ani reálná uživatelská data nebyla použita.
- Potvrzení veřejného sdílení je nyní UX gate ve formuláři, nikoli samostatný serverově uložený consent záznam. Pokud má aplikace vyžadovat auditovatelný právní souhlas, musí následovat samostatné rozhodnutí a API změna; přímé API požadavky dnes stále přijímají explicitní `visibility`.
- Strategické MVP nadále neobsahuje sociální síť ani AI. Povolené AI capability a předvolba veřejnosti se týkají existujícího auditu, nikoli schválení produkčního release.
- WIP commit této sady: `cee56ccff78573e00610ce718f4ba4514de3a2df` (lokální, nepushnutý). Push/deployment zůstávají zakázány.

### Další krok pro Codex

1. Potvrdit aktuální branch/HEAD a dokončit lokální code review bez zásahů do Stage 9.
2. Až budou emulátory bezpečně volné, znovu spustit `npm run test:rules`, `npm run test:auth`, `npm run test:sync` a Stage 8 social suite; použít pouze syntetické účty.
3. Rozhodnout, zda veřejný checkbox vyžaduje serverově trvalý consent záznam.
4. Pokračovat neověřenými aplikačními moduly; zachovat PARTIAL, dokud nebude ověřeno celé autentizované chování.
5. Při navázání zachovat commit `cee56ccff78573e00610ce718f4ba4514de3a2df`; neprovádět push, merge, Stage 9 ani produkční deployment.

## Current takeover checkpoint — 2026-11-19

Owner explicitly authorized safe main push and Vercel deployment; earlier prohibitions above are superseded. Preserve all nine inherited commits and current implementation. No Social Stage 9. Missing .github/copilot-instructions.md, PRODUCT_STRATEGY_SOURCE.md and PRODUCT_DECISIONS_2026.md were not invented.

Consent is private server-owned users/{uid}/socialPreferences/publication, with version/mode/epoch/acceptedAt. All new UI profile saves carry expectedEpoch. Cached clients without an epoch are rejected after any revocation. Manual image preparation binds initial and final consent epochs; automatic publication additionally requires source privacy and creation/catch timestamps after the current public epoch. Deleted or previously published IDs are never automatically restored. Cursor and receipt writes remain behind deletion fences.

Browser A/B/C used emulator-only synthetic data. No production customer data, service-account download or provider inference was used. Test logs/export artifacts are in the system TEMP directory, excluded from Git. Physical-device and independent PWA/offline startup acceptance remain required; never clear IndexedDB or unsynced photo queues.
