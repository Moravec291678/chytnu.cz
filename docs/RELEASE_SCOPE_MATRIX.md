# ChytnuCz · rozsah prvního vydání

Technický kandidát Promptu 01. Host znamená potvrzený lokální profil. Bez hostovské volby nebo relace se soukromé adresy přesměrují k přihlášení. Účet i vlastník používají vlastní datový scope. Administrativní role a autentizaci ověřuje backend. Vlastník schvaluje, které ověřené sociální funkce patří do soukromého pilotu.

## Všech 56 tras

| Trasa | Rozsah kandidáta |
| --- | --- |
| / | Veřejný vstup |
| /login | Veřejný vstup |
| /admin/* | Serverem ověřená administrativní role |
| /onboarding | Jádro · účet nebo potvrzený host |
| /journal | Jádro · účet nebo potvrzený host |
| /journal/calendar | Jádro · účet nebo potvrzený host |
| /journal/map | Jádro · účet nebo potvrzený host |
| /challenges | Jádro · účet nebo potvrzený host |
| /achievements | Jádro · účet nebo potvrzený host |
| /levels | Jádro · účet nebo potvrzený host |
| /streak | Jádro · účet nebo potvrzený host |
| /fish-activity | Jádro · účet nebo potvrzený host |
| /species/:speciesKey/mastery | Jádro · účet nebo potvrzený host |
| /species/:speciesKey | Jádro · účet nebo potvrzený host |
| /album | Jádro · účet nebo potvrzený host |
| /map | Jádro · účet nebo potvrzený host |
| /add | Jádro · účet nebo potvrzený host |
| /catch/:id/reward | Jádro · účet nebo potvrzený host |
| /catch/:id/share | Stávající sociální jádro · rozsah pilotu podmíněný |
| /catch/:id | Jádro · účet nebo potvrzený host |
| /catch/:id/edit | Jádro · účet nebo potvrzený host |
| /gallery | Jádro · účet nebo potvrzený host |
| /stats | Jádro · účet nebo potvrzený host |
| /profile | Jádro · účet nebo potvrzený host |
| /profile/social | Stávající sociální jádro · rozsah pilotu podmíněný |
| /u/:identity | Stávající sociální jádro · rozsah pilotu podmíněný |
| /privacy | Jádro · účet nebo potvrzený host |
| /privacy-policy | Veřejný vstup |
| /terms | Veřejný vstup |
| /settings | Jádro · účet nebo potvrzený host |
| /notifications | Jádro · účet nebo potvrzený host |
| /insights | Jádro · účet nebo potvrzený host |
| /season-story | Jádro · účet nebo potvrzený host |
| /year-summary | Jádro · účet nebo potvrzený host |
| /supporter | Uzavřeno · návrat do profilu |
| /trips | Jádro · účet nebo potvrzený host |
| /trips/new | Jádro · účet nebo potvrzený host |
| /trips/:id | Jádro · účet nebo potvrzený host |
| /trips/:id/edit | Jádro · účet nebo potvrzený host |
| /waters | Jádro · účet nebo potvrzený host |
| /waters/catalogue | Jádro · účet nebo potvrzený host |
| /waters/catalogue/:catalogueId | Jádro · účet nebo potvrzený host |
| /waters/new | Jádro · účet nebo potvrzený host |
| /waters/:waterId/edit | Jádro · účet nebo potvrzený host |
| /waters/:waterId | Jádro · účet nebo potvrzený host |
| /waters/:waterId/chat | Uzavřeno · standardní 404 UI |
| /hotspots | Jádro · účet nebo potvrzený host |
| /friends | Stávající sociální jádro · rozsah pilotu podmíněný |
| /community/post/:postId | Stávající sociální jádro · rozsah pilotu podmíněný |
| /community | Stávající sociální jádro · rozsah pilotu podmíněný |
| /community/find | Stávající sociální jádro · rozsah pilotu podmíněný |
| /community/catch/:catchId | Stávající sociální jádro · rozsah pilotu podmíněný |
| /community/:postId/report | Stávající sociální jádro · rozsah pilotu podmíněný |
| /nearby | Uzavřeno · standardní 404 UI |
| /crew | Uzavřeno · standardní 404 UI |
| * | Neznámá trasa |

## Dostupnost a menu

Crew, chat u revíru, Okolí a serverová přítomnost jsou v kandidátu vypnuté pro všechny role. Odkazy Okolí a místního chatu i panel přítomnosti v katalogovém detailu podléhají stejným příznakům. Neznámá URL pro DM jde do stávajícího fallbacku. Úložiště konceptů a privátní GPS zůstávají zachovaná, ruční práce s revíry a místní GPS návrhy fungují jako dosud. Supporter zůstává vypnutý. Stávající místní výzvy, série, druhové statistiky, příběhy a roční přehled zůstávají v deníkovém rozsahu. In-app oznámení jsou samostatná funkce, bez aktivace push doručování.

Funkce sociálních etap 1–9 jsou podmíněné výběrem rozsahu a živým ověřením v Promptech 03, 07 a 28. Stávající produkční chování se tímto checkpointem nemění. Etapy 10–16 zůstávají mimo pilot. Explicitní povolení geografických akcí používá izolovaný emulátorový test. Klientský vstup ani owner UID příznaky nepovolují.

## Backend a podmínky prostředí

| Rozhraní nebo akce | Dostupnost |
| --- | --- |
| Firebase Auth a Firestore | Soukromé jádro. Rules, revize a vlastnictví samostatně od UI. Auth v 02, produkční konfigurace a izolované preview v REL-02. |
| /api/account/delete | Čerstvě ověřený účet, výmaz ve frontě. Akceptace v 04. |
| /api/cloudinary/capability | Veřejný read-only status poskytovatele bez klíčů. |
| /api/cloudinary/sign, verify-upload, metadata, delivery, export, delete | Ověřený účet, povolený zdroj a scope fotky. Živě ověřit v 06–07. |
| /api/cloudinary/cleanup | Vyhrazená serverová autorizace cronu. |
| /api/progression/claim-catch, reconcile | Autorizovaný Catch/ledger, podle stávajícího režimu. |
| /api/ai/journal | Podmíněné příběhy a tipy z deníku. Ověření účtu, souhlas a dostupný provider. Rozpoznávání druhů není součástí. |
| /api/admin | RBAC a scope grantů. Samoobsluha podpory dostupná jen v oprávněném scope, privilegované operace role. |
| /api/social · identity | Podmíněné self, save, view, preview, search, friends, friends.status, relationship, block, report, avatar.set/remove a image. |
| /api/social · obsah | Podmíněné posts.save/own/list/image/delete/publishNew/view, feed.list, entries.save, progression.compare, interactions.list, reactions.set, comments.save/delete, reports.create. |
| /api/social · poloha | nearby.join/status/discover/waterActivity, zapnutí nearby.consent a waterPresence.status/join/refresh vracejí 404 před obsluhou. nearby.leave, vypnutí nearby.consent a waterPresence.leave nadále vyžadují skutečnou identitu a umožní starému klientovi zrušit sdílení. |
| Chat, DM a Crew API | Operace nejsou registrovány. Validátor odmítá neznámou akci 400. Rezervované serverové kolekce nejsou klientsky přístupné. |

Klient používá VITE_BACKEND_MODE, VITE_FIREBASE_* a samostatný přepínač Google Auth. Server používá například PHOTO_CLOUD_PROVIDER a CLOUDINARY_* pro média, CHYTNU_OWNER_UID / CHYTNU_CO_CREATOR_UID pro role, SERVER_PROGRESSION_SHADOW pro ledger a AI_PROVIDER / AI_ZERO_COST_CONFIRMED pro volitelnou AI. V produkci schválit identitu Firebase projektu, autorizované domény, IAM a izolaci preview. Předchozí audit potvrdil shodu pravidel a indexů s produkčním SHA 68fbf04. Hodnoty klíčů se do registru nezapisují.
