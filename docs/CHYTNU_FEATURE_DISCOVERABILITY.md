# Dohledatelnost funkcí ChytnuCz

Kontrola proti Promptu 01 a routeru se 57 deklaracemi. Hlavní sekce jsou Domů, Deník, Komunita a Profil. Jejich běžný vstup je jeden krok ze spodní navigace. Funkce uvedená v profilové skupině je z otevřeného Profilu dostupná dvěma kroky (rozbalit, otevřít). Položky „přes“ přidávají zvolení skutečného záznamu nebo další kontextovou akci. Čísla nezahrnují psaní ani bezpečnostní potvrzení.

| Funkce | Trasa | Hlavní sekce | Vstup z Profilu | Kontextový vstup | Výchozí návrat | Podmínka | Stav |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Domů, počasí, aktivní vycházka a Quick Catch | `/` | Domů | — | Spodní navigace, zápis z galerie nebo fotoaparátu | — | — | Dostupné |
| Odhad aktivity ryb | `/fish-activity` | Domů | — | Jak odhad funguje na Domů | / | — | Poloha jen se souhlasem |
| Přihlášení, registrace, obnova hesla, host | `/login` | Účet | Správa účtu | Vstup do aplikace, přihlášení z komunitních funkcí | Volba způsobu přihlášení | Konfigurace Auth | Veřejné |
| První nastavení deníku | `/onboarding` | Účet | — | První spuštění, volba režimu a polohy | Zpět mezi kroky | — | Vstup podle stavu onboarding |
| Nový ruční úlovek a koncept | `/add` | Zápis | — | Středové +, Deník, revír a vycházka | /journal | — | Místní koncept |
| Detail úlovku, fotky, oblíbené, smazání | `/catch/:id` | Deník | Deník a moje úlovky → Všechny úlovky | Deník, Galerie, mapa, vycházka, revír | /journal | — | Vlastní záznam |
| Úprava úlovku | `/catch/:id/edit` | Deník | Přes úlovek | Detail → Upravit úlovek | /catch/:id | — | Varování při odchodu |
| Potvrzení uložení a získané XP | `/catch/:id/reward` | Deník | Přes úlovek | Po uložení nového úlovku | /catch/:id | — | Po uložení |
| Karta a sdílení úlovku | `/catch/:id/share` | Deník | Přes úlovek | Detail úlovku → Sdílet | /catch/:id | publicSharing | Se souhlasem |
| Všechny úlovky, hledání a filtry | `/journal` | Deník | Deník a moje úlovky | Spodní navigace, Domů | — | — | Místní |
| Kalendář dne, měsíce a roku | `/journal/calendar` | Deník | Deník a moje úlovky | Deník → Kalendář | /journal | — | Místní |
| Soukromá mapa a detaily bodů | `/journal/map` | Deník | Revíry a mapy | Deník → Mapa, detail úlovku a Hotspoty | /journal | — | Místní body, podklad online |
| Stará adresa mapy | `/map` | Deník | — | Historický odkaz se zachováním parametrů | /journal/map (přesměrování) | — | Alias |
| Přehled míst úlovků | `/hotspots` | Deník | Revíry a mapy | Deník → Mapa, příběhy a přehledy | /journal/map | — | Místní |
| Galerie, filtry, prohlížeč fotografií | `/gallery` | Deník | Deník a moje úlovky | Deník → Galerie | /journal | — | Místní kopie, chráněné online fotky |
| Statistiky a osobní rekordy | `/stats` | Deník | Deník a moje úlovky, Postup a cíle | Deník → Statistiky | /journal | — | Místní |
| Osobní přehledy a tipy | `/insights` | Deník | Deník a moje úlovky | Deník → Mapa, příběhy a přehledy | /journal | Souhlas pro externí AI | Místní analýza |
| Příběh sezóny | `/season-story` | Deník | Deník a moje úlovky | Deník → Mapa, příběhy a přehledy | /journal | Souhlas pro externí AI | Dostupné místní jádro |
| Roční souhrn | `/year-summary` | Deník | Deník a moje úlovky | Deník → Mapa, příběhy a přehledy | /journal | — | Místní |
| Vycházky, aktivní a minulé | `/trips` | Deník | Deník a moje úlovky | Deník → Vycházky | /journal | — | Místní |
| Zahájení vycházky, volba revíru | `/trips/new` | Deník | Přes Vycházky | Domů nebo Vycházky, pokud žádná neběží | /trips | — | Varování při odchodu |
| Detail vycházky, mapa, úlovky, ukončení | `/trips/:id` | Deník | Přes Vycházky | Seznam vycházek, Domů, detail úlovku | /trips | — | Vlastní záznam |
| Úprava vycházky a výchozích údajů | `/trips/:id/edit` | Deník | Přes Vycházky | Detail vycházky → Upravit | /trips/:id | — | Varování při odchodu |
| Moje revíry, oblíbené, GPS a hledání | `/waters` | Deník | Revíry a mapy | Deník → Moje revíry, katalog | /journal | — | Vlastní revíry |
| Katalog ČRS/RIS a filtry | `/waters/catalogue` | Deník | Revíry a mapy | Moje revíry, výběr revíru ve formuláři | /waters | — | Katalog z cache |
| Detail RIS, pravidla, mapa a uložení | `/waters/catalogue/:catalogueId` | Deník | Přes Katalog ČRS/RIS | Výsledek hledání, detail uloženého revíru | /waters/catalogue | — | Veřejná data katalogu v aplikaci |
| Přidání revíru | `/waters/new` | Deník | Přes Moje revíry | Přidat revír, rozpracovaný úlovek | /waters nebo /add | — | Varování při odchodu |
| Úprava uloženého revíru | `/waters/:waterId/edit` | Deník | Přes Moje revíry | Detail uloženého revíru → Upravit | /waters/:waterId | — | Varování při odchodu |
| Detail revíru, záznamy, oblíbené, mapa | `/waters/:waterId` | Deník | Přes Moje revíry | Moje revíry, detail úlovku, katalog a vycházka | /waters | — | Vlastní záznam |
| Profil, trofeje, účet, záloha, obnova a synchronizace | `/profile` | Profil | Spodní navigace | Účet a místní data, osobní vitrína | —, sekce dat → /profile | Cloudové akce pro účet | Místní záloha i pro hosta |
| Veřejná identita a nastavení sdílení | `/profile/social` | Profil | Komunita a přátelé | Vlastní veřejný profil, Soukromí, editor příspěvku | /profile | publicProfiles | Přihlášený účet, varování při odchodu |
| Nastavení, export účtu, zpětná vazba a výmaz | `/settings` | Profil | Nastavení a soukromí, Správa a podpora | Odkazy na konkrétní sekce | /profile | Výmaz účtu a cloud jen s účtem | Výmaz s potvrzením |
| Soukromí, GPS, viditelnost a osobní místa | `/privacy` | Profil | Nastavení a soukromí | Nastavení, odkazy na předvolby sdílení | /settings | — | Místní nastavení |
| Zásady ochrany osobních údajů | `/privacy-policy` | Profil | Nastavení a soukromí | Přihlášení, Nastavení, Podmínky | /settings nebo /login | — | Veřejné |
| Podmínky používání | `/terms` | Profil | Nastavení a soukromí | Přihlášení, Nastavení, Zásady | /settings nebo /login | — | Veřejné |
| Administrace, podpora, moderace a stav | `/admin/*` | Profil | Správa a podpora | Oprávněná administrace → příslušné záložky | /profile | Serverové RBAC | Podle role a oprávnění |
| Úspěchy a odměny | `/achievements` | Profil | Postup a cíle | Úrovně a XP, oznámení | /profile | — | Místní |
| Úrovně a XP | `/levels` | Profil | Postup a cíle | Domů, přehled postupu | /profile | — | Místní |
| Úkoly a výzvy | `/challenges` | Profil | Postup a cíle | Domů, oznámení | /profile | Rozsah výzev podle příznaků | Stávající konfigurace |
| Týdenní série | `/streak` | Profil | Postup a cíle | Přehled postupu | /profile | streaks pro rozšířené série | Stávající přehled |
| Druhové album, vody a trofeje | `/album` | Profil | Postup a cíle | Vlastní vitrína, detail druhu | /profile | — | Místní |
| Detail druhu, první a nejlepší úlovek | `/species/:speciesKey` | Profil | Přes Druhové album | Album, profilová vitrína | /album | — | Místní |
| Mistrovství druhu | `/species/:speciesKey/mastery` | Profil | Přes Detail druhu | Odkaz u dostupného mistrovství | /species/:speciesKey | speciesMastery pro rollout | Podle konfigurace postupu |
| Podpora projektu | `/supporter` | Profil | Správa a podpora je-li povolena | Podpůrná stránka | /profile | supporter | Výchozí vypnuto |
| Feed a přímé hledání | `/community` | Komunita | Komunita a přátelé | Spodní navigace, Domů a Přátelé | — | community, userDiscovery pro hledání | Zavřeno v pilotu |
| Příspěvek, komentáře a reakce | `/community/post/:postId` | Komunita | Přes Komunitní přehled | Feed, veřejný profil, oznámení | /community | community | Serverová viditelnost |
| Místní náhled úlovku a interakce v zařízení | `/community/catch/:catchId` | Komunita | Přes Komunitní přehled | Místní náhled v Komunitě | /community | community | Povolená místní projekce |
| Hlášení příspěvku ze staré adresy | `/community/:postId/report` | Komunita | Přes Komunitní přehled | Detail příspěvku → Nahlásit | /community/post/:postId (přesměrování) | community | Přístup a zápis potvrzuje server |
| Veřejný profil rybáře | `/u/:identity` | Komunita | Vlastní profil nebo přes hledání | Výsledek hledání, Přátelé, autor příspěvku | /community nebo /profile pro vlastní | publicProfiles | Serverová viditelnost |
| Stará adresa hledání rybářů | `/community/find` | Komunita | Přes Najít rybáře | Historické odkazy | /community#fisher-search (přesměrování) | community + userDiscovery | Zavřeno v pilotu |
| Přátelé, příchozí a odeslané žádosti | `/friends` | Komunita | Komunita a přátelé | Komunita, oznámení, veřejný profil | /community | friends | Přihlášený účet |
| Oznámení a předvolby | `/notifications` | Komunita / Profil v pilotu | Komunita a přátelé, Nastavení a soukromí | Domů, Komunita, Nastavení | /profile | Sociální cíle podle konfigurace | Přehled povolený i v pilotu |
| Soukromé zprávy | `/messages/:targetUid?` | Komunita | Komunita a přátelé je-li povoleno | Přátelé, povolený profil a seznam konverzací | /friends nebo /messages | directMessages | Výchozí vypnuto |
| Crew | `/crew` | Komunita | Komunita a přátelé je-li povoleno | Komunita | /community | crew | Výchozí vypnuto |
| Chat konkrétního revíru | `/waters/:waterId/chat` | Komunita | Přes Moje revíry je-li povoleno | Detail revíru, ověřené členství | /waters/:waterId | waterChat | Výchozí vypnuto |
| Dobrovolné Okolí a hrubá poloha | `/nearby` | Komunita | Komunita a přátelé je-li povoleno | Komunita | /community | nearby | Výchozí vypnuto |
| Neznámá či uzavřená adresa | `*` | Aplikace | — | Chybný, smazaný nebo uzavřený odkaz | /journal | Podle cíle | Bezpečný návrat |

## Zjištěné a opravené nedostatky

- Profil měl dvě stálé rozbalovací navigační skupiny, panel dat a samostatný odkaz administrace podle role. Nyní má šest tematických skupin a stávající panel dat. Přibylo 36 položek v komponentě rozcestníku včetně odkazů podmíněných funkcemi a oprávněním. Odkazy vedou na kanonické stránky Deníku, Komunity a stávající sekce účtu.
- Dvě slepé cesty potvrzené ve výchozím stavu. Přehled míst úlovků měl vlastní trasu bez běžného vstupu. Stará trasa hlášení obsahovala neaktivní panel. Po opravě mají obě funkční vstup. Dříve uzavřené rollouty do počtu nespadají.
- Pět běžných stránek postrádalo samostatný návrat (Galerie, Statistiky, Vycházky, Moje revíry a Hotspoty). Nově jej mají všechny. Okolí má připravený stejný návrat pro budoucí povolení. Místní záloha nově má návrat i z profilového odkazu na sekci.
- Opraveny čtyři typy chyb návratu. Slepý krok historií z detailu druhu, použití zachovaného klíče prohlížeče po obnovení úlovku, pevný návrat mimo zdrojovou stránku a opakování stejného detailu v historii po uložení editace. Staré adresy mapy a hledání zachovávají své parametry.
- Návrat používá záznam skutečně navštívené interní stránky v paměti aktuálního profilu a dokumentu. Při obnovení nebo cizím vstupu má explicitní interní cíl. Rozbalení Profilu, hledání v Komunitě, filtry Deníku a katalogu se při návratu uchovají v paměti relace. Údaje se neposílají ani nevkládají do URL.
- Rozpracovaný nový úlovek dál ukládá stávající koncept. Zpět a spodní navigace u formulářů bez trvalého konceptu žádají potvrzení. Varování se použije i při opouštění dokumentu, pokud ho prohlížeč zobrazí. Nativní gesto historie uvnitř SPA a libovolné kontextové odkazy nemají centrální blokaci.
- Offline mapa využívá místní body a případně dříve načtený podklad. Sociální funkce vyžadují online ověřený účet a serverová oprávnění. Viditelnost, blokování, moderace a správa účtu zůstávají pod stávající serverovou kontrolou.

Další související záznamy jsou v [mapě tras](CHYTNU_FINAL_ROUTE_MAP.md) a [registru provedení](CHYTNU_FINAL_EXECUTION.md).
