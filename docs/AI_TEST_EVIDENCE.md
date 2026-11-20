# Test evidence checkpoint

Status: PARTIAL

## 2026-11-19

- `npm run lint`: PASS
- `npm run build`: PASS
- `npm test`: 1,164/1,164 PASS
- `npm test`: 1,161/1,161 PASS
- `node --test src/server/accountDeletion.test.js`: 12/12 PASS
- `node --test src/features/catches/utils/catchJournal.test.js`: 7/7 PASS
- `node --test src/features/catches/data/catchGallery.test.js src/features/catches/data/catchRepository.test.js`: 37/37 PASS
- Trip model, repository, statistics and map: 15/15 PASS
- Water, RIS catalogue, location and chat suites: 38/38 PASS
- Species, trophy and catch ranking suites: 20/20 PASS
- `npm run test:rules`: PASS, including 131 social interaction checks
- `npm run test:auth`: PASS
- `npm run test:sync`: PASS
- `npm run test:photos`: PASS
- Guest browser smoke: PASS for core guest routes
- Physical devices: NOT AVAILABLE

## 2026-11-19 — resumed audit validation

- `npm test`: **1,165/1,165 PASS**. The first run exposed an unrelated ordering assumption in a parallel photo-upload test; isolated execution passed, and the assertion now compares the exact uploaded ID set without assuming completion order. The full suite then passed.
- `npm run lint`: PASS.
- `npm run build`: PASS; existing large-chunk warnings remain.
- `git diff --check`: PASS.
- `node --test src/features/catches/data/photoCloudService.test.js`: 39/39 PASS.
- Home fish-activity SSR regression test: 1/1 PASS.
- Stage 8 social Auth/Firestore emulator integration: 131 checks PASS across six synthetic emulator accounts.
- Browser: 47 authenticated route paths at 400 px; 47 guest paths at each of ten exact widths (470 responsive checks). The synthetic community post-detail URL had no fixture and no heading. Browser API routes returned local 404 because the Vite server does not run Vercel functions; authenticated social browser operations remain unverified.
- No production credentials or real user records were used. Physical mobile device coverage is unavailable.

## 2026-11-19 — continued AI/privacy checkpoint

| Check | Result | Notes |
|---|---|---|
| `npm test` | PASS — 1,156/1,156 | Includes two emulator-config restoration unit tests |
| `npm run lint` | PASS | |
| `npm run build` | PASS | Cloudinary client secret scan passed for 161 assets; existing large chunk warnings remain |
| `npm run product` | PASS | Product config valid; generated inventory unchanged |
| `npm run test:photos` | PASS | Local-only photo metadata/Blob behavior |
| `node --test tools/local-social-api-plugin.test.mjs` | PASS — 2/2 | Restore existing emulator config or remove temporary config |
| `git diff --check` | PASS | |
| `npm run test:rules` | NOT RUN | Existing Firestore emulator on 127.0.0.1:8080; avoid disrupting active local session |
| `npm run test:auth` | NOT RUN | Existing Auth emulator on 127.0.0.1:9099 |
| `npm run test:sync` | NOT RUN | Requires the occupied Auth/Firestore emulator ports |
| Stage 8 social emulator suite | NOT RUN in this checkpoint | Prior documented 131-check result remains historical |

Browser evidence: the community post composer stayed disabled until public consent was checked, enabled after consent and disabled again when consent was removed. No post was submitted. `/community` and `/profile/social` had no horizontal overflow at measured widths 320, 360, 375, 390, 430, 768, 1023/1025, 1280, 1440 and 1920 px; the integrated browser quantized 1024 px to a neighboring width. A synthetic profile was viewed but not changed. Local Vite `/api/progression/reconcile` returned 404 and a later profile API request returned 401 while the browser showed a logged-out state; the cause is unverified and neither result is evidence of production behavior.

## Takeover verification — 2026-11-19

- Final unit suite: 1,154/1,154 PASS, zero failures/skips. Removed obsolete AI tests explain the lower count.
- Lint, production build, 162-asset client-secret scan, local photo check, product inventory and diff check PASS. Auth and Sync standard npm emulator scripts PASS.
- Initial full rules run: 1,520 checks PASS; targeted final publication suite: 284 checks PASS (six real emulator accounts, consent CAS, media revocation race, pagination, tombstones and no duplicate XP). Final clean full rules rerun recorded below when complete.
- Local harness guard/cleanup 5/5 PASS; real Vite restart integration 7/7 PASS (three restarts, valid authentication preserved, invalid/anonymous denied).
- Generated service worker executed in VM: current shell wins over retained previous cache; bad HTTP/non-HTML responses cannot poison shell; cache-write failures do not break navigation.
- A shared-emulator full rerun failed a feed pagination assumption because browser fixtures were still present. Assertions were preserved; only our demo servers were stopped, and the normal npm rules command was restarted with clean emulators. Other-worktree Vite port 5173 was untouched.

## Final release verification — 2026-11-19

- `npm run lint`, `npm test` (1,154/1,154), `npm run build`, `npm run test:rules`, `npm run test:auth`, `npm run test:sync`, `npm run test:photos`, `npm run product`, and `git diff --check`: PASS.
- Clean full rules run: feed 209, base Firestore 21, admin 39, support 49, social foundation 264, repository 47, profiles 95, discovery 84, friendships 127, publications 284, progression 203, interactions 131; all passed. Firebase Rules were unchanged, so no deployment was required.
- Production deployed from GitHub `main`; Vercel reported READY for commit `1a85e3216be512d969bd7d13f12a2f3e8779b880`. Production homepage returned HTTP 200 with the ChytnuCz shell. Anonymous POST to `/api/ai/journal` was rejected with HTTP 401; no inference or customer data was used.
- Authenticated emulator/browser work used synthetic accounts. AI provider inference and live Cloudinary media delivery were not tested. Full offline PWA reopen produced an inconclusive blank browser view and remains **MANUAL TEST REQUIRED**; no local storage or photo queue was cleared. Physical iOS/Android validation is also **MANUAL TEST REQUIRED**.
- The broader application audit remains PARTIAL. No Firebase Rules deploy, paid-service activation, or Stage 9 work occurred.

## Stage 9 social notifications — 2026-11-19

- `npm test`: 1,162/1,162 PASS; `npm run lint`, `npm run build` (Cloudinary secret scan included), `npm run product`, `npm run test:photos`, `npm run test:auth`, `npm run test:sync`, `npm run test:rules`, and `git diff --check`: PASS.
- Rules emulator: 22 tests PASS, including owner-only reads/writes and strict social preference schema. Full social rules suite exited 0.
- Cross-account Auth/Firestore: friendships 129 checks PASS; social interactions 136 checks PASS; admin moderation 50 checks PASS. These cover deduplication, preferences, recipient privacy and forged cross-account writes.
- Unit tests cover preference defaults/normalization, cross-device notification updates, read-state merge and unsubscribe cleanup.
- Production Firestore rules deployment not performed because only the local demo project is configured. Physical device and authenticated browser multi-account acceptance remain unverified.
- Follow-up release: `firestore.rules` was deployed to the verified ChytnuCZ Firebase project `chutnucz`; Vercel production is READY for code SHA `1a83e11fbdb2cd9d513af119fec8ecd0582c8cd4`, live home HTTP 200, production notification UI bundle verified.

## Produkční audit – PWA, hlavní navigace a nativní oprávnění

Výchozí produkce i main byly 6587d4518125949851d42bb725b99ecc41d08850. Práce proběhla na větvi codex/chytnu-release-continuation. Původní worktree s 27 rozpracovanými soubory zůstal zachovaný.

- PWA: build obsahoval pět odkazů na odstraněné JS soubory, což zablokovalo instalaci service workeru. Seznam se nyní generuje po dokončení ostatních výstupních hooků Vite a build kontroluje existenci všech 154 položek. Offline HTML se uchovává s odpovídajícími assety. API zůstává mimo offline cache a odkazy z oznámení míří do aplikace.
- Navigace: jedna mapa sekcí sjednocuje stav podstránek, staré adresy s lomítkem, aktivitu ryb, Hotspoty a oznámení. Nastavení profilu a chat revíru mají vlastní odpovídající rodiče.
- Chromium: 180 přechodů na 18 trasách při 320, 360, 375, 390, 430, 768, 1024, 1280, 1440 a 1920 px. Bez zjištěného vodorovného přetečení v těchto kontrolách. Po odpojení serveru prošlo šest navigací a offline Quick Catch se skutečným čtením fotografie v detailu po novém načtení. Fyzická PWA a restart celého prohlížeče jsou neověřené.
- Android wrapper deklaruje polohu v popředí, iOS popisuje účel kamery a polohy při používání aplikace. XML a tři platformní testy prošly. Android target/compile SDK je 36 a applicationId/bundle ID je cz.chytnu.app. Android SDK a Xcode v tomto prostředí nejsou k dispozici. Podpisy, fyzické testy a store balíčky zůstávají otevřené.
- Prošlo 1 183 jednotkových testů, lint, build, produktový inventář, kontrola Cloudinary klientských secret markerů a npm audit produkčních závislostí bez nálezů. Firebase Rules, Auth, Sync a Photos prošly v lokálním testovacím prostředí.

## Závěrečná verifikace webového milníku · 20. listopadu 2026

- 1 184/1 184 jednotkových testů po úpravách Deníku a analýzy. Lint, build a product PASS. Build ověřil 154 souborů offline manifestu a 162 klientských assetů kontrolou Cloudinary secret markerů.
- Chromium na lokálním produkčním buildu a s testovací fotografií. Po odpojení serveru šest úspěšných navigací a čtení fotografie Quick Catch. Ukončení celého procesu přes Browser.close, nové spuštění se stejným testovacím profilem a stále odpojeným serverem, detail znovu načetl fotografii s nenulovou skutečnou šířkou.
- Fyzická instalovaná PWA, iOS/Android podepsané buildy a Cloudinary v produkci zůstávají neověřené.

- Přihlášený Chromium test: skutečný Auth emulátor, ověřený syntetický účet, přihlášení přes formulář, dokončení onboardingu bez GPS, potom 14 tras × 10 šířek. Všech 140 kontrol bez nálezu. Testovací účet a lokální běhy emulátoru byly ukončeny.
- Vercel production READY na SHA 65b7f623f6d9dee1dd9ebccb574173aac2ce0c6e. Home, Deník a service worker HTTP 200.
