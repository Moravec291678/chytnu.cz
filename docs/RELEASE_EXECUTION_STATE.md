# ChytnuCz · řízení vydání

## Checkpoint po Promptu 00/33 · 20. listopadu 2026

**Prompt 00 · VERIFIED. Veřejné vydání · NO-GO.** Toto je provozní registr 19 existujících úkolů. Původní zjištění a kritéria zůstávají v [auditu](PUBLIC_LAUNCH_READINESS.md), [backlogu](PUBLIC_LAUNCH_BACKLOG.md), [matici QA](QA_COVERAGE_MATRIX.md), [webové akceptaci](RELEASE_ACCEPTANCE_CHECKLIST.md), [mobilní akceptaci](MOBILE_STORE_RELEASE_CHECKLIST.md) a [krocích vlastníka](OWNER_LAUNCH_ACTIONS.md). Starší checkpointy v AI_FULL_AUDIT, AI_HANDOFF a AI_MASTER_PROGRESS poskytují historický kontext.

- **Pracovní kopie vydání** `chytnu-terminology-ux-checkpoint`, větev `codex/public-launch-readiness-audit`, vstupní HEAD `924599300a75fbd5e011c1687e40cc54ad178278`, čistá před úpravami. Checkpoint Promptu 00 je dokumentační commit s tímto souborem na téže větvi. Přesné aktuální SHA checkpointu ukáže `git log -1 --format=%H -- docs/RELEASE_EXECUTION_STATE.md`.
- **Vzdálený main a živá produkce** `68fbf04b70e123b226bac90ee83f12dde1dc352b`. Po fetch potvrzeno také přes ls-remote. Produkční alias ověřen ve Vercel CLI jako READY, scope konektoru vrátil 403. Lokální větev `main` v jiné kopii na `b71c32f` je divergentní, proto není výchozím bodem.
- **Původní pracovní kopie** `chytnu-terminology`, větev `codex/ui-terminology-length-priority`, HEAD `208baf2afd16a7841422386a344da711ddca9e85`. 22 změněných sledovaných a pět nových souborů, žádné staged změny. Dokumentace, Nearby a navazující server/UI/testy. Obsah porovnán před a po pomocí otisku SHA-256 všech 27 souborů a stavu Git. Varování o koncích řádků jsou stávající.
- **Nové ověření tohoto promptu** Git, Vercel a kontrola úplnosti dokumentačního registru. Produktové, emulátorové a fyzické testy tento prompt nespouštěl.
- **Důkaz převzatý z auditu na produkčním SHA** 1 184 jednotkových testů, 1 667 dílčích Rules a integračních kontrol, Auth/Sync/Photos/lint/build/product, 180 hostovských a 140 přihlášených kombinací v Chromiu. Offline nový proces obnovil uložený úlovek s fotkou. Přihlášený průchod ověřil založení, obnovu, ukončení a smazání prázdné vycházky. Nasazené Firestore Rules, 12 složených indexů a dvě výjimky polí se při auditu read-only shodovaly. Tyto dílčí důkazy platí pro dané prostředí a SHA.
- **Otevřeno** Živé A/B fotky a cleanup, skutečný životní cyklus účtu, fyzická PWA, přesný rozsah pilotu, licence a provozní akceptace. Rozpracovaná komunita zahrnuje přístupnou místní Crew a chat u revíru bez napojeného živého chatu. Podepsaná vydání obchodů jsou samostatná.

## Registrované úkoly

**Rozdělení:** P0 0 potvrzených, P1 14 podmínek příslušného vydání, P2 3 a P3 2. P1 pro obchod, sociální beta nebo cloud se uplatňuje v uvedeném rozsahu. **Stavy:** 6 NOT STARTED, 3 IN PROGRESS, 10 BLOCKED. Dokončené dílčí funkce jsou uvedené s důkazem nahoře nebo u ID; žádný z 19 otevřených úkolů ještě nesplňuje všechny podmínky pro VERIFIED nebo DEPLOYED. Příznak nasazení popisuje celek úkolu, u existujících komponent uvádí přesný dostupný rozsah.

### P0 · Bezpečnost a data

Žádný potvrzený P0. Prokazatelné překročení scope účtu, zveřejnění soukromé GPS či historického úlovku, ztrátu fotografie nebo offline zápisu a selhání výmazu s veřejnou projekcí povýšit pod původním ID a zastavit dotčené vydání. Postup podle [pravidel](RELEASE_EXECUTION_RULES.md).

### P1 · Podmínky webu a pilotu

- **REL-01 · Rozsah pilotu a uzavření nedokončených funkcí · IN PROGRESS.** Soubory `src/app/App.jsx`, `src/product/config/featureFlags.js`, `src/features/social/server/socialApi.js`. Závislost rozhodnutí o rozsahu. Test přímých a navigačních tras i akcí pro hosta, účet a ownera, zvlášť zachování deníku offline. Hotovo, když nepovolené UI i serverové operace odpovídají schválené matici a historie zůstává čitelná v oprávněném scope. Vlastník schvaluje rozsah. **Nasazeno:** stávající dílčí přepínače a lokální Crew; jednotná hranice celého pilotu otevřená.
- **REL-02 · Identita prostředí, pravidla a rollback · IN PROGRESS.** Soubory `vercel.json`, `firestore.rules`, `firestore.indexes.json`, `docs/FIREBASE_PRODUCTION_SETUP.md`. Závislost přístupy jen v potřebném rozsahu. Test porovnání pravidel a indexů, izolovaný preview smoke a návrat se správnou verzí rules. Hotovo po doložení Vercel/Firebase identity, rolí IAM, domén, retence a odděleného preview. Vlastník potvrzuje či deleguje přístup a izolaci. **Nasazeno:** audit už potvrdil shodu produkčních pravidel a indexů; izolace a návrat jako celek otevřené.
- **REL-03 · Živé Cloudinary fotky · BLOCKED.** Blokátor schválený sandbox, syntetické účty a živý poskytovatel. Soubory `api/cloudinary/`, `src/server/cloudinaryApi.js`, `src/features/catches/data/photoInput.js`. Závislost REL-02. E2E JPEG a HEIC, přerušený upload, opakování, autorizace originálu, doručení derivátu, EXIF a cleanup. Hotovo při čitelné fotce na obou zařízeních, prázdné frontě a potvrzeném odstranění dohodnutých médií. Vlastník schválí prostředí a přístup. **Nasazeno:** capability enabled a obsluha existuje; živá akceptace chybí.
- **REL-04 · Auth, export, obnova a skutečný výmaz · BLOCKED.** Blokátor schválené živé testovací účty e-mail a Google, odkaz z e-mailu a živý cleanup. Soubory `src/pages/LoginPage.jsx`, `src/pages/SettingsPage.jsx`, `api/account/delete.js`, `docs/ACCOUNT_DELETION.md`. Závisí na REL-02, návaznost na média REL-03. Test registrace a ověření, reset, expirace, A/B scope, hranice exportu, obnovy, žádosti s čerstvým auth a dokončení výmazu i po odhlášení. Hotovo s doloženou izolací a kontrolou lokálních, účtových, Cloudinary a sociálních dat. Vlastník schválí syntetické účty a scope. **Nasazeno:** existující obsluha účtu; živá akceptace jako celek otevřená.
- **REL-05 · Souhlas a revokace · BLOCKED pro povolenou komunitu.** Blokátor živý autorizovaný multi-account test a médiová akceptace. Soubory `src/features/social/server/{publicProfileService,publicationService,socialPhoto}.js` a `src/pages/CatchSharePage.jsx`. Závisí REL-03/04, politika REL-08 a rozsah REL-01. Test A/B/C, epochy a stará relace, blok, veřejná projekce, TTL odkazu a výmaz. Hotovo s potvrzenou serverovou revokací bez návratu ze staré fronty a bez soukromého úlovku, originálu či GPS v projekci. Vlastník schvaluje rozsah a politiku. **Nasazeno:** ochrany a revizní mechanismus v produkčním kódu; reálná CDN revokace otevřená. Při uzavření komunity na UI i serveru odložit její akceptaci.
- **REL-06 · Fyzická PWA a offline · BLOCKED.** Blokátor fyzické telefony a dostupnost živých testů REL-03/04. Soubory `vite.config.js`, `src/features/catches/data/photoInput.js`, `src/features/sync/`. Test instalace, kamera/galerie a skutečný HEIC, ztráta sítě, GPS opt-out, znovuotevření, update s outboxem, konflikt a desktopová kontrola. Hotovo s protokolem pro iOS i Android a bez ztraceného záznamu. Vlastník zajistí hardware nebo testery. **Nasazeno:** webový SW a offline opravy; desktopové obnovení prokázáno, fyzická PWA otevřená.
- **REL-07 · Přístupnost, navigace a velké seznamy · IN PROGRESS.** P2 je hloubková optimalizace mimo kritické toky, sdílí měření s POST-01. Soubory `src/pages/{JournalPage,GalleryPage,AddCatchPage,SettingsPage,ProfilePage}.jsx`, `src/shared/layout/`, `src/shared/hooks/useModalFocusTrap.js`. Závislost hardware pro závěrečnou akceptaci. Práce v prohlížeči může začít samostatně. Test 200% zoom, čtečka, focus, 44px dotykové cíle, dlouhé názvy, 1 000/5 000 záznamů a HEIC. Hotovo s akceptovanými kritickými cestami, jedním hlavním vstupem k místní záloze při zachování cloudového exportu a zachovanými odkazy mapy. Vlastník pomůže s fyzickým ověřením. **Nasazeno:** stávající navigace a průchod 320 kombinací; celá přístupnost otevřená.
- **REL-08 · Právní texty, zdroje a licence · BLOCKED.** Blokátor uzavření vlastníka a podle rozsahu kvalifikovaná revize. Soubory `src/pages/legalDocuments.js`, `docs/RIS_CATALOGUE.md`, `docs/WEATHER_AND_ACTIVITY.md`. Závisí na rozsahu REL-01. Podklad a review jde připravit souběžně, ověřit veřejné právní odkazy, atribuci, manuální režim a deklarace proti skutečným datům. Hotovo po potvrzení licencí RIS, počasí a map nebo bezpečném omezení dotčeného zdroje, schválení textů, retence a povinností podpory/moderace. Vlastník schvaluje a zajišťuje revizi. **Nasazeno:** právní stránky; nové schválení otevřené.
- **REL-09 · Monitoring, návrat a obnova · NOT STARTED.** Soubory `api/cloudinary/cleanup.js`, `vercel.json`, `docs/SYNC_CONTRACT.md`. Závislost REL-02 a dohoda o RPO/RTO, živý foto signál navazuje na REL-03. Test syntetické selhání, přijetí alertu, ověření cronu, kompatibilní rollback a obnova v izolovaném scope. Hotovo s odpovědným operátorem, důkazem reakce a metrikami bez soukromých payloadů. Vlastník potvrdí příjemce, oprávnění, návrat a ochranu DB. **Nasazeno:** existující cleanup, úplný dohled a recovery drill otevřené.
- **REL-10 · Pozvaný pilot a rozhodnutí GO · BLOCKED.** Blokátor příslušné P1 REL-01–09 a RISK-01 pro cloud, bez otevřeného P0. Soubory `docs/RELEASE_ACCEPTANCE_CHECKLIST.md`, `docs/OWNER_LAUNCH_ACTIONS.md`, `vercel.json`. Test omezené skupiny 10–20, scénáře onboarding/recovery, týdenní data, zátěž se syntetickými daty a zastavení růstu při 80 % rozpočtu. Hotovo po schválení scope, výsledků, rozpočtu a výslovném rozhodnutí. Vlastník schvaluje testery a otevření. **Nasazeno:** veřejná URL běží; schválený pilot a rozšíření otevřené.
- **RISK-01 · Tvrdý Cloudinary limit a granty · BLOCKED při cloud uploadu.** Blokátor sandbox a REL-03. Soubory `src/product/config/limits.js`, `src/server/cloudinaryApi.js`, `api/cloudinary/sign.js`. Schválený malý negativní test odmítnutí, expiry a následného úklidu; bez zátěže živých účtů. Hotovo s doloženou hranicí před přenosem nebo ekvivalentním ohraničením a viditelným stavem chyby. Vlastník schvaluje rozsah a ověří limity konzole. **Nasazeno:** aplikační limit 10 MiB; účinnost poskytovatele neověřená.

### P1 · Pouze vydání v obchodech

- **MOB-01 · Android build a Play testy · BLOCKED.** Blokátor mobilní SDK a zařízení, podpis a přístup k Play Console. Soubory `android/`, `capacitor.config.json`, `docs/MOBILE_STORE_RELEASE_CHECKLIST.md`. Závisí na výsledku webové akceptace a pro podání MOB-03. Test AAB, podpis, fyzická kamera a restart, oprávnění, SDK/16kiB, interní či požadovaný uzavřený test. Hotovo po schváleném podepsaném buildu a protokolu testovacího kanálu. Vlastník řídí účet, registraci, klíče a release. **Nasazeno:** zdrojová konfigurace API 36; vydání v Play neověřené.
- **MOB-02 · iOS archiv a TestFlight · BLOCKED.** Blokátor macOS/Xcode, fyzický iPhone, podpis a App Store Connect. Soubory `ios/`, `capacitor.config.json`, `docs/MOBILE_STORE_RELEASE_CHECKLIST.md`. Závisí na výsledku webové akceptace a pro podání MOB-03. Test Archiv, provisioning, reálný HEIC/kamera/GPS, WebView auth a TestFlight; iPad pokud podporovaný. Hotovo s ověřeným archivem, protokolem TestFlight a potvrzenými oprávněními. Vlastník řídí tým, členství a release. **Nasazeno:** zdrojové deklarace kamery a GPS existují; vydání neověřené.
- **MOB-03 · Deklarace, webové mazání a uzavření store · BLOCKED.** Blokátor schválený obsah, publikace URL a výsledek REL-04/08. Soubory `src/app/App.jsx`, `src/pages/SettingsPage.jsx`, `docs/MOBILE_STORE_RELEASE_CHECKLIST.md`. Deklarace připravit před podáním, finální kontrola navazuje na testy MOB-01/02. Test výmaz z aplikace i použitelné vnější cesty, znění deklarací proti datům, review metadata a podpora. Hotovo s protokolem výmazu, živou cestou a schválenými podklady obou obchodů. Vlastník schvaluje prohlášení a podání. **Nasazeno:** zahájení výmazu v Nastavení; externí store checklist otevřený.

### P2 · Důležitá následná práce

- **RISK-02 · CSP · NOT STARTED.** Soubory `vercel.json`, `vite.config.js`. Závisí na ověřeném preview REL-02 a soupisu zdrojů. Test report-only a funkční Auth, mapy, média, počasí i SW. Hotovo s bezpečnou politikou bez regresí a zvoleným procesem eskalace. Vlastník posoudí případného nového zpracovatele, pokud by byl potřeba. **Nasazeno:** základní bezpečnostní hlavičky; explicitní CSP chybí.
- **RISK-03 · Duplicitní soukromý revír · NOT STARTED.** Soubory `src/features/waters/data/waterRepository.js`, `src/features/sync/`, `docs/RIS_CATALOGUE.md`. Závisí na REL-04. Test dva offline klienty jednoho účtu a stejný catalogueId, reconciliační konflikt a vazby. Hotovo po reprodukci a bezpečné detekci, zachování ID, potvrzení uživatelem a bez automatického destruktivního sloučení. Vlastník ne pro lokální ověření. **Nasazeno:** popsané riziko mezi klienty zůstává; jednotná detekce neověřená.
- **POST-01 · Výkon a foto cache · NOT STARTED.** Soubory `vite.config.js`, `src/pages/{JournalPage,GalleryPage}.jsx`, `src/features/catches/`, `src/features/sync/`. Závisí na měření REL-07 a využívá sběr REL-09. Test stejných velkých scénářů před/po, telefonní p75, cache, decode a nízká paměť. Hotovo s doloženým zlepšením, bez regrese offline shellu a bez citlivých metrik. Vlastník jen hardware nebo rozhodnutí o infrastruktuře. **Nasazeno:** existující PWA zlepšení, cílové optimalizace nezavřené.

### P3 · Budoucí funkce

- **POST-02 · Sociální beta a nedokončené moduly · NOT STARTED.** Soubory `src/features/social/`, `src/pages/{NearbyPage,WaterChatPage,CrewPage}.jsx`, `firestore.rules`. Závisí na REL-01/05/08/09 a samostatném schválení. Test role a autorizace, tři účty, consent, blok a moderace, dostupnost a rozpočet. Hotovo po oddělené akceptaci dovolovaných modulů a ověření hrubé dobrovolné polohy. Vlastník schvaluje sociální betu. **Nasazeno:** dílčí sociální služby, Okolí a přítomnost; rozšíření chatu/DM/Crew neověřené nebo chybí.
- **POST-03 · Volitelný push, AI, XP a Supporter · NOT STARTED.** Soubory `src/pages/{NotificationsPage,SeasonStoryPage,InsightsPage}.jsx`, `src/features/ai/`, `src/product/config/featureFlags.js`, `api/ai/journal.js`. Závisí na samostatném rozhodnutí o přínosu a REL-01/08/09. Test opt-in a revoke, bezpečné payloady, lokální fallback, veškeré kvóty a žádné nové účtování. Hotovo jen pro schválené položky s prokázaným užitkem a náklady. Vlastník schvaluje rozsah; placené služby se podle Promptu 00 nepovolují. **Nasazeno:** místní analýza a dílčí infrastruktura; rozšíření žádné ověřené vydání.

## Návaznost promptů 00–33

Řídí se souborem chytnucz_34_postupnych_codex_promptu.md ze Stažených souborů. Všechny 34 bloky se obsahově shodují se čtyřmi svazky. Mapa níže nahrazuje předběžné pořadí z Promptu 00. Stejné ID připomíná společné kritérium, dílčí důkazy se mezi prompty přebírají.

- **00 — ŘÍDICÍ CHECKPOINT, SKUTEČNÝ BACKLOG A BEZPEČNÝ PLÁN PRÁCE** · baseline
- **01 — REL-01/REL-02: ROZSAH PRVNÍ VERZE, FEATURE FLAGS A BEZPEČNOST TRAS** · REL-01/02
- **02 — REGISTRACE, PŘIHLÁŠENÍ, RESET HESLA A DVA SKUTEČNÉ ÚČTY** · REL-04
- **03 — SOUKROMÍ, VEŘEJNÉ PROJEKCE, PUBLIKACE A ODVOLÁNÍ SOUHLASU** · REL-05
- **04 — EXPORT UŽIVATELSKÝCH DAT A ÚPLNÝ VÝMAZ ÚČTU** · REL-04/09
- **05 — OFFLINE OUTBOX, VÍCE ZAŘÍZENÍ A BEZCHYBNÁ SYNCHRONIZACE** · REL-04/06
- **06 — SKUTEČNÝ CLOUDINARY UPLOAD, DORUČENÍ A DRUHÉ ZAŘÍZENÍ** · REL-03
- **07 — REVOKACE VEŘEJNÝCH FOTOGRAFIÍ, CLEANUP A MAZÁNÍ MÉDIÍ** · REL-03/05 + RISK-01
- **08 — QUICK CATCH A DENÍK: KOMPLETNÍ REÁLNÝ E2E** · REL-06/07
- **09 — VÝPRAVY, REVÍRY, MAPY A DŮVĚRYHODNOST RIS DAT** · REL-08 + RISK-03
- **10 — XP, STATISTIKY, OSOBNÍ REKORDY A DENÍKOVÉ PŘÍBĚHY/TIPY** · REL-07 + POST-03
- **11 — INSTALOVANÁ PWA NA REÁLNÉM ANDROIDU, OFFLINE A UPDATE** · REL-06
- **12 — INSTALOVANÁ PWA NA REÁLNÉM IPHONU A MOBILNÍ SAFARI** · REL-06
- **13 — NAVIGACE A FUNKČNOST VŠECH 56 TRAS** · REL-07
- **14 — JEDNOTNÝ DESIGN SYSTEM, VIZUÁLNÍ HIERARCHIE A TYPOGRAFIE** · REL-07
- **15 — PŘÍSTUPNOST, MOBILNÍ KLÁVESNICE A VELKÉ DATOVÉ SADY** · REL-07
- **16 — VÝKON, VELKÉ CHUNKY, SÍŤ A ROZPOČET FIREBASE ČTENÍ** · POST-01
- **17 — FINÁLNÍ BEZPEČNOST API, PRAVIDEL, LIMITŮ A ADMINISTRACE** · REL-02/05 + RISK-02
- **18 — PRÁVNÍ TEXTY, LICENCE RIS/OSM A PROVOZNÍ PRAVIDLA** · REL-08
- **19 — MONITORING, INCIDENTY, OBNOVA A ROLLBACK** · REL-09
- **20 — KVÓTY, NÁKLADY, BEZPLATNÝ TARIF A OMEZENÍ SOCIÁLNÍHO PROVOZU** · REL-09/10 + RISK-01
- **21 — PŘÍPRAVA UZAVŘENÉHO PILOTU PRO 10–20 ÚČTŮ** · REL-10
- **22 — VYHODNOCENÍ PILOTU, OPRAVNÉ ITERACE A EXIT GATE** · REL-10
- **23 — VEŘEJNÉ SPUŠTĚNÍ WEBOVÉ/PWA APLIKACE PRO RYBÁŘE** · REL-10
- **24 — ANDROID CAPACITOR SESTAVENÍ A FYZICKÉ NATIVNÍ TESTY** · MOB-01
- **25 — GOOGLE PLAY CONSOLE, INTERNÍ TESTOVÁNÍ A PUBLIKACE** · MOB-01/03
- **26 — IOS CAPACITOR BUILD, XCODE A FYZICKÝ IPHONE** · MOB-02
- **27 — TESTFLIGHT A APPLE APP STORE PUBLIKACE** · MOB-02/03
- **28 — SOCIÁLNÍ JÁDRO 1–9: KOMPLETNÍ ŽIVÁ AKCEPTACE** · REL-05 + POST-02
- **29 — NEARBY, BEZPEČNÁ PŘÍTOMNOST A VYHLEDÁVÁNÍ RYBÁŘŮ V OKOLÍ** · POST-02
- **30 — KATALOGOVÁ GEOMETRIE REVÍRŮ A SERVEROVÉ ČLENSTVÍ U REVÍRU** · REL-08 + POST-02
- **31 — CHAT U REVÍRU — DOKONČIT BACKEND, MODERACI A UI** · POST-02
- **32 — SOUKROMÉ ZPRÁVY, CREW A KOMUNITNÍ OBSAH REVÍRŮ** · POST-02
- **33 — KOMPLETNÍ SOCIÁLNÍ INTEGRACE, ADMIN, FINÁLNÍ RELEASE 1.0+** · POST-02/03

## Průběh podle hlavního plánu

- **00 · PASS.** Checkpoint 0bf13ec ověřen, původních 27 změn zachováno. Hlavní soubor a čtyři svazky potvrzeny, pořadí aktualizováno zde. Produkce READY na 68fbf04.
- **01 · PARTIAL · 21. listopadu 2026.** Technické uzavření Crew, místního chatu, Okolí a nové přítomnosti hotové. Přímé geo operace selžou před službou, odvolání zůstává autorizované. [Rozsah všech 56 tras](RELEASE_SCOPE_MATRIX.md). Lint, 1 187 jednotkových testů, build, product a plná Rules sada (1 667 dílčích kontrol) PASS. Chromium: 180 hostovských a 140 přihlášených kombinací, 10 zavřených přímých vstupů hosta, 10 přihlášených, 4 anonymní přesměrování, kontrola menu a offline foto. První pomocný běh nestihl úklid před ukončením emulátoru, samostatný opakovaný běh PASS včetně úklidu. Commit d1ac3dc79a13988b99bb1b2460b8c7dddfca6d5f, GitHub vývojová větev ověřena, Vercel preview READY na stejném SHA. Vercel produkce 68fbf04. Otevřené vlastníkovo vymezení sociálního pilotu a potvrzení izolace preview REL-02. Vydání je uzavřené.

- **02 · PARTIAL · 21. listopadu 2026.** Opraveno obnovování session-only Auth po navigaci/obnově bez povýšení na trvalé úložiště. Dva nezávislé Chromium profily, přihlášení, reload a odhlášení PASS. Auth emulátor nové A/B relace, scope a jednorázové email/reset akce PASS. Lint, 1 188 jednotkových testů, build a cílených 18 auth testů PASS. První běh odhalil skutečnou chybu a časování pomocného testu; ověřený opakovaný průchod prošel. [Protokol účtu](QA_AUTH_ACCOUNT_LIVE.md). Commit 5caca034b08306101f403fa66a9807b33ab331da, push na vývojovou větev ověřen, Vercel preview READY na stejném SHA. Produkce na 68fbf04. Chybí schválené živé testovací identity a mailbox pro produkční e-mail, Google, suspend a výmaz. REL-04 zůstává BLOCKED pro živou část.

- **03 · PARTIAL · 21. listopadu 2026.** Na čtecí hranici znovu složena povolená Catch projekce a ohraničeno DTO zážitku/milníku. Přidány syntetické regresní scénáře k uloženým mapám s privátním klíčem a neschváleným údajem. Lint, 1 188 jednotkových testů, build a Rules PASS, včetně 211 feed a 288 publikačních kontrol, celkem 1 673 dílčích kontrol. [Protokol soukromí](QA_PUBLIC_PRIVACY.md). Commit podle git log pro tento protokol, push ověřit na vývojové větvi. Vercel produkce 68fbf04. Živá revokace a Cloudinary zůstávají v 06–07, REL-05 BLOCKED pro veřejnou komunitu. Pravidla Firestore se nezměnila.

## Přesný bod pokračování

**Prompt 04** · inventura exportovaných, čištěných a místních úložišť; ověřit limity exportu, opakovaný výmaz, delete fence a pokračování fronty v izolované sadě. Živý výmaz jen na výslovně schváleném účtu.
