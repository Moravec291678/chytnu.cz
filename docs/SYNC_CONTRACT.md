# Synchronizační kontrakt

## Zdroj pravdy

IndexedDB `chytnu-local` je zdrojem pravdy pro UI. Catch, Trip a Water mutace zapisují entity a outbox atomicky. Firestore je soukromá replika účtu pro metadata. UI Firebase SDK přímo nevolá.

Po přihlášení se synchronizují pouze záznamy se stejným `ownerId`. Ownerless deník se k účtu připojí jen po výslovném potvrzení; ID, vazby a lokální Bloby zůstanou zachované.

## Protokol

- Stálé `operationId`, rostoucí `localRevision` a serverová `serverRevision`.
- Firestore transakce zapisuje entitu nebo tombstone, receipt v `syncOperations`, delta událost v `syncChanges` a kurzor v `sync/state`.
- Opakované odeslání stejné operace je idempotentní.
- Stará revize vytváří zachovaný konflikt; nepoužívá se tiché last-write-wins.
- Síťová chyba ponechá operaci ve frontě s exponenciálním retry nejvýše 30 minut.
- Přímé mazání dokumentů je zakázané. Smazání je tombstone.
- Změna aktivního účtu zastaví běh a zabraňuje potvrzení operace jinému vlastníkovi.

## Fotografie

IndexedDB zůstává zdrojem pravdy a obsahuje originální Blob. Výchozí provider `none` nic nenahrává a zachovává dosavadní local-only chování. Volitelný provider je oddělený od uložení Catch: lokální zápis doběhne první a upload běží později. Jeden Catch stále používá jednu outbox operaci a jeden transakční zápis synchronizátoru. Firestore ukládá odkazy `photoRefs` a `primaryPhotoId` na dokumentu Catch; každé foto metadata je v `catches/{catchId}/photos/{photoId}` se stabilním `sortIndex`. Limit deseti odkazů kontrolují pravidla na Catch.

Pravidla validují u každého foto dokumentu přesnou cestu, ID shodné s ID dokumentu, MIME, velikost do 10 MB, rámování, pořadí, tombstone a uzavřená pole včetně provider-independent `cloud` bloku. Po úspěšném uploadu obsahuje soukromý Firestore dokument pouze ID provideru, deterministický object key a SHA-256; žádnou URL, podpis ani secret. Vlastník i Catch jsou svázány cestou dokumentu pod UID přihlášeného uživatele a rodičovským Catch; tato pole se v payloadu neduplikují. Rodič omezuje primary ID na některý ze svých odkazů. Pravidla neprovádějí pro každý photo zápis samostatný `existsAfter` na fyzický primární dokument, protože by se jeho opakované vyhodnocování nevešlo do limitu výrazů Firestore při dávce deseti fotek. Adapter vytváří dokumenty a odkazy společně v jedné transakci.

Legacy Catch dokumenty s vloženým polem `photos` se při čtení dál podporují. Při dalším Catch zápisu adapter převede fotografie na samostatné dokumenty a z rodiče odstraní vložené pole. Blob se neposílá. Odstraněné fotografie zůstávají jako tombstones; smazání Catch zapisuje tombstones fotografií ve stejné operaci. Object-store upload/delete úlohy jsou samostatné trvalé operace ve stávající IndexedDB outbox; nejsou součástí Firestore entity sync workeru.

Pokud má zařízení Blob stejné fotografie, remote metadata update jej zachová. Nové zařízení bez bytes zachová metadata-only stav a UI použije fallback. Firebase Storage není součástí runtime, konfigurace emulátoru ani testů.

## Diagnostika

Development a staging zapisují do konzole pouze bezpečný kontext: typ entity, druh operace, normalizovaný error code, případný provider code a retryable stav. Nezapisují payload, token ani tajnou konfiguraci. UI rozlišuje nedostupný server, odmítnutí pravidly a jinou chybu; data vždy zůstávají v outboxu.

## Ověření

- `npm test`: lokální repository, retry, idempotence, konflikt, scope a UI copy.
- `npm run test:rules`: Firestore pravidla a default deny.
- `npm run test:sync`: SDK/Auth/Firestore transakce pro Catch, Trip, Water, deset dokumentů fotografií, framing, primary změnu a tombstones.
- `npm run test:photos`: local-only Blob, metadata projekce, druhé zařízení bez bytes a absence Storage runtime.
