# ChytnuCz · inventář a matice ověření

Rozsah je auditovaný commit `68fbf04b70e123b226bac90ee83f12dde1dc352b`. Všechny trasy s deklarací jsou v sekci níže, včetně aliasů a podmíněných tras. Identifikátory odkazují na [backlog](PUBLIC_LAUNCH_BACKLOG.md). Inventář mapuje komponenty tras, hlavní operace a jejich model. Individuální kliknutí mimo popsané scénáře zůstávají neověřená.

## Evidenční klíč

- **N** = nově provedená jednotková, pravidlová nebo integrační sada `npm test`, `test:rules`, `test:auth`, `test:sync`, `test:photos`. Emulátor není produkce, foto transport je simulovaný nebo local-only.
- **G** = nově provedený lokální Chromium guest, 18 tras × 10 šířek. Cesty /, /journal, /journal/calendar, /journal/map, /trips, /gallery, /stats, /community, /friends, /nearby, /profile, /settings, /waters/catalogue, /add, /fish-activity, /notifications, /hotspots, /JOURNAL/. Deset šířek 320, 360, 375, 390, 430, 768, 1024, 1280, 1440 a 1920 px. Sleduje (1) cestu (2) aktivní sekci (3) vodorovné přetečení.
- **A** = přihlášený Chromium s Auth emulátorem a onboardingem. Nový běh na auditovaném SHA má 140/140 průchodů bez nálezu. Stejné pokrytí bylo zaznamenáno ve [starším browser protokolu](AI_VISUAL_QA.md). Posuzované trasy /, /journal, /trips, /gallery, /stats, /community, /friends, /nearby, /profile, /settings, /privacy, /waters/catalogue, /add a /notifications při stejných deseti šířkách.
- **O** = nový Chromium offline. Zápis jednoho úlovku testovací JPEG, detail, skutečný obraz a zavření celého browser procesu. Stejný profil a odpojený server po znovuotevření. Tři odkazy přehledů v Deníku kliknuty při 390 px před vypnutím serveru.
- **U** = nový přihlášený transakční scénář s emulátorem. Na /trips/new založena vycházka, reload potvrdil aktivní stav, po ukončení a dalším načtení potvrzen dokončený stav, po výmazu otevření původní URL ukázalo „Vycházka nenalezena“. Přímé /crew samostatně ukázalo „Jen místně“.
- **P** = omezený aktuální read-only HTTP/metadata důkaz na živé doméně. Dostupnost HTML nedokazuje funkční backend ani ochranu více účtů. Zbytek je zdrojová evidence.
- Stavy funkcí **OVĚŘENÁ** v konkrétním prostředí, **IMPLEMENTOVANÁ / NEOVĚŘENÁ**, **ČÁSTEČNÁ**, **ROZBITÁ**, **CHYBÍ**, **VYPNUTÁ**, **MIMO VYDÁNÍ**. Stav kritických scénářů níže používá PASS, FAIL, PARTIAL, NOT TESTED, BLOCKED a NOT APPLICABLE.

## Trasy, komponenty a podkladové operace

Relativní názvy komponent jsou v `src/pages/`, pokud není uvedeno jinak. ID je stabilní skupina souvisejících tras a operací.

| ID | Trasa a komponenta | Chování, data a backend | Stav a důkaz | Produkční omezení a priorita |
| --- | --- | --- | --- | --- |
| F01 | / · HomePage a HomeRoute | Aktivní výprava, rychlá fotka, poslední úlovky, agregace a odhad podmínek. Místní data, volitelné počasí a sociální preview | OVĚŘENÁ navigace G/A/P, O capture | Živé počasí, naplněný dashboard a výpadek. P1 REL-06/08 |
| F02 | /login · LoginPage | E-mail, Google, heslo, host, zaškrtávací persistence; Firebase Auth | OVĚŘENÁ emulátor N; živý OAuth neověřen | Doručení e-mailu a autorizované domény. P1 REL-04 |
| F03 | /onboarding · OnboardingPage | Volba jednoduchého/detailního režimu, volitelná poloha a dokončení. Auth a local preference | OVĚŘENÁ A a N | Systémový GPS prompt při obou rozhodnutích. P1 REL-06 |
| F04 | /journal · JournalPage | Čtení Catch, search, filtrů, řazení, chybějících detailů, historie a vstup do reportů | OVĚŘENÁ G/A/O; filtry N | Velký deník, interakce s délkou textu. P1/P2 REL-07 |
| F05 | /journal/calendar · JournalCalendarPage | Místní Catch a Trips podle data, navigace na záznam | OVĚŘENÁ G; datová logika N | Reálný vzorek přes hranici dne, měsíce a pásma. P2 |
| F06 | /journal/map a /map · MapPage; /hotspots · HotspotsPage | Leaflet/OSM, místní Catch, strukturované GPS, agregace míst | ČÁSTEČNÁ G/N, alias stejný komponent | Odmítnutí GPS, slabá síť, bez offline dlaždic, OSM. P1/P2 REL-06/08 |
| F07 | /add, /catch/:id/edit · AddCatchPage | Capture a klasický editor, ruční úpravy, draft, fotografie, volitelný trip a water; catchRepository, IndexedDB a sync | OVĚŘENÁ O/N pro JPEG, G/A otevření | Fyzický foto input, konflikt, čtyři snímky a upload. P1 REL-03/06 |
| F08 | /catch/:id · CatchDetailPage | Detail, fotky, edit, odstranění, XP údaje a privátní místo | OVĚŘENÁ O/N | Reálný výmaz bohatého záznamu ze dvou zařízení. P1 REL-04 |
| F09 | /catch/:id/reward · CatchRewardPage | Stav XP odvozený místně a kompatibilita se serverovým ledgerem | IMPLEMENTOVANÁ / NEOVĚŘENÁ UI, N výpočty | Duplicita XP, neúplný úlovek, souběh a degradace. P2 |
| F10 | /catch/:id/share · CatchSharePage | Safe share karta a oddělená zvolená sociální publikace; publikace, souhlas a media API | ČÁSTEČNÁ N, reálné sdílení neověřeno | Derivát, EXIF a revokace. P1 pokud zapnuto REL-05 |
| F11 | /gallery · GalleryPage | IndexedDB a dostupná cloudová média, role fotografie, filtrování | OVĚŘENÁ G/A/O; N | Velká galerie, upload/doručení a čisté foto ACL. P1 REL-03 |
| F12 | /stats · StatsPage | Časové rozsahy, počty, osobní rekord, potvrzená a odhadnutá data | OVĚŘENÁ G/A/N | Výpočty po změně/smazání a chování nesourodých dat z migrace. P1 REL-04 |
| F13 | /album a /species/:speciesKey · SpeciesAlbumPage a SpeciesDetailPage | Lokální katalog, ruční volba a úlovky vybraného druhu | IMPLEMENTOVANÁ / NEOVĚŘENÁ UI, N data | Případy neznámých druhů a licencí obrázků. P2 |
| F14 | /species/:speciesKey/mastery · SpeciesMasteryPage | Druhový progres a lokální odvození za vlajkou funkce | VYPNUTÁ produktová vlajka | Deep link a konzistentní scope. P3 REL-01 |
| F15 | /challenges, /achievements, /levels, /streak · jmenovité Page | XP ledger a místní model průběhu; achievements/levels použitelné segmenty, sezónní/týdenní výzvy a streak pod vlajkami | ČÁSTEČNÁ N, externí uživatelské chování neověřeno | Potvrdit prvotní rozsah, XP bez duplicit a správný fallback. P2/P3 |
| F16 | /fish-activity · FishActivityPage | Open-Meteo, modelové údaje, cache a heuristické skóre | ČÁSTEČNÁ G/N | Počasí v terénu, timeout, živý tarif/zdroj. P1 REL-08 |
| F17 | /trips, /trips/new, /trips/:id, /trips/:id/edit · TripsPage, TripCreatePage, TripDetailPage, TripEditPage | Start/konec/čas, vody, explicitní catch vazba, snapshot metadata; IndexedDB/Firestore | OVĚŘENÁ G/A seznam a N sync, formulářové workflow částečně | Fyzické zahájení, konflikt, dokončení a osiřelé vztahy. P1 REL-06 |
| F18 | /waters, /waters/new, /waters/:waterId, /waters/:waterId/edit · WatersPage, WaterCreatePage, WaterDetailPage | Lokální a synchronizovaný Water, vazby, doporučení; CRUD a výmaz | ČÁSTEČNÁ N, dřívější scénář v [RIS](RIS_CATALOGUE.md) | Privátní GPS, ruční výběr a licence. P1 REL-08 |
| F19 | /waters/catalogue, /waters/catalogue/:catalogueId · WaterCataloguePage, CatalogueWaterDetail | Statická sada RIS, vyhledávání a stabilní identifikátor | OVĚŘENÁ G/A seznam a N katalog | Chybný/nezadaný bod, čas zdroje, práva distribuce. P1 REL-08 |
| F20 | /profile, /settings, /privacy · ProfilePage, SettingsPage, PrivacyPage | Scope, lokální a cloudová záloha, export, mazání, nastavení počasí/privacy | ČÁSTEČNÁ G/A/N | Plná data, dvě relace, administrátorský lifecycle. P1 REL-04 |
| F21 | /privacy-policy a /terms · PrivacyPolicyPage a TermsPage | Statické právní texty a veřejná čitelnost bez přihlášení | OVĚŘENÁ P dostupnost, obsah existuje | Revize textu, regionu, kontaktu, práv a verzování. P1 REL-08 |
| F22 | /profile/social a /u/:identity · social/SocialProfileSettings a PublicFishingProfile | Souhlas, projekce, handle, sekce, avatar, preview a přátelé. Server a Cloudinary | ČÁSTEČNÁ N, dřívější multi-account prohlížeč | Aktuální live A/B/C, fotka a odvolání. P1 pokud povoleno |
| F23 | /friends · social/FriendsPage; /community/find · social/FisherDiscovery | Žádosti, akceptace, zrušení, blok a hledání. Projekce a vazby | OVĚŘENÁ N, G/A otevření /friends | Aktivní role a dlouhé UI stavy na telefonu. P1 pokud povoleno |
| F24 | /community · CommunityPage; /community/post/:postId · CommunityPostPage | Feed global/friends, text, foto, komentáře a reakce. Server DTO a kurzory | ČÁSTEČNÁ N/G/A/P front door | Foto/latence a moderace před otevřením. P1 REL-05 |
| F25 | /community/catch/:catchId a /community/:postId/report · CommunityCatchDetailPage a CommunityReportPage | Přechodová obrazovka úlovku a nahlášení; sociální služba, lokální kompatibilita | IMPLEMENTOVANÁ / NEOVĚŘENÁ UI; N serverové reporty | Přímý link, blok, neaktivní starý obsah, error stavy. P1 pokud povoleno |
| F26 | /notifications · NotificationsPage | Lokální i sociální inbox, preference, čtení. Firestore jmenný prostor uživatele | ČÁSTEČNÁ G/A/N; push odesílač vypnut | Odhlášení, druhý telefon, suppression opakování. P2 |
| F27 | /nearby · NearbyPage | Opt-in, hrubá pozice, revíry, omezený výstup, oddělená přítomnost na vodě | ČÁSTEČNÁ G/A/N | Fyzický opt-in/opt-out, špatná přesnost, ochrana malých skupin. P2 ve veřejném jádru |
| F28 | /waters/:waterId/chat · WaterChatPage; /crew · CrewPage | IndexedDB místní zprávy a Crew draft. Serverový room service bez API vazby | ČÁSTEČNÁ, U Crew lokální, uživatelské online sdílení CHYBÍ | Přímé routy mohou být za hranou scope. P1 skrýt / P3 vyvinout |
| F29 | /insights, /season-story, /year-summary · InsightsPage, SeasonStoryPage, YearSummaryPage | Deterministické shrnutí deníku, omezený a volitelný externí journal; spojení na existující lokální Catch | OVĚŘENÁ O odkazy a N lokální data, provider NEOVĚŘENÁ | Souhlas, čas/kvóta a žádné pozadí. P2, zajistit fallback P1 |
| F30 | /supporter · SupporterPage/fallback | Entitlement a informace, feature off | VYPNUTÁ | Checkout a placené funkce mimo vydání. P3 |
| F31 | /admin/* · features/admin/AdminDashboard | Firebase UID a role, admin API, monitoring, tasky, granty, revize a audit | OVĚŘENÁ N role, P metoda odmítnuta; UI live neověřeno | Prověřit delegaci vlastníka, grant s výmazem a provozní alerty. P1 REL-02/09 |
| F32 | * · NotFoundPage a app/routeAccess.js | Neznámá cesta, guest guard, veřejné linky, redirect | IMPLEMENTOVANÁ / NEOVĚŘENÁ návaznost, N guard | Přímý link při expiraci, neplatné ID a offline chyby. P2 |

## API a datové operace

| Hrana | Operace, model a autorizace | Důkaz a chybějící přijetí |
| --- | --- | --- |
| /api/account/delete | Čerstvý Firebase token a stav účtu, označení žádosti, výmaz Auth a podstromů, izolované foto joby, inkluze sociálních referencí | N testy a rules. Živý celý lifecycle REL-04. Alias dotazu social/admin deleguje do témže handleru, oba zůstávají odděleně autorizované |
| /api/cloudinary/capability, /sign, /verify-upload, /metadata | Dostupnost konfigurace; token, vlastník a konkrétní catch/photo pro upload a ověření metadat | P capability 200 enabled; N podpis a synthetic READY. Živý originál REL-03 |
| /api/cloudinary/delivery, /delete, /export, /cleanup | Privátní foto grant, odstranění a fronta, export; cron vyžaduje tajnou autorizaci, klient ji nedostává | P delivery GET 405 a cleanup bez oprávnění 401. N transport a cleanup. Reálné dokončení REL-03/04/09 |
| /api/progression/claim-catch, /reconcile | Firebase identita a vlastnictví, serverové ověření Catch, idempotence ledgeru | N a emulátor sociální projekce. Reálné dvojí zařízení/progress shadow P2 |
| /api/ai/journal | Omezený journal handler, autorizace, režim tip/příběh, souhlas a provider | N testy logiky, poskytovatel NOT TESTED; přepínač a fallback REL-01 |
| /api/social · identity a seznamy | self, save, view, preview, search, friends, friends.status, relationship, block, report, avatar.set/remove a image. Projekce a autorizace podle akce | N profily 95, hledání 84, vztahy 129; skutečný avatar a CDN otevřené |
| /api/social · obsah | posts.save/own/list/image/delete/publishNew/view, feed.list, entries.save, progression.compare, interactions.list, reactions.set, comments.save/delete, reports.create. Projekce, revize, bloky, safe DTO | N publikace 284, feed 209, XP 203, interakce 136. P feed bez auth 401. Produkční REL-05 a zátěž |
| /api/social · geo | nearby.join/leave/consent/status/discover/waterActivity; waterPresence.status/join/refresh/leave. Hrubá celá oblast a nezávislé potvrzení vody | N Nearby 83, water presence 22. Fyzická a dlouhodobá akceptace |
| /api/admin · řízení | self, overview, users.list/get/update, config.get/update, tasks.list/save/delete, audit.list, monitoring. ID token, roli kontroluje server | N 39 administrátorských kontrol, P GET 405. Autorizované role na live ověřit po schválení |
| /api/admin · podpora | support.own/open/grant/revoke/cases/case.open/case.save/content/photo, moderation.own/set, users.public/history/index, social.reports.list/report.resolve, progression.preview/adjust/self. Oprávnění po zdrojích, audit | N 50 kontrol; živé provedení REL-04/05/09 |
| Přímý Firebase | Email/Google/reset; owner-scoped Catch/Photo/Trip/Water, sync state/operations/changes, notificationPreferences, notifications a pushSubscriptions; serverové AI/progression/social kolekce dle Rules | N standardní i negativní operace. Aktivní pravidla v chutnucz obsahově shodná po normalizaci. 12 složených indexů a dvě field overrides shodné. Živý login, tarif a staging REL-02/04 |

## Transakční akceptace

| Test | Aktér a výchozí stav | Provedení a očekávání | Typ / důkaz / stav | Zbývá |
| --- | --- | --- | --- | --- |
| T01 registrace | Nový uživatel | Založit, doručit a použít ověřovací e-mail | Auth N PASS v emulátoru, celkem PARTIAL | Live P1 |
| T02 reset | Založený účet | Vyžádat a jednou použít odkaz, staré heslo odmítnuto | Auth N PARTIAL | Live doručení/expirace P1 |
| T03 login a relace | Host, A | Přihlásit e-mailem a Google, obnovit a odhlásit | Auth N, A e-mail PARTIAL | Skutečný Google P1 |
| T04 data scope | A a B | Vyměnit účet při čekajícím zápisu, obě data izolována | Auth a Sync N PARTIAL | Fyzické A/B a legacy P1 |
| T05 Quick Catch | Host offline | Zvolit JPEG, uložit, dohledat a rozpoznat čitelný snímek | O a N PASS lokálně | Fyzická kamera P1 |
| T06 offline restart | Host, bez HTTP serveru | Zavřít proces, otevřít detail, ověřit blob | O PASS desktop | Instalovaná PWA / HEIC P1 |
| T07 upload/CDN | A, připravený foto blob | Upload READY, cizí B odmítnut, oprávněné druhé zařízení zobrazuje | N synthetic, P capability. Živé NOT TESTED | Schválený fixture a provider P1 |
| T08 sync recovery | A ve dvou relacích | Ztráta sítě, retry, zachování ID, konflikt a tombstone | Sync N PARTIAL | Skutečná dvě zařízení P1 |
| T09 editor | A, Catch | Upravit ruční údaje proti pozdějšímu enrichmentu, obnovit | N PARTIAL | Plný browser a zařízení |
| T10 výmaz Catch | A s uploadem | Smazat během čekání, bez návratu nebo sirotka | N PARTIAL | CDN cleanup |
| T11 Deník | Host s Catch | Kombinovat filtry, řadit, vyhledat a otevřít | N/G/O PARTIAL | Velký dataset a klikací kombinace |
| T12 Trip | A žádná vycházka | Založit, přiřadit catch, ukončit, upravit, smazat | U založení/reload/konec/výmaz PASS; sync N | Přiřazení Catch a fyzický offline scénář PARTIAL |
| T13 Water | A, katal. a privátní | Vyhledat/uložit revír a připnout k výpravě bez přepisu ručního údaje | N/A a historický browser PARTIAL | GPS a zdroj práv |
| T14 GPS | Host bez permission | Zamítnout a ručně dokončit, pak povolit přesnost | N a simulace PARTIAL | Fyzický systémový dialog |
| T15 XP/achievement | A nový a starý záznam | Nárok, duplicita, historické milníky, smazání | Jednotky/203 projekčních N PASS v emulátoru | Fyzická relace, P2 |
| T16 profil | A/B bez profile | Výslovně povolit, host/B a sekce podle oprávnění | 95 N PASS v emulátoru | Produkční režim a avatar |
| T17 publikace | A a starý soukromý záznam | Nová public volba jen s platným souhlasem a safe DTO | 284 N PARTIAL | Skutečný derivative a revokace |
| T18 odvolání | A1/A2 + B | Zastaralé zařízení zkusí obnovit, B nedostane projekci | 284 N PARTIAL | Čas a živé CDN |
| T19 žádost a přijetí | A a B | Žádost, přijmout, blokovat, opětovná žádost zamítnuta | 129 N PASS v emulátoru | Proběhnout schválenou sociální betu |
| T20 feed | A/B/C, public a private | Rozdílné role, stránkování a odvolání | 209 N PASS v emulátoru | Seznam při kapacitě pilota |
| T21 reakce/komentář | A/B s příspěvkem | Uložit, změnit, odmítnout nepovolenou mutaci | 136 N PASS v emulátoru | Mobilní editor a fan-out |
| T22 notifikace | A žádost / B | Jedna událost, nastavení, čtení, blok | N PARTIAL | Live relace, push mimo vydání |
| T23 report/moderace | B nahlásí, owner vyřídí | záznam, omezení akce, rozhodnutí, audit | N PASS v emulátoru | reálný postup podpory |
| T24 výmaz účtu | A a B, sdílený obsah | A žádá výmaz, cleanup, úlohy do konce a B zachován | N PARTIAL | Produkční testovací účet a CDN P1 |
| T25 export/obnova | A s lokálními a cloud fotkami | Dva exporty, výpadek, limit, čistý profil a obnova | N PARTIAL | Shell export na obou OS P1 |
| T26 příběh a tip | A, syntetická historie | Deterministický výstup bez sítě a autorizovaný provider jen s opt-in | N/O lokální PASS, provider NOT TESTED | Pokud zůstane vypnuto, provider NOT APPLICABLE |
| T27 update PWA | A, nesync fronta | Aktualizovat bez smíchání assetů a zachovat fotku | N/O základ PARTIAL | Instalovaná PWA update obou OS |
| T28 Android kamera | Fyzický Android | Sestavení, sign, kamera/galerie/restart | BLOCKED na SDK, podpis a hardware | MOB-01 |
| T29 iOS kamera | Fyzický iPhone | Archiv, signing, HEIC/limited library a restart | BLOCKED na macOS, podpis a hardware | MOB-02 |
| T30 Nearby | A–F, pod a nad prahem | Zapnout/vypnout, blok, návrat po TTL, bez přesné GPS ve výstupu | 83 N PARTIAL | Reálná zařízení a rozpočty |
| T31 Water presence | A se dvěma zařízeními | Potvrdit společnou vodu, expirace a konflikt | 22 N PASS v emulátoru | Hardware P2 |
| T32 support role | Owner, co-creator, B | Backend role, audity, úzký grant, odvolání, žádné GPS | 39 + 50 N PASS v emulátoru | Oprávněná live akceptace před moderací |
| T33 UX a dostupnost | Guest a A | Obě matice šířek, navigace, offline, řešení formulářů a SR | G/A/O PARTIAL | Systémová klávesnice, zoom, čtečky, kontrast |
| T34 rollback | Operátor, stav s frontou | Přepnout release, prokázat persistenci, napojení pravidel a alarm | NOT TESTED | REL-09 |

## Sociální plán 18 etap

| Etapa | Backend, rozhraní a důkaz | Podmínka vydání |
| --- | --- | --- |
| 1 Identita | Server-only projekce a 264 kontrol rules, 47 repository | Základ; kontrola konfigurace |
| 2 Profily | UI i server, 95 kontrol, avatar provider otevřen | Až po REL-05 pokud povoleno |
| 3 Hledání | Indexy, kurzory, 84 kontrol na 20 účtech | Moderace a výkon bety |
| 4 Přátelství | API i UI, 129 kontrol; blok a souběh | Ověřit dvě zařízení |
| 5 Galerie | Publikace a ochrana, 284 kontrol | Živé deriváty a revokace |
| 6 XP a úspěchy | Serverová projekce, 203 kontrol | Bezpečně zobrazit jen ověřené údaje |
| 7 Feed | Global/friends, bounded query, 209 kontrol; anon 401 | Kontrola zátěže, media, sekce |
| 8 Interakce | 136 kontrol reakce/komentář/report/moderace | Pojmenovaná služba moderace |
| 9 Oznámení | In-app eventy a prefs, Web Push vypnutý | Omezená sociální beta; externí odesílač později |
| 10 Okolí | Opt-in buňka a TTL, 86 kontrol | Fyzická soukromá beta, bez mapy lidí |
| 11 Geometrie | Katalog a referenční body, 188 chybí; skutečné hranice chybí | Použít jen návrhy a manuální potvrzení |
| 12 Přítomnost | Server, UI a 22 kontrol; ověřuje potvrzení, ne hranici | Samostatná beta a TTL |
| 13 Živý chat | Autorizovaný server, klient, hlášení, 56 kontrol a dva browser účty | Vypnuto. Fyzická retence, reconnect a provozní moderace. [Důkazy](SOCIAL_WATER_CHAT_ACCEPTANCE.md) |
| 14 Soukromé zprávy | Konverzace přátel, nepřečtené, moderace, 67 kontrol a dva browser účty | Vypnuto. Retence a fyzická akceptace. [Důkazy](SOCIAL_DM_ACCEPTANCE.md) |
| 15 Crew | Serverové skupiny, role, pozvání, předání, moderace, 60 kontrol a dva browser účty | Vypnuto. Pilot, moderace a další skupinový obsah. [Důkazy](SOCIAL_CREW_ACCEPTANCE.md) |
| 16 Obsah revírů | Stránkované výslovně sdílené úlovky s RIS ID, 44 kontrol a dva browser účty | Vypnuto. Licence RIS, živá média a textové příspěvky. [Důkazy](SOCIAL_WATER_CONTENT_ACCEPTANCE.md) |
| 17 Administrace | RBAC, support a moderace existují, ověřeno emulátorem | Provozní postupy, výkon, delegace |
| 18 Integrace | Dílčí A/B/C a navigační testy, plná živá akceptace chybí | Před všeobecným sociálním vydáním |

## UX/UI plán 26 etap

1. **Informační architektura** doložená route mapou a routerem. 2. **Čtyři sekce** nasazené. 3. **Spodní navigace** aktivní stav G/A, hardware otevřený. 4. **Home** aktivní vycházka a rychlý úlovek, zatížené stavy částečné. 5. **Duplicity Home** část odkazů odstraněna, prověřit funkční překryv.
6. **Profil** navigace funguje, vlastnictví záloh ve dvou obrazovkách. 7. **Nastavení/soukromí** existují, transakční P1. 8. **Onboarding** A a opt-out, hardware otevřený. 9. **Tokeny** centrální paleta, ověřit odchylky při konkrétním nálezu. 10. **Typografie a ikony** existující systém, kontrast a zoom nevysloven.
11. **Sdílené komponenty** Layout, potvrzení a status; mezistránková sjednocenost částečná. 12. **Responsivita** G/A, safe area a klávesnice otevřené. 13. **Quick Catch** O/N, fyzický foto vstup neověřen. 14. **Metadata** GPS/počasí a zachování ruční editace mají strojové pokrytí. 15. **Plný editor** implementovaný, plný mobilní A/B tok otevřený.
16. **Detail** O fotografie i metadata, edit a smazání celá cesta otevřená. 17. **Deník** G/A a filtry N. 18. **Kalendář, historie a analýza** odkazy O, detailní datová a přístupnostní akceptace zbývá. 19. **Vycházky** G/A a sync N, reálné ukončení a interakce otevřené. 20. **Revíry/RIS** katalog a vazby N, licence a data otevřené.
21. **Mapy a GPS** Leaflet a hrubé návrhy, fyzické měření a licence otevřené. 22. **Druhy** ruční katalog a album, plná čitelnost a zdroje neověřeny. 23. **Galerie** G/A/O, živý cloud otevřen. 24. **Progrese a statistiky** N a A render, skutečný multi-device životní cyklus otevřen. 25. **Offline a výkon** cold reopen Chromium PASS, instalovaná PWA a slabé zařízení neověřené. 26. **Úplná akceptace** otevřená do splnění REL-01–10.

[Hlavní závěr](PUBLIC_LAUNCH_READINESS.md) · [Akceptační checklist](RELEASE_ACCEPTANCE_CHECKLIST.md).
