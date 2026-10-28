# Product catalog — generated

Automaticky vytvořeno příkazem `npm run product:inventory` z `src/product/config/`. Validace před generováním kontroluje duplicity, XP, období, challenge typy, odkazy, levely a feature flagy.

## Achievements

| ID | Název | Podmínka | XP | Enabled / okno |
|---|---|---|---:|---|
| first-catch | První úlovek | Zaznamenej první úlovek. | 30 | Ano · trvalý |
| first-kilo | První kilo | Zaznamenej úlovek o hmotnosti alespoň 1 kg. | 30 | Ano · trvalý |
| trophy-catch | Trofejní úlovek | Zaznamenej úlovek o hmotnosti alespoň 10 kg. | 100 | Ano · trvalý |
| ten-catches | Prvních deset | Zaznamenej deset úlovků. | 50 | Ano · trvalý |
| fifty-catches | Padesát úlovků | Zaznamenej 50 úlovků. | 100 | Ano · trvalý |
| five-hundred-catches | Pět set úlovků | Zaznamenej 500 úlovků. | 200 | Ano · trvalý |
| five-species | Lovec druhů I | Zaznamenej pět různých druhů. | 50 | Ano · trvalý |
| ten-species | Lovec druhů II | Zaznamenej deset různých druhů. | 75 | Ano · trvalý |
| twenty-five-species | Lovec druhů III | Zaznamenej 25 různých druhů. | 150 | Ano · trvalý |
| fifty-species | Rybí encyklopedie | Zaznamenej 50 různých druhů. | 200 | Ano · trvalý |
| five-waters | Objevitel vod I | Zaznamenej úlovky z pěti různých revírů. | 50 | Ano · trvalý |
| ten-waters | Objevitel vod II | Zaznamenej úlovky z deseti různých revírů. | 100 | Ano · trvalý |
| twenty-five-waters | Objevitel vod III | Zaznamenej úlovky z 25 různých revírů. | 200 | Ano · trvalý |
| summer-catch | Letní rybář | Zaznamenej úlovek v létě. | 30 | Ano · trvalý |
| winter-catch | Zimní rybář | Zaznamenej úlovek v zimě. | 30 | Ano · trvalý |
| four-week-streak | Čtyři týdny u vody | Udrž týdenní sérii po dobu čtyř týdnů. | 75 | Ano · trvalý |
| twelve-week-streak | Sezóna v rytmu | Udrž týdenní sérii po dobu 12 týdnů. | 150 | Ano · trvalý |
| fifty-two-week-streak | Rok aktivního rybaření | Udrž týdenní sérii po dobu 52 týdnů. | 200 | Ano · trvalý |
| night-catch | Noční vlk | Zaznamenej úlovek mezi 22:00 a 04:00. | 50 | Ano · skrytý do splnění |
| marathon-trip | Maratonec | Dokonči vycházku trvající alespoň osm hodin. | 75 | Ano · skrytý do splnění |

## Denní a týdenní challenges

Časová zóna: `Europe/Prague`.

| ID | Název | Podmínka / typ | Cíl | Reward | Enabled / okno |
|---|---|---|---:|---:|---|
| daily-catch | Zaznamenej dnešní úlovek | catch-count | 1 | 25 XP | Ano · denně |
| daily-species | Zaznamenej dnes dva různé druhy | species-count | 2 | 25 XP | Ano · denně |
| daily-trip | Dokonči dnešní vycházku | trip-count | 1 | 25 XP | Ano · denně |
| weekly-species | Zaznamenej tři druhy tento týden | species-count | 3 | 75 XP | Ano · týdně |
| weekly-water | Navštiv revír po 30 a více dnech | water-visit | 1 | 75 XP | Ano · týdně |

## Sezónní challenges

| ID vzor | Název | Podmínka | Reward | Enabled / okno |
|---|---|---|---:|---|
| season-{YYYY}-winter | Zimní warrior | Zaznamenej úlovek při teplotě pod 5 °C. | 100 XP | Ano · prosinec, leden, únor |
| season-{YYYY}-spring | První úlovek po zimě | Zaznamenej první jarní úlovek. | 100 XP | Ano · březen, duben, květen |
| season-{YYYY}-summer | Noční rybaření | Zaznamenej letní úlovek mezi 22:00 a 04:00. | 100 XP | Ano · červen, červenec, srpen |
| season-{YYYY}-autumn | Kapr | Zaznamenej kapra s uvedenou délkou. | 100 XP | Ano · září, říjen, listopad |
| season-{YYYY}-autumn-predator | Dravec | Zaznamenej dravce s uvedenou délkou. | 100 XP | Ano · září, říjen, listopad |
| season-{YYYY}-autumn-other | Lososovité / ostatní | Zaznamenej lososovitou nebo jinou nedravou rybu s uvedenou délkou. | 100 XP | Ano · září, říjen, listopad |

## XP, úrovně a mastery

- XP za catch: 10 základ, 15 s fotkou, 20 s GPS a počasím.
- Verification multipliers: strong 100%, standard 100%, limited 25%, unverified 0%. Limited cap: 20 XP/den.
- Další hodnoty XP: newSpecies 50 XP, newWater 30 XP, dailyChallenge 25 XP, weeklyChallenge 75 XP, streakBonus 50 XP, communityContribution 5 XP, publicShare 10 XP, legendaryRarity 200 XP.
- Level L vyžaduje 50 × (L−1)² XP; maximum 100.

| Rank | Levely | Enabled / duration |
|---|---:|---|
| Nováček · Rybářský nadšenec | 1–5 | Ano · trvalý |
| Rybář · U vody | 6–15 | Ano · trvalý |
| Zkušený rybář · Znalec vod | 16–29 | Ano · trvalý |
| Senior rybář · Mistr prutu | 30–49 | Ano · trvalý |
| Expert · Vodní vlk | 50–74 | Ano · trvalý |
| Legenda · Kapitán vod | 75–99 | Ano · trvalý |
| Prestige I+ · Rybářská legenda | 100–100 | Ano · trvalý |

| Mastery | Počet catchů | XP |
|---|---:|---:|
| První úlovek | 1 | 50 |
| Znalec druhu | 5 | 30 |
| Zkušený lovec | 20 | 50 |
| Mistr druhu | 50 | 100 |
| Legenda druhu | 100 | 200 |

## Notifications

| ID | Název | Text / hluboký odkaz | Enabled / podmínka |
|---|---|---|---|
| sync_problem | Problém se synchronizací | Synchronizace potřebuje pozornost · /profile | Typ podporovaný modelem |
| achievement | Úspěch | Nový úspěch · /achievements | Typ podporovaný modelem |
| challenge | Výzva | Výzva dokončena · /challenges | Typ podporovaný modelem |
| active_trip | Aktivní vycházka | Typ modelu; text producer zatím nemá | Typ podporovaný modelem |
| app_update | Aktualizace aplikace | Typ modelu; text producer zatím nemá | Typ podporovaný modelem |

Preference jsou uživatelsky nastavitelné: morningFishActivity (default ON), tomorrowGreatConditions (default OFF), friendActivity (default OFF), streaksAndChallenges (default ON), friendLegendaryCatch (default OFF).

## Feature flags

| ID | Enabled |
|---|---|
| seasonalChallenges | Ne |
| weeklyChallenges | Ne |
| streaks | Ne |
| rarity | Ne |
| speciesMastery | Ne |
| waters | Ne |
| community | Ne |
| friends | Ne |
| nearby | Ne |
| crew | Ne |
| notifications | Ne |
| supporter | Ne |
| aiInsights | Ne |
| dailyTips | Ne |
| seasonStory | Ne |
| publicSharing | Ne |

## Limity

| ID | Hodnota |
|---|---|
| photosPerCatch | 4 |
| legacyPhotosPerCatch | 10 |
| photoBytes | 10485760 |
| backupFileBytes | 104857600 |
| notificationIdLength | 128 |
| notificationTitleLength | 120 |
| notificationBodyLength | 500 |
| notificationDeepLinkLength | 300 |
| catch | {"weightKg":1000,"lengthCm":2000,"girthCm":2000,"fightDurationMin":10000,"depthM":2000,"waterNumber":99999999,"airTempC":{"min":-60,"max":60},"waterTempC":{"min":-10,"max":60},"pressureHpa":{"min":300,"max":1200},"windKmh":300} |
| liveGpsMaxAgeMs | 900000 |
| liveGpsMaxAccuracyMeters | 150 |
| verifiedWaterRadiusMeters | 1000 |
| photoCaptureTimeToleranceMs | 86400000 |
| tripCatchTimeToleranceMs | 1800000 |
| futureCatchClockSkewMs | 300000 |
| limitedCatchDailyXp | 20 |
| quickSpecies | 8 |
| trophySelection | 5 |
| statsPatternMinimumSample | 3 |
| nightCatchStartHour | 22 |
| nightCatchEndHour | 4 |
| marathonTripHours | 8 |
| waterVisitGapDays | 30 |
- Rozestup návštěvy stejného revíru pro weekly challenge: 30 dní.

## Supporter entitlements

| Capability ID | Required entitlement | Free limit | Supporter limit |
|---|---|---:|---:|
| catch.photos.extended | supporter | 4 | 8 |
| stats.advanced | supporter | — | — |
| filters.saved | supporter | — | — |
| profile.supporter-style | supporter | — | — |
| share.extra-themes | supporter | — | — |

## Supporter obsah

- Benefity (návrhy): AI příběh sezóny, Pokročilé statistiky, Zmrazení série 2×, Export deníku do PDF, Nápověda ke skrytým úspěchům, Vytvoření crew, Badge Supporter.
- Free obsah: Neomezený deník, XP, úrovně a úspěchy, Feed a okolí podle dostupnosti služby, Základní statistiky, Revíry.
- Kosmetika: Rám avatara (29 Kč, pouze návrh), Badge (39 Kč, pouze návrh), Zlatý záblesk (49 Kč, pouze návrh).
- Copy: Plán podpory · návrh ceny od 69 Kč měsíčně · Nákup zatím není dostupný

> Supporter ceny jsou pouze produktové návrhy; inventář ani tento nástroj neaktivují billing nebo checkout.
