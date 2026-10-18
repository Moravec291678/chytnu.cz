# ChytnuCz — MVP kritéria dokončení a testovací checklist

**Aktualizováno:** 18. 10. 2026
`[x]` implementováno a ověřeno · `[~]` pouze lokálně/emulátorově nebo chybí produkční důkaz · `[ ]` chybí

## Produktové jádro

- [x] Catch create/detail/edit, nullable míry, datum/čas, lokalita, metoda, nástrahy, poznámka, výsledek, oblíbené a Trip vazba.
- [x] Potvrzované smazání a ochrana Tripu s připojenými úlovky (automatizovaně; browser delete nebyl v tomto bloku znovu proveden).
- [x] Fotografie se uloží jako Blob a zůstane viditelná po reloadu.
- [x] Trip create/edit/active/end/detail/history a statistiky z reálných časů a vazeb.
- [x] Deník: hledání bez diakritiky, kombinované filtry, reset, sbalení a korektní řazení nullable měření.
- [x] Statistiky: počty, druhy, hmotnost/délka, známé C&R výsledky, čas, metody a dokončené výpravy bez demo hodnot.
- [x] Druhový přehled a Species Album vycházejí ze skutečných úlovků; album ukazuje odemčené druhy, počty, osobní maxima a progres katalogu.
- [x] Stupňované XP (10/15/20 + první druh 50), levely 1–20 a osm odvozených achievementů jsou deterministické a idempotentní.
- [~] PWA shell a manifest jsou v buildu; offline restart vyžaduje fyzický prohlížečový test.

## Zálohy a lokální data

- [x] Export v1 obsahuje Catch, Trip, vazby a plné bajty fotografií.
- [x] Neplatný JSON/verze/ID/datum/fotografie/tripId nezmění databázi.
- [x] Merge je idempotentní; rozdílné stejné ID je zablokované.
- [x] Replace je potvrzovaný a transakční; nevytváří cloudové tombstones.
- [x] V prohlížeči proběhlo skutečné stažení, opětovný výběr souboru, náhled a idempotentní merge.
- [x] Cloudově synchronizovaná záloha se obnoví bezpečně jako ownerless lokální data.

## Účty a synchronizace

- [~] Registrace, login, session, logout, reset a ověření e-mailu: ověřeno proti Auth Emulatoru; produkce chybí.
- [~] Google Auth používá stejnou Firebase vrstvu a emulátorový mock credential test prochází; skutečný popup vyžaduje stagingový Google provider a autorizovanou doménu.
- [x] Ownerless data se nikdy nepřiřadí automaticky; explicitní atomická akce zachová ID, Trip vazby a Blob.
- [x] Odhlášení nemaže lokální deník ani fotografii.
- [x] Outbox přežije restart/výpadek, retry je idempotentní a ruční opakování obejde čekání backoffu.
- [x] Catch/Trip metadata se přenesou, delta+cursor se uloží atomicky a tombstone brání starému upsertu.
- [x] Catch i Trip konflikt zachová obě verze, lze zvolit místní/vzdálenou a fronta se dokončí.
- [x] Foto upload/download ověřuje SHA-256 a bajty, druhý klient obnoví Blob, cizí účet je odmítnut.
- [x] Selhání uploadu i cleanupu po nahrazení/odstranění/smazání ponechá operaci ve frontě a další retry ji dokončí.
- [~] Všechny cloudové funkce jsou pouze proti demo emulátorům; produkční projekt není nakonfigurovaný.
- [ ] Smazání produkčního účtu a všech cloudových dat.

## Počasí a GPS

- [x] Poloha se žádá pouze po kliknutí; zamítnutí ani síťová chyba neblokují deník.
- [x] Timeout, neúplná a fyzikálně nepravděpodobná data jsou odmítnuta; aktivita je označena jako orientační odhad.
- [x] Chybějící souřadnice se nenahrazují vymyšlenou polohou.
- [x] Catch podporuje validované strukturované souřadnice; pole je kompatibilní s IndexedDB, backupem, outboxem, Firestore projekcí, pravidly a konflikty.
- [~] Produkční licence/atribuce a živý požadavek na fyzickém zařízení zůstávají release bránou.
- [~] Soukromá Leaflet mapa zobrazuje jen vlastní úlovky s validní GPS a zvládne nedostupné dlaždice; veřejný OSM tile server je vhodný pro lokální QA, produkční provider je release rozhodnutí.

## Kvalita a bezpečnost

- [x] `npm run lint`.
- [x] `npm test`: 101/101.
- [x] `npm run test:rules`: 6/6.
- [x] `npm run test:auth`, `npm run test:sync`, `npm run test:photos` s exit code 0.
- [x] `npm run build` a `git diff --check`.
- [x] Bezpečnostní pravidla odmítají anonymního i cizího uživatele, změnu ownerId, neplatná ID/pole a veřejnou fotografii.
- [~] Audit závislostí posouzen; 6 produkčních nálezů vyžaduje major migraci nebo upstream opravu.
- [~] Browser QA na 390 px prošlo pro hlavní scénáře a bez konzolových chyb; fyzický iOS/Android test chybí.
- [x] Explicitní režimy backendu `emulator`, `staging`, `production` nemají tichý fallback do cloudu; `.env.example` obsahuje jen veřejné client proměnné.
- [x] Vercel build a SPA rewrite jsou připravené a automaticky kontrolované; skutečný Preview deploy nebyl proveden.
- [ ] Produkční cloud, právní dokumenty, backup restore drill, store metadata a uzavřená beta.

## Rozhodnutí o rozsahu

- [x] Sociální síť, veřejné mapy, AI, marketplace a placené funkce jsou mimo MVP.
- [x] Základní Species Album, XP, levely 1–20 a osm věcných achievementů jsou součástí strategického MVP; questy, streaky, rarity a sociální gamifikace zůstávají mimo rozsah.

## Stav vydání

Lokálně a proti emulátorům je strategické produktové jádro dokončené a projekt je technicky připravený na staging. Veřejné vydání zůstává zablokované produkční infrastrukturou, Google OAuth konfigurací, volbou mapového provideru, právními podklady, fyzickými zařízeními a potvrzením offline PWA chování.
