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
- [x] Druhový přehled vychází ze skutečných úlovků.
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
- [~] Produkční licence/atribuce a živý požadavek na fyzickém zařízení zůstávají release bránou.
- [ ] Osobní mapa: odložena, protože model nemá validované souřadnice; není kritériem soukromého deníkového MVP.

## Kvalita a bezpečnost

- [x] `npm run lint`.
- [x] `npm test`: finální počet viz závěrečný report.
- [x] `npm run test:rules`: 6/6.
- [x] `npm run test:auth`, `npm run test:sync`, `npm run test:photos` s exit code 0.
- [x] `npm run build` a `git diff --check`.
- [x] Bezpečnostní pravidla odmítají anonymního i cizího uživatele, změnu ownerId, neplatná ID/pole a veřejnou fotografii.
- [~] Audit závislostí posouzen; 6 produkčních nálezů vyžaduje major migraci nebo upstream opravu.
- [~] Browser QA na 390 px prošlo pro hlavní scénáře a bez konzolových chyb; fyzický iOS/Android test chybí.
- [ ] Produkční cloud, právní dokumenty, backup restore drill, store metadata a uzavřená beta.

## Rozhodnutí o rozsahu

- [x] Sociální síť, veřejné mapy, AI, marketplace a placené funkce jsou mimo MVP.
- [x] XP, levely a achievementy jsou odložené podle novějšího full-MVP promptu, který zakazuje složitou/infantilní gamifikaci a vymezuje jádro jako praktický soukromý deník.

## Stav vydání

Lokálně a proti emulátorům je produktové jádro dokončené. Veřejné vydání zůstává zablokované produkční infrastrukturou, právními podklady, fyzickými zařízeními a potvrzením offline PWA chování.
