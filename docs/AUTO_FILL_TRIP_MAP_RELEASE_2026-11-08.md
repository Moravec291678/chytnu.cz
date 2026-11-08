# Smart Quick Catch — výchozí údaje a mapa vycházky

Navazuje na hotfix `7ef1017`. Úplná matice skutečných polí je v
[CATCH_AUTO_FILL_MATRIX.md](CATCH_AUTO_FILL_MATRIX.md).

## Výsledné chování

- Vybraná vlastní voda a její číslo, konkrétní místo, metoda, nástrahy,
  hloubka a dno se kopírují do běžných Catch polí při novém kamerovém úlovku.
  Galerie aktuální nastavení vycházky nepřebírá. Platné EXIF datum se použije
  i při návratu z fotoaparátu; čas fotografie není potvrzeným časem záběru.
- Ruční teplota vody má zdroj `manual_trip` a okamžik měření. Do podmínek
  úlovku se použije pouze měření před úlovkem staré nejvýše čtyři hodiny.
  Starší pozorování zůstává odděleným historickým kontextem. Neměnný snímek
  uchovává revizi a datum nastavení vycházky; její pozdější změna úlovek nepřepíše.
- Změna poznámky nepřepisuje původ jiných polí. Běžný editor zachová rozšířené
  počasí, astronomii a časovaný snímek. Rozšířené údaje lze uložit také do
  normálního/legacy Catch přes stejný normalizátor prostředí a bounded JSON.
- Před otevřením fotoaparátu lze jednorázově získat již povolenou polohu.
  GPS neblokuje uložení, požadavek trvá nejvýše 4 s, důkaz má přesnost nejvýše
  150 m a odstup od fotografie nejvýše 60 s. Nejde o průběžné sledování trasy.
  Historická fotografie, jiný účet, nová kamerová operace ani pozdní callback
  nepřebírají starý snímek GPS. Původní bounded GPS doplnění po uložení zůstává.
- Mapa vycházky promítá aktuální Catch záznamy jen příslušného vlastníka a Trip.
  Každý platný bod má vlastní značku. Blízké či shodné značky mají přístup ke
  všem úlovkům ve společném popupu i seznamu; skutečné souřadnice se neposouvají.
  Popup zobrazí dostupnou fotografii přes stávající loader, druh/návrh AI, čas,
  naměřené míry a odkaz. Odhad hmotnosti se nevydává za vážení.
- Nedostupné dlaždice neodebírají místní body ani odkazy. Seznam se otevře
  automaticky a po návratu připojení lze mapu znovu načíst. Offline dlaždice
  nejsou implementované ani slibované. Změny, přeřazení a smazání vycházejí
  ze stávajícího CatchContext a realtime synchronizace.

## Kompatibilita a bezpečnost

Žádná migrace ani mazání dat, nová fronta nebo placená infrastruktura.
Soukromé výchozí nastavení pro Quick Catch zůstává, pokud neexistuje výslovná
platná volba aktivního profilu. Soukromé místo vždy potlačí zveřejnění polohy.
Mapa je pouze soukromým pohledem; veřejné projekce ani API nebyly rozšířeny o GPS.
AI souhlas, kvóty, oddělení návrhu od druhu a ochrany smazaných záznamů zůstávají.

Trip editor uchovává verzi otevřeného formuláře a zápis atomicky porovnává místní
i serverovou revizi. Novější úprava nebo smazání znamená chybu místo přepsání.
Firestore chrání nové Trip klíče a normální `environment` před vynecháním starým
klientem. Nový snapshot v normalizovaných Quick Catch metadatech se rovněž nesmí
ztratit. Před úpravou takových záznamů je třeba starší aplikaci znovu načíst.

Firestore pravidla ověřují stejný obsah při vytvoření; při změně ponechávají
již ověřené nezměněné struktury a znovu validují změněné. Přímo validují také
rychlou větev změny poznámky/oblíbeného stavu. Tím se zachová limit 1000 výrazů
bez vynechání vlastnictví, account-deletion, revizí, typů či číselných rozsahů.
Negativní testy odmítají neplatnou poznámku, favorit, rozsahy, soukromí a nové klíče.

## Provedené ověření

- Automatické testy pokrývají předávání nastavení, nulové/chybějící hodnoty,
  čtyřhodinovou hranici, ruční opravy, snímky, EXIF, GPS relace, editor, obnovu,
  prostředí, mapové projekce, překrývání bodů a konflikt formuláře vycházky.
- Firestore emulátor přenáší kompletní kamerový Quick Catch s vlastním GPS,
  metodou/nástrahou/vodou/hloubkou/dnem/měřením vody na druhou samostatnou
  IndexedDB instanci. Kontroluje také následnou ruční opravu a výřez fotografie,
  zachování snímku a správný mapový bod. Cloudinary READY/delivery je zde simulace.
- Skutečný prohlížeč, oddělený místní origin a výslovně syntetická data: vytvoření
  a úprava vycházky, čtyři skutečně vykreslené Leaflet značky, popup s fotografií
  a správným odkazem, Catch Detail/editor a uložení pouhé poznámky. Přeřazení
  čtvrtého úlovku změnilo mapy ze 4/0 na 3/1 bodů.
- Simulovaný výpadek dlaždic pomocí testovací CSP zachoval čtyři body i odkazy
  a otevřel seznam. Není vydáván za fyzický offline test telefonu.
- Šířky 320, 390 a 844 px bez vodorovného přesahu. Dočasný seedovací HTML soubor
  byl odstraněn a testovací data nebyla přenesena do produkce.

Fyzický iPhone, uspání/zavření nainstalované PWA, skutečné GPS a nový kompletní
Cloudinary → automatické AI rozpoznání v produkční přihlášené relaci vyžadují
fyzickou akceptaci. V tomto vydání nebylo provedeno nové volání Cloudflare modelu.
Bezplatné limity ani poskytovatelé nebyli změněni a billing nebyl aktivován.

Quality gate: `npm run lint`, `npm test` (973/973), `npm run build`,
`npm run test:sync`, `npm run test:photos`, `npm run test:rules` (18/18),
`npm run test:auth`, `npm run product` a `git diff --check` prošly.
