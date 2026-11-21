# Závěrečná matice akceptace

Stav k 21. 11. 2026. Kódový kandidát `e45f963f4d4433d5542b1209beaf2574e523d848`. Výsledky emulátoru a prohlížeče patří pouze k uvedenému prostředí.

## WEB / PWA · PARTIAL · NO-GO pro veřejné rozšíření

- **PASS lokálně** · Přihlášení skutečného syntetického účtu, izolace scope a obnova relace, Quick Catch s JPEG, trvalý readback a obnova po restartu. Deník, úpravy, výmaz bez návratu, vycházky/revíry, ruční fallback bez GPS/dlaždic, export, statistiky a XP. [Jádro deníku](QA_CORE_CATCH_JOURNAL.md) · [Synchronizace](QA_SYNC_RECOVERY.md) · [Export a výmaz](QA_EXPORT_DELETION.md) · [Vycházky](QA_TRIPS_WATERS_MAPS.md) · [Výsledky XP](QA_PROGRESSION_STATISTICS.md)
- **UX a trasy** · Původních 56 tras na 390 a 1440 px v [matici](QA_ROUTE_INTERACTION_MATRIX.md). Aktuální kandidát prošel 57 trasami ve dvou šířkách, 114 přihlášených zobrazení, bez nedostupného stavu vykreslení či horizontálního přetečení. Navíc 180 hostovských případů, šest offline navigací s JPEG, čtení fotografie po ukončení a novém spuštění Chromium, 14 přímých zákazů v hostu a pět přímých zákazů po přihlášení. Přístupnost zahrnuje klávesnici a kontrast v kritických tocích. Fyzická klávesnice, čtečka a slabé zařízení zůstávají otevřené.
- **PASS produkční read-only** · Vercel alias READY na `68fbf04b70e123b226bac90ee83f12dde1dc352b`; formulář bez odeslání, host, vstup do Quick Catch, Deník, Profil, Nastavení a právní stránky prošly v Chromium. [Produkce](https://chytnu-cz.vercel.app)
- **BLOCKED** · Živá produkční registrace/e-mail/Google, schválení izolovaného preview a syntetických účtů, živý Cloudinary upload, download, odstranění a CDN revokace. PWA na skutečných iOS a Android telefonech včetně HEIC a aktualizace se zachovaným outboxem stále čeká. [Webový sign-off](PUBLIC_WEB_RELEASE_SIGNOFF.md) · [Média](QA_CLOUDINARY_LIVE.md)

## ANDROID · GATED

- **PASS částečně** · Capacitor synchronizace, app ID `cz.chytnu.app`, místní konfigurace API 36. Gradle skončil před kompilací kvůli chybějícímu Android SDK. API vrací 405 na preflight nativního WebView. Neověřený APK/AAB, podpis, fyzický Android, přihlášení, fotky a Play.
- [Android build](ANDROID_NATIVE_BUILD_EVIDENCE.md) · [PWA na Androidu](DEVICE_ANDROID_PWA_ACCEPTANCE.md) · [Google Play](GOOGLE_PLAY_SUBMISSION_PACK.md)

## IOS · GATED

- **PASS částečně** · Capacitor iOS sync na Windows a ověření PrivacyInfo.xcprivacy v projektu. Archiv, podpis, fyzický iPhone, WebView přihlášení/doručení fotek a TestFlight vyžadují Mac, nástroje a oprávnění. Preflight nativního WebView také vrací 405.
- [iOS build](IOS_NATIVE_BUILD_EVIDENCE.md) · [PWA na iOS](DEVICE_IOS_PWA_ACCEPTANCE.md) · [App Store](APPLE_STORE_SUBMISSION_PACK.md)

## SOCIAL · GATED

- **1–9 · PASS v emulátoru, živá akceptace PARTIAL** · Tři oddělené účty, profil/vyhledávání, přátelství, bezpečná publikace, veřejná XP projekce, feed, reakce, komentáře, hlášení, oznámení v aplikaci a odvolání. Živý Cloudinary a provider fotky zůstávají podmínkou. [Jádro](SOCIAL_CORE_ACCEPTANCE.md)
- **10–12 · PARTIAL** · Dobrovolné hrubé Okolí, prahová ochrana, odvolání, expiry a ručně potvrzené členství u revíru. Geometrie 1 263 bodů z 1 451, žádný ověřený polygon. [Okolí](SOCIAL_NEARBY_ACCEPTANCE.md) · [Revíry](SOCIAL_WATER_PRESENCE_ACCEPTANCE.md)
- **13–16 · PASS izolované scénáře, rollout GATED** · Chat revíru s moderací a výmazem, soukromé zprávy přátel, Crew s pozvaným vstupem a řízenými rolemi, výslovně sdílené úlovky v přehledu revíru. Širší skupinový či textový obsah, retence, reálná zařízení a schválené účty jsou otevřené. [Chat](SOCIAL_WATER_CHAT_ACCEPTANCE.md) · [Zprávy](SOCIAL_DM_ACCEPTANCE.md) · [Crew](SOCIAL_CREW_ACCEPTANCE.md) · [Obsah revírů](SOCIAL_WATER_CONTENT_ACCEPTANCE.md)
- **17–18 · PARTIAL** · Admin a support permission/suspension/cleanup testy PASS. Produkční privilegovaná akceptace a vlastník moderace čekají. Nedokončené funkce zůstávají mimo výchozí veřejnou konfiguraci. Browser push sociálních událostí se nezapínal. [Přehled etap](QA_COVERAGE_MATRIX.md)

## Vstupní podmínky vydání

Živý end-to-end na schválených syntetických účtech a schválená kapacita, fyzické telefony, izolované preview, licence a provozní povinnosti, obnovovací zkouška, rozhodnutí vlastníka a týdenní pilot. [Kroky vlastníka](OWNER_LAUNCH_ACTIONS.md) · [Výstupní kritéria pilotu](PILOT_EXIT_CRITERIA.md)
