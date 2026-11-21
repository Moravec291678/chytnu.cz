# Produktový kontrakt ChytnuCz

Stav k 21. listopadu 2026. Podklad pro schválení po Promptu 00 nového balíku 00–23. Výchozí kód je vývojový commit `dcdc595883ee0563694326d5245d448d1e051a51`. Produkční `main` je `68fbf04b70e123b226bac90ee83f12dde1dc352b`. Výsledky konkrétních scénářů jsou v [registru provedení](CHYTNU_FINAL_EXECUTION.md) a [mapě tras](CHYTNU_FINAL_ROUTE_MAP.md).

## Produkt

ChytnuCz spojuje soukromý rybářský deník s dobrovolnou sociální sítí, rybářskou identitou a revíry. Hlavní akce je zaznamenat zážitek u vody. Tmavé rozhraní se zelenou zůstává, základ tvoří Domů, Deník, Komunita a Profil s centrální akcí pro úlovek. U soukromého pilotu Komunita chybí záměrně.

- **Osobní příběh.** Úlovky, vycházky, galerie, kalendář, retrospektivy a bezpečný export. Příležitostný rybář se rychle dostane k fotce i ručnímu formuláři.
- **Postup a identita.** XP, rekordy, trofeje, druhové album a úspěchy ze skutečných údajů. Aktivní rybář a sběratel vidí důvěryhodný postup. Úroveň sama nezvyšuje pravomoci v moderaci.
- **Komunita.** Schválené sdílení, profily, přátelé, feed, reakce, komentáře a oznámení. Členové komunity se k pozdějším zprávám, Crew a chatu dostanou přes sekundární vstupy podle oprávnění a připravenosti.
- **Objevování.** Revíry, vycházky, soukromé mapy a případně hrubé dobrovolné Okolí. Pro průzkumníka je katalogový bod referencí. Neprokazuje hranici revíru ani přítomnost.
- **Data a přehledy.** Statistiky, podmínky, odhady aktivity a volitelné příběhy či tipy z deníku. Chybějící měření zůstává chybějící. Počasí a skóre popisují zdroj a nejistotu.

Word navíc popisuje mladší mobilní rybáře, uživatele soustředěné na komunitu a lovce rekordů. Přístupnost, rychlý zápis, sdílení se souhlasem a hodnota vlastních dat těmto skupinám slouží bez nátlakových oznámení, vykazování falešné přítomnosti, žebříčků neověřených úlovků a soutěžní výhody za peníze. Výchozí důraz má vlastní záznam. Pokročilý feed, velká data a doplňkové kroky mají omezené čtení a jasný stav načítání, chyby nebo prázdného výsledku.

## Cílové sekce a stávající opora

- **Domů.** Výrazný Quick Catch, stručné počasí a aktivita ryb, aktivní vycházka, poslední vlastní úlovky a postup. Existuje `HomePage`, `QuickCatchButton` a přehled přátel. Prompt 03 ověří prioritu obsahu, omezený rozsah a dopad vedlejších požadavků.
- **Deník.** Jeden vstup k úlovkům, vycházkám, galerii, kalendáři a statistikám. Detail úlovku vede úpravu a soukromí. Sekundárně mapy, revíry a retrospektivy. `JournalPage`, `AddCatchPage`, `CatchDetailPage`, `catchRepository` a `syncService` už fungují. Prompty 01, 04, 06 a 07 pracují s těmito vstupy.
- **Komunita.** Jeden feed Pro všechny a Přátelé, nové Okolí pouze v povolené betě. `CommunityPage`, `socialFeedService`, `socialInteractionService` a `friendsService` poskytují skutečné podklady. Místní náhled zůstává jasně označený. Oprávněná publikace a revokace se ověřují na serveru.
- **Profil.** Soukromá správa účtu přes `ProfilePage` a `SettingsPage`. Veřejnou identitu vykresluje `PublicFishingProfile` ze schválené projekce. Profil může odkázat na údaje deníku bez paralelních obrazovek. Trofeje a rekordy zachovávají hranice sdílení.
- **Revíry a Okolí.** Katalog má 1 451 stabilních RIS ID, 1 263 referenčních bodů a žádný ověřený polygon. Úlovek a vycházku propojuje vybraný revír. Serverové služby Okolí, přítomnosti a sdílených úlovků jsou připravené za příznaky. Typy veřejnosti, vlastnictví a souhlasu se nesměšují.

## Rozhodnutí při konfliktu se starým Wordem

- **Stack.** Současný React v JavaScriptu, Vite, Router, sdílené CSS, Firebase Auth/Firestore a Vercel API. Typový, CSS ani stavový framework se plošně nemění. Cloudinary poskytuje chráněná média, IndexedDB a outbox drží místní data a obnovu. Firebase Storage a placené Functions zůstávají mimo rozsah.
- **Offline.** Školení a pilot už vyžadují místní zápis, opětovné otevření a bezpečný retry. Starý návrh odkladu offline práce je překonaný. PWA restart s JPEG je doložený v Chromiu, fyzický mobil a živé druhé zařízení mají vlastní bránu.
- **XP.** Některé hodnoty původní tabulky přežily, závazné jsou `src/product/config/xp.js`, `levels.js`, `features/progression` a serverová pravidla důkazů. Uplatňuje se násobitel ověření a limit slabě doložených úlovků. Automatické odměňování sdílení, rarity, streaky, prestige a mastery musejí vycházet ze skutečně aktivní politiky. Historie se nepřepočítává podle Wordu.
- **AI a ceny.** Povoleny pouze dobrovolné příběhy a tipy či rady z vlastního deníku. Lokální statistiky jsou deterministické. Rozpoznávání ryb, automatická foto-verifikace, AI moderace, GPS a XP predikce jsou mimo produktový kontrakt. Současný volitelný provider je podmíněn souhlasem a schválenou bezplatnou kapacitou. Stripe, premium API, placené tarify ani Firebase billing se nezapínají.
- **Veřejnost a přesnost.** Historické soukromé úlovky, osobní GPS, poznámky a originály fotografií zůstávají v odděleném vlastnickém úložišti. Soukromé zprávy čtou jen oprávnění účastníci konverzace. Příspěvek vzniká teprve se serverovým potvrzením souhlasu. Epochy, blokování, smazání a odvolání platí i mezi zařízeními. Práce s počasím používá Open-Meteo, mapy Leaflet a OSM. Před zveřejněním zdrojů se uzavírá právní brána.
- **Rozsah rozšíření.** Stávající služby zpráv, Crew a revírového chatu mají emulátorové a prohlížečové důkazy, produkčně zůstávají mimo pilot. Řízená retence, lidská moderace, fyzická zařízení a provozní kvóty se ověřují před otevřením. Žebříčky neověřených úlovků a další dlouhodobé nápady čekají mimo tento balík.

## Podmínky vydání

- **A · Soukromý web/PWA.** Deník, Quick Catch, galerie, vycházky, revíry podle schválení zdrojů, místní počasí a statistiky, postup a správa účtu. `VITE_PRIVATE_JOURNAL_PILOT=1` uzavírá sociální trasy, API a externí AI. Otevřená je živá A/B foto a účtová akceptace, fyzický Android/iPhone, právní a provozní schválení a skutečný pilot.
- **B · Sociální síť.** Souhlas a revokace včetně CDN, role a moderace, bezpečná retence a reálné objemy před postupným otevřením. Plnohodnotná sociální síť je cílový výsledek se samostatnou bránou.
- **C · Android a iOS.** Konfigurace CORS a nativní kopie ověřeny. Zbývají SDK/Xcode, fyzický průchod včetně HEIC a WebView, podpisy a Play/TestFlight. Dál platí [matice akceptace](FINAL_ACCEPTANCE_MATRIX.md).

Výkonové cíle jsou p75 LCP do 2,5 s, INP do 200 ms a CLS do 0,1 v reprezentativním mobilním prostředí. Jsou to cíle pro měření v 16. Součástí akceptace je četnost Firestore čtení, velikost balíku, zátěž dekódování obrázků a výsledek při slabé síti. Běžné akce mají jeden kanonický cíl a ověřitelné zkrácení, bezpečnostní potvrzení mají zůstat dostupná a srozumitelná.
