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

Fotografie jsou local-only. Blob zůstává v IndexedDB a v uživatelem vytvořené lokální záloze. Firestore projekce obsahuje pouze `id`, `name`, `type`, `size` a volitelně `focalX`, `focalY`, `zoom`. Adapter neodesílá Blob, `storagePath` ani `sha256`.

Pokud má zařízení Blob stejné fotografie, remote metadata update jej zachová. Nové zařízení bez bytes zachová metadata-only stav a UI použije fallback. Firebase Storage není součástí runtime, konfigurace emulátoru ani testů.

## Diagnostika

Development a staging zapisují do konzole pouze bezpečný kontext: typ entity, druh operace, normalizovaný error code, případný provider code a retryable stav. Nezapisují payload, token ani tajnou konfiguraci. UI rozlišuje nedostupný server, odmítnutí pravidly a jinou chybu; data vždy zůstávají v outboxu.

## Ověření

- `npm test`: lokální repository, retry, idempotence, konflikt, scope a UI copy.
- `npm run test:rules`: Firestore pravidla a default deny.
- `npm run test:sync`: SDK/Auth/Firestore transakce pro Catch, Trip, Water a framing metadata.
- `npm run test:photos`: local-only Blob, metadata projekce, druhé zařízení bez bytes a absence Storage runtime.
