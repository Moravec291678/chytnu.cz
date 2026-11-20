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
- WIP checkpoint commit: `cee56ccff78573e00610ce718f4ba4514de3a2df` (local only; no push). The working tree was clean after this commit.
- Restricted AI to optional story drafts and diary recommendations; disabled species recognition, standalone diary AI explanations and Home AI requests. Legacy Home AI cache is cleared while local insight state is preserved.
- New social posts have a public form default but cannot submit before confirmation. New profile defaults are public at the top level only; sections and discoverability remain private/off. Historical documents/data are not migrated and server defaults remain private-first.
- Local Vite social harness restores its previous emulator configuration on close.
- Validation: 1,156 unit tests, lint, build and client secret scan, product inventory, local-only photos, two local harness tests, and diff check passed. Build has existing large-chunk warnings.
- Rules/Auth/Sync emulator tests were not re-run because existing app/emulator processes occupied configured ports 5174/9099/8080. Processes were left running. Previously recorded 131 Stage 8 social checks are historical.
- Authenticated composer consent was checked without submitting; two social/profile views had no overflow at measured widths from 320 to 1920 px. The browser could not realize exactly 1024 px. Local `/api/progression/reconcile` 404 and a later profile 401 were not treated as production results.
- No production user data, credentials, push, merge, Stage 9, or deployment was used.
- Next: rerun emulator suites when safely available, decide if public consent must be persisted server-side, and continue the remaining authenticated module/browser audit.

## Owner-authorized takeover — 2026-11-19

Latest owner instructions authorize the verified main release and supersede the earlier no-push checkpoint. Branch: codex/ui-terminology-length-priority; takeover HEAD eb095a7ae499a744db3a24616f932ba6bbaf1e73; origin/main and production at inspection: 7b7631d8ea93ad17d04c5508e2f0bcbdbf9bb752. Nine local commits are a linear descendant; the reported 81-commit divergence belongs to another worktree, left untouched.

Implemented: obsolete species/standalone diary inference removed; journal stories and tips retained. Server-owned version-1 publication consent, epochs/CAS, private-mode revocation, no historical auto-publication, bounded idempotent new-catch publication with deferred-photo pagination. New profile public presets require meaningful confirmation. Local privacy switch now links to authoritative social settings. Fixed local API restart authentication and current-shell offline cache selection. No billing, source-data migration or Stage 9.

Release gate and production result are recorded in the final release checkpoint. Whole-application audit remains PARTIAL. Next audit item: review the deterministic Home fallback that displays the literal generic method label when no method is known; do not invent diary evidence.

## Stage 9 — social notifications checkpoint — 2026-11-19

- Stage 9 in-app notifications: **PASS**. Friend requests/acceptances, first reactions per actor/post, new comments, and existing moderation notices use the existing owner-scoped inbox.
- Social events are committed with their authorized relationship/post mutation; stable IDs, generic private-safe copy, block checks, server-read preferences, and idempotency prevent spoofing and notification storms.
- Inbox updates across devices through a bounded Firestore subscription (latest 250). Social notification preferences are stored per account and restricted by Firestore Rules. Browser push delivery for social events remains unconnected and is not claimed as active.
- Verification: full unit suite 1,162/1,162; lint/build/product/photo/diff checks PASS. Auth emulator PASS; sync emulator PASS; full rules/social emulator suite PASS. Focused evidence: rules 22 tests; admin support 50 checks; friendships 129 checks; interactions 136 checks.
- Firebase production Rules deployed to confirmed project `chutnucz` using only `firestore.rules`; no index deployment or other Firebase service changes.
- Code commit `1a83e11fbdb2cd9d513af119fec8ecd0582c8cd4` is on `main`; Vercel production reached READY for that SHA. Live homepage returned HTTP 200 and the deployed notification bundle contains the new social preference UI and honest push status.
- Optional browser push sending remains inactive. Physical mobile and authenticated live browser validation remain unverified.
- Next: Stage 10 Nearby privacy and presence. Do not start later stages before review and verification.

## Sociální síť 10/18 – Okolí

- Zapnutí přítomnosti vyžaduje přihlášení a výslovný souhlas. Server uchovává jedinou hrubou oblast na účet po dobu 20 minut. API nevrací souřadnice ani oblast. U úplného vypnutí se serverový souhlas odvolá a přítomnost odstraní společně.
- Profil se ve stejné oblasti zobrazí jen s dalším souhlasem, veřejnou dohledatelností, aktivní přítomností, nejméně pěti účastníky v oblasti a bez oboustranného blokování. Zobrazené výsledky se po 30 sekundách odstraní z paměti obrazovky.
- Poloha pro hledání katalogových revírů zůstává v zařízení. Návrhy měří vzdálenost k referenčnímu bodu RIS a vyžadují výběr. Aktivita zvoleného revíru čte pouze schválené veřejné publikace obsahující daný katalogový revír. Odpověď vynechává fotografie a soukromé údaje.
- Server přestane počítat relaci při expiraci. Uložené záznamy odstraňuje stávající denní úklid po nejvýše 200 položkách. Před smazáním znovu ověří expiraci. Firebase TTL a placené služby nejsou potřeba.
- Ověření: 1 173 jednotkových testů, lint, build a kontrola tajných klíčů PASS. 83 kontrol Nearby v emulátoru Auth/Firestore se šesti syntetickými účty PASS. Přihlášený průchod Chromium 390 px se syntetickou polohou a skutečným lokálním API PASS. Fyzické zařízení zůstává neověřené.

## Sociální síť 11–12/18 – geometrie a přítomnost u revíru

- Etapa 11: audit snapshotu RIS dokončen a vydán v commitu 64dcf5d91626983319cceb8e2288c1a612dcb991. Osmnáct cílených testů prošlo. Vercel READY na odpovídajícím commitu. Podrobnosti jsou v docs/SOCIAL_RIS_GEOMETRY.md.
- Etapa 12: přihlášený rybář může v katalogovém detailu potvrdit přítomnost na 30 minut, načíst stav, prodloužit nebo ukončit relaci. Backend ověřuje skutečný katalogový identifikátor, účet a platnost serverové relace. GPS se nevyžaduje ani neukládá. Stav je určený pro vlastní účet. Změny používají rotační ID relace, aby starší zařízení nepřepsalo novější volbu. Expiraci ověřuje každý autorizační dotaz.
- Přístupová pravidla a indexy Firebase zůstaly stejné. Denní úklid využívá existující úlohu. Emulátor 22 kontrol přítomnosti u revíru a 83 kontrol Nearby PASS. Chromium při 390 px s přihlášeným syntetickým účtem ověřilo potvrzení, zapnutí, prodloužení a ukončení.
- Další sociální milník je etapa 13. Napojit živý chat na existující serverovou autorizaci revíru, bezpečné stránkování a moderaci a zachovat staré místní zprávy.

## Audit vydání · 20. listopadu 2026

Milníky PWA, navigace a nativních oprávnění 81406e2, 951ac12 a 0fe9d8a jsou na main a ověřené ve Vercel. Odkazy na osobní přehledy jsou v Deníku a lokální analýza pracuje se skutečným názvem metody. Úplný stav a otevřené ověření jsou v AI_FULL_AUDIT.md.
