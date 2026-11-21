# Mapa tras a akcí ChytnuCz

Výchozí stav 21. listopadu 2026, vývojový SHA `dcdc595883ee0563694326d5245d448d1e051a51`. Router má 57 deklarací včetně fallbacku. Číslo u trasy označuje milník, který vlastní její ověření. Prompt 01 vlastní změny navigačních vstupů a přeměření napříč sekcemi. Hluboké odkazy zůstávají podporované.

## Domů a vstup

- `/` · 03 · Domů, stav dne a Quick Catch.
- `/fish-activity` · 03 · Vysvětlení odhadu podmínek z Domů.
- `/login` · 15 · Přihlášení, registrace a obnova.
- `/onboarding` · 03 · První průchod do Domů.

## Úlovek a deník

- `/add` · 04 · Ruční zápis z FAB, foto Quick Catch začíná přímo na Domů.
- `/catch/:id` · 04 · Kanonický soukromý detail.
- `/catch/:id/edit` · 04 · Kanonická úprava úlovku.
- `/catch/:id/reward` · 08 · Potvrzený postup po uložení.
- `/catch/:id/share` · 05 · Sdílení z detailu se souhlasem, mimo soukromý pilot.
- `/journal` · 06 · Kanonický seznam s filtry.
- `/journal/calendar` · 06 · Kalendář z Deníku.
- `/journal/map` · 07 · Kanonická soukromá mapa, vstup ze skupiny Mapa, příběhy a přehledy v Deníku.
- `/map` · 07 · Kompatibilní přesměrování na kanonickou mapu se zachováním parametrů a fragmentu.
- `/hotspots` · 07 · Soukromý odvozený přehled míst.
- `/gallery` · 06 · Kanonická vlastní galerie z Deníku.
- `/stats` · 06 · Kanonické statistiky z Deníku.
- `/insights` · 06 · Tipy z deníku s případnou dobrovolnou externí AI.
- `/season-story` · 06 · Příběh sezóny s případným opt-in.
- `/year-summary` · 06 · Roční retrospektiva.
- `/trips` · 07 · Kanonický seznam vycházek.
- `/trips/new` · 07 · Jeden formulář z Domů a seznamu vycházek.
- `/trips/:id` · 07 · Detail vycházky a její úlovky.
- `/trips/:id/edit` · 07 · Úprava vycházky.
- `/waters` · 07 · Moje revíry z Deníku, vstup do katalogu.
- `/waters/catalogue` · 07 · Kanonický katalog RIS.
- `/waters/catalogue/:catalogueId` · 07 · Detail RIS s přiznanou přesností.
- `/waters/new` · 07 · Přidání soukromého revíru.
- `/waters/:waterId` · 07 · Detail vlastního revíru.
- `/waters/:waterId/edit` · 07 · Úprava vlastního revíru.

## Profil, účet a postup

- `/profile` · 09 · Kanonický vlastní profil, správa identity a místní záloha s obnovou v sekci Účet a místní data (`#local-backup`).
- `/profile/social` · 09 · Veřejná identita a souhlas, v soukromém pilotu zavřeno.
- `/settings` · 15 · Účet, cloudový export a výmaz. Odkaz vede do kanonické sekce místní zálohy.
- `/privacy` · 15 · Soukromí a poloha.
- `/privacy-policy` · 19 · Veřejné zásady zpracování.
- `/terms` · 19 · Veřejné podmínky.
- `/admin/*` · 15 · Serverově oprávněná administrace.
- `/achievements` · 08 · Úspěchy.
- `/levels` · 08 · Úrovně a XP.
- `/challenges` · 08 · Výzvy podle dostupné konfigurace.
- `/streak` · 08 · Série se stávajícími omezeními.
- `/album` · 08 · Kanonické druhové album.
- `/species/:speciesKey` · 08 · Detail skutečného druhu.
- `/species/:speciesKey/mastery` · 08 · Detail mastery podle dostupnosti.
- `/supporter` · 21 · Vypnuto.

## Komunita

- `/community` · 10 · Kanonický feed a přímo vložené vyhledávání rybářů, v soukromém pilotu zavřeno.
- `/community/post/:postId` · 10 · Kanonický autorizovaný detail příspěvku.
- `/community/catch/:catchId` · 10 · Kompatibilní odkaz na místní náhled.
- `/community/:postId/report` · 10 · Zachovaný vstup hlášení.
- `/u/:identity` · 09 · Kanonický veřejný profil.
- `/community/find` · 11 · Kompatibilní přesměrování na hledání v Komunitě (`#fisher-search`).
- `/friends` · 11 · Přátelé a žádosti.
- `/notifications` · 11 · Kanonická oznámení z Domů, Komunity a nastavení.
- `/messages/:targetUid?` · 12 · Konverzace přátel, výchozí stav zavřeno.
- `/crew` · 13 · Skupiny a role, výchozí stav zavřeno.
- `/waters/:waterId/chat` · 13 · Chat potvrzeného členství, výchozí stav zavřeno.
- `/nearby` · 14 · Dobrovolná hrubá přítomnost, výchozí stav zavřeno.
- `*` · 18 · Standardní fallback a návrat.

## Kanonické vstupy a hranice

- Běžný klient má Domů, Deník, přidání úlovku, Komunitu a Profil. Soukromý pilot uzavírá sociální trasy i API a externí AI. Privilegované akce zůstávají chráněné serverem.
- Místní záloha a obnova mají jedinou obrazovku v Profilu. Cloudový export zůstává v Nastavení. Detail z oznámení, mapy nebo feedu podléhá stejné autorizaci jako detail z hlavní navigace.
- Soukromé revíry, mapa a vycházky zvýrazňují Deník. Chat revíru, povolené konverzace a veřejné profily zvýrazňují Komunitu. Druhové album, postup, soukromí a nastavení zvýrazňují Profil.
- Profil zpřístupňuje stejné kanonické stránky prostřednictvím šesti rozbalovacích skupin. Přehled všech vstupů, podmínek, výchozích návratů a kontextových akcí je v [inventuře dohledatelnosti](CHYTNU_FEATURE_DISCOVERABILITY.md).
- Sdílený návrat používá skutečnou historii aktuální relace nebo výchozí návrat z inventury. Starý odkaz na hlášení vede na formulář u příslušného příspěvku a zachová bezpečnostní kontrolu serveru.
