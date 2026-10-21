# Audit projektu ChytnuCz

**Aktualizováno:** 21. 10. 2026
**Rozsah:** aktuální pracovní strom po lokálním dokončení bezpečně proveditelných částí MVP

## Ověřená architektura

- React 18 + Vite 5, React Router, JavaScript a klasické CSS.
- UI zapisuje přes Context a repository vrstvy. Lokálním zdrojem pravdy je IndexedDB `chytnu-local`.
- Stores: `catches`, `trips`, `outbox`, `syncConflicts`, `syncState`. Upgrade na verzi 4 je aditivní.
- Firebase Auth a Firestore jsou zapojené proti lokálnímu demo emulátoru i explicitní staging konfiguraci projektu `chutnucz`. Aktuální rules byly 21. 10. 2026 nasazeny a reálný izolovaný smoke test Auth/Sync/Security prošel; koncový Google popup na Vercel doméně zůstává manuální release kontrolou.
- Soukromé fotografie zůstávají jako Blob v IndexedDB. Cloudová projekce obsahuje jen ID, název, MIME, velikost a bezpečně omezená framing metadata; Firebase Storage se nepoužívá.
- Produkční build obsahuje manifest a vlastní service worker pro statický shell. Firebase, počasí ani soukromé odpovědi necachuje.

## Ověřené funkce

- Catch: vytvoření, detail, úprava, potvrzované smazání, nullable měření, výsledek včetně `neuvedeno`, oblíbené, vazba na Trip a jedna fotografie.
- Trip: založení, aktivní stav, editace, ukončení, historie, detail, statistiky a zákaz smazání při navázaných úlovcích.
- Deník: skutečná data, hledání bez diakritiky, kombinované filtry, sbalení bez ztráty volby, reset a řazení s neznámými měřeními na konci.
- Statistiky: pouze z reálných Catch/Trip dat; neznámé výsledky ani míry se nevydávají za nulu.
- Záloha: JSON v1 včetně fotografií, úplná validace, náhled, idempotentní merge, blokace konfliktu stejného ID, potvrzovaný replace a transakční rollback.
- Synchronizace: trvalý outbox, CAS revize, idempotentní operation ID, delta cursor, retry/backoff, tombstones a uživatelsky řešitelné Catch i Trip konflikty.
- Účty: e-mail/heslo, session, logout, reset a ověření e-mailu pouze v Auth Emulatoru.
- Počasí/Fish Activity: pouze po vědomé akci, s timeoutem a pravdivými prázdnými/chybovými stavy.

## Automatické důkazy

- `npm test`: 73/73 po doplnění Trip konfliktu (finální počet se ověřuje v závěrečné sadě).
- `npm run test:rules`: Firestore owner/schema/default-deny pravidla včetně crop bounds; aktuální počet je uveden v posledním QA reportu.
- `npm run test:auth`, `npm run test:sync`, `npm run test:photos`: úspěšný exit code 0.
- `npm run lint`, `npm run build`, `git diff --check`: úspěšné; build upozorňuje na hlavní JS chunk přibližně 831 kB.
- Praktické QA v izolovaném IAB na 390 px: Catch CRUD bez smazání, fotografie po reloadu, Trip create/edit/end, Catch→Trip, filtry, naplněné statistiky, export a idempotentní import. Konzole bez warning/error.

## Neověřeno nebo blokováno

- Nasazená verze Firestore pravidel, skutečné e-maily, Google Authorized domains/OAuth a obnovovací zálohy cloudových metadat.
- Smazání cloudového účtu a dat potřebuje schválenou serverovou infrastrukturu a retenční pravidla.
- Service worker je vytvořen a buildnut, ale použitý IAB po vypnutí preview serveru nevykreslil offline shell; fyzický Chrome/Safari/PWA test zůstává nutný.
- Živý požadavek počasí nebyl v tomto bloku spuštěn s přesnou polohou uživatele. Produkční licence/atribuce zdroje musí být potvrzena.
- iOS/Android balíčky, store účty, fyzická zařízení, deep links a background sync nejsou součástí současného web/PWA projektu.
- Kompletní prohlížečové smazání nebylo opakováno, protože UI automatizace vyžaduje zvláštní potvrzení bezprostředně před destruktivní akcí; repository a dřívější cílené scénáře jej kryjí.

## Rozpory dokumentace

- Starší strategie obsahuje sociální síť, mapy a gamifikaci. Novější hlavní prompt je řadí mimo první praktické MVP. Aktuální implementace je soukromý dospělý deník.
- Starší plán uváděl chybějící restore, foto sync, migraci a konfliktové UI. Tyto části jsou nyní implementované a lokálně/emulátorově ověřené.
- Strategický požadavek nativních aplikací zatím není splněn; současný výstup je web/PWA základ připravený pro pozdější rozhodnutí Capacitor versus jiný wrapper.
