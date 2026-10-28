export const PRIVACY_POLICY = Object.freeze({
  title: "Zásady ochrany osobních údajů",
  lastUpdated: "28. října 2026",
  sections: [
    {
      heading: "1. Správce osobních údajů",
      paragraphs: [
        "Správcem osobních údajů je David Moravec, fyzická osoba – nepodnikatel.",
        "Dotazy k soukromí a žádosti o přístup, opravu, export nebo výmaz údajů posílej na David.Moravec2@seznam.cz.",
        "ChytnuCz je v současnosti poskytováno bezplatně, bez reklam a bez aktivních placených funkcí.",
      ],
    },
    {
      heading: "2. Jaké údaje zpracováváme",
      paragraphs: ["Rozsah závisí na tom, které funkce používáš a jaké údaje do aplikace vložíš."],
      subsections: [
        { heading: "Účet", items: ["e-mailovou adresu a technický identifikátor účtu;", "údaje potřebné pro přihlášení a synchronizaci;", "informace o Google přihlášení, pokud tuto možnost použiješ."] , note: "ChytnuCz nezná tvoje heslo k účtu Google." },
        { heading: "Rybářský deník", items: ["druh, délku a hmotnost ryby, datum a čas úlovku;", "metodu, nástrahu, poznámky, revír nebo vlastní vodu;", "údaje o vycházce, fotografie a další údaje, které do záznamu vložíš."] },
        { heading: "Poloha", items: ["GPS souřadnice úlovku nebo vycházky;", "polohu ručně zvolenou na mapě;", "souřadnice použité pro nalezení vody nebo načtení počasí."] , note: "Poloha není nutná pro každý záznam a některé údaje lze zadat ručně." },
        { heading: "Fotografie", items: ["obraz fotografie a její technická metadata;", "datum pořízení a GPS údaje, pokud je soubor obsahuje."] , note: "Metadata může aplikace použít k usnadnění zápisu nebo vyhodnocení kontextu úlovku." },
        { heading: "Herní postup a technické údaje", items: ["XP, úrovně, achievementy, výzvy, série a mastery;", "stav synchronizace, identifikátory operací, konflikty mezi zařízeními a záznamy potřebné k zabránění duplicitním odměnám;", "technické údaje o chybách a neúspěšných synchronizacích."] , note: "Technické údaje nepoužíváme k vytváření reklamních profilů." },
      ],
    },
    {
      heading: "3. Proč údaje používáme",
      paragraphs: ["Údaje používáme k provozu účtu a rybářského deníku, synchronizaci mezi zařízeními, ukládání a zobrazování fotografií, místní záloze a obnově, mapovým a meteorologickým funkcím, statistikám a herním funkcím, zabezpečení a řešení technických chyb a vyřízení žádostí uživatelů. Údaje neprodáváme a aplikace v současnosti neobsahuje reklamní systém."],
    },
    {
      heading: "4. Právní základ",
      paragraphs: [
        "Údaje potřebné pro účet a funkce aplikace zpracováváme za účelem poskytnutí služby a plnění souvisejících povinností.",
        "U volitelných funkcí, jako je poloha, fotografie nebo oznámení, rozhoduješ prostřednictvím oprávnění zařízení nebo nastavení. Některé technické údaje mohou být zpracovávány na základě oprávněného zájmu na zabezpečení a spolehlivém provozu.",
      ],
    },
    {
      heading: "5. Kde jsou údaje uloženy",
      paragraphs: [
        "Aplikace používá místní úložiště zařízení, například IndexedDB. Podle zvolené funkce a konfigurace nasazení mohou být údaje také synchronizovány do cloudových služeb uvedených níže.",
        "Místní JSON záloha obsahuje pouze údaje dostupné na daném zařízení. Nejde o úplný export všech dat uložených v cloudu. Záloha není šifrovaná; chraň ji stejně jako jiné soubory obsahující fotografie nebo polohu.",
      ],
    },
    {
      heading: "6. Poskytovatelé služeb",
      paragraphs: ["Provoz aplikace může podle konfigurace využívat tyto poskytovatele:",],
      items: [
        "Google Firebase – autentizace, cloudová databáze a související serverové operace.",
        "Cloudinary – ukládání a doručování fotografií, pokud je cloudový foto transport v daném nasazení zapnutý.",
        "Vercel – hosting aplikace a serverových API funkcí.",
        "Open-Meteo – při načtení počasí aplikace odešle souřadnice místa, pro které se počasí vyhledává.",
        "OpenStreetMap nebo související poskytovatelé mapových dlaždic – při zobrazení mapy probíhá běžná síťová komunikace s jejich servery.",
      ],
      note: "Poskytovatelé mohou zpracovávat technické údaje, například IP adresu, podle vlastních podmínek a zásad ochrany osobních údajů.",
    },
    {
      heading: "7. Přenos mimo Evropský hospodářský prostor",
      paragraphs: ["Někteří poskytovatelé infrastruktury mohou údaje zpracovávat také mimo Evropský hospodářský prostor. Pokud k takovému přenosu dochází, použijí se příslušné mechanismy ochrany podle nastavení poskytovatele a platných předpisů. Podrobnosti o konkrétním umístění a použitém mechanismu lze vyžádat na kontaktní adrese správce."],
    },
    {
      heading: "8. Jak dlouho údaje uchováváme",
      subsections: [
        { heading: "Účet a záznamy", paragraphs: ["Údaje potřebné pro používání účtu a aplikace uchováváme po dobu používání služby a dále jen tehdy, pokud je to potřebné pro synchronizaci, bezpečnost nebo splnění právních povinností. Konkrétní jednotná retenční lhůta pro všechny cloudové záznamy není stanovena."] },
        { heading: "Fotografie", paragraphs: ["Po smazání fotografie nebo úlovku se místní záznam odstraní a synchronizovaná fotografie může být zařazena do fronty k odstranění z cloudového úložiště. Dokončení závisí na synchronizaci a dostupnosti poskytovatele; pevnou lhůtu 24 hodin aplikace negarantuje. Zálohy a provozní záznamy poskytovatelů se řídí jejich vlastními retenčními pravidly."] },
        { heading: "Synchronizační záznamy", paragraphs: ["Tombstones a potvrzení operací mohou zůstat uložené po dobu potřebnou k tomu, aby starší zařízení neobnovilo již smazaná data. Maximální doba uchování těchto záznamů není v aplikaci nastavena na 30 dní."] },
        { heading: "Diagnostika", paragraphs: ["Aplikace nemá jednotnou 30denní retenční lhůtu pro všechny diagnostické údaje. Některé diagnostické záznamy jsou dočasné a místní; logy poskytovatelů se řídí jejich vlastními pravidly. Do diagnostiky se záměrně nemají ukládat poznámky, fotografie ani autentizační tokeny."] },
        { heading: "Rozepsaný úlovek", paragraphs: ["Místní draft úlovku se automaticky odstraní přibližně po 7 dnech, pokud jej dříve nedokončíš nebo nesmažeš."] },
      ],
    },
    {
      heading: "9. Export údajů",
      paragraphs: ["V aplikaci můžeš stáhnout místní JSON zálohu údajů, které jsou dostupné na právě používaném zařízení. Tato záloha nemusí obsahovat všechna data synchronizovaná do cloudu a není úplným cloudovým exportem. O přístup k dalším údajům můžeš požádat správce e-mailem."],
    },
    {
      heading: "10. Smazání účtu",
      paragraphs: ["V aplikaci nyní není automatizované úplné smazání cloudového účtu. Žádost o smazání účtu a souvisejících online údajů pošli na kontaktní e-mail; správce s tebou ověří žádost a sdělí další postup. Aplikace neslibuje konkrétní lhůtu dokončení ani automatické odstranění všech systémů poskytovatelů."],
    },
    {
      heading: "11. Smazání místních dat",
      paragraphs: ["Nastavení umožňuje odstranit data aktivního profilu uložená na tomto zařízení. Tato akce nemaže cloudový účet ani online data. Odstraní místní záznamy, fotografie a rozepsané úlovky, které lze bezpečně přiřadit danému profilu. Starší nebo globální záznamy bez informace o vlastníkovi mohou zůstat zachované, protože je nelze bezpečně přiřadit bez rizika smazání údajů jiného profilu."],
    },
    {
      heading: "12. Tvoje práva",
      paragraphs: ["V rozsahu stanoveném právními předpisy můžeš požádat zejména o informace a přístup k údajům, opravu, výmaz, omezení zpracování, přenositelnost nebo vznést námitku. Žádosti posílej na kontaktní adresu správce. Máš také právo podat stížnost u Úřadu pro ochranu osobních údajů."],
    },
    {
      heading: "13. Uživatelé mladší 15 let",
      paragraphs: ["ChytnuCz je určeno především osobám od 15 let. Osoby mladší 15 let mohou aplikaci používat se souhlasem zákonného zástupce. Aplikace věk aktivně technicky neověřuje."],
    },
    {
      heading: "14. Bezpečnost",
      paragraphs: ["Používáme technická a organizační opatření přiměřená povaze služby. Žádná internetová služba nemůže zaručit absolutní bezpečnost ani nepřetržitou dostupnost. Do poznámek neukládej údaje, které pro rybářský deník nepotřebuješ."],
    },
    {
      heading: "15. Změny zásad",
      paragraphs: ["Zásady můžeme aktualizovat při změně funkcí, poskytovatelů, způsobu zpracování nebo právních požadavků. Datum poslední aktualizace je uvedeno na začátku. O významných změnách můžeme informovat přímo v aplikaci."],
    },
    {
      heading: "16. Kontakt",
      paragraphs: ["Dotazy k soukromí, exportu nebo odstranění údajů:", "David Moravec · David.Moravec2@seznam.cz"],
    },
  ],
});

export const TERMS_OF_USE = Object.freeze({
  title: "Podmínky používání",
  lastUpdated: "28. října 2026",
  sections: [
    { heading: "1. Provozovatel", paragraphs: ["ChytnuCz provozuje David Moravec, fyzická osoba – nepodnikatel. Kontakt: David.Moravec2@seznam.cz."] },
    { heading: "2. Charakter služby", paragraphs: ["ChytnuCz je bezplatná aplikace určená především pro osobní rybářský deník. Může obsahovat evidenci úlovků, fotografie, mapy a GPS, vycházky, statistiky, výzvy, achievementy, XP, počasí, revíry, zálohu a synchronizaci mezi zařízeními. V současné verzi nejsou aktivní placené funkce ani reklamy."] },
    { heading: "3. Uživatelský účet", paragraphs: ["Některé funkce vyžadují účet. Odpovídáš za zabezpečení přihlašovacích údajů, správnost vložených údajů a činnost provedenou prostřednictvím svého účtu. Podezření na zneužití oznam na kontaktní e-mail."] },
    { heading: "4. Věk uživatele", paragraphs: ["ChytnuCz je určeno především uživatelům od 15 let. Uživatelé mladší 15 let mají aplikaci používat pouze se souhlasem zákonného zástupce. Aplikace věk technicky neověřuje."] },
    { heading: "5. Rybářské předpisy", paragraphs: ["Aplikace nenahrazuje rybářský řád, právní předpisy, podmínky povolenky, místní pravidla revíru ani rozhodnutí příslušných orgánů. Odpovídáš za lov v souladu s aktuálně platnými pravidly. Informace o revíru mohou být neúplné, orientační nebo neaktuální; před lovem ověř aktuální pravidla u oficiálního zdroje."] },
    { heading: "6. Počasí a aktivita ryb", paragraphs: ["Počasí, tlak, vítr, srážky, fáze měsíce a odhad aktivity ryb mají informační a orientační charakter. Odhad aktivity nezaručuje úspěšný lov. Dostupnost a přesnost meteorologických údajů třetích stran nejsou garantovány."] },
    { heading: "7. Mapy a GPS", paragraphs: ["GPS a mapové informace mohou být nepřesné. Nepoužívej aplikaci jako jediný zdroj navigace, bezpečnostních informací, hranic revíru ani oprávnění k lovu. V terénu odpovídáš za vlastní bezpečnost."] },
    { heading: "8. Fotografie a obsah uživatele", paragraphs: ["Práva k fotografiím, poznámkám a dalšímu obsahu zůstávají tobě. Provozovateli poskytuješ oprávnění nezbytné k technickému uložení, synchronizaci, zpracování, zobrazení a doručení obsahu zpět tobě. Obsah nesmí být používán k prodeji fotografií ani reklamě. Odpovídáš za to, že máš právo vložený obsah použít."] },
    { heading: "9. Zakázané použití", items: ["neoprávněný přístup k cizím účtům;", "obcházení bezpečnostních mechanismů nebo úmyslné zahlcování serverů;", "automatizované zneužívání API;", "nahrávání nezákonného obsahu nebo porušování práv třetích osob;", "pokusy získat neveřejné údaje jiných uživatelů."] },
    { heading: "10. Synchronizace a offline režim", paragraphs: ["Aplikace může částečně fungovat offline. Změny se nemusí odeslat okamžitě a synchronizace může pokračovat později. Dočasný výpadek může vyžadovat opakování synchronizace; Catch uložený místně nezmizí pouze kvůli čekajícímu odeslání."] },
    { heading: "11. Zálohování", paragraphs: ["Aplikace nabízí místní JSON zálohu dostupných dat na používaném zařízení. Nejde o úplný cloudový export. Záloha není šifrovaná; uchovávej ji bezpečně. Důležité údaje doporučujeme pravidelně exportovat. Nelze zaručit, že online služba nikdy neztratí data."] },
    { heading: "12. Smazání úlovku a fotografie", paragraphs: ["Smazaný obsah přestane být v aplikaci aktivně zobrazován. U synchronizované fotografie může aplikace zařadit odstranění vzdáleného objektu do fronty; dokončení závisí na synchronizaci a dostupnosti poskytovatele a nemá garantovanou lhůtu 24 hodin. Minimální technické synchronizační záznamy mohou zůstat po dobu nutnou k dokončení synchronizace."] },
    { heading: "13. Smazání účtu", paragraphs: ["Úplné smazání účtu není v aplikaci automatizované. Žádost můžeš poslat provozovateli na kontaktní e-mail; další postup a ověření budou řešeny individuálně. Konkrétní lhůta ani automatické dokončení u všech poskytovatelů nejsou garantovány."] },
    { heading: "14. Dostupnost služby", paragraphs: ["ChytnuCz je poskytováno bezplatně a bez záruky nepřetržité dostupnosti. Může dojít k údržbě, výpadku serveru nebo služby třetí strany, změně API, technické chybě či dočasnému omezení funkce."] },
    { heading: "15. Služby třetích stran", paragraphs: ["Aplikace může využívat Google Firebase, Cloudinary, Vercel, Open-Meteo a OpenStreetMap nebo jiné poskytovatele mapových dlaždic. Tyto služby mají vlastní podmínky, pravidla dostupnosti a zásady ochrany osobních údajů."] },
    { heading: "16. Změny a ukončení funkcí", paragraphs: ["Funkce aplikace mohou být upraveny, přidány, dočasně vypnuty nebo odstraněny. Pokud změna ovlivní nakládání s osobními údaji, aktualizujeme také zásady ochrany osobních údajů."] },
    { heading: "17. Odpovědnost za rozhodnutí", paragraphs: ["ChytnuCz je pomocný nástroj. Informace o počasí, aktivitě ryb, GPS, mapách a revírech mohou být orientační nebo neaktuální. Nezakládej na nich rozhodnutí bez ověření u vhodného zdroje. Tím nejsou dotčena práva ani odpovědnost, které nelze podle práva vyloučit."] },
    { heading: "18. Ochrana osobních údajů", paragraphs: ["Zpracování osobních údajů popisují samostatné Zásady ochrany osobních údajů ChytnuCz, dostupné přímo v aplikaci a před vytvořením účtu."] },
    { heading: "19. Změny podmínek", paragraphs: ["Podmínky můžeme aktualizovat. Aktuální znění a datum změny jsou dostupné v aplikaci. O významných změnách můžeme informovat prostřednictvím aplikace."] },
    { heading: "20. Kontakt", paragraphs: ["Dotazy, technická podpora a požadavky týkající se účtu: David Moravec · David.Moravec2@seznam.cz"] },
  ],
});
