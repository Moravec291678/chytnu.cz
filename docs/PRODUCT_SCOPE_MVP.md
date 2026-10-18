# Produktový rozsah strategického MVP

## Součást MVP

- soukromý osobní deník Catch a Trip;
- lokální CRUD, fotografie a strukturovaná volitelná GPS použitelné bez přihlášení;
- hledání, filtry, historie, pravdivé statistiky a soukromá mapa vlastních úlovků;
- druhové album odvozené ze skutečných Catch;
- střídmá odvozená progrese: stupňované XP, levely 1–20 a osm základních milníků;
- export a bezpečná obnova;
- e-mailový účet, feature-gated Google Auth, dobrovolné propojení ownerless dat a synchronizace mezi zařízeními;
- konflikty bez tichého přepsání, trvalá fronta a viditelné chyby;
- počasí a aktivita ryb jako dobrovolný orientační odhad;
- PWA shell a konfigurace připravená pro oddělený staging a production.

Album, XP, levely, milníky a mapové body jsou odvozené z aktuálně viditelných Catch/Trip. Nevznikají pro ně duplicitní cloudové kolekce. Přesné souřadnice jsou soukromé a do mapy vstupují jen validní strukturované hodnoty nebo jednoznačně parsovatelný starší text.

## Mimo první MVP

- feed, komentáře, reakce, přátelé, Crew, chat a veřejné profily;
- questy, streak, rarity, mastery a rozsáhlá gamifikace;
- veřejné mapy, heatmapy a sdílení přesných GPS;
- AI, marketplace, předplatné, Stripe a push notifikace;
- nativní Android/iOS balíček.

## Kritérium vydání

Lokální web/PWA beta může začít až po fyzickém offline testu. Veřejná účtová verze navíc vyžaduje oddělený staging a produkční cloud, produkční e-mail/Google konfiguraci, serverový lifecycle účtu, právní dokumenty, cenový dohled a bezpečnostní kontrolu nasazených pravidel.
