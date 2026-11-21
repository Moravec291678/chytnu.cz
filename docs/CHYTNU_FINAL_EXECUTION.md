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
