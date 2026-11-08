# Automatické doplňování úlovku a výchozí údaje vycházky

Datum revize: 8. listopadu 2026. Matice vychází ze skutečných polí plného formuláře
`src/pages/AddCatchPage.jsx`, `catchModel.js`, Quick Catch a editoru, nikoli jen ze
seznamu v zadání. Popisuje datový kontrakt této změny; výsledky provedených testů
patří do závěrečného release reportu.

## Jeden model, několik důvěryhodných zdrojů

Quick Catch používá tentýž Catch, editor a outbox jako plný záznam. Vycházka je
zdroj výchozích hodnot pouze při vytvoření nového způsobilého úlovku. Kopie hodnot
v Catch je historický snímek; změna vycházky nemění dřívější úlovky. Žádná vycházka
není podmínkou pořízení fotografie.

Přednost má ruční údaj konkrétního úlovku, poté ověřený údaj dané fotografie či
pořízení, poté výslovný platný údaj vycházky. Chybějící údaj zůstává neznámý.
`0` je platná číselná hodnota tam, kde ji dovoluje doména; není náhradou za chybění.
AI návrh druhu je oddělen od potvrzeného `speciesKey`.

V tabulkách znamená **C** běžné Catch pole: místní IndexedDB, stejná serializace
Firestore, lokální záloha/obnova a export účtu. **Q** znamená existující bounded
`quickCatch` metadata (na Firestore JSON nejvýše 4096 znaků); součást téhož Catch,
nikoli další repository či synchronizační fronta. **P** jsou fotografie: místní
binární data a existující Cloudinary upload/delivery, Firestore nese metadata.
**E** označuje společný normalizovaný tvar prostředí: u rychlého úlovku uvnitř Q jako `quickCatch.environment`, u běžného/legacy úlovku jako volitelné `environment` na tomtéž Catch (bounded JSON na Firestore, nikoli jiný model či fronta). **A** je owner-scoped stav AI návrhu a serverový výsledek; nepotvrzený návrh není
naměřený ani potvrzený údaj úlovku.

## Úplná matice polí plného formuláře a editoru

| Pole v UI | Klíč Catch / formuláře | Zdroj a automatické doplnění | Do výchozích údajů vycházky? | Spolehlivost a ruční oprava | Detail, editor, synchronizace a export |
|---|---|---|---|---|---|
| Fotografie | `photos`, `primaryPhotoId` | Jedna fotografie z fotoaparátu/galerie, další dobrovolně v editoru | Ne | Uložit binární data před potvrzením; SHA a stabilní identity při retry; smazání nesmí pozdní upload obnovit | P; běžný galerijní/editorový tok, ořez a hlavní snímek zachovány |
| Druh ryby | `speciesKey`, `species`, `speciesLatin`; oddělený `aiSpeciesSuggestion` | Pouze autorizovaný katalogově validovaný AI návrh; bez souhlasu neznámý | Ne | Návrh vyžaduje potvrzení či opravu; potvrzený/ruční druh nelze AI přepsat | C po potvrzení, A před ním; jasný štítek Návrh AI; nepotvrzený návrh nevstupuje do druhových statistik/PB |
| Délka (cm) | `lengthCm` | Ruční měření; běžná fotografie délku nedokazuje | Ne | Primární míra, neznámá není nula | C; plný editor a detail; délkové PB jen z platné uložené míry |
| Váha (kg) | `weightKg`, `weightSource` | Ruční vážení; volitelný matematický odhad až z potvrzeného druhu a délky | Ne | `estimated` je zřetelně oddělen od ručně vážené hodnoty; není ověřené váhové PB | C; editor/Detail zachovává označení odhadu, Quick Catch nehádá váhu |
| Obvod (cm) | `girthCm` | Ruční měření | Ne | Žádný odhad z fotografie | C; editor i známá hodnota v detailu |
| Délka boje (min) | `fightMinutes` / `fightDurationMin` | Ruční zápis | Ne | Nelze odvodit z jedné fotografie ani délky vycházky | C; editor i detail |
| Uložený revír | `waterId` | Výslovně zvolený revír vlastníka v platné aktivní vycházce | Ano, existující `waterId` | Žádné automatické přijetí nejbližšího revíru; ruční výběr či vymazání vítězí | C; editor zachová i dříve zvolený nedostupný revír, detail odkazuje na vlastní revír |
| Revír / lokalita | `locationName` | Výslovné místo vycházky; název vlastního uloženého revíru jako náhradní popis | Ano, existující `locationName` | Konkrétní místo neztratit přepsáním obecným názvem vody; oprava patří jen úlovku | C; běžný textový editor a detail |
| Číslo revíru (ČRS) | `waterNumber` | Platné číslo z explicitně zvoleného vlastního revíru | Nepřidávat duplicitní pole; zdrojem je zvolený revír | Catch má existující číselný kontrakt; nenumerický či nepodporovaný katalogový text nepřevádět na smyšlené číslo | C; editor i detail; původ `saved_water` v Q |
| Datum | `caughtAt` / `catchDate`, `catchDateTimeSource` | Čas pořízení; u historické fotografie platné EXIF datum, jinak dostupný čas zařízení se správným označením | Ne | EXIF s offsetem je absolutní okamžik; bez offsetu omezení místního pásma. Ručně opravený údaj vítězí | C + Q původ/pásmo; zachovat sekundy při nezměněném minutovém formuláři |
| Čas záběru / záznamu | `caughtAt` / `catchTime` | Stejný okamžik jako datum, nikoli důkaz přesného času záběru | Ne | Rozlišit čas fotografie, čas uložení a uživatelem opravený čas úlovku; nedomýšlet délku prodlevy před focením | C + Q; čas a zdroj v detailu; ruční úprava může zneplatnit dřívější automatické počasí |
| GPS souřadnice | `coordinates`, `gpsLocation`, `gpsSource`, `locationEvidence` | Platné EXIF GPS; jinak dostatečně čerstvé/přesné již povolené GPS v původní kamerové relaci | Ne jako nové měření; uložené místo není senzor | Při otevření fotoaparátu nejvýše jeden 4s požadavek s již uděleným oprávněním; pomocný snímek jen v paměti původní relace/vlastníka, nejvýše 60 s od fotografie a s přesností nejvýše 150 m. Bez nového permission promptu při Quick Catch; po znovuotevření nepoužít dnešní polohu pro starý úlovek; ruční mapa/text vítězí | C + Q; soukromá mapa, původ a případná přesnost/čas měření; přesné GPS se nezveřejňuje automaticky |
| Hloubka (m) | `waterDepthM` / `depthM` | Ručně zadaná výchozí hloubka vycházky | Ano, `waterDepthM` | Kontext `active_trip`, ne měření pro konkrétní rybu; rozsah 0–2000 m; ruční oprava úlovku vítězí | C + Q původ; běžný editor a čitelný detail |
| Typ dna | `bottomType` | Výslovný výchozí údaj vycházky | Ano, `bottomType` | Pouze existující enum `mud`, `sand`, `gravel`, `rocks`; nikoli inference z rybí fotografie | C + Q původ; české názvy Bahno/Písek/Štěrk/Kamení v UI |
| Metoda lovu | `method` / `fishingMethod` | Platný katalogový `methodKey` aktivní vycházky | Ano, existující `methodKey` | Položená/Feeder/Plavaná/Přívlač/Muškaření/Dírky z existujícího katalogu; změna vycházky jen pro budoucí úlovky | C + Q `active_trip`; obyčejný editor a detail, žádný druhý seznam metod |
| Nástrahy | `baits` / `baits[]` klíče | Jedna či více explicitních katalogových nástrah vycházky | Ano, existující `baitKeys` | Neodvozovat z oblíbené nástrahy ani starších úlovků; prázdný výběr znamená neznámé | C + Q `active_trip`; editor zachová klíče/labely a umožňuje vlastní volbu |
| Zařadit k vycházce | `tripId` | Existující aktivní vycházka a časově odpovídající nové pořízení | Ano jako asociace, nikoli duplicitní nastavení | Historická galerie nesmí získat dnešní nesouvisející vycházku; ruční přeřazení/odpojení vítězí | C + Q; existující select a odkaz v detailu; žádná zpětná změna snímku při úpravě Trip |
| Vzduch (°C) | `conditions.airTempC` | Open-Meteo pro spolehlivou polohu a původní čas úlovku | Ne | Meteorologický model/reanalýza, nikoli místní teploměr; nevyplňuje ručně upravené nebo výslovně vymazané pole | C + Q původ API; editor a sekce Počasí |
| Voda (°C) | `conditions.waterTempC`; časovaný snímek měření vycházky | Výslovné ruční měření z aktivní vycházky | Ano, `waterTemperatureMeasurement` | Není teplota vzduchu. Hodnota −10 až 60 °C, čas a `source: manual_trip`; politiku stáří viz níže | C pro časově relevantní teplotu, Q pro původní pozorování/čas; běžný editor a detail Voda |
| Tlak (hPa) | `conditions.pressureHpa` | Open-Meteo tlak při povrchu pro místo/čas | Ne | Zachovat jednotky a zdroj; žádné tvrzení o měření u rybáře | C + Q; editor, Počasí a reference modelu |
| Vítr (km/h) | `conditions.windKmh` | Open-Meteo pro místo/čas | Ne | Nula je skutečné bezvětří, ne chybějící údaj; manuální oprava vítězí | C + Q; editor i detail |
| Fáze měsíce | `conditions.moonPhase` | Existující deterministický výpočet z data/času | Ne | Přibližný výpočet, nikoli externí AI; ruční volba je respektována | C + Q `derived`; editorový výběr a Slunce a Měsíc |
| Vlhkost (%) | `quickCatch.environment.conditions.humidityPct` / `environmentConditions.humidityPct` | Open-Meteo; 0–100 % | Ne | Rozsah a původ validovány; ruční změna/vymazání blokuje pozdní doplnění | E; volitelná rozšířená pole editoru, známé hodnoty v detailu |
| Směr větru (°) | `quickCatch.environment.conditions.windDirectionDeg` | Open-Meteo; 0–360° | Ne | Není automatické určení směru z fotografie | E; rozšířený editor a detail |
| Nárazy větru (km/h) | `quickCatch.environment.conditions.windGustKmh` | Open-Meteo; 0–400 km/h | Ne | Odděleno od průměrné rychlosti větru | E; rozšířený editor a detail |
| Srážky za hodinu (mm) | `quickCatch.environment.conditions.precipitationMm` | Open-Meteo; 0–1000 mm | Ne | Hodinový modelový údaj; nula se zachovává | E; rozšířený editor a detail |
| Oblačnost (%) | `quickCatch.environment.conditions.cloudCoverPct` | Open-Meteo; 0–100 % | Ne | Model, nikoli pozorování kamery | E; rozšířený editor a detail |
| Kód počasí WMO | `quickCatch.environment.conditions.weatherCode` | Open-Meteo; celé číslo 0–99 | Ne | Validované celé číslo, známé kódy mají český popis | E; rozšířený editor a detail |
| Změna tlaku za 3 h (hPa) | `quickCatch.environment.conditions.pressureChange3hHpa` | Rozdíl skutečně dostupných souvislých hodin modelu | Ne | −100 až 100 hPa; bez obou odpovídajících časů neznámé | E; rozšířený editor a detail |
| Výsledek | `result` / `resultKey` | Výhradně pozdější ruční volba | Ne | Quick Catch `unspecified` = Neuvedeno; fotografie nedokazuje puštění ani ponechání | C; editor a známý výsledek v detailu |
| Poznámky | `notes` | Ruční text; oddělený dobrovolný AI nástroj jen po výslovném schválení | Ne | Nekopírovat obecné poznámky vycházky jako příběh konkrétní ryby | C; editor a detail; text se neodešle modelu pouhým pořízením fotografie |
| Označit jako oblíbený | `isFavorite` | Ruční preference | Ne | Quick Catch výchozí false; žádné automatické oblíbené položky | C; editor, hvězda v detailu a filtry |
| Viditelnost úlovku | `privacy.visibility` | Existující platná výslovná preference uživatele, jinak bezpečné soukromé nastavení | Ne | Automatické doplnění není nový souhlas s publikací; pozdější explicitní úprava vítězí | C; standardní privacy editor a veřejná projekce |
| Viditelnost fotografie | `privacy.photoVisibility` | Existující platná výslovná preference, jinak private | Ne | Souhlas s AI není souhlas s veřejnou fotografií | C + P; privátní upload není automatická publikace |
| Přesnost polohy | `privacy.locationPrecision` | Stávající preference při respektování soukromého místa | Ne | `none` bez souhlasu; `privateSpot` vynucuje `none`; veřejná projekce respektuje existující bezpečné omezení | C; privacy editor; soukromé GPS v exportu vlastníka, nikoli automaticky ve veřejném feedu |
| Považovat místo za soukromé | `privacy.privateSpot` | Bezpečná preference, jinak true | Ne | Nikdy automaticky neodkrýt místo; soukromé místo vypíná nearby/heatmap způsobilost | C; existující privacy model a editor |

## Další automatická metadata mimo samostatná pole formuláře

| Údaj | Klíč | Pravidlo a integrace |
|---|---|---|
| Čas pořízení, vstup a pásmo zařízení | `quickCatch.capturedAt`, `inputSource`, `timeZone`, `timezoneOffsetMinutes` | Q; odlišit od ručně opraveného `caughtAt`; fotoaparát a galerie nejsou totožné časové důkazy |
| Původ jednotlivého údaje | `quickCatch.provenance` | Q; `manual`, `exif`, `device`, `gps`, `active_trip`, `saved_water`, `weather_api`, `derived`, `ai_suggestion`; nezměněné údaje nesmějí po uložení poznámky získat nepravdivé označení manual |
| Historický snímek vycházky | `quickCatch.tripSnapshot` | Q; identita/revize zdrojové vycházky a časované pozorování vody podle implementace; zdrojová změna ani souběžná synchronizace nemění hodnoty staršího Catch |
| Zdroj a stáří počasí | `quickCatch.environment.weather` | E; `provider: open-meteo`, `kind: forecast-model` nebo `historical-reanalysis`, `hour`, `fetchedAt`; žádné surové odpovědi API |
| Východ/západ slunce | `quickCatch.environment.astronomy.sunriseAt`, `sunsetAt` | E; aproximace pouze při platném čase a GPS; pro polární den/noc nevyrábět smyšlené časy |
| Den/noc | `quickCatch.environment.astronomy.daylight` | E; `day`, `night`, `polar-day`, `polar-night`; výpočet, nikoli čidlo |
| Osvětlení Měsíce | `quickCatch.environment.astronomy.moonIlluminationPct` | E; přibližně 0–100 %, bez modelového AI požadavku |
| Čas vůči východu/západu | `quickCatch.environment.astronomy.minutesFromSunrise`, `minutesToSunset` | E; výpočet patří výhradně k `forInstant === caughtAt`; po změně místa/času přepočítat |
| Stav metadat/počasí | `quickCatch.enrichment.metadata`, `.weather` | Q; bounded retry, nezávislé na okamžitém potvrzení lokálního uložení; API selhání nesmí skrýt Catch |
| Stav AI | `aiRecognition`, `aiSpeciesSuggestion` při čtení; owner-scoped cache a serverový výsledek | A; čekání na internet/fotografii/bezplatný limit, schválení jen proti aktuálnímu owner/photo/hash/revizi, smazaná ryba se nesmí vrátit |

## Trip kontrakt a časová pravidla

Existující `waterId`, `methodKey`, `baitKeys` a `locationName` se znovu používají.
Chybějící volitelná pole jsou `waterDepthM`, `bottomType` a
`waterTemperatureMeasurement: { valueC, measuredAt, source: "manual_trip" }`.
Žádné míry jednotlivé ryby, její druh, výsledek ani oblíbenost nejsou výchozí
údaje vycházky. Poznámky vycházky zůstávají pouze u vycházky.

Měření vody je relevantní pro přímé `conditions.waterTempC` pouze tehdy, když
`measuredAt <= caughtAt` a rozdíl není větší než čtyři hodiny. Jde o konzervativní
produktovou politiku použitelnosti, nikoli fyzikální záruku neměnné teploty.
Starší dostupné pozorování se smí zachovat ve snímku jako dřívější měření s časem;
nesmí tiše vystupovat jako nové měření ve chvíli záběru. Budoucí měření se nepoužije
pro minulý úlovek. Pozdější ruční změna teploty konkrétního Catch vítězí.

Časové okamžiky se ukládají jako ISO/UTC; formulář zobrazuje místní čas. EXIF
`OffsetTimeOriginal` má přednost před dohadem pásma. EXIF bez offsetu neposkytuje
jednoznačné původní pásmo ani rozlišení opakované hodiny při změně letního času;
toto omezení se nesmí zaměnit za přesnou historickou lokaci/čas. Stará galerie
bez spolehlivého historického času nedostane aktuální vycházku ani dnešní počasí.

## Zachování dat a ověřovací scénáře

- Lokální potvrzení následuje až po durable zápisu fotografie a read-back kontrole;
  GPS, počasí, sync ani AI na něj nečekají.
- Hodnoty vycházky se kopírují před uložením Catch; nečtou se dodatečně z dnešní
  vycházky při zobrazení starého úlovku. Nová revize Trip platí pro budoucí úlovky.
- Běžný editor čte stejný Catch; změna jednoho pole zachovává ostatní hodnoty,
  rozšířené počasí, původ a časový snímek. Změna času/GPS smí zneplatnit pouze
  automatické údaje skutečně vázané na starý kontext, ne ručně opravené počasí.
- Firestore nadále validuje běžná pole, owner a revize; nové volitelné Trip údaje
  jsou zpětně kompatibilní. Při exportu/importu se Q normalizuje a neznámá metadata
  se nepřelévají do objektu bez validace.
- Nový adaptér zachovává již uložená volitelná Trip pole i `environment` běžného
  Catch, pokud je starší vstup vůbec neobsahuje. Pravidla odmítnou jejich tiché
  odstranění starým klientem; výslovné `null` z aktuálního editoru je povolené
  vymazání. Staré úlovky bez nových polí zůstávají platné. Zařízení se starou
  verzí musí před úpravou vycházky s novými výchozími údaji načíst aktualizaci;
  odmítnutí zápisu nesmí být řešeno mazáním místních dat.
- Souběžné doplnění respektuje aktuální tombstone, vlastníka, fotografii i ruční
  hodnoty přijaté z druhého zařízení. Deferred AI má serverovou deduplikaci a
  rezervace bezplatné kvóty; neprovádí inference při každém otevření detailu.
- Povinná automatizovaná akceptace: úplné výchozí údaje; změněné výchozí údaje se
  dvěma historickými snímky; žádná vycházka; lokální retry/reopen; staré EXIF;
  ruční opravy a pozdní rebase; notes-only edit; soukromé fotografie/GPS;
  serializace/záloha/export/smazání a owner izolace.

Mockovaná fotografie, emulátor a simulované druhé zařízení nejsou důkaz skutečného
iPhonu ani živého Cloudinary. Instalovaná PWA po fyzickém zavření, aktuální souhlas
produkčního vlastníka a živá autorizovaná inference se reportují samostatně podle
skutečně provedeného ověření.
