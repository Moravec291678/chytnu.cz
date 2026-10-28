# Product catalog — ChytnuCz

Inventář produktových hodnot, které vlastník může potřebovat upravit. Popisuje současnou implementaci, ne návrh nové konfigurace. Zdrojové cesty jsou relativní k repozitáři.

**Poznámky:** produktová data jsou centralizována v `src/product/config/`; samostatné admin UI ani remote config nejsou. Výpočty zůstávají v enginech pod `src/features/`. Stabilní IDs neměň bez migračního plánu. „Aktivní“ znamená používané logikou, ne automaticky server-authoritative. Catch progression používá eligible records; legacy catch bez verification jsou grandfathered.

## Achievementy

Data: `src/product/config/achievements.js`; vyhodnocení: `src/features/progression/data/progression.js`. Odměny jsou jednorázové na stabilní ID, bez časového limitu. Catch podmínky se vyhodnocují z progression-eligible záznamů. Skryté se ukážou až po splnění.

| ID | Název a podmínka | Reward | Enabled / window |
|---|---|---:|---|
| first-catch | První úlovek; 1 catch | 30 XP | Aktivní · trvalé |
| first-kilo | První kilo; měřená hmotnost ≥ 1 kg | 30 XP | Aktivní · trvalé |
| trophy-catch | Trofejní úlovek; měřená hmotnost ≥ 10 kg | 100 XP | Aktivní · trvalé |
| ten-catches | Prvních deset; 10 catchů | 50 XP | Aktivní · trvalé |
| fifty-catches | Padesát úlovků; 50 catchů | 100 XP | Aktivní · trvalé |
| five-hundred-catches | Pět set úlovků; 500 catchů | 200 XP | Aktivní · trvalé |
| five-species | Lovec druhů I; 5 druhů | 50 XP | Aktivní · trvalé |
| ten-species | Lovec druhů II; 10 druhů | 75 XP | Aktivní · trvalé |
| twenty-five-species | Lovec druhů III; 25 druhů | 150 XP | Aktivní · trvalé |
| fifty-species | Rybí encyklopedie; 50 druhů | 200 XP | Aktivní · trvalé |
| five-waters | Objevitel vod I; catch z 5 uložených revírů | 50 XP | Aktivní · trvalé |
| ten-waters | Objevitel vod II; catch z 10 revírů | 100 XP | Aktivní · trvalé |
| twenty-five-waters | Objevitel vod III; catch z 25 revírů | 200 XP | Aktivní · trvalé |
| summer-catch | Letní rybář; catch v červnu–srpnu | 30 XP | Aktivní · každý rok, lokální měsíc |
| winter-catch | Zimní rybář; catch v prosinci–únoru | 30 XP | Aktivní · každý rok, lokální měsíc |
| four-week-streak | Čtyři týdny u vody; série ≥ 4 týdnů | 75 XP | Aktivní · trvalé maximum |
| twelve-week-streak | Sezóna v rytmu; série ≥ 12 týdnů | 150 XP | Aktivní · trvalé maximum |
| fifty-two-week-streak | Rok aktivního rybaření; série ≥ 52 týdnů | 200 XP | Aktivní · trvalé maximum |
| night-catch | Noční vlk; catch 22:00–04:00, skrytý | 50 XP | Aktivní · čas Europe/Prague |
| marathon-trip | Maratonec; dokončená Vycházka ≥ 8 h, skrytý | 75 XP | Aktivní · trvalé |

## Denní a týdenní výzvy

Data: `src/product/config/challenges.js`; vyhodnocení: `src/features/progression/data/challenges.js`. Catch podmínky používají způsobilé záznamy.

| ID | Název / podmínka | Reward | Enabled / time window |
|---|---|---:|---|
| daily-catch | Zaznamenej dnešní úlovek; alespoň 1 catch | 25 XP | Aktivní · denně, Europe/Prague |
| daily-species | Zaznamenej dnes dva různé druhy | 25 XP | Aktivní · denně, Europe/Prague |
| daily-trip | Dokonči dnešní Vycházku | 25 XP | Aktivní · denně, Europe/Prague |
| weekly-species | Zaznamenej tři druhy tento týden | 75 XP | Aktivní · pondělí–neděle, Europe/Prague |
| weekly-water | Navštiv revír po 30 a více dnech | 75 XP | Aktivní · týdně; mezera ≥ 30 dní, max 1 postup na revír/týden |

## Sezónní výzvy

Data: `src/product/config/challenges.js`; vyhodnocení: `src/features/progression/data/seasonalChallenge.js`. Cíl je 1 způsobilý catch, reward 100 XP za každou samostatně splněnou variantu. Okna: zima XII–II, jaro III–V, léto VI–VIII, podzim IX–XI; měsíce určuje lokální runtime.

| ID vzor | Název / podmínka | Reward | Enabled / time window |
|---|---|---:|---|
| season-{YYYY}-winter | Zimní warrior; vzduch pod 5 °C | 100 XP | Aktivní · jedna zima |
| season-{YYYY}-spring | První úlovek po zimě; libovolný jarní catch | 100 XP | Aktivní · jedno jaro |
| season-{YYYY}-summer | Noční rybaření; letní catch 22:00–04:00 | 100 XP | Aktivní · jedno léto |
| season-{YYYY}-autumn | Kapr; commonCarp/carp s hmotností | 100 XP | Aktivní · jeden podzim |
| season-{YYYY}-autumn-predator | Dravec mimo lososovité s hmotností | 100 XP | Aktivní · jeden podzim |
| season-{YYYY}-autumn-other | Lososovitá nebo jiná nedravá ryba mimo kaprovité s hmotností | 100 XP | Aktivní · jeden podzim |

## XP, mastery a úrovně

Data: `src/product/config/xp.js` a `src/product/config/levels.js`; výpočty: `src/features/progression/data/xpRules.js`, `progression.js`, `progressionLedger.js`. Nové claimy obsluhují `api/progression/claim-catch.js` a `api/progression/reconcile.js`; ledger deduplikuje stabilní reward IDs.

| ID / název | Podmínka / reward | Enabled / window |
|---|---|---|
| catch.base | Catch bez bonusového kontextu: 10 XP před verification multiplierem | Aktivní · jednou za catch |
| catch.photo | Catch s fotografií: 15 XP před multiplierem | Aktivní · jednou za catch |
| catch.gpsAndWeather | Catch s GPS a počasím: 20 XP před multiplierem | Aktivní · jednou za catch |
| verification strong / standard | Multiplier 100 % | Aktivní |
| verification limited | Multiplier 25 %, max 20 XP celkem z Limited catchů za den | Aktivní · denně Praha |
| verification unverified | 0 XP | Aktivní |
| species.first | Nový druh: 50 XP | Aktivní · jednou na druh |
| water.created | Vytvořený revír: 30 XP | Aktivní · jednou na revír ID |
| streak.bonus | 50 XP za každý násobek 7 týdnů série | Aktivní · trvalé milníky |
| mastery.milestone | 1/5/20/50/100 catchů druhu; 0/30/50/100/200 XP | Aktivní · každý druh |
| rarity.legendary | Legendární rarita: 200 XP | Aktivní · jednou na catch |
| share.public | Veřejné sdílení způsobilého catch: 10 XP | Aktivní · jednou na catch |
| communityContribution | 5 XP je uvedeno v XP pravidlech/přehledu Levels; event writer nebyl nalezen | Není potvrzeno jako udělované |
| achievement | Konkrétní odměny 30–200 XP jsou výše | Aktivní · jednou na achievement ID |
| challenge.completed | Daily/weekly/seasonal odměny podle tabulek | Aktivní · dle období |

Prahy úrovní: level L vyžaduje 50 × (L−1)² XP; maximum je 100. Nové claim/reconcile API je v api/progression/claim-catch.js a api/progression/reconcile.js; serverové endpointy vracejí disabled stav, pokud není zapnutý env přepínač SERVER_PROGRESSION_SHADOW. Kódové definice ranků jsou v progression.js:

| ID | Název / titul | Úrovně | Enabled / duration |
|---|---|---:|---|
| rank-novacek | Nováček · Rybářský nadšenec | 1–5 | Aktivní · trvalé |
| rank-rybar | Rybář · U vody | 6–15 | Aktivní · trvalé |
| rank-zkuseny | Zkušený rybář · Znalec vod | 16–29 | Aktivní · trvalé |
| rank-senior | Senior rybář · Mistr prutu | 30–49 | Aktivní · trvalé |
| rank-expert | Expert · Vodní vlk | 50–74 | Aktivní · trvalé |
| rank-legenda | Legenda · Kapitán vod | 75–99 | Aktivní · trvalé |
| rank-prestige | Prestige I+ · Rybářská legenda | 100 | Aktivní · maximum |

Mastery názvy pro úrovně 1–5: První úlovek, Znalec druhu, Zkušený lovec, Mistr druhu, Legenda druhu; definice prahů a XP jsou v progression.js. Achievementy, mastery i XP hodnoty jsou kódové konstanty, nikoli CMS.

## Oznámení a texty

Model typů a validace: src/features/notifications/data/notificationModel.js. Producers: src/features/notifications/context/NotificationProvider.jsx a src/features/notifications/data/notificationModel.js.

| ID | Název / text | Podmínka | Reward | Enabled / window |
|---|---|---|---|---|
| sync_problem | „Synchronizace potřebuje pozornost“ + lokální data zůstávají uložená; zopakuj synchronizaci | sync error; stabilní ID deduplikuje problém za den | žádný | Aktivní · denně deduplikované |
| achievement | „Nový úspěch“ + dynamický text získaného XP | ledger event achievement.unlocked | XP je ledger reward, ne notification | Aktivní · událost |
| challenge | „Výzva dokončena“ + dynamický text XP | ledger event challenge.completed | bez další odměny | Aktivní · událost |
| active_trip | Typ model podporuje; producer/text nebyl nalezen | neurčeno | žádný | Není zjištěno emitování |
| app_update | Typ model podporuje; producer/text nebyl nalezen | neurčeno | žádný | Není zjištěno emitování |

Notification preferences: src/pages/NotificationsPage.jsx, src/features/preferences/data/preferences.js.

| ID preference | Název | Default | Enabled / duration |
|---|---|---|---|
| morningFishActivity | Ranní aktivita ryb | zapnuto | Preference profilu |
| tomorrowGreatConditions | Skvělé podmínky zítra | vypnuto | Preference profilu |
| friendActivity | Aktivita přátel | vypnuto | Preference profilu |
| streaksAndChallenges | Série a výzvy | zapnuto | Preference profilu |
| friendLegendaryCatch | Výjimečný úlovek přítele | vypnuto | Preference profilu |

Delivery abstraction podporuje in_app/web_push/native_push v src/features/notifications/data/notificationDelivery.js. Web Push vyžaduje explicitní souhlas. Flag notifications není centrální gate všech obrazovek.

## Feature flags

Data jsou v `src/product/config/featureFlags.js`, kompatibilní export a vyhodnocení v `src/shared/config/featureFlags.js`. Výchozí hodnota všech níže uvedených flagů je false; unknown key také vrací false. Flagy nejsou centrálně použité ve všech feature, proto jejich změna nemusí danou stránku/flow vypnout nebo zapnout. Aktuálně zjištěné čtení: aiInsights na Stats.

| ID | Název / účel | Enabled | Reward / duration |
|---|---|---|---|
| seasonalChallenges | Sezónní výzvy | false | — |
| weeklyChallenges | Týdenní výzvy | false | — |
| streaks | Série | false | — |
| rarity | Rarita | false | — |
| speciesMastery | Mistrovství druhů | false | — |
| waters | Revíry | false | — |
| community | Komunita | false | — |
| friends | Přátelé | false | — |
| nearby | Okolí | false | — |
| crew | Crew | false | — |
| notifications | Oznámení | false | — |
| supporter | Supporter | false | — |
| aiInsights | AI přehledy | false | — |
| dailyTips | Denní tipy | false | — |
| seasonStory | Příběh sezóny | false | — |
| publicSharing | Veřejné sdílení | false | — |

## Limity

| ID | Limit | Zdroj | Podmínka | Reward / duration |
|---|---|---|---|---|
| catch.photos.new | 4 fotografie na nový catch | src/features/catches/data/catchPhotos.js, catchModel.js | add/edit validace | — · na catch |
| catch.photos.legacy | zachovat legacy catch až do 10 fotek; nemažou se při editaci | catchPhotos.js, firestore.rules | kompatibilita historických záznamů | — · trvalá kompatibilita |
| photo.bytes | 10 MiB na upload/foto metadata | src/features/catches/data/cloudinaryPhotoProvider.js, firestore.rules | kontrola uploadu | — · na fotografii |
| verification.gps | GPS do 15 minut a accuracy ≤150 m | src/features/catches/data/catchVerification.js | podpůrný důkaz ověření | ovlivňuje verification |
| catch.measurements | váha ≤1000 kg; délka/obvod ≤2000 cm | src/features/catches/data/catchModel.js | formulář | — · při save |
| catch.conditions | vzduch −60…60 °C; voda −10…60 °C; tlak 300…1200 hPa; vítr ≤300 km/h | catchModel.js | formulář | — · při save |
| xp.limited-daily | max 20 XP z Limited catchů | src/features/progression/data/xpRules.js | další reward po dosažení capu je 0 | 20 XP · den Praha |
| notification.fields | ID 128, title 120, body 500, deep link 300 znaků | src/features/notifications/data/notificationModel.js | schema validation | — · na oznámení |
| quick-species | nejvýše 8 druhů | src/features/preferences/data/quickSpeciesPreferences.js | rychlý picker | — · preference |
| trophy-selection | nejvýše 5 úlovků | src/features/species/data/trophySelection.js | trofeje profilu | — · preference |
| backup.file | záloha 100 MiB, vložené foto 10 MiB | src/features/backup/data/backupRestore.js | import/restore | — · na import |

Další validační limity názvů a poznámek jsou v src/features/waters/data/waterModel.js; limity crew jsou v src/features/crew/data/crewModel.js (crew flag je vypnutý).

## Filtry a statistiky

| ID / oblast | Název | Zdroj | Podmínky / volby | Reward / window |
|---|---|---|---|---|
| journal.filters | Filtry Deníku | src/pages/JournalPage.jsx, src/features/catches/utils/catchJournal.js | hledání druhu, lokality, metody, nástrahy, poznámky a Vycházky; druh, datum od/do, oblíbené, výsledek, metoda, Vycházka; řazení nejnovější/nejstarší, nejtěžší/nejlehčí, nejdelší/nejkratší | žádný · pouze zobrazení |
| gallery.filters | Filtry Galerie | src/pages/GalleryPage.jsx, src/features/catches/data/catchGallery.js | hledání, druh, voda/revír, všechno/měsíc/rok/vlastní rozsah, oblíbené; řazení nejnovější/nejstarší/největší | žádný · pouze zobrazení |
| stats.period | Období statistik | src/pages/StatsPage.jsx, src/features/stats/utils/statsPeriod.js | sezóna od března, kalendářní rok, celkem | žádný · výběr profilu |
| stats.metrics | Statistiky catch/Vycházek | src/features/stats/utils/catchStatistics.js, src/pages/StatsPage.jsx | počty catchů/druhů/metod, měřené váhy a délky, největší váha, nejdelší délka, dokončené/aktivní Vycházky, průměr catchů na dokončenou Vycházku, 6měsíční počty a validní datumy, nejčastější vzorce času/lokality/nástrahy/měsíce, průměrný tlak a teplota vody | žádný · dle zvoleného období |
| stats.pattern-sample | Minimum pro vzorce | src/features/stats/utils/catchStatistics.js | nejméně 3 vzorky a nejčastější hodnota alespoň 2× | žádný · dle období |

## Onboarding a výchozí obsah

| ID | Název / obsah | Zdroj | Podmínka | Reward / enabled / duration |
|---|---|---|---|---|
| onboarding.detail-mode | „Jak chceš rybařit?“; Jednoduše / Do detailů | src/pages/OnboardingPage.jsx, src/features/preferences/data/preferences.js | první krok; default simple | žádný · aktivní, měnitelné v Settings |
| onboarding.location-mode | Přesnost polohy nebo pokračovat bez GPS | src/pages/OnboardingPage.jsx, src/features/privacy/data/onboardingLocationPreference.js, src/features/privacy/data/privacyModel.js | dobrovolná volba přibližná/přesná/bez polohy a případná permission | žádný · aktivní, profilová preference |
| onboarding.complete | Dokončení úvodu | src/features/preferences/data/preferences.js | příznak profilového scope, migrace starého global flagu | žádný · trvalé |
| add-catch.default-mode | Rychlý / podrobný zápis | src/pages/SettingsPage.jsx, preferences.js | uživatelský výběr defaultu formuláře | žádný · profilová preference |
| species.defaults | Katalog druhů, kategorií a labels | src/shared/constants/speciesCatalog.js | picker, filtry, sezónní matching; species key je datové ID | žádný · trvalý katalog |
| method.defaults / bait.defaults | Katalog metod a nástrah | src/shared/constants/constants.js | standardní volby zápisu; vlastní položky mohou existovat | žádný · trvalý katalog |

## Supporter a budoucí funkce

Zdroje: src/pages/SupporterPage.jsx, src/features/entitlements/data/entitlementAccess.js. Stránka má entitlement snapshot natvrdo null; aktivace vyžaduje explicitně serverem ověřený entitlement. Checkout ani platby nejsou aktivní.

| ID | Název / popis | Podmínka | Reward | Enabled / duration |
|---|---|---|---|---|
| supporter.entitlement | Supporter členství | pouze ověřený server entitlement | výhody níže | Nedostupné · žádný billing |
| supporter.ai-season-story | AI příběh sezóny | budoucí Supporter + služba | obsah | Budoucí |
| supporter.advanced-stats | Pokročilé statistiky | budoucí entitlement | obsah | Budoucí |
| supporter.streak-freeze | Zmrazení série 2× | entitlement; existuje doménový základ, nárok není zapojen | ochrana série | Není aktivní |
| supporter.pdf-export | Export deníku do PDF | budoucí entitlement; share page říká nedostupný | export | Vypnuto |
| supporter.hidden-help | Nápověda ke skrytým úspěchům | budoucí entitlement | obsah | Budoucí |
| supporter.crew | Vytváření crew | entitlement + feature flag crew | sociální funkce | Flag false |
| supporter.badge | Badge Supporter | ověřené entitlement | kosmetika | Budoucí |
| supporter.cosmetics | Rám avatara, badge, zlatý záblesk | stránka uvádí návrhy, nákup není dostupný | pouze vzhled | Vypnuto; nejde o billing config |

Stránka uvádí jako zdarma neomezený deník, XP/úrovně/úspěchy, základní statistiky a revíry. Ceníkové texty na této stránce jsou návrhy, nikoli aktivní checkout.

## Správa katalogu

Definice achievementů, výzev, XP, sezónních textů, notification producers, limitů, flags, filtrů, statistik i onboarding copy jsou dnes v uvedených zdrojových souborech. Samostatné owner/admin UI ani remote-config feed není. Před změnou stable ID ověř ledger idempotency, backup/sync kompatibilitu a odpovídající testy.
