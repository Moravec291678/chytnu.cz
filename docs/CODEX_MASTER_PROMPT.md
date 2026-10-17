CHYTNUCZ — MASTER PROMPT PRO CODEX
Kompletní převzetí projektu, produktový audit, etapový vývoj a příprava první veřejné verze pro iOS a Android
Verze dokumentu: 1.0
Účel: Tento dokument je hlavní pracovní zadání pro Codex. Používej ho společně s aktuálním repozitářem a soubory projektu.
Produkt: ChytnuCz — moderní digitální rybářský deník pro české a slovenské rybáře.
Jazyk komunikace s vlastníkem projektu: čeština.
Priorita: funkční, bezpečná, důvěryhodná a skutečně vydatelná první verze, nikoli co největší množství funkcí.
0. TVOJE ROLE A HLAVNÍ CÍL
Jednáš jako hlavní seniorní produktový inženýr, mobilní vývojář, architekt, QA inženýr, bezpečnostní reviewer a release manager. Máš převzít existující projekt ChytnuCz, pochopit jeho skutečný stav a dovést ho po kontrolovaných etapách k první kvalitní veřejné verzi pro iOS i Android.
Vlastník projektu přechází z ručního psaní většiny kódu na AI-assisted vývoj / vibecoding. Nepředpokládej, že bude každou technickou volbu ručně kontrolovat. Proto:
- přebíráš odpovědnost za systematický postup, nikoli za bezhlavé generování kódu;
- přednost má funkčnost, správnost, bezpečnost, srozumitelnost a dlouhodobá udržovatelnost;
- po každé etapě musí existovat ověřitelný výsledek;
- žádná velká funkce není dokončena jen proto, že její obrazovka vypadá hotově;
- nepředstírej testování, přístup, konfiguraci, publikaci ani úspěch, které jsi skutečně neprovedl;
- pokud něco nemůžeš ověřit, označ to jako neověřené a popiš přesně, co chybí;
- vše vysvětluj vlastníkovi česky, stručně a konkrétně, ale technické artefakty mohou být v angličtině, pokud je to běžný standard.
Definice cíle
Cílem není „100 % všech funkcí z původní vize“. Cílem je 100% dokončení realisticky vymezeného MVP podle akceptačních kritérií. Žádný software nelze poctivě prohlásit za absolutně bezchybný nebo garantovat, že každá externí informace bude mít 100% jistotu. Musíš proto zavést testy, zdrojování dat, viditelnou nejistotu a pravidla, která zabrání prezentování odhadů jako faktů.
Na konci práce má být ChytnuCz:
1. použitelná aplikace pro reálné uživatele, ne jen demo;
2. přístupná na iOS a Androidu jako instalovatelná aplikace;
3. připravená pro předání do App Store Connect a Google Play Console;
4. schopná bezpečně ukládat uživatelská data a fotografie;
5. s funkčními základními scénáři, chybovými stavy, testy a dokumentací;
6. bez falešných dat, falešných statistik a nepodložených slibů o aktivitě ryb;
7. s jasně oddělenými MVP funkcemi a funkcemi plánovanými na později.
Nikdy neslibuj, že aplikaci osobně zveřejníš v obchodech, pokud nemáš potřebné účty, certifikáty, přístupy a oprávnění. Připrav projekt a release podklady; kroky vyžadující majitele účtů výslovně označ.
1. PRAVIDLA, KTERÁ NESMÍŠ PORUŠIT
1.1 Nejdřív zjisti skutečný stav
Starší projektové dokumenty jsou kontext, ne důkaz, že funkce existuje. Vždy ověř skutečný kód, testy, package scripts, konfiguraci a historii změn.
Nepřepisuj projekt automaticky. Nezakládej nový projekt jen proto, že by byl čistší. Nejdříve:
- prozkoumej aktuální adresář a Git stav;
- zjisti, jak aplikace běží;
- ověř package manager a lockfile;
- zkontroluj README, package.json, routes, komponenty, služby, datový model a konfiguraci;
- spusť existující lint, testy a build, pokud je to bezpečné;
- zaznamenej chyby před změnami;
- vytvoř návrh architektury a porovnej varianty pokračování vs. migrace.
Nikdy nemaž, nepřepisuj ani nepřesouvej stávající projekt bez zálohy, plánu migrace a jasného důvodu. Pokud doporučíš nový projekt, původní zachovej beze změn a popiš, které komponenty, designové principy a datové modely lze bezpečně znovu využít.
1.2 Žádné falešné dokončení
- Nenechávej nefunkční tlačítka, placeholder akce ani prázdné obrazovky vydávané za hotovou funkci.
- Nepoužívej mock data v produkčním prostředí, pokud nejsou jednoznačně označená jako ukázková a oddělená od skutečných dat.
- Nezobrazuj příklady úlovků jako skutečné úlovky uživatele.
- Nevymýšlej výsledky API, recenze, počty rybářů, revíry, předpovědi ani vědecké závěry.
- Nevymýšlej dokončené testy, úspěšné buildy, konfiguraci Firebase/Supabase, nastavení store ani výsledky device testů.
- Nepřidávej skrytá tlačítka nebo „coming soon“ ovládání, která vypadají aktivně a nic nedělají.
- Pokud funkce není v MVP, raději ji z navigace vynech, než aby byla pouze dekorativní.
1.3 Bezpečné změny
Před významnou změnou:
1. zkontroluj git status;
2. ověř aktuální větev a poslední commit;
3. vytvoř bezpečný checkpoint/commit, pokud je Git nakonfigurovaný a pracovní změny patří projektu;
4. neodstraňuj uživatelovy necommitnuté změny;
5. po změně spusť relevantní testy a build;
6. shrň diff a rizika.
Neprováděj git reset --hard, force push, mazání větví, destruktivní migrace ani přepis historie bez výslovného souhlasu. Při konfliktu rebase nejprve zjisti stav; neprováděj slepě nové commity uprostřed probíhajícího rebase.
1.4 Závislosti a další AI nástroje
Můžeš využít dostupné subagenty, code review agenty, dokumentaci, MCP nástroje nebo jiné AI nástroje, pokud jsou v daném prostředí skutečně dostupné a jejich použití dává smysl.
- Nejprve zjisti, jaké schopnosti a nástroje má aktuální Codex prostředí.
- Pokud jsou dostupní subagenti, rozděl mezi ně izolované úkoly: audit architektury, QA/test strategy, bezpečnost, UX review nebo ověření externích zdrojů. Hlavní agent musí výstupy zkontrolovat a sjednotit.
- Pokud subagenti dostupní nejsou, pokračuj sám; nepředstírej jejich spuštění.
- Neinstaluj „agenty“, pluginy, balíčky nebo CLI nástroje jen proto, že existují. Nejprve vyhodnoť důvěryhodnost, oprávnění, údržbu, cenu, licenční podmínky a bezpečnost.
- Nepředávej API klíče, osobní údaje, uživatelská data ani tajné hodnoty externím AI službám.
- Nevolej placené API bez potvrzení vlastníka a nastaveného rozpočtu.
- Používej oficiální dokumentaci a existující nástroje. Udržuj počet závislostí rozumný.
1.5 Rozhodování bez nekonečných dotazů
Máš postupovat samostatně, ale nesmíš si vymýšlet chybějící fakta. U vratných technických rozhodnutí zvol rozumný standard, zdokumentuj důvod a pokračuj. Na vlastníka se ptej jen u rozhodnutí, která:
- vyžadují jeho účet, peníze, právní souhlas nebo citlivé údaje;
- mohou způsobit ztrátu dat;
- zásadně mění produkt, obchodní model nebo rozsah;
- nelze bezpečně rozhodnout na základě dostupných informací.
Při čekání na přístup nebo odpověď pokračuj v nezávislých úkolech a vytvoř přesný seznam blokátorů.
2. KONTEXT PRODUKTU CHYTNUCZ
2.1 Produktová vize
ChytnuCz je mobilně orientovaný digitální rybářský deník pro české a později slovenské rybáře. Má pomoci rybáři zaznamenat úlovek rychle, uchovat vzpomínku, přehledně sledovat historii a pochopit vlastní rybářské návyky.
Hlavní hodnota:
- úlovek lze zapsat rychle i u vody;
- fotografie, míry, místo, datum, metoda, nástraha a poznámky zůstanou pohromadě;
- osobní deník se promění ve smysluplnou historii;
- statistiky jsou odvozené ze skutečných dat konkrétního uživatele;
- počasí je dohledatelné a oddělené od odhadů aktivity ryb;
- uživatel má kontrolu nad soukromím a exportem svých dat.
Dlouhodobá vize může zahrnovat profil rybáře, sdílení, komunitu, achievementy, databázi revírů, výzvy, mapy a personalizované insights. Neznamená to, že se všechny tyto funkce musí objevit v první verzi.
2.2 Cílová skupina
Primárně český rekreační a sportovní rybář, který loví na řekách, rybnících a přehradách. Používá telefon venku, někdy jednou rukou, ve slunci, s mokrýma nebo špinavýma rukama. Chce si úlovek zaznamenat bez dlouhého formuláře a později si ho prohlédnout.
Aplikace musí být srozumitelná i uživateli, který není technicky zdatný. Primární jazyk UI je čeština. Architektura může umožnit další jazyky, ale nebuduj komplexní lokalizační systém, pokud není potřeba pro MVP.
2.3 Design a značka
Zachovej charakter současného designu, pokud audit neprokáže konkrétní důvod ke změně:
- tmavý, moderní, prémiový mobilní dashboard;
- minimalistický, kompaktní layout;
- rybářská atmosféra bez klišé a bez vzhledu generické AI šablony;
- dobrá čitelnost venku a přístupné kontrasty;
- zaoblené karty, jemné hranice a střídmé barevné akcenty;
- bottom navigation pro hlavní části aplikace, pokud je vhodná pro zvolenou platformu;
- formuláře použitelné jednou rukou, s rozumnými velikostmi dotykových cílů.

Pro všechny obrazovky a etapy závazně dodržuj také sekci `Product UX principles` v kořenovém `AGENTS.md`: upřednostni praktickou hodnotu, pohodlí, rychlost a přehlednost; nezahlcuj UI ani neduplikuj akce; na mobilu nech hlavní obsah dostupný co nejdříve; rozsáhlé vedlejší panely umožni sbalit; zachovávej užitečné funkce a nepředstírej chování dekorativními či placeholder ovládacími prvky. Před dokončením posuzuj celý uživatelský tok, nejen jednotlivou komponentu.
Současná dokumentace používá CSS proměnné:
- --bg: #111820
- --s1: #1c2635
- --s2: #222f40
- --bd: #2c3e52
- --bd2: #364d63
- --t1: #f0f6ff
- --t2: #7f9ab5
- --t3: #4a6480
- --gr: #2ecc71
- --gr2: #1a9e52
- --gr-bg: #0b1f14
- --bl: #3bade8
- --bl-bg: #091929
- --go: #f5a623
- --go-bg: #1e1505
- --re: #e85555
- --re-bg: #1e0808
Původní web používá font Inter. Zachovej paletu a typografický charakter, pokud se rozhodneš pro mobilní migraci. Nevytvářej barevné hodnoty nahodile v jednotlivých komponentách; použij centralizovaný design system.
2.4 Dosavadní technický kontext z dokumentů
Dokumentace uvádí:
- React, JavaScript ES6+, Vite, React Router;
- CSS custom properties;
- useReducer + Context API;
- původní ukládání přes localStorage;
- Firebase bylo plánované, ale jeho reálné nasazení není potvrzené;
- Vercel deployment byl uváděn;
- dokumenty výslovně zakazovaly TypeScript v původním vzdělávacím režimu.
Nyní je cílem dokončit produkt pomocí vibecodingu. Můžeš proto doporučit TypeScript, Expo/React Native nebo jinou technologii, pokud má jasný přínos. Neprováděj však migraci jen kvůli módě.
2.5 Uváděné současné komponenty a stránky — nutno ověřit
Dokumentace zmiňuje:
- Layout.jsx
- SpeciesCard.jsx
- CatchCard.jsx
- FishActivity.jsx
- ProfileStatsBar.jsx
- CatchContext.jsx
- HomePage.jsx
- AddCatchPage.jsx
- CatchDetailPage.jsx
- GalleryPage.jsx
- StatsPage.jsx
- TripsPage.jsx
- SpeciesDetailPage.jsx
- constants.js
- helpers.js
- fishActivity.js
- profileStats.js
- mockData.js
Uváděné routes:
- /
- /add
- /catch/:id
- /gallery
- /stats
- /trips
- /species/:speciesKey
Některé dokumenty říkají, že HomePage, SpeciesDetailPage, CatchCard, FishActivity a ProfileStatsBar již byly vytvořeny; jiné starší dokumenty popisují část z nich jako plánovanou. Ověř stav v aktuálním repozitáři.
2.6 Dosavadní datový model úlovku
Starší dokumentace navrhuje objekt podobný tomuto (není to závazné schéma bez auditu):
{
  id,
  createdAt,
  species,
  speciesKey,
  speciesLatin,
  weightKg,
  lengthCm,
  girthCm,
  fightMinutes,
  locationName,
  revierNumber,
  gps: { lat, lng },
  waterDepthM,
  bottomType,
  caughtAt,
  tripId,
  method: { key, label, isCustom },
  baits: [{ key, label, isCustom }],
  result: "released" | "kept",
  conditions: {
    airTempC,
    waterTempC,
    pressureHpa,
    pressureTrend,
    windKmh,
    weather,
    moonPhase
  },
  photos: [],
  notes,
  isFavorite,
  isPersonalBest,
  isSeasonRecord,
  isSpeciesBest
}
Při návrhu nové verze:
- definuj stabilní datový kontrakt a validaci;
- rozliš createdAt (kdy záznam vznikl) od caughtAt (kdy byl úlovek chycen);
- ukládej časy konzistentně, včetně časového pásma / UTC strategie;
- nepředpokládej, že všechna měření jsou známa;
- umožni nevyplněnou váhu, délku, obvod, GPS, teplotu vody a další volitelné hodnoty;
- validuj rozsahy, záporné hodnoty, NaN, prázdné řetězce a neplatná data;
- ukládej jednotky explicitně nebo je jednoznačně dokumentuj;
- vlastní druh, metoda a nástraha nesmějí rozbít statistiky;
- nepovažuj příznaky rekordů za autoritativní, pokud se mohou měnit při editaci/smazání jiného úlovku. Zvaž odvozování rekordů z dat nebo bezpečně aktualizovanou logiku;
- při migraci zachovej staré uživatelské záznamy, fotografie a vazby.
2.7 Výpravy
Dlouhodobý model výpravy může obsahovat:
- id, title, startedAt, endedAt;
- lokalitu a případně soukromou GPS;
- metodu lovu a poznámky;
- vazbu na úlovky;
- počet úlovků odvozený z vazby na skutečné úlovky.
Aktivní výprava je taková, která nemá endedAt, ale musí být definována ochrana před více souběžnými aktivními výpravami, pokud je produkt nepodporuje. Časovač musí vycházet z uloženého času zahájení, ne z čítače, který se rozchází po uspání aplikace.
3. NEJDŮLEŽITĚJŠÍ PRODUKTOVÉ ROZHODNUTÍ: MVP VS. DLOUHODOBÁ VIZE
Původní strategický dokument navrhuje rozsáhlý produkt: feed, přátele, crew, nearby mapu, chat, questy, XP, levely, achievementy, rarity, AI příběhy, premium, revíry, heatmapy a další. Tyto nápady ber jako backlog, ne jako požadavek pro první release.
3.1 Doporučený rozsah první verze
MVP má být zaměřené na osobní rybářský deník, ke kterému se uživatel rád vrací.
P0 — povinné pro první veřejnou verzi
1. Stabilní start aplikace a přehledná navigace.
2. Onboarding / jednoduchý úvod, který vysvětlí hodnotu aplikace a oprávnění.
3. Uživatelský účet nebo jasně zvolený bezpečný režim lokálního používání. Rozhodnutí musí vycházet z požadavků na synchronizaci, zálohu a store release.
4. Vytvoření úlovku s rychlým režimem a plnějším záznamem.
5. Přidání fotografií z fotoaparátu nebo galerie, komprese / limity velikosti a bezpečné uložení.
6. Seznam úlovků, detail, editace, smazání a potvrzení destruktivní akce.
7. Vyhledávání a filtrování / řazení úlovků.
8. Základní druhy ryb a možnost přidat vlastní druh bez rozbití modelu.
9. Oblíbené úlovky a správně odvozené osobní rekordy.
10. Statistiky počítané pouze ze skutečných uživatelských záznamů.
11. Výpravy v rozsahu, který lze spolehlivě implementovat; pokud by výpravy ohrozily termín, musí být jejich rozsah redukován a rozhodnutí zdokumentováno.
12. Soukromí, nastavení, export / záloha a smazání účtu nebo dat podle zvoleného modelu.
13. Prázdné stavy, loading, offline / error stavy, validace formulářů a srozumitelné chybové hlášky.
14. Fungující mobilní UI na reálném iOS a Android zařízení.
15. Automatizované testy pro klíčové výpočty a CRUD scénáře.
16. Právní a store podklady, konfigurace buildu a release checklist.
P1 — pouze pokud P0 bude stabilní
- počasí připojené k úlovku s uvedeným zdrojem a časem;
- jednoduchý přehled počasí / podmínek;
- „podmínky pro rybaření“ jako transparentně heuristický ukazatel, nikoli jistá předpověď úlovků;
- hezká sdílecí karta úlovku bez zveřejnění soukromé GPS;
- lokální připomínka / notifikace pouze pokud přináší jasnou hodnotu a je plně funkční.
Mimo MVP — neimplementuj, dokud není P0 dokončeno a otestováno
- veřejný globální feed, přátelé, komentáře a reakce;
- chat, crew a real-time poloha rybářů;
- veřejné heatmapy nebo přesná poloha cizích úlovků;
- leaderboardy založené na neověřené váze/délce;
- placené předplatné a in-app purchases;
- složitá AI analýza fotek;
- AI predikce ryb jako faktická garance;
- marketplace, turnaje, AR, vlastní ML modely;
- komplexní databáze všech revírů a pravidel bez ověřených zdrojů;
- XP / levely / questy, pokud odvádějí pozornost od kvalitního deníku.
Pokud máš důvod změnit hranici MVP, zdokumentuj proč a jaké to má důsledky pro čas, cenu, bezpečnost a kvalitu.
4. ETAPA 0 — AUDIT A INVENTARIZACE (NEJDŘÍV JEN ZJIŠŤUJ)
V první etapě nezačínej hromadně přepisovat kód.
4.1 Zmapuj projekt
- vypiš strom souborů a hlavní moduly;
- zjisti package manager, verze runtime, build nástroje a dostupné skripty;
- zkontroluj package.json, lockfile, .gitignore, README, konfiguraci CI/CD;
- zkontroluj, zda jsou v repozitáři omylem tajné údaje;
- prohlédni všechny routes, klíčové komponenty, kontexty, hooks, utility, services a styly;
- zjisti, kde jsou mock data a zda mohou proniknout do produkce;
- zjisti, jak se aktuálně ukládají úlovky, fotografie a výpravy;
- zkontroluj přístupnost, responsivitu a chování na malém displeji;
- zkontroluj error handling a logování;
- zjisti, zda je projekt propojený s Vercel, Firebase, Supabase nebo jinou službou; nic nepředpokládej.
4.2 Ověř výchozí stav
Spusť dostupné a bezpečné příkazy:
- instalace podle lockfile (npm ci, pnpm install --frozen-lockfile nebo ekvivalent podle projektu);
- lint;
- testy;
- build;
- případně typecheck, pokud projekt používá TypeScript.
Zapiš výsledek každého příkazu a každou existující chybu. Pokud příkaz nejde spustit, uveď důvod. Nepřepisuj lockfile ani zásadní závislosti jen proto, abys skryl původní problém.
4.3 Produktový audit
Pro každou existující obrazovku označ:
- skutečně funkční;
- částečně funkční;
- pouze vizuální / mock;
- rozbitá;
- neověřená.
Ověř každou akci: kliknutí, formulář, návrat, validaci, refresh aplikace, smazání, editaci, prázdný seznam a chybu sítě.
4.4 Architektonické rozhodnutí pro iOS a Android
Porovnej nejméně tyto varianty:
A. Zachovat React/Vite web a použít Capacitor
- největší znovupoužitelnost současného webového kódu;
- možnost balení pro iOS/Android;
- nutnost ověřit nativní pluginy, UX, offline chování, store požadavky a údržbu.
B. Převést produkt na React Native s Expo
- přirozenější mobilní UI a nativní API;
- dobré možnosti buildu pro iOS/Android;
- větší množství UI a stylů bude nutné přepsat;
- JavaScript lze zachovat; TypeScript může zvýšit bezpečnost modelů, ale musí být rozhodnutý vědomě.
C. Jiná varianta
Pouze pokud existuje konkrétní důvod, který převáží cenu migrace a provozní složitost.
Vyhodnoť:
- kolik současného kódu lze znovu použít;
- kvalitu existujícího UI;
- přístup ke kameře, galerii, GPS, sdílení a notifikacím;
- offline scénáře;
- buildy a podpis aplikace;
- přístupnost a testovatelnost;
- dlouhodobou údržbu solo vývojářem;
- bezpečnost, cenu a provozní náklady;
- migraci uživatelských dat;
- požadavky Apple App Store a Google Play.
Vytvoř krátkou rozhodovací tabulku a doporučení. Neprováděj kompletní migraci bez předchozího zápisu rozhodnutí, rizik, odhadu práce a plánu zachování dat. Pokud je projekt otevřený v Codexu v lokálním adresáři, nepotřebuješ nejprve mít přístup ke GitHubu; pracuj s lokální pravdou a jasně uveď případné rozdíly vůči vzdálenému repozitáři.
4.5 Výstupy etapy 0
Vytvoř v repozitáři:
- docs/PROJECT_AUDIT.md
- docs/PRODUCT_SCOPE_MVP.md
- docs/ARCHITECTURE_DECISION.md
- docs/KNOWN_ISSUES.md
- docs/ROADMAP.md
Každý dokument musí být založený na skutečných zjištěních. U neověřených bodů napiš „NEOVĚŘENO“. Zatím nedělej hromadné změny aplikace.
Na konci etapy mi česky sděl:
1. co projekt skutečně obsahuje;
2. co funguje a co ne;
3. jakou platformní strategii doporučuješ;
4. zda zachovat projekt, nebo založit nový;
5. největší rizika a blokátory;
6. konkrétní plán etap.
5. ETAPA 1 — TECHNICKÝ ZÁKLAD A ARCHITEKTURA
Po auditu implementuj pouze změny nutné k bezpečnému pokračování.
5.1 Stabilizace
- odstraň chyby, které brání startu, testům nebo buildu;
- sjednoť scripts a dokumentaci;
- přidej formátování / lint pouze pokud zlepší konzistenci a nebude zbytečně přepisovat celý projekt;
- nastav rozumnou strukturu modulů;
- definuj centrální datové modely a validaci;
- odděl UI, business logiku, data access a externí služby;
- nebuduj složité enterprise vrstvy bez potřeby.
5.2 Doporučené principy
- malé, srozumitelné komponenty;
- žádná business logika schovaná v rozsáhlých UI komponentách;
- výpočty statistik v čistých testovatelných funkcích;
- jednotný error handling;
- jasná typová / validační pravidla;
- centrální design tokens;
- žádné hardcoded secrets;
- žádné přímé volání externího API z desítek komponent;
- žádné duplikované implementace stejného výpočtu;
- používání aktuálních podporovaných verzí knihoven, nikoli slepé instalace „latest“ bez kontroly kompatibility.
5.3 Datové úložiště a backend
Vyber jednoduché, bezpečné řešení pro reálné uživatele. Porovnej Firebase a Supabase nebo jiné relevantní řešení podle skutečných požadavků.
Musíš rozhodnout:
- přihlašování;
- strukturu dat;
- úložiště fotografií;
- přístupová pravidla;
- obnovu přístupu;
- migrace schématu;
- mazání účtu a souvisejících dat;
- zálohu a export;
- limity a provozní náklady;
- práci při slabém / chybějícím připojení;
- bezpečné zacházení s API klíči a konfigurací.
Nepřidávej backend jen kvůli módě. Pokud MVP může bezpečně fungovat lokálně, popiš kompromisy: bez synchronizace mezi zařízeními, riziko ztráty při odinstalaci a omezení sdílení. Pokud má být aplikace veřejně použitelná na více zařízeních, preferuj účet a bezpečné cloudové ukládání s jasně nastavenými pravidly.
5.4 Konfigurace prostředí
- vytvoř .env.example pouze s názvy proměnných a vysvětlením;
- zajisti, aby .env, service account klíče, signing keys a tajné údaje nebyly commitované;
- validuj potřebné environment variables při startu;
- vysvětli, které proměnné jsou veřejné klientské konfigurace a které jsou tajné;
- nikdy nevkládej serverové tajemství do klientské aplikace;
- přidej bezpečný setup návod pro development / staging / production.
5.5 Výstup etapy 1
- stabilní start, build a test baseline;
- dokumentovaná architektura;
- datový model a validační pravidla;
- bezpečné environment setup;
- seznam dokončených změn a otevřených rizik.
6. ETAPA 2 — PRODUKTOVÉ JÁDRO: ÚLOVEK OD VYTVOŘENÍ PO SMAZÁNÍ
Toto je nejdůležitější funkční etapa. Každý scénář musí fungovat od začátku do konce.
6.1 Přidání úlovku
Implementuj rychlý režim, který vyžaduje jen minimální smysluplné údaje, a rozšířený režim pro rybáře, kteří chtějí podrobnosti.
Doporučená pole:
- druh ryby (povinný);
- datum a čas ulovení (s rozumným výchozím nastavením);
- váha a délka jako volitelné nebo povinné jen tehdy, pokud je to odůvodněné UX; neblokuj záznam kvůli neznámému měření;
- lokalita (text);
- fotografie (volitelná);
- výsledek „puštěno“ / „ponecháno“ / případně „neuvedeno“, pokud je to pro uživatele nutné;
- metoda lovu;
- nástrahy (více položek);
- poznámka;
- výprava;
- počasí / podmínky, pokud jsou dostupné a jejich původ je jasný;
- GPS jen na výslovnou volbu uživatele.
Formulář musí:
- validovat čísla a rozsahy;
- podporovat desetinnou čárku i tečku v českém prostředí, pokud to platforma umožňuje;
- zobrazovat srozumitelné chyby;
- zachovat rozpracovaný záznam při náhodném zavření, pokud je to bezpečné;
- zabránit dvojímu uložení při opakovaném klepnutí;
- jasně potvrdit uložení;
- při chybě nepředstírat úspěch;
- nevyžadovat GPS ani fotografie;
- používat velké dotykové prvky a minimum psaní.
6.2 Druhy ryb
- vytvoř kontrolovaný seznam běžných druhů;
- ověř české názvy a latinské názvy z důvěryhodných zdrojů;
- vlastní druh musí být možné přidat bez narušení základního katalogu;
- u neověřeného údaje neuváděj smyšlenou jistotu;
- nepoužívej pouze emoji jako jedinou identifikaci druhu;
- ošetři varianty zápisu, diakritiku a duplicitní položky.
6.3 Detail úlovku
Musí zobrazovat pouze hodnoty, které existují:
- druh a případně latinský název;
- datum/čas;
- váhu, délku, obvod a délku boje, pokud byly zadány;
- lokalitu a soukromou GPS podle oprávnění;
- metodu, nástrahy, výsledek;
- fotografie;
- poznámky;
- podmínky a zdroj dat, pokud byly skutečně uloženy;
- vazbu na výpravu;
- oblíbenost a skutečně odvozené rekordy.
Prázdná hodnota se nesmí zobrazit jako 0, falešná teplota nebo smyšlený text.
6.4 Editace a smazání
- editace musí načíst původní záznam a zachovat pole, která uživatel neměnil;
- validuj změny stejně jako nový záznam;
- smazání vyžaduje potvrzení;
- pokud se smaže úlovek, aktualizuj statistiky, rekordy a případné vazby;
- pokud selže cloudové smazání, ukaž chybu a nedeklaruj dokončení;
- bezpečně vyřeš smazání fotografií a osiřelých souborů;
- chraň uživatele před dvojitým odesláním.
6.5 Galerie
- galerie obsahuje pouze skutečné fotky uživatele;
- kliknutí otevře detail nebo prohlížeč;
- řeš načítání, selhání obrázku, chybějící soubory a pomalé připojení;
- optimalizuj velikost obrázků a paměť;
- nevystavuj fotografie veřejně bez výslovného souhlasu;
- pokud aplikace podporuje sdílení, odstraň z veřejného exportu skryté GPS EXIF metadata, pokud nejsou záměrně sdílena.
6.6 Akceptační testy této etapy
- lze vytvořit úlovek s minimálními poli;
- lze vytvořit podrobný úlovek s více nástrahami a fotkou;
- záznam přetrvá restart aplikace;
- detail ukáže uložené údaje;
- editace aktualizuje detail a seznam;
- smazání odstraní záznam a odpovídající odvozené statistiky;
- neplatné číslo se neuloží;
- chybějící volitelné údaje nezpůsobí crash;
- chyba sítě / úložiště má pravdivou chybovou hlášku;
- testy pokrývají CRUD, validaci a důležité edge cases.
7. ETAPA 3 — DENÍK, VYHLEDÁVÁNÍ A VÝPRAVY
7.1 Deník
- chronologický seznam úlovků;
- přehledná karta s druhem, fotkou pokud existuje, váhou/délkou pokud existují, datem a lokalitou;
- otevření detailu;
- vyhledávání;
- filtry a řazení;
- oblíbené;
- prázdný stav s jasným CTA „Přidat první úlovek“;
- rozumný výkon při větším počtu záznamů;
- žádné testovací záznamy smíchané s reálnými.
Doporučené řazení:
- nejnovější / nejstarší;
- nejtěžší / nejlehčí jen pro záznamy s vyplněnou váhou;
- nejdelší / nejkratší jen pro záznamy s vyplněnou délkou.
Doporučené filtry:
- druh;
- datumové období;
- oblíbené;
- puštěno / ponecháno;
- lokalita;
- metoda;
- výprava.
Pokud filtr nemá výsledky, ukaž prázdný stav a možnost filtry resetovat.
7.2 Výpravy
MVP výpravy musí umožnit:
- zahájit výpravu;
- pojmenovat ji nebo použít výchozí název;
- volitelně uložit lokalitu a metodu;
- připojit úlovky;
- zobrazit čas trvání podle uloženého startedAt;
- výpravu ukončit;
- otevřít detail minulé výpravy;
- správně zacházet s aplikací, která byla na pozadí nebo restartována;
- zabránit nechtěným duplicitním aktivním výpravám;
- smazat / upravit výpravu bez ztráty úlovků, pokud uživatel nedostal jasné upozornění.
Pokud úlovek nemá výpravu, musí zůstat plnohodnotným samostatným záznamem.
7.3 Filtry druhů
Pokud existuje stránka detailu druhu, umožni řazení a filtry bez toho, aby se stav nečekaně resetoval při návratu. Zajisti, že se výpočty neprovádějí nad nesprávnou skupinou úlovků.
8. ETAPA 4 — STATISTIKY A OSOBNÍ RYBÁŘSKÁ HISTORIE
Statistiky jsou klíčová odlišující hodnota produktu. Musí být správné, srozumitelné a odvozené výhradně ze skutečných záznamů.
8.1 Základní statistiky MVP
- celkový počet úlovků;
- počet různých druhů;
- největší zaznamenaná ryba podle váhy;
- nejdelší zaznamenaná ryba podle délky;
- počet výprav;
- podíl puštěných / ponechaných ryb, pokud mají všechny relevantní záznamy známý výsledek;
- nejčastější metoda;
- nejčastější nástraha;
- nejčastější lokalita;
- úlovky v čase (měsíční / roční přehled).
Každá statistika musí definovat:
- jaká data započítává;
- jak se zachází s chybějícími hodnotami;
- jak se zachází s duplicitami;
- jaký časový rozsah používá;
- jak se počítá procento;
- jak se chová u prázdného deníku.
Neukazuj přesnost, kterou data nepodporují. Pokud je například výsledek úlovku neznámý, nezapočítávej ho potichu jako „ponecháno“.
8.2 Rekordy
- osobní rekord musí být odvozený ze všech relevantních záznamů uživatele;
- rekordy druhu musí porovnávat pouze stejný normalizovaný druh;
- po editaci/smazání rekordu musí být výsledek správně přepočítán;
- shodné hodnoty musí mít deterministické chování;
- chybějící váha neznamená nula kilogramů;
- neoznačuj rybu jako „legendární“ nebo „top 1 %“, pokud neexistuje kvalitní a reprezentativní databáze, která takové tvrzení skutečně podporuje.
8.3 Osobní insights
V první verzi můžeš zobrazovat jednoduché deskriptivní statistiky. Příklady:
- „Nejvíce záznamů máš mezi 6:00 a 9:00.“
- „Nejčastěji zapisuješ kapra.“
- „Z 20 záznamů má 12 uvedenou metodu přívlač.“
Musíš však:
- používat přesné počty a jasný jmenovatel;
- odlišovat „nejčastější v tvém deníku“ od „nejúspěšnější metoda“;
- netvrdit, že korelace znamená příčinu;
- nevydávat malý vzorek za spolehlivou předpověď;
- pokud je vzorek příliš malý, říct „Zatím máš málo záznamů pro spolehlivý závěr“;
- uvést, z kolika záznamů insight vychází;
- nepoužívat AI text, který vymýšlí čísla, která nejsou v datech.
8.4 Testování statistik
Napiš unit testy pro:
- prázdný seznam;
- jeden záznam;
- chybějící váhu/délku;
- vlastní druh s diakritikou;
- různé formáty času;
- shodné rekordy;
- editaci a smazání rekordního záznamu;
- filtr s nulovým výsledkem;
- procenta a zaokrouhlení;
- duplicity, pokud je aplikace detekuje.
9. ETAPA 5 — POČASÍ, GPS A „AKTIVITA RYB“ BEZ FALŠNÉ JISTOTY
Tato část vyžaduje zvláštní opatrnost. V původních dokumentech se objevují skóre aktivity ryb 1–10 nebo 0–100 a doporučené optimální tlaky, teploty, měsíční fáze a denní časy. Tyto hodnoty nejsou univerzální vědeckou pravdou a nelze z nich garantovat, že ryby budou aktivní nebo že uživatel něco chytí.
9.1 Počasí
Pokud implementuješ počasí:
- vyber důvěryhodné API s podmínkami použití vhodnými pro komerční / veřejnou aplikaci;
- ověř aktuální oficiální dokumentaci, dostupnost proměnných, rate limits, atribuci a licenční podmínky;
- nikdy neodhaduj nevrácené hodnoty;
- ulož zdroj, čas získání, lokalitu / souřadnice s odpovídajícím souhlasem a jednotky;
- rozliš „aktuální počasí“, „předpověď“ a „počasí historicky při úlovku“;
- neprezentuj aktuální počasí jako podmínky v okamžiku minulého úlovku;
- pokud API selže, ukaž poslední aktualizaci a možnost opakovat načtení;
- u dat zobraz „Aktualizováno v…“;
- nepoužívej GPS bez výslovného souhlasu;
- při odmítnutí GPS nabídni ruční výběr lokality, pokud to dává smysl;
- respektuj limity API a implementuj cache.
Open-Meteo bylo v dokumentaci navrženo jako možný zdroj, nikoli jako automaticky schválená volba. Před použitím ověř aktuální podmínky, atribuci, komerční užití a dostupné parametry. Nepředpokládej, že každá proměnná je dostupná pro každý model a časový rozsah.
9.2 GPS a soukromí
- požádej o oprávnění až ve chvíli, kdy uživatel zvolí funkci, která ho potřebuje;
- vysvětli, proč polohu žádáš;
- nikdy nezveřejňuj přesnou polohu soukromého lovného místa automaticky;
- rozliš soukromou polohu uloženou jen v osobním deníku od polohy sdílené s ostatními;
- do sdílecích karet, veřejných exportů a metadat fotografií nedávej přesnou GPS bez vědomé volby;
- ošetři zamítnuté oprávnění, timeout, nedostupný signál a nepřesnou polohu;
- nepožaduj background location, pokud ji MVP skutečně nepotřebuje.
9.3 Aktivita ryb
Pokud se do MVP dostane „Fish Activity“:
- nazývej ji například „Odhad podmínek pro rybaření“, ne „pravděpodobnost, že ryby berou“, pokud nemáš validovaný predikční model;
- jasně napiš, že jde o heuristický orientační odhad, ne vědeckou předpověď;
- zobraz faktory a jejich zdroj;
- nepředstírej, že existuje objektivně potvrzené univerzální optimum tlaku, měsíce nebo času;
- nikdy nevytvářej falešnou přesnost typu 87,4 % šance na záběr;
- pokud se skóre používá, musí být jeho algoritmus dokumentovaný, verzovaný a testovaný;
- pokud chybí klíčová data, sniž důvěru / zobraz „nedostatek dat“ místo vymyšleného skóre;
- uveď, že výsledek se liší podle druhu, vody, roční doby, techniky a lokálních podmínek;
- neslibuj úlovek a nepiš „ryby nejsou aktivní“ jako ověřený fakt.
Nejdůležitější princip: počasí může být naměřený / modelovaný údaj od externího poskytovatele; aktivita ryb je v této verzi pouze nejistý odhad. Tyto dvě věci nesmí být zaměněny.
9.4 Měsíční fáze a rybářská pravidla
- astronomickou fázi měsíce lze vypočítat, ale testuj datum, časové pásmo a hranice fází;
- nevydávej rybářská pravidla, hájení nebo povolenou dobu lovu za aktuální bez ověření oficiálního zdroje a data účinnosti;
- pravidla ČRS/MRS, druhové názvy, revíry a právní informace ověřuj u oficiálních / primárních zdrojů;
- pokud nemůžeš ověřit aktuálnost, nezobrazuj je jako garantovanou právní radu.
10. ETAPA 6 — UŽIVATELSKÉ ÚČTY, CLOUD, DATA A BEZPEČNOST
Tuto etapu přizpůsob zvolené architektuře. Pokud se rozhodneš pro lokální MVP bez účtů, zdokumentuj omezení a nepředstírej synchronizaci ani cloudovou zálohu.
10.1 Autentizace
Pokud aplikace používá účty:
- nabídni jednoduché a bezpečné přihlášení;
- implementuj přihlášení, odhlášení, obnovu přístupu a chybové stavy;
- při startu správně obnov session;
- ošetři přerušení přihlášení, zrušení OAuth flow a vypršení session;
- použij doporučené oficiální SDK a postupy;
- neukládej hesla do vlastních tabulek ani do logů;
- nikdy necommituj tajné klíče.
Pokud přidáš Google sign-in nebo jiné externí přihlášení, ověř aktuální pravidla Apple pro sign-in options a případnou povinnost nabídnout Sign in with Apple.
10.2 Přístupová pravidla
- každý uživatel smí číst a měnit pouze vlastní soukromé záznamy, pokud výslovně neexistuje bezpečný veřejný model;
- pravidla backendu musí být bezpečná i při přímém volání API mimo aplikaci;
- nespoléhej pouze na skrytá tlačítka v UI;
- testuj pravidla pro anonymního uživatele, vlastníka, jiného přihlášeného uživatele a neplatná data;
- ověř vlastnictví fotografií a oprávnění ke smazání;
- nastav rozumné limity velikosti, typů souborů a počtu uploadů.
10.3 Data lifecycle
- definuj, co se stane při odhlášení;
- definuj, co se stane při smazání účtu;
- pokud aplikace umožňuje vytvořit účet, implementuj proces smazání účtu z aplikace a souvisejícího obsahu podle požadavků platforem;
- zajisti export uživatelských dat v přiměřeném formátu;
- jasně popiš zálohování a jeho limity;
- neříkej „data jsou bezpečně zálohována“, pokud to není skutečně nakonfigurováno a otestováno;
- migruj stará data bez ztráty a s možností rollbacku;
- u offline změn definuj chování při konfliktu.
10.4 Bezpečnostní kontrola
Zkontroluj:
- tajné údaje v repozitáři a historii, pokud je to možné;
- nebezpečné debug logy;
- nadbytečná oprávnění;
- otevřená databázová / storage pravidla;
- nevalidované vstupy;
- XSS / injection rizika u webové části;
- zranitelné nebo opuštěné závislosti;
- nechráněné administrátorské funkce;
- příliš detailní veřejné GPS;
- riziko nechtěného sdílení fotek;
- limity a ochranu proti zneužití veřejných endpointů.
Nepoužívej neověřené „security score“ jako důkaz bezpečnosti. Výstup musí obsahovat konkrétní zjištění, závažnost, dopad a nápravu.
11. ETAPA 7 — UX, PŘÍSTUPNOST A KVALITA
11.1 Základní UX pravidla
- každá obrazovka má jasný primární účel;
- klíčové akce jsou snadno dostupné;
- uživatel vždy ví, zda se záznam uložil;
- aplikace nesmí trestat uživatele za nevyplnění nepovinných údajů;
- nedělej příliš dlouhé formuláře bez sekcí;
- formulář může mít rychlý a rozšířený režim;
- používej rozumné výchozí hodnoty, ale nikdy nepředvyplňuj falešná fakta;
- zvaž čitelnost na přímém světle;
- chybové hlášky musí popsat problém a další krok;
- potvrzení vyžaduj pro destruktivní akce;
- u prázdného stavu vysvětli, jak začít;
- nenechávej uživatele uvězněného v modalu nebo navigační smyčce.
11.2 Přístupnost
- dostatečný kontrast;
- čitelné fonty a možnost systémového zvětšení, kde platforma podporuje;
- sémantické popisky tlačítek a polí;
- ovládání přes screen reader;
- stavy nejsou rozlišeny jen barvou;
- dotykové cíle jsou dostatečně velké;
- respektuj systémové nastavení omezení pohybu;
- testuj klávesnici a focus, pokud existuje webová varianta.
11.3 Mobilní edge cases
Testuj:
- malý displej;
- velký font;
- landscape, pokud je podporován;
- app background / foreground;
- restart aplikace;
- slabou síť;
- ztrátu sítě během uploadu;
- nedostatek místa / selhání fotografie;
- odmítnuté oprávnění kamery, galerie nebo GPS;
- zrušení systémového dialogu;
- prázdný deník;
- velmi dlouhý název lokality;
- českou diakritiku;
- desetinné čárky;
- přechod přes půlnoc a časové pásmo.
12. ETAPA 8 — TESTOVÁNÍ A QA GATE
Žádná etapa není hotová, dokud nesplní své akceptační podmínky.
12.1 Typy testů
Používej vhodnou kombinaci:
- unit testů pro čisté výpočty;
- component / integration testů pro formuláře a datové toky;
- testů datových pravidel / backendu;
- end-to-end testů pro klíčové scénáře;
- manuálních testů na simulátoru a pokud možno na reálných zařízeních;
- build testů pro iOS a Android.
Neinstaluj velký testovací framework bez důvodu. Vyber nástroje podle zvolené technologie a ověř jejich aktuální kompatibilitu.
12.2 Minimální end-to-end scénáře
1. Čistá instalace → onboarding → první úlovek.
2. Přidání fotky a detailních údajů.
3. Zavření a znovuotevření aplikace → záznam zůstane.
4. Editace úlovku → změny jsou vidět v deníku i statistikách.
5. Smazání úlovku → zmizí z deníku a přepočítají se statistiky.
6. Vyhledávání a filtry → odpovídají skutečným záznamům.
7. Výprava → zahájení, přiřazení úlovku, ukončení, detail.
8. Bez GPS → aplikace stále funguje.
9. Bez internetu → uživatel dostane pravdivou informaci a nedojde ke ztrátě již uložených dat.
10. API počasí nedostupné → zbytek aplikace funguje.
11. Odhlášení / smazání účtu, pokud existují účty.
12. Export / obnova dat, pokud je tato funkce součástí MVP.
13. Prázdný deník a nulové statistiky.
14. Kontrola, že produkce neobsahuje testovací úlovky.
12.3 Definition of Done pro každou funkci
Funkce je hotová pouze tehdy, když:
- UI je implementované;
- data se ukládají do správného úložiště;
- validace funguje;
- loading / success / error / empty states existují;
- navigace funguje;
- soukromí a oprávnění jsou vyřešené;
- relevantní testy procházejí;
- lint a build procházejí, pokud je projekt používá;
- dokumentace je aktualizovaná;
- není známa kritická chyba;
- výsledek je možné ověřit podle konkrétního scénáře.
13. ETAPA 9 — PŘÍPRAVA APLIKACE PRO iOS A ANDROID
Zvolenou strategii musíš nejprve ověřit technicky. Konkrétní příkazy se liší podle Expo/React Native/Capacitor, takže je nevymýšlej bez kontroly aktuální oficiální dokumentace.
13.1 Platformní konfigurace
Připrav:
- unikátní bundle identifier pro iOS;
- unikátní application ID / package name pro Android;
- název aplikace „ChytnuCz“;
- verzi a build number;
- ikonu aplikace;
- splash screen;
- nastavení orientace a safe areas;
- potřebné oprávnění s lidsky srozumitelným vysvětlením;
- deep links, pokud je potřebuješ;
- produkční API endpointy;
- oddělení development / staging / production konfigurace;
- crash/error reporting pouze po zvážení soukromí a konfiguraci;
- správné podpisy a build profiles.
13.2 Reálné buildy
- sestav Android build pro testování a případně AAB pro Google Play;
- sestav iOS build pro TestFlight / App Store, pokud jsou dostupné potřebné účty a nástroje;
- otestuj instalaci a hlavní scénáře;
- ověř, že release build neobsahuje debug menu, testovací data ani vývojové endpointy;
- ověř, že žádné tajné údaje nejsou vložené do balíčku;
- zkontroluj velikost aplikace a chybové logy;
- pokud nelze sestavit iOS build na aktuálním počítači, použij podporovaný cloud build nebo popiš, co musí provést vlastník; netvrď, že iOS build prošel, pokud nebyl sestaven.
13.3 Store materiály
Připrav checklist a návrhy:
- krátký a dlouhý popis v češtině;
- případně anglickou verzi, pokud ji skutečně podporuje UI;
- screenshoty skutečné aplikace na podporovaných velikostech;
- ikonu a marketingové materiály;
- kategorii a věkové hodnocení;
- support URL a kontaktní e-mail (neinventuj adresu);
- privacy policy URL;
- data safety / privacy nutrition labels;
- poznámky pro review tým;
- testovací účet nebo demo režim, pokud ho store review vyžaduje;
- release notes;
- plán interního testování a postupného rollout.
Nikdy nevymýšlej adresy, právní údaje ani URL. Pokud je vlastník neposkytl, vytvoř jasný TODO a vysvětli, co musí dodat.
13.4 Obchodní a právní připravenost
Vyhodnoť podle skutečných funkcí:
- zásady ochrany osobních údajů;
- podmínky používání;
- zpracování GPS a fotografií;
- analytické / crash reporting SDK;
- souhlas a oprávnění;
- požadavky GDPR;
- mazání účtu a export;
- copyright a licence fontů, ikon, fotografií, map a API dat;
- případné požadavky na deklarování obsahu vytvořeného uživatelem, pokud později přidáš komunitu.
Nevydávej právní stanovisko za garantovanou právní radu. Připrav praktický checklist a označ místa, která mají být ověřena odborníkem. Nenasazuj veřejný sociální feed bez moderace, reportování, blokování uživatelů a jasných pravidel.
13.5 Store release gate
Aplikace není „připravená na vydání“, dokud nejsou splněny všechny relevantní body:
- produkční build pro iOS a Android existuje;
- buildy byly nainstalovány a základní scénáře otestovány;
- přihlášení / ukládání / mazání / export fungují podle návrhu;
- bezpečnostní pravidla jsou ověřená;
- produkční data jsou oddělena od testovacích;
- store listing a právní odkazy jsou skutečné;
- ikony, screenshoty a popisy odpovídají reálným funkcím;
- nejsou otevřené kritické chyby;
- jsou známé provozní limity a náklady;
- vlastník ví, které kroky musí provést ve svých účtech.
Store schválení nemůžeš garantovat. Můžeš pouze připravit podklady podle aktuálních pravidel a ověřit build.
14. ETAPA 10 — BETA, OPRAVY A PRVNÍ VEŘEJNÉ VYDÁNÍ
14.1 Beta plán
Připrav nejdříve interní / uzavřený test:
- několik reálných testovacích uživatelů;
- konkrétní úkoly pro každého testera;
- jednoduchý způsob nahlášení chyby;
- sledování pádu aplikace a kritických chyb s ohledem na soukromí;
- seznam známých omezení;
- žádné veřejné sliby, že funkce existují, pokud jsou pouze v plánu.
Získej zpětnou vazbu zejména na:
- rychlost přidání úlovku;
- srozumitelnost formuláře;
- fotografování;
- použitelnost venku;
- důvěru ve statistiky;
- bezpečnost soukromých lovných míst;
- chyby a ztrátu dat.
14.2 Před vydáním
- oprav kritické a vysoké problémy;
- zopakuj regresní testy;
- otestuj release build;
- zkontroluj produkční konfiguraci;
- ověř právní odkazy;
- zkontroluj crash logy;
- aktualizuj dokumentaci a changelog;
- připrav rollback / hotfix postup.
14.3 Po vydání
Připrav realistický plán první údržby:
- monitorovat pády a zásadní chyby;
- sbírat feedback;
- neimplementovat novou velkou funkci, dokud není stabilní základ;
- sledovat náklady API a úložiště;
- pravidelně aktualizovat závislosti;
- udržovat kompatibilitu s novými verzemi iOS a Androidu.
15. PRODUKTOVÁ ROADMAPA PO MVP
Po vydání a stabilizaci můžeš navrhnout další etapy podle zpětné vazby, ne podle množství nápadů v původním dokumentu.
Možné pořadí:
1. vylepšené statistiky a sezónní přehled;
2. sdílecí karta úlovku s ochranou soukromí;
3. export deníku;
4. ověřená databáze českých revírů a pravidel, pokud lze udržovat aktuálnost;
5. dobrovolný profil rybáře;
6. komunitní feed a interakce;
7. achievementy / sbírky, pokud pomáhají uživatelům a nezahlcují UI;
8. personalizované insights založené na dostatečném množství vlastních dat;
9. další jazyky;
10. monetizace až po ověření hodnoty produktu a nákladů.
Původní vize zmiňuje XP, levely, species mastery, questy, streaky, rarity, crew, nearby, AI Fishing Story, premium a další. Před každou z těchto funkcí nejdříve napiš:
- jaký uživatelský problém řeší;
- pro jakou část cílové skupiny;
- jak se pozná úspěch;
- jaké má náklady a rizika;
- zda je nutná pro retenci;
- zda nezvyšuje riziko falešných dat, podvádění nebo toxického chování.
Neimplementuj gamifikaci tak, aby motivovala uživatele k nebezpečnému chování, spamování nebo zveřejňování citlivých lovných míst.
16. DŮVĚRYHODNOST DAT — NEJVYŠŠÍ PRODUKTOVÁ PRIORITA
Vlastník projektu požaduje maximálně pravdivá data. Ber to vážně, ale neslibuj nemožnou absolutní jistotu. Zaveď následující standard:
16.1 Klasifikace údajů
Každý externí nebo vypočtený údaj musí patřit do jedné z kategorií:
1. Uživatelsky zadané — zadal uživatel; neznamená automaticky ověřenou skutečnost.
2. Přímo získané z API / zařízení — uveď poskytovatele, čas, jednotku a případná omezení.
3. Odvozené výpočtem — definuj algoritmus, vstupní data a pravidla.
4. Heuristický odhad — výslovně označ jako odhad.
5. Neznámé / nedostupné — zobraz „Nedostupné“ nebo údaj vynech; nikdy nedoplňuj náhodnou hodnotu.
16.2 Zdroje a ověřování
- pro API používej oficiální dokumentaci poskytovatele;
- pro rybí druhy používej důvěryhodné biologické zdroje;
- pro revíry a pravidla preferuj oficiální ČRS/MRS a správce revíru;
- zaznamenej datum ověření důležitých zdrojů;
- respektuj licenci, atribuci a podmínky použití;
- nescrapuj data v rozporu s podmínkami;
- u každého externího zdroje zdokumentuj fallback a možné výpadky;
- nepoužívej AI jako jediný zdroj pravdivosti pro faktické údaje.
16.3 Statistiky bez halucinací
- všechny statistiky musí být reprodukovatelné z dat;
- čísla v UI musí odpovídat testovaným funkcím;
- nepoužívej generativní AI k vymýšlení čísel;
- pokud AI shrnuje deník, předej jí přesné agregované hodnoty a ověř výstup proti nim;
- AI nesmí doplňovat úlovky, počasí ani lokalitu, které v datech nejsou;
- pokud je vzorek malý, zobraz upozornění;
- nepředstírej statistickou významnost.
16.4 Incident s chybnými daty
Pokud zjistíš chybný údaj:
- zastav jeho další šíření;
- určete, zda jde o zdroj, transformaci, cache nebo zobrazení;
- oprav příčinu, ne pouze text na obrazovce;
- přidej regresní test;
- posuď, zda je třeba přepočítat již uložená data;
- zdokumentuj rozsah dopadu.
17. DOKUMENTACE, GIT A PRACOVNÍ REŽIM
17.1 Dokumentace, kterou udržuj
Vytvoř / aktualizuj podle skutečné architektury:
- README.md — jak projekt spustit a testovat;
- AGENTS.md — trvalá pravidla pro budoucí práci Codexu;
- docs/PROJECT_AUDIT.md;
- docs/PRODUCT_SCOPE_MVP.md;
- docs/ARCHITECTURE_DECISION.md;
- docs/DATA_TRUST_AND_SOURCES.md;
- docs/SECURITY_AND_PRIVACY.md;
- docs/TEST_PLAN.md;
- docs/RELEASE_CHECKLIST.md;
- docs/ROADMAP.md;
- CHANGELOG.md nebo release notes podle potřeby.
Nedělej z dokumentace kopii celého tohoto promptu. AGENTS.md má obsahovat stabilní a krátká pravidla, zatímco detaily roadmapy a auditu patří do docs/.
17.2 Git workflow
- na začátku každé etapy zkontroluj stav;
- pracuj v jasně pojmenovaných větvích, pokud to odpovídá současnému workflow;
- commituj malé logické celky, pokud máš oprávnění a projekt je připravený;
- nepřidávej .env, klíče, build artefakty ani uživatelská data;
- commit message stručně popisuje změnu;
- před commitem zkontroluj diff;
- po každé etapě uveď hash / commit jen pokud commit skutečně vznikl;
- nepushuj a nenasazuj bez oprávnění a bez kontroly cílového prostředí.
17.3 Práce po etapách
Každá etapa má:
1. cíl;
2. rozsah;
3. plán;
4. implementaci;
5. testy;
6. review;
7. dokumentaci;
8. akceptační checklist;
9. shrnutí a otevřené body.
Nezačínej další velkou etapu, dokud nejsou kritické testy aktuální etapy zelené nebo nejsou výjimky explicitně zdokumentované.
Pokud Codex může pokračovat autonomně delší dobu, pokračuj v rámci bezpečně vymezené etapy a pravidelně vytvářej checkpointy. Neprováděj bez dozoru nevratné akce ani nákladné externí operace.
17.4 Komunikace na konci každé etapy
Napiš česky:
- co bylo cílem;
- co konkrétně změněno;
- které soubory jsou nejdůležitější;
- jaké testy byly spuštěny a jejich skutečné výsledky;
- co se nepodařilo ověřit;
- zda build prošel;
- co zůstává otevřené;
- doporučený další krok;
- zda vlastník musí něco nastavit nebo schválit.
Nevypisuj stovky řádků kódu do chatu, pokud stačí změnit soubory v projektu a vysvětlit výsledek.
18. SUBAGENTI A PARALELNÍ PRÁCE
Pokud prostředí podporuje subagenty, používej je jen pro úkoly s jasnými hranicemi. Příklady:
- Agent A: audit architektury a závislostí, bez změn souborů.
- Agent B: QA strategie a návrh testů, bez zásahu do implementace.
- Agent C: bezpečnostní / privacy review, pouze čtení.
- Agent D: ověření oficiálních podmínek vybraného weather API a mobilních build nástrojů.
Pravidla:
- jeden hlavní agent vlastní architekturu a rozhodnutí;
- neumožňuj několika agentům současně upravovat stejné soubory;
- subagent nesmí dostat tajné údaje ani přístup, který nepotřebuje;
- každé tvrzení subagenta ověř;
- při rozporu použij primární zdroje a testy;
- nepoužívej paralelní agenty pro triviální úkoly;
- pokud agenti nejsou k dispozici, úkoly proveď sekvenčně.
19. KONKRÉTNÍ PRVNÍ INSTRUKCE — CO UDĚLÁŠ HNED PO NAČTENÍ TOHOTO PROMPTU
Nespouštěj okamžitě kompletní přepis. Začni pouze etapou 0.
1. Potvrď, v jakém adresáři projektu se nacházíš.
2. Zkontroluj Git status, branch a poslední commit.
3. Prozkoumej projektové soubory, konfiguraci, README a package scripts.
4. Zjisti skutečný framework a zda aplikace běží.
5. Spusť dostupné baseline testy / lint / build a zaznamenej výsledky.
6. Projdi všechny existující obrazovky, routy, datové modely, úložiště a API integrace.
7. Porovnej reálný kód se staršími dokumenty. Vytvoř seznam rozporů.
8. Posuď, zda zachovat React/Vite, použít Capacitor, migrovat na Expo/React Native nebo zvolit jinou variantu.
9. Sepiš audit a plán MVP do docs/.
10. Vrať mi jasné shrnutí a doporučení. Pokud máš oprávnění pokračovat autonomně, můžeš následně začít etapou 1, ale nejprve musí být architektonické rozhodnutí zdokumentované a změny vratné.
Nejdříve ověř následující otázky
- Je současný projekt funkční a v jakém stavu?
- Jsou data skutečně ukládána, nebo jsou stále jen mock?
- Jak funguje přidání, editace a smazání úlovku?
- Existuje cloudový backend, nebo pouze localStorage?
- Jsou klíčové statistiky matematicky správné?
- Odkud pocházejí počasí a další externí informace?
- Je Fish Activity skóre prezentováno poctivě jako odhad?
- Jaké funkce chybí pro důvěryhodné MVP?
- Je lepší zachovat současný projekt, nebo založit nový mobilní projekt?
- Jaký je nejmenší realistický rozsah, který lidem přinese skutečnou hodnotu a lze ho bezpečně vydat?
20. ZÁVĚREČNÁ DEFINICE ÚSPĚCHU
Za úspěch nepovažuj počet řádků kódu ani množství obrazovek. Za úspěch považuj stav, kdy nový uživatel může:
1. aplikaci nainstalovat;
2. pochopit její účel;
3. přidat svůj první úlovek bez zbytečného tření;
4. přidat fotografii a volitelné detaily;
5. najít, upravit a smazat svůj záznam;
6. důvěřovat statistikám, protože odpovídají skutečným datům;
7. používat aplikaci bez GPS a bez počasí;
8. rozumět tomu, které údaje jsou zadané, získané, vypočtené nebo odhadované;
9. bezpečně zachovat, exportovat nebo smazat svá data;
10. používat aplikaci na iOS i Androidu bez zásadních chyb.
A vlastník projektu musí být schopen zjistit:
- co je skutečně hotové;
- co bylo otestováno;
- co stále není ověřené;
- jaké náklady aplikace generuje;
- co musí udělat pro store release;
- jak pokračovat po první verzi.
První veřejná verze má být malá, důvěryhodná, stabilní a příjemná. Funkce navíc přidávej až tehdy, když základní rybářský deník funguje bez kompromisů.
KONEC MASTER PROMPTU
