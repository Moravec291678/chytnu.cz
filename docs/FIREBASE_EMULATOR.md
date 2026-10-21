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

Fotografie se do Firebase Storage neposílají. Originální Blob zůstává v IndexedDB a v explicitním lokálním exportu. Firestore Catch drží mapu `photoRefs` a `primaryPhotoId`; metadata jednotlivých fotek jsou v podkolekci `photos` s pořadím a tombstone. Výchozí `none` provider nic nenahrává. Budoucí cloud stav může obsahovat pouze provider ID, deterministický object key a SHA-256; nikdy signed URL, upload grant ani credentials. Pravidla kontrolují každou fotku: ID a cestu, MIME JPEG/PNG/WebP, velikost do 10 MB, `focalX` a `focalY` v rozsahu 0..1, `zoom` 1..2, pořadí 0..9 a uzavřený tvar cloud metadata. Nejvýše deset odkazů je v jednom Catch. Přímé mazání foto dokumentů je zakázané; používají tombstones. Legacy embedded foto metadata jsou čitelná a převedou se při dalším synchronizačním zápisu Catch.

Vazba vlastníka a Catch vychází z hierarchické cesty pod UID a z rodičovské mapy odkazů; payload neobsahuje duplicitní `ownerId`/`catchId`. Pravidla ověřují, že primary ID existuje v mapě referencí, ne však fyzickou existenci primárního subdokumentu. Opakované načítání těchto dokumentů přes `existsAfter` v každém zápisu překračovalo limit výrazů Firestore pro dávku deseti fotografií. Aplikace proto zapisuje rodičovské reference a metadata ve stejné transakci a testuje jejich konzistenci na emulátoru.

Druhé zařízení obdrží metadata, ale bez místních bytes zobrazí bezpečný branded fallback. Aplikace nesmí tvrdit, že se fotografie synchronizovala mezi zařízeními.

## Omezení

Emulátor neprokazuje skutečný Google popup, autorizované domény, e-mailové doručení, nasazenou verzi pravidel, produkční kvóty ani chování mobilního background režimu. Skutečný staging projekt je `chutnucz`; tento dokument ani skripty jej automaticky nenasazují.
