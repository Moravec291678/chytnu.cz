# Provedení finální strategie ChytnuCz

## Prompt 00 · PASS · 21. listopadu 2026

Tento registr sleduje finální balík 00–23. Důkazy předchozího balíku 00–33 zůstávají v [registru vydání](RELEASE_EXECUTION_STATE.md). Produktový kontrakt a seznam 57 aktuálních tras jsou v [blueprintu](CHYTNU_FINAL_PRODUCT_BLUEPRINT.md) a [mapě tras](CHYTNU_FINAL_ROUTE_MAP.md).

### Podklady a stav práce

- Celý Word `ChytnuCz_Strategicky_Dokument.docx` z kořene `catchlog`, včetně textu tabulek a kontrolou částí s komentáři a poznámkami. Kopie v `design-reference` je bitově shodná. Doklad výběru je SHA-256 `1cec32a864a28ac3dfa154ca0662806ad514c1e6f532f5afb8bcaca91b624e9e`. Nová strategie i hlavní balík byly nalezeny ve Stažených souborech. Všech 24 promptů hlavního souboru odpovídá pěti samostatným souborům.
- Ověřen vzdálený repozitář `Moravec291678/chytnu.cz`. Výchozí lokální a vzdálený dev SHA `dcdc595883ee0563694326d5245d448d1e051a51`, větev `codex/public-launch-readiness-audit`, na začátku čistá. Dev je 39 commitů před `origin/main`. Main `68fbf04b70e123b226bac90ee83f12dde1dc352b` má 56 deklarací tras, dev 57 včetně vypnuté trasy zpráv.
- Původní worktree na `208baf2afd16a7841422386a344da711ddca9e85` má 27 existujících změn. Zachováno. Vercel preview výchozího dev SHA READY, produkční alias READY na SHA main. Přesný SHA tohoto checkpointu lze zjistit přes `git log -1 --format=%H -- docs/CHYTNU_FINAL_EXECUTION.md`.
- Jádro deníku, offline obnovení, XP, katalog, profil a sociální základ se přebírají. Pokročilé sociální moduly existují za příznaky. Nativní preflight funguje na dev preview. Živý Cloudinary, schválená izolace, fyzická PWA, licence, operační pilot, podpisy a nativní vydání se dále řídí [maticí release](FINAL_ACCEPTANCE_MATRIX.md). V tomto kroku se nemění runtime ani produkce.

### Měření cest

Přihlášené Chromium, viewport 390 × 844, skutečné lokální Firebase Auth a Firestore, dva syntetičtí uživatelé. Každý scénář začal na otevřené Domů po přihlášení a onboardingu. Počítá se každá aktivace odkazu, tlačítka, rozbalení nebo vstupního pole. Výběr fotografie přidává jednu akci v dialogu. Vpisování je evidováno samostatně. Programové otevření Domů mezi scénáři a čekání na data se nepočítá. Čísla ukazují provedený průchod s uvedeným koncem, půjde je opakovat v Promptu 01.

- **2 kliknutí · Quick Catch fotkou.** Domů → Z galerie → výběr JPEG v dialogu. Potvrzen uložený místní záznam.
- **1 kliknutí · ruční zápis.** Domů → centrální FAB → připravený formulář. Počet končí na otevření formuláře.
- **3 kliknutí · úprava z Deníku.** Domů → Deník → uložený úlovek s vykreslenou fotkou → Upravit úlovek. Počet končí v editoru.
- **2 kliknutí · vlastní galerie.** Domů → Deník → Galerie. Cesta Domů → Profil → Přehledy a revíry → Galerie má 3 kliknutí a stejný cíl.
- **2 kliknutí · statistiky.** Domů → Deník → Statistiky. Cesta přes Profil a Přehledy má 3 kliknutí a stejný cíl.
- **2 kliknutí · skutečné zahájení vycházky.** Domů → nová vycházka → potvrzení. Z Deníku vede alternativní cesta na seznam Vycházky již dvěma kliknutími. Počet pro alternativu končí u seznamu.
- **6 kliknutí + 1 zadání · detail revíru RIS.** Domů → Profil → Přehledy a revíry → Moje revíry → katalog → hledání čísla → vybraný výsledek.
- **4 kliknutí + 1 zadání · najít rybáře a otevřít jeho profil.** Domů → Komunita → Najít rybáře → hledání syntetického uživatele → jeho otevřený profil. Přes Profil a skupinu Komunita jsou to 3 kliknutí k samotnému vyhledávacímu formuláři.
- **1 kliknutí · oznámení.** Domů → zvonek. Alternativní cesta přes Nastavení v Profilu má 3 kliknutí.
- **3 kliknutí · místní záloha JSON.** Domů → Profil → Účet a místní data → Exportovat zálohu. Alternativa přes skupinu Nastavení a obrazovku Nastavení má 4 kliknutí. Obě skutečně spustily stažení JSON.

Přednost při Promptu 01 mají šestikrokové revíry, vyhledávání rybáře a dva vstupy k záloze. Galerie, statistiky a oznámení už mají společné cílové obrazovky.

### Jediný vlastník existujících ID

- **05** · REL-03, RISK-01, SOC-05. Živá média, galeriová autorizace, limit a revokace přístupu k médiu.
- **07** · RISK-03, SOC-11. Stabilní revír, neduplicitní vazby a geometrie.
- **08** · SOC-06. Ověřený postup, trofeje a statistiky.
- **09** · SOC-02. Veřejná identita a vlastní profil.
- **10** · SOC-07, SOC-08. Feed a interakce.
- **11** · SOC-03, SOC-04, SOC-09. Vyhledávání, přátelství a oznámení.
- **12** · SOC-14. Zprávy a ochrana účastníků.
- **13** · SOC-13, SOC-15. Chat revíru a Crew.
- **14** · SOC-10, SOC-12, SOC-16. Okolí, přítomnost, obsah revíru.
- **15** · REL-04, REL-05, RISK-02, SOC-01, SOC-17. Účet, souhlas, soukromí a správní role.
- **16** · POST-01. Výkon, foto cache a měření.
- **17** · REL-06. Fyzický PWA offline a update.
- **18** · REL-07, SOC-18. Společná přístupnost a role napříč trasami.
- **19** · REL-02, REL-08, REL-09. Izolace, návrat, právo a provoz.
- **20** · REL-01, REL-10. Výběr a skutečná akceptace soukromého pilotu.
- **21** · POST-02, POST-03. Rozhodnutí o postupném otevření sociální bety a nepovinných funkcí po jejich vlastních technických branách.
- **22** · MOB-01. Android.
- **23** · MOB-02, MOB-03. iOS a evidence deklarací a výmazu pro oba obchody.

SOC-01 až SOC-18 odpovídají původním číslům v [matici QA](QA_COVERAGE_MATRIX.md). Ostatní milníky bez starého ID zůstávají přiřazené vlastnímu promptu. Vzájemné závislosti jsou odkazy na výsledek vlastníka a nezakládají druhý úkol.

### Ověření a pokračování

- 1 202 Node testů včetně nové kontroly úplnosti a jediného vlastníka každé trasy. Lint, build, produktová validace a kontrola diffu. Z posledního kandidáta se přebírá 1 919 integračních kontrol a 26 nativních HTTP/Firebase kontrol. V této etapě se neměnil kód služeb. Prohlížečové důkazy výše pocházejí z nové relace se syntetickými daty.
- Další krok je **Prompt 01 · odstranění zbytečných kliků a jednotná informační architektura**. Vzít zde změřené cesty jako výchozí stav, sjednotit vstupy při zachování deep linků a potvrzení a zopakovat stejná měření. Prompt 01 čeká na další zadání vlastníka.

## Prompt 01 · PASS · 21. listopadu 2026

- **Výchozí stav.** Větev `codex/public-launch-readiness-audit` a vzdálené `main` začínaly na `75d7384ded85e3cb9cd2441b34f0dc447cf421bd`. Původní worktree `chytnu-terminology` má zachovaných 27 rozpracovaných změn.
- **Deník.** Stejné hlavní odkazy v Deníku a Kalendáři. Moje revíry vedou do katalogu ČRS/RIS, mapa a retrospektivy jsou ve skupině Mapa, příběhy a přehledy. Úlovky a vycházky nadále používají stávající volič a identifikátory. Starý odkaz `/map` přesměruje na `/journal/map` s parametry a fragmentem.
- **Komunita.** Přímé hledání na obrazovce feedu, vedle něj Přátelé a Oznámení. Starý `/community/find` vede do vyhledávacího pole. Nové oznámení o pozvání otevře příchozí žádosti. Vyhledávání a uzavřené sociální trasy respektují konfiguraci pilotu.
- **Profil.** Deset duplicitních odkazů odstraněno z navigace Profilu a vstup Moje revíry přesunut do Deníku. Jedna duplicitní akce místního exportu odstraněna z Nastavení. Odtud odkaz otevře přesně `/profile#local-backup`. Stávající stažení, obnova, potvrzení nahrazení, synchronizace a samostatný cloudový export zůstávají dostupné.

### Přeměření v Chromiu při 390 px

- Quick Catch s fotkou **2 → 2**. Ruční zápis **1 → 1**. Editor úlovku s vykreslenou fotkou **3 → 3**.
- Galerie **2 → 2**. Statistiky **2 → 2**. Zahájení vycházky **2 → 2**.
- Detail RIS **6 → 5** a jedno zadání. Vyhledávací pole v katalogu je z Domů viditelné po třech kliknutích místo čtyř.
- Vyhledání rybáře a otevření jeho profilu **4 → 3** a jedno zadání. Test zahrnul vyhledání zveřejněného jména bez diakritiky.
- Oznámení **1 → 1**. Místní JSON záloha **3 → 3**. Kontextový odkaz z Nastavení vede ke stejnému exportu.

### Důkazy a další krok

- 1 203 Node testů a 1 919 Auth/Firestore kontrol. Samostatné Auth, Sync a Photos, lint, build, produktová validace a kontrola diffu. Testy zahrnují počet 57 deklarací tras, kanonické cíle a pravidla pro aktivní navigaci.
- Host a soukromý pilot při 320, 360, 390, 430 a 1 280 px. Host 95, pilot 80 zobrazení, v obou režimech 6 offline kontrol včetně opětovného zobrazení fotografie. V pilotu jsou přímé sociální odkazy uzavřené.
- Přihlášený běh v izolovaném Firebase Auth/Firestore pokryl všech 57 adres včetně očekávaných přesměrování, vypnutých tras a bezpečného stavu nenalezeného soukromého revíru. Dále 55 zobrazení napříč pěti šířkami a 25 skutečných kliknutí ověřených podle prvku pod ukazatelem. Dva účty potvrdily hledání se souhlasem, žádost, otevření oznámení do příchozí záložky a přijetí. Ověřeno uložení revíru RIS, přiřazení k vycházce a předvyplnění téhož revíru v úlovku, návraty, aktivní navigace, účetní záloha a otevření starých adres se zachováním parametrů.
- Vývojový commit této etapy uvádí `git log -1 --format=%H -- docs/CHYTNU_FINAL_EXECUTION.md`. Nasazení patří na vývojovou větev do Vercel Preview. Produkční commit etapy 00 je `75d7384ded85e3cb9cd2441b34f0dc447cf421bd`. Kontrola živého Cloudinary a fyzických telefonů zůstává v samostatných release úkolech.
- Po dokončení následuje **Prompt 02 · jednotný design systém, typografie a vizuální kompaktnost**. Navázat na nové hlavní vstupy a ověřit hustotu, hierarchii a dotykové cíle bez změny tmavé a zelené identity.

## Prompt 01B · PASS · sjednocený návrat a dohledatelnost

- Výchozí vývojová větev `codex/public-launch-readiness-audit` na `654d06307e72977ffe26970c194909d7d6defc87`, `main` na `75d7384ded85e3cb9cd2441b34f0dc447cf421bd`. Původní pracovní kopie zůstává bez zásahu.
- Šest skupin Profilu odkazuje na existující stránky a sekce. Počet deklarací zůstává 57. Jediná záloha a potvrzení pro obnovu i výmaz se dál řídí stávajícími obrazovkami. Detaily, výchozí návraty a podmínky jsou v [inventuře dohledatelnosti](CHYTNU_FEATURE_DISCOVERABILITY.md).
- Sdílený návrat nese známý kontext v paměti aktuálního dokumentu a profilu. Po přímém vstupu nebo obnovení používá interní výchozí adresu. Potvrzení chrání rozpracované změny u tlačítka Zpět a hlavní navigace. Nový úlovek používá stávající místní koncept.
- Čerstvá kontrola kódu · 1 207 Node testů, lint, build, produktová konfigurace, manifest offline a kontrola diffu. Izolovaný Chromium ověřil zachování hledání v katalogu a Komunitě, přímé adresy, obnovení detailu, zálohu, soukromí, existující formulář hlášení a koncept nového úlovku. Šest profilových skupin prošlo klávesnicí při 320, 360, 390, 430, 768 a 1 280 px. Host 95 a pilot 80 zobrazení, oba režimy 6 offline kontrol s vykresleným JPEG.
- V izolovaném Firebase prošla cesta Úspěchy, album a detail druhu, vycházky, úlovek a revír včetně varování před opuštěním editace, návrat z veřejného profilu i staré adresy hlášení, kliknutí po přímém vstupu a obnovení, ovládání klávesnicí a zamítnutí zavřených tras. Prošlo 1 919 bezpečnostních a integračních kontrol i samostatné Auth, Sync a Photos. Produkční pravidla a konfigurace se neměnila.
- Vývojový SHA eviduje `git log -1 --format=%H -- docs/CHYTNU_FINAL_EXECUTION.md`. Nasazení je určeno pro [vývojový Vercel Preview](https://chytnu-cz-git-codex-public-launc-495d52-moravec291678s-projects.vercel.app). Fyzické telefony a živá média mají vlastní akceptaci. Další etapou je **Prompt 02 · design systém a vizuální kompaktnost**.

## Prompt 01/11 · jednotné prohlížení fotografií

- Sdílený PhotoViewer nahrazuje tři samostatné prohlížeče. Používá ho osobní galerie, hlavní a další fotky na detailu úlovku, karty úlovků včetně osobních trofejí, výběr na veřejném profilu, sdílená galerie, feed, detail příspěvku a příspěvky u revíru.
- Celý snímek zachovává poměr stran. Zavření přes X nebo Escape vrací fokus. Šipky a vodorovná dotyková gesta přepínají dostupné snímky. Panel sdílení přepínání pozastaví.
- Soukromé fotky používají místní soubor nebo autorizované doručení. Sdílené obrázky zůstávají za serverovým ověřením a používají JPEG deriváty. Starý místní náhled úlovku už nenačítá neověřenou adresu fotografie.
- Kontroly kódu prošly. 1 209 Node testů, lint, build, product, test:photos a kontrola diffu. Fyzické telefony a živé Cloudinary zůstávají k ověření. Firebase pravidla ani produkční nastavení sdílení se neměnila.
- Pět scénářů v Chromiu s 38 skutečnými kliknutími. Ověřeny šířky 360, 390, 430 a 1 280 px a 844 × 390 px na šířku. Scénáře pokrývají 1–20 snímků, chybějící snímek, místní fotku, simulované cloudové doručení, návrat fokusu a odvolání sdílení mezi dvěma účty Firebase v emulátoru.

## Prompt 02/11 · PASS · centimetry, časový graf a deníkový tip

- Výchozí větev `codex/public-launch-readiness-audit` a `main` na `744baf35d621adb72743283ecede7cc7c044d3cf`. Společné zobrazení měr řadí cm dopředu a zvětšuje je při souběhu s kg. Změna platí pro karty úlovků včetně Domů, Deníku, výsledků filtrů a trofejí, detail a mapu, galerie, statistiky a rekordy, výpravy, roční a sezónní přehledy, veřejné profily, komunitní a revírové příspěvky. Sdílený náhled a PNG jasně označují odhad hmotnosti. Serverové podmínky zveřejnění se zde neměnily.
- Graf skládá každý měsíc jako počet, sloupec se společnou osou a popisek. Nula nemá sloupec a ostatní výšky odpovídají poměru k maximu. Roční graf při malé šířce pokračuje v dalším řádku. Asistenční technologie dostávají celý měsíc, rok i počet. Pořadí v žebříčku Nejtěžší úlovky vychází dál z kg.
- Tip na Domů zobrazuje jeden místně vypočtený postřeh nebo konkrétní další krok při malém množství dat. Podklady a odkazy na úlovky jsou rozbalitelné. Podrobné přehledy zůstávají na vlastní obrazovce. Tip na Domů respektuje nastavení místních doporučení. Případný externí požadavek se spouští z detailních přehledů po uživatelské akci s platným souhlasem.
- Ověřeno 1 211 testů, lint, build, product a kontrola diffu. Chromium a izolované Firebase účty ověřily 30 soukromých záznamů, veřejné karty, 0 i chybějící měření, nezměněné uložené míry a XP, deníkový tip pro 0, 1 a 30 záznamů a stav při vypnutí doporučení. Výchozí a nové snímky grafu z 320 / 360 / 390 / 430 / 768 / 1 280 px, ověřeno i 12 měsíců, jeden úlovek a poměr 1:29. Cloudflare při ověřování nebyl volán.

## Prompt 03/11 · PASS · kompaktní a spolehlivá synchronizace

- Výchozí dev a main byly na `5038e1216e5eb8d575632f7d80ab2259da765ad8`. Synchronizace má jedno malé kolečko v layoutu a detail otevřený uživatelem. Detail ukazuje frontu záznamů a fotografií, spojení, poslední úspěch, chybu a další pokus. Přihlášení, oprávnění a konflikty mají konkrétní řešení v Profilu.
- Tři ruční pokusy na opakovanou dočasnou chybu se počítají samostatně a stav přežije obnovení stránky. Automatické pokusy řídí exponenciální prodleva s rozptylem a horní hranicí 30 minut pro místní plánování. Delší serverový Retry-After má přednost i před ručním pokusem. Návrat internetu a obnova relace znovu rozběhnou způsobilou práci.
- Běhy v kartách sdílejí zámek účtu přes Web Locks nebo časově obnovovaný zámek v IndexedDB. Potvrzování zachovává ID a revizi položek. Opravy chyb nemažou frontu a neoznačují fotku jako doručenou před potvrzením. Produkční pravidla Firebase se neměnila.
- 1 214 testů, lint, build, product a git diff check. Prošly Sync, Auth a Photos a 26 kontrol nativního foto API v emulátoru. Chromium ověřil offline a návrat sítě, Firebase 503, tři ruční pokusy, obnovu stránky, automatické dokončení, 403, obnovu relace po 401, foto 429 s Retry-After a 500, pomalou síť ve dvou kartách a výměnu účtu. Při běžných chybách a retry zaznamenáno 0 samovolně otevřených panelů nebo modálů. Výpadky byly simulované v izolovaném prostředí.
- Release cíl je vývojová větev `codex/public-launch-readiness-audit` a Vercel Preview.

## Prompt 04/11 · fotografická synchronizace a autorizované náhledy

- Výchozí dev i main byly na `b4e2e3321c7db6df7f3dc13cf6f598ab58c8d047`. V uploadu se dříve opakovalo načtení úlovku a ověření stejných bajtů. Retry po chybě autorizace zbytečně zkoušel ověřit upload, který ještě nezačal. Fronta nyní zachovává poslední fázi. Po přerušení během přenosu nebo potvrzení se před opakováním stále ověřuje existující asset. ID operace, ochrana proti přepsání a maximálně dva paralelní uploady zůstávají součástí stejné služby.
- Soukromé náhledy 384/800/1 600 px používají binární odpověď stávajícího autorizovaného proxy. Server před změnou velikosti ověřuje aktivní účet, vlastnictví, aktuální SHA-256, velikost a typ. Zachová poměr stran, aplikuje orientaci a odstraní metadata z odvozeného JPEG. Současně zpracuje nejvýše čtyři náhledy na instanci. Odpovědi jsou `private, no-store` a čas dalšího pokusu respektuje `Retry-After`. Náhled se nikdy neukládá na místo originálu. Legacy snímek mimo limity náhledu lze otevřít jako originál v detailu. Místní snímky a uložené originály se používají i offline.
- Při třech měřeních se syntetickou latencí 80 ms na požadavek trval retry po chybě podpisu 374/370/372 ms před změnou a 281/281/283 ms po změně. Ověření klesla ze dvou na jedno a samotný upload proběhl vždy jednou. Zrychlení platí pro daný scénář, nikoli jako měření Cloudinary v produkci.
- JPEG se zdrojovou hranou 4 000 px měl 696 998 B. Stávající místní 1 920px kopie měla 170 007 B. Soukromé náhledy měly 10 443 / 39 322 / 139 676 B, samotná serverová příprava 14 / 23 / 71 ms. Proxy dál načítá a ověřuje celý zdroj z Cloudinary, zmenšuje se přenos k zařízení. Z veřejného JPEG o velikosti 39 322 B vznikne 52 432 B Base64 ještě před obálkou JSON. Bezpečný příští krok pro tento starší sociální kontrakt je binární odpověď na stejné autorizované akci s `Accept: image/jpeg`.
- Reálný vzorek HEIC o 718 114 B se v Chromiu převedl na JPEG o 322 290 B. Příprava před/po 782/809 ms, ověřené uložení v IndexedDB 10/10 ms. Stejná fotka byla čitelná po zavření a úplném opětovném spuštění prohlížeče při odpojeném serveru. V emulátoru šlo potvrzené Firebase metadata načíst do druhé databáze a fotku dekódovat v Chromiu. Vzorek HEIC pochází z [libheif](https://github.com/strukturag/libheif/tree/master/examples).
- Zachován produktový limit čtyř snímků na nový úlovek a kompatibilita starších záznamů až s deseti. Scénář výběru pěti nových fotek proto nebyl proveden. Živý Cloudinary a fyzický iPhone s počítačem jsou **BLOCKED** bez schváleného izolovaného prostředí. Akceptační postup je vložit syntetické JPG, PNG a HEIC, odpojit síť, zavřít a znovu otevřít aplikaci, obnovit spojení, ověřit druhé zařízení, přerušit potvrzení, zkontrolovat počet assetů a poté testovací úlovek smazat.
- Cloudinary účet, Firestore pravidla a datový model se neměnily. Proxy zpracovává náhledy v aplikačním serveru. Cloudinary eager varianta by ušetřila přenos z úložiště na server, ale vyžaduje další deriváty a ověření kvót a revokace. Authenticated originály i eager deriváty vyžadují podepsané doručení. [Oprávnění médií](https://cloudinary.com/documentation/control_access_to_media) · [Eager transformace](https://cloudinary.com/documentation/eager_and_incoming_transformations) · [Optimalizace formátu a kvality](https://cloudinary.com/documentation/image_optimization) · [Invalidace cache](https://cloudinary.com/documentation/invalidate_cached_media_assets_on_the_cdn)
- Ověřeno 1 217 testů, lint, build, product, Photos, Sync, Auth, Firebase Rules a šest scénářů v Chromiu. Nativní foto API prošlo 26 kontrolami HTTP/Firebase. Chromium ověřil soukromé varianty, zákaz cizímu účtu, galerii 20 snímků a odvolání veřejného sdílení. Pro doručení byl použit autorizovaný aplikační server a testovací Cloudinary odpověď. Fyzická a živá akceptace zůstává BLOCKED.
- Na druhém zařízení jsou offline dostupné již uložené originály. Samotný zmenšený síťový náhled se do trvalé cache neukládá, takže k jeho prvnímu či opětovnému načtení po restartu může být potřeba připojení.

## Prompt 05/11 · výkon mobilního webu · PARTIAL

- Výchozí vývojová větev `cd7d0db75540dc586be7b3785a63dff038114647`. Deník vykreslí 24 karet a galerie 36 dlaždic na první dávku. Další lze přidat bez stropu. Filtry vyhodnocují celou sbírku a galerie ji celou zpřístupní i v prohlížeči fotografií. Pozice a dávka se obnoví při návratu z detailu. Příprava filtru běží s nižší prioritou než textové pole.
- Domů načítá náhled přátel a deníkový tip poblíž výřezu po načtení lokálních souhrnů. Náhledy karet a sociální avatary načítají data podle výřezu. Feed zachovává stránkování a (po změně účtu, publika nebo připojení) ruší staré požadavky. Souběžné kliknutí na další stranu nespouští druhý požadavek. Kód HEIC zůstává oddělený a offline instalace stále ukládá plný shell. Firestore oprávnění a data se neměnila.
- Statistiky a XP znovu používají stejné formátovače času. Statistiky spočítají měsíce v jednom průchodu. Tři běhy shodné sady výpočtů na 100 / 1 000 / 5 000 záznamech měly medián 105 / 1 046 / 5 844 ms před změnou a 10 / 73 / 372 ms poté. Výstupy statistik, výzev a série byly přesně shodné.
- Soukromá mapa seskupuje viditelné body po 48 px, Leaflet se zavádí až s dostupnými body. Test s 5 000 body zobrazil 2 730 bodů v 63 vrstvách. Záznamy ve skupině se procházejí po 20. Revírová mapa používá skutečný referenční bod z RIS, mapa výpravy a revíru odkládají dlaždice podle výřezu.
- Chromium v izolaci měřil gzip a studenou cache u produkčních sestavení s Firebase emulátorem, syntetickými účty a 100 úlovky. Mobilní profil 390 px, zpomalení CPU 4×, 80 ms, 1,6 Mbit/s. Slabší profil 6×, 150 ms, 0,85 Mbit/s. U jednotlivých tras jde o jednotlivé běhy, ne o percentil reálných uživatelů. Fotodekódování měří čekání na `img.decode()` vzorku, často ještě před měřením již dekódovaného. Počet HTTP požadavků Firestore je transportní metrika a počet účtovaných čtení dokumentů z ní nelze odvodit. Registrace service workeru byla při porovnávání záměrně vypnutá a jeho offline chování se ověřilo zvlášť. Vercel a Cloudinary se pro benchmark nepoužily.

### Mobilní profil · PŘED → PO

| Trasa | Obsah / LCP (ms) | CLS | JS / přeneseno (kB) | HTTP / Firestore HTTP | Heap (MiB) / dlouhé úlohy | Dekódování (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| Domů | 2602 → 2213 · 1412 → 1340 | 0,000 → 0,000 | 408,1 → 401,2 · 441,9 → 433,9 | 15 → 19 · 0 → 1 | 10,5 → 10,6 · 3 → 2 | — → — |
| Deník | 4452 → 3686 · 1536 → 1500 | 0,000 → 0,000 | 411,8 → 396,1 · 450,5 → 432,7 | 30 → 30 · 6 → 5 | 9,1 → 11,8 · 7 → 6 | — → — |
| Galerie | 3104 → 3049 · 3328 → 3296 | 0,000 → 0,000 | 413,9 → 398,2 · 454,2 → 437,5 | 29 → 30 · 5 → 5 | 13,5 → 10,3 · 5 → 5 | 3 → 0 |
| Detail úlovku | 3066 → 3573 · 3048 → 3444 | 0,208 → 0,000 | 423,3 → 407,5 · 463,5 → 445,4 | 28 → 28 · 5 → 5 | 9,5 → 5,5 · 5 → 5 | 5 → 2 |
| Komunita | 3566 → 3438 · 2808 → 2788 | 0,000 → 0,000 | 416,7 → 411,7 · 461,5 → 459,0 | 30 → 39 · 5 → 5 | 10,2 → 9,3 · 5 → 5 | — → — |
| Veřejný profil | 3078 → 3116 · 1392 → 1276 | 0,000 → 0,000 | 414,5 → 403,3 · 454,1 → 447,6 | 28 → 34 · 5 → 4 | 11,9 → 6,9 · 5 → 5 | — → — |
| Revíry | 2770 → 2911 · 1364 → 1308 | 0,000 → 0,000 | 419,5 → 403,6 · 459,3 → 441,0 | 28 → 28 · 2 → 2 | 11,2 → 9,3 · 5 → 6 | — → — |
| Soukromá mapa | 3014 → 2745 · 1348 → 2768 | 0,006 → 0,006 | 454,6 → 439,7 · 497,6 → 480,8 | 24 → 28 · 2 → 6 | 13,7 → 11,3 · 6 → 1 | — → — |
| Statistiky | 3612 → 2258 · 1364 → 1288 | 0,000 → 0,000 | 415,0 → 399,1 · 452,0 → 433,7 | 24 → 25 · 2 → 3 | 16,3 → 6,4 · 7 → 0 | — → — |
| Přátelé | 2691 → 2622 · 2692 → 2616 | 0,000 → 0,000 | 411,3 → 397,0 · 448,7 → 433,5 | 22 → 27 · 2 → 2 | 10,5 → 19,3 · 6 → 5 | — → — |
| Oznámení | 1480 → 1382 · 1372 → 1280 | 0,000 → 0,000 | 413,9 → 397,9 · 309,7 → 291,4 | 18 → 18 · 0 → 0 | 17,8 → 14,8 · 0 → 0 | — → — |
| Chat revíru | 3419 → 3087 · 3360 → 3052 | 0,165 → 0,165 | 411,4 → 395,7 · 447,4 → 429,5 | 21 → 22 · 2 → 2 | 13,3 → 17,6 · 5 → 5 | — → — |

### Slabší profil · PŘED → PO

| Trasa | Obsah / LCP (ms) | CLS | Klávesa filtru (ms) | JS / přeneseno (kB) |
| --- | --- | --- | --- | --- |
| Domů | 4746 → 4218 · 2552 → 2360 | 0,067 → 0,036 | — → — | 408,1 → 412,0 · 442,1 → 309,0 |
| Deník | 7887 → 5328 · 2544 → 2408 | 0,000 → 0,000 | 400 → 48 | 411,8 → 396,1 · 449,5 → 431,6 |
| Galerie | 6742 → 14186 · 6876 → 14544 | 0,000 → 0,000 | <16 → 120 | 413,9 → 398,2 · 453,2 → 436,5 |
| Detail úlovku | 6763 → 6041 · 6508 → 5812 | 0,208 → 0,000 | — → — | 423,3 → 407,5 · 463,5 → 445,4 |
| Komunita | 5913 → 6988 · 5284 → 6088 | 0,000 → 0,000 | — → — | 416,7 → 411,7 · 460,5 → 458,6 |
| Veřejný profil | 5434 → 5700 · 2520 → 2356 | 0,000 → 0,000 | — → — | 414,5 → 403,3 · 458,0 → 447,2 |
| Revíry | 5448 → 5201 · 2556 → 2408 | 0,000 → 0,000 | — → — | 419,5 → 403,6 · 459,3 → 441,0 |
| Soukromá mapa | 5468 → 5791 · 2528 → 2404 | 0,006 → 0,006 | — → — | 454,6 → 439,7 · 497,6 → 480,4 |
| Statistiky | 6951 → 5728 · 2540 → 2492 | 0,000 → 0,000 | — → — | 415,0 → 399,1 · 452,0 → 433,7 |
| Přátelé | 5210 → 5183 · 5160 → 4924 | 0,000 → 0,000 | — → — | 411,3 → 397,0 · 448,3 → 433,5 |
| Oznámení | 2567 → 2444 · 2540 → 2384 | 0,000 → 0,000 | — → — | 259,4 → 243,5 · 252,8 → 234,5 |
| Chat revíru | 6517 → 5168 · 6360 → 5160 | 0,165 → 0,165 | — → — | 411,4 → 395,7 · 447,4 → 429,5 |

### Deník a galerie při růstu dat · PŘED → PO

| Data a trasa | První obsah (ms) | Klávesa filtru (ms) | Uzly DOM | Heap (MiB) |
| --- | --- | --- | --- | --- |
| 0 · Deník | 2140 → 1929 | 48 → 24 | 116 → 117 | 19,3 → 15,7 |
| 0 · Galerie | 2038 → 1924 | 24 → 24 | 103 → 105 | 18,1 → 18,2 |
| 10 · Deník | 2157 → 2016 | 48 → 32 | 272 → 274 | 17,5 → 15,8 |
| 10 · Galerie | 2122 → 2116 | 24 → 24 | 211 → 214 | 23,3 → 21,6 |
| 100 · Deník | 4452 → 3686 | 200 → 48 | 1707 → 494 | 9,1 → 11,8 |
| 100 · Galerie | 3104 → 3049 | 72 → 40 | 1196 → 496 | 13,5 → 10,3 |
| 1000 · Deník | 16253 → 11952 | 1704 → 24 | 16812 → 499 | 39,5 → 25,5 |
| 1000 · Galerie | 17095 → 12889 | 144 → 40 | 3397 → 501 | 54,8 → 34,5 |
| 5000 · Deník | 56685 → 6947 | 9504 → 32 | 84808 → 494 | 105,8 → 19,7 |
| 5000 · Galerie | 11267 → 3988 | 144 → 40 | 3397 → 496 | 113,7 → 61,7 |

- Při 5 000 úlovcích výchozí porovnatelné měření chybí. Po úpravách se zobrazilo 24 karet Deníku a 36 dlaždic Galerie. Pomalé jednotlivé průchody Galerie mají velký rozptyl. V jednom byly 6,74 → 14,19 s do obsahu při slabém profilu. Cíle LCP a CLS proto hodnotíme jako částečně splněné. Doba jednotlivé interakce je laboratorní vzorek a nezastupuje skutečné INP mobilních uživatelů.
- V prohlížeči se ověřilo 24 → 48 karet Deníku a návrat z detailu přesně na 2 691 px, ve vieweru přechod z 37. na 38. fotografii ze 100 a offline načtení první dávky JPEG. Prošel i samostatný offline restart po úplném zavření Chromia se soukromou fotografií z HEIC. U detailu úlovku po rezervaci místa kleslo CLS z 0,208 na 0,000 v obou profilech. Chat běžel jen proti izolovanému Firebase.
- Prošlo 1 220 unit a komponentových testů, lint, build, product, diff check, Photos, Sync, Auth a 211 integračních kontrol feedu s Firebase. Hlavní test feedu prošel 25 příspěvky se shodným časem v paginaci. Změnu účtu ověřila Auth sada v izolaci. Git release je na vývojové větvi, produkce zůstává na původním buildu.
- Další krok je Prompt 06. Pro veřejnou akceptaci zbývá měření na fyzickém telefonu, skutečná telemetrie INP a počty čtení dokumentů. Produkční pilot, sdílení a placené služby se v této etapě neměnily.
