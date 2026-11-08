export const PRIVACY_POLICY = Object.freeze({
  title: "Zásady ochrany osobních údajů",
  lastUpdated: "8. listopadu 2026",
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
        { heading: "Volitelné funkce AI", items: ["nastavení souhlasu s externím zpracováním, jeho verzi, změny a odvolání;", "návrhy druhů ryb, vysvětlení souhrnů a vyžádané návrhy vyprávění, pokud tuto funkci použiješ."] , note: "Externí zpracování je ve výchozím nastavení vypnuté. Návrh AI není potvrzený údaj deníku." },
        { heading: "Herní postup a technické údaje", items: ["XP, úrovně, achievementy, výzvy, série a mastery;", "stav synchronizace, identifikátory operací, konflikty mezi zařízeními a záznamy potřebné k zabránění duplicitním odměnám;", "technické údaje o chybách a neúspěšných synchronizacích."] , note: "Technické údaje nepoužíváme k vytváření reklamních profilů." },
      ],
    },
    {
      heading: "3. Proč údaje používáme",
      paragraphs: ["Údaje používáme k provozu účtu a rybářského deníku, synchronizaci mezi zařízeními, ukládání a zobrazování fotografií, místní záloze a obnově, mapovým a meteorologickým funkcím, statistikám a herním funkcím, zabezpečení a řešení technických chyb a vyřízení žádostí uživatelů. Údaje neprodáváme a aplikace v současnosti neobsahuje reklamní systém.", "Místní rozbor deníku a doporučení počítá aplikace v zařízení ze záznamů. Nejde o výstup AI modelu a tento místní režim neposílá fotografie, poznámky ani polohu externí AI službě. Pokud jsou v nasazení dostupné externí funkce AI, použijí se pouze po tvém samostatném souhlasu pro danou funkci, jak popisuje část 6a."],
    },
    {
      heading: "4. Právní základ",
      paragraphs: [
        "Údaje potřebné pro účet a funkce aplikace zpracováváme za účelem poskytnutí služby a plnění souvisejících povinností.",
        "U volitelných funkcí, jako je poloha, fotografie nebo oznámení, rozhoduješ prostřednictvím oprávnění zařízení nebo nastavení. Některé technické údaje mohou být zpracovávány na základě oprávněného zájmu na zabezpečení a spolehlivém provozu.",
        "Externí AI zpracování fotografie, souhrnů deníku nebo vybraných poznámek je dobrovolné a vychází ze samostatného souhlasu. Souhlas můžeš v nastavení Umělá inteligence změnit nebo odvolat; odvolání neovlivňuje zákonnost dřívějšího zpracování. Uložení úlovku, běžný deník i místní přehledy fungují bez tohoto souhlasu.",
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
        "Cloudflare, Inc. – pouze u výslovně povolených externích funkcí AI služba Workers AI s modelem Google Gemma 4; podrobnosti v části 6a.",
        "Open-Meteo – při načtení počasí aplikace odešle souřadnice místa, pro které se počasí vyhledává.",
        "OpenStreetMap nebo související poskytovatelé mapových dlaždic – při zobrazení mapy probíhá běžná síťová komunikace s jejich servery.",
      ],
      note: "Poskytovatelé mohou zpracovávat technické údaje, například IP adresu, podle vlastních podmínek a zásad ochrany osobních údajů.",
    },
    {
      heading: "6a. Volitelná umělá inteligence",
      paragraphs: [
        "Externí funkce používají Cloudflare Workers AI s modelem Google Gemma 4 26B A4B. Model je provozován Cloudflare; nejde o odesílání do Gemini API. Dostupnost závisí na konfiguraci a bezplatné kapacitě služby. Oprávnění uděluješ zvlášť pro rozpoznávání ryb, vysvětlení deníku, doporučení a pomoc s historkami; samotné vytvoření účtu ani fotografie není souhlasem s AI.",
        "Automatické rozpoznávání nových rychlých úlovků povoluješ zvláštní volbou v nastavení. Po jejím uložení se způsobilé nové fotografie odešlou ke zpracování po dokončení nahrání, bez dalšího tlačítka. Při chybě připojení nebo nedostupné bezplatné kapacitě požadavek počká. Odvolání souhlasu zastaví další odesílání; již probíhající zpracování nelze vzít zpět. Při pozastavené aplikaci není pokračování na pozadí zaručené.",
        "Pro rozpoznání ryby odešleme obraz vybrané fotografie a katalog druhů. Z fotografie před odesláním odstraníme vložené EXIF údaje, včetně GPS a času pořízení. Obraz může stále obsahovat obličeje nebo místo viditelné na fotografii; vybírej jen snímky, které máš právo takto zpracovat. Přesné GPS souřadnice ani další údaje z deníku k fotografii nepřidáváme.",
        "Pro vysvětlení deníku a doporučení se nejprve vypočítají statistiky v aplikaci a externí model obdrží odvozené souhrny, nikoli celý deník, fotografie nebo přesné GPS. Pro historky odešleme pouze poznámky, které k dané úpravě vybereš. Text sám může obsahovat osobní údaje nebo popis místa; neposílej údaje, které k úpravě nejsou potřebné.",
        "Cloudflare uvádí, že obsah standardních nestavových požadavků Workers AI nepoužívá k tréninku modelů a neuchovává ho déle, než vyžaduje zpracování a doručení odpovědi. Mohou platit právní a bezpečnostní výjimky a uchovávat se provozní metadata. Nejde o záruku absolutní nulové retence ani zpracování výhradně v EU. Pro aplikaci se nepoužívá ukládání obsahu do AI Gateway ani placený náhradní poskytovatel.",
        "Nastavení souhlasu a uložené výsledky jsou přiřazené tvému účtu. Odvoláním souhlasu zastavíš další externí požadavky a zahájí se odstranění uložených návrhů AI; při výpadku může odstranění vyžadovat opakování nebo pomoc podpory. Již odeslané zpracování nelze vzít zpět. Ručně přijaté nebo upravené údaje v běžném deníku zůstávají jeho součástí. Souhlas a dostupné uložené výsledky zahrnuje export účtu; při smazání účtu se odstraňují s ostatními cloudovými údaji.",
      ],
      note: "AI se může mýlit. Druh zůstává návrhem do tvého potvrzení; text před uložením zkontroluj. Model nesmí sám měnit potvrzené druhy, míry ani poznámky. Pokud pro své rozhodnutí potřebuješ souhlas zákonného zástupce, používej externí AI pouze s jeho souhlasem.",
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
      paragraphs: ["V Nastavení můžeš stáhnout export cloudových údajů svého přihlášeného účtu včetně dostupných cloudových fotografií. U fotografií bez cloudové kopie export uvede, co chybí. Můžeš také stáhnout místní JSON zálohu údajů dostupných na právě používaném zařízení. Místní rozepsané úlovky, starší záznamy bez přiřazeného účtu a jiné údaje uložené pouze na jiném zařízení nemusí být v cloudovém exportu. Exportovaný soubor není šifrovaný; uchovávej ho bezpečně. O přístup k dalším údajům můžeš požádat správce e-mailem."],
    },
    {
      heading: "10. Smazání účtu",
      paragraphs: ["V Nastavení můžeš po opětovném ověření přihlášení zahájit smazání cloudového účtu. Po zahájení se smažou místní data aktivního profilu na tomto zařízení a odhlásíš se. Odstranění cloudových záznamů a fotografií probíhá postupně ve frontě a může pokračovat i po odhlášení; závisí na dostupnosti poskytovatelů. Pevnou lhůtu dokončení, například 24 hodin, aplikace negarantuje. Údaje uložené jen na jiném zařízení nebo starší místní záznamy bez přiřazeného vlastníka se tím nemusí odstranit. Pokud dokončení selže nebo potřebuješ pomoc, kontaktuj správce e-mailem."],
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
  lastUpdated: "5. listopadu 2026",
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
    { heading: "11. Zálohování", paragraphs: ["Nastavení nabízí export údajů přihlášeného cloudového účtu a samostatnou místní JSON zálohu dat dostupných na používaném zařízení. Export upozorní na fotografie bez dostupné cloudové kopie. Údaje uložené pouze na jiném zařízení, včetně místních rozepsaných úlovků, nemusí být v cloudovém exportu. Exportované soubory nejsou šifrované; uchovávej je bezpečně. Nelze zaručit, že online služba nikdy neztratí data."] },
    { heading: "12. Smazání úlovku a fotografie", paragraphs: ["Smazaný obsah přestane být v aplikaci aktivně zobrazován. U synchronizované fotografie může aplikace zařadit odstranění vzdáleného objektu do fronty; dokončení závisí na synchronizaci a dostupnosti poskytovatele a nemá garantovanou lhůtu 24 hodin. Minimální technické synchronizační záznamy mohou zůstat po dobu nutnou k dokončení synchronizace."] },
    { heading: "13. Smazání účtu", paragraphs: ["Smazání účtu můžeš zahájit v Nastavení po opětovném ověření přihlášení. Související cloudové záznamy a fotografie se odstraňují postupně; dokončení závisí na dostupnosti poskytovatelů a nemá garantovanou lhůtu 24 hodin. Místní údaje na jiných zařízeních a starší nepřiřazené místní záznamy mohou vyžadovat samostatné odstranění. Při potížích kontaktuj provozovatele e-mailem."] },
    { heading: "14. Dostupnost služby", paragraphs: ["ChytnuCz je poskytováno bezplatně a bez záruky nepřetržité dostupnosti. Může dojít k údržbě, výpadku serveru nebo služby třetí strany, změně API, technické chybě či dočasnému omezení funkce."] },
    { heading: "15. Služby třetích stran", paragraphs: ["Aplikace může využívat Google Firebase, Cloudinary, Vercel, Open-Meteo a OpenStreetMap nebo jiné poskytovatele mapových dlaždic. Volitelné externí funkce AI využívají po souhlasu Cloudflare Workers AI a model Google Gemma 4. Tyto služby mají vlastní podmínky, pravidla dostupnosti a zásady ochrany osobních údajů."] },
    { heading: "15a. Návrhy umělé inteligence", paragraphs: ["AI funkce jsou dobrovolné a mohou být omezené bezplatnou kapacitou. Návrh druhu není potvrzené určení ryby, číselné skóre modelu není ověřená pravděpodobnost a doporučení nezaručuje úspěšný lov. Model neodvozuje délku nebo hmotnost z běžné fotografie. Vyprávění před uložením zkontroluj; AI nesmí bez tvého schválení přepsat poznámky ani automaticky publikovat obsah. Uložení úlovku a používání deníku zůstává dostupné bez externí AI."] },
    { heading: "16. Změny a ukončení funkcí", paragraphs: ["Funkce aplikace mohou být upraveny, přidány, dočasně vypnuty nebo odstraněny. Pokud změna ovlivní nakládání s osobními údaji, aktualizujeme také zásady ochrany osobních údajů."] },
    { heading: "17. Odpovědnost za rozhodnutí", paragraphs: ["ChytnuCz je pomocný nástroj. Informace o počasí, aktivitě ryb, GPS, mapách a revírech mohou být orientační nebo neaktuální. Nezakládej na nich rozhodnutí bez ověření u vhodného zdroje. Tím nejsou dotčena práva ani odpovědnost, které nelze podle práva vyloučit."] },
    { heading: "18. Ochrana osobních údajů", paragraphs: ["Zpracování osobních údajů popisují samostatné Zásady ochrany osobních údajů ChytnuCz, dostupné přímo v aplikaci a před vytvořením účtu."] },
    { heading: "19. Změny podmínek", paragraphs: ["Podmínky můžeme aktualizovat. Aktuální znění a datum změny jsou dostupné v aplikaci. O významných změnách můžeme informovat prostřednictvím aplikace."] },
    { heading: "20. Kontakt", paragraphs: ["Dotazy, technická podpora a požadavky týkající se účtu: David Moravec · David.Moravec2@seznam.cz"] },
  ],
});
