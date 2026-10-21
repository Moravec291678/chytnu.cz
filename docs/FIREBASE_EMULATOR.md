# Lokální Firebase emulator a bezpečnostní testy

## Rozsah

Lokální vývoj používá pouze Firebase Authentication a Cloud Firestore Emulator s demo projektem `demo-chytnucz-local`. IndexedDB zůstává zdrojem pravdy. Příkazy emulátoru nečtou `.env.local` a nemají fallback do skutečného projektu.

- `npm run emulators`: Auth + Firestore
- `npm run test:auth`: registrace, e-mail login, session, reset, ověření, logout a syntetický Google credential
- `npm run test:rules`: Firestore vlastnictví, schema, default deny a zákaz přímého mazání
- `npm run test:sync`: Catch, Trip, Water, receipts, delta, revize, retry, konflikty a tombstones
- `npm run test:photos`: local-only Blob a Firestore metadata bez Firebase Storage

Emulátory vyžadují Java 21+. Ověření na tomto počítači používá pouze dočasný portable Temurin JDK 21; systémová Java ani globální PATH se nemění.

## Datová hranice

Soukromé dokumenty jsou pod `/users/{uid}`. Firestore přijímá pouze zápisy aktuálního vlastníka přes transakční sync protokol. Catch může odkazovat pouze na existující nesmazanou Trip stejného vlastníka. Přímé delete operace jsou zakázané; synchronizátor zapisuje tombstone.

Fotografie se do Firebase Storage neposílají. Blob zůstává pouze v IndexedDB a v explicitním lokálním exportu. Firestore obsahuje jen popis fotografie: ID, název, MIME, velikost a volitelný frame `focalX 0..1`, `focalY 0..1`, `zoom 1..2`. Starší metadata bez framingu jsou platná. Cizí pole, Blob, Storage cesta a hash cloudového objektu pravidla odmítnou.

Druhé zařízení obdrží metadata, ale bez místních bytes zobrazí bezpečný branded fallback. Aplikace nesmí tvrdit, že se fotografie synchronizovala mezi zařízeními.

## Omezení

Emulátor neprokazuje skutečný Google popup, autorizované domény, e-mailové doručení, nasazenou verzi pravidel, produkční kvóty ani chování mobilního background režimu. Skutečný staging projekt je `chutnucz`; tento dokument ani skripty jej automaticky nenasazují.
