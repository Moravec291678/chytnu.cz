# Synchronizační kontrakt Catch a Trip

**Stav:** Catch/Trip metadata a soukromé Catch fotografie se synchronizují proti vývojovým Firebase Emulatorům; žádný produkční projekt není nakonfigurován.

## Rozsah a hranice

`catchRepository` a `tripRepository` zůstávají jedinou cestou lokálního ukládání v IndexedDB. Databáze `chytnu-local` ve verzi 4 obsahuje záznamy, trvalou `outbox`, konfliktové kopie a kurzory; fotografie zůstávají Bloby uvnitř Catch záznamu. UI nevolá Firebase SDK přímo; `SyncProvider` používá `syncService`, provider-neutral port, Firestore adaptér a photo Storage adapter připnuté na lokální Auth/Firestore/Storage Emulatory. Produkční endpoint není fallbackem dostupný.

Po přihlášení se synchronizují pouze záznamy vytvořené pro toto UID. Starší `ownerId: null` záznamy ani jejich fronta se nikdy automaticky nepřipojí k účtu. Uživatel je může po zobrazení souhrnu a potvrzení atomicky propojit s aktivním účtem; ID, Trip vazby a Bloby zůstávají zachované. Odhlášení nemaže místní data ani čekající změny.

## Operace a odolnost

- Lokální Catch/Trip změna a její operace se zapisují v jedné IndexedDB transakci. Opakované změny stejné entity se sloučí do jedné operace s trvalým `operationId` a rostoucím `localRevision`.
- Firestore transakce ověřuje očekávanou `serverRevision` (CAS) a současně zapisuje záznam nebo tombstone, idempotentní receipt, změnovou událost a uživatelský sekvenční kurzor.
- Opakovaný `(ownerId, operationId, localRevision)` vrací původní potvrzení. Pozdější lokální edit téže dosud čekající operace pokračuje pouze pokud se vzdálená verze prokazatelně změnila stejným `operationId`.
- Delta se stahuje po stránkách. Vzdálené záznamy a konflikty se aplikují atomicky s lokálním kurzorem. Selhání transaction nepostoupí kurzor.
- Souběžná vzdálená změna zachová místní záznam, vzdálený snímek i položku fronty se stavem konfliktu; automatické slučování ani ztrátová politika „poslední zápis vyhrává“ se nepoužívá.
- Profil umožní pro Catch i Trip vybrat místní nebo vzdálenou verzi. Lokální volba naváže operaci na poslední serverovou revizi; vzdálená volba bezpečně nahradí místní stav. Vzdálený tombstone místní variantu při volbě „místní“ zachová pod novým ID.
- Smazání je vzdálený tombstone; přímé Firestore mazání dokumentu je zakázáno. Starší klient tak záznam znovu nevytvoří. Tombstones a receipty nemají zatím retenční purge.
- Přechodná chyba zvyšuje retry delay exponenciálně s horní hranicí 30 minut. Neodeslaná operace zůstává ve frontě a poslední chyba je viditelná v Profilu. Připojení ani přijetí HTTP požadavku samo o sobě není potvrzením.
- Změna účtu během požadavku zastaví další čtení/zápisy a klient potvrdí pouze účet, který zůstal aktivní.

## Datová projekce a fotografie

Firestore používá cesty `/users/{uid}/catches/{catchId}` a `/users/{uid}/trips/{tripId}`. Vlastnictví a ID jsou ověřena pravidly. Catch může odkazovat pouze na existující výpravu téhož vlastníka. Lokální `sync.revision` je oddělená od serverové revize.

Do Firestore se posílají pouze metadata fotografie (ID, název, MIME, velikost, hash a soukromá Storage cesta). Blob zůstává v IndexedDB; synchronizátor jej kopíruje do soukromého Storage pouze pro Catch s ověřeným `ownerId` shodným s právě přihlášeným UID. Ownerless data ani jejich fotografie se nepřenášejí.

Upload nejprve zapíše Catch metadata, která svazují owner/Catch/photo ID, hash, cestu, MIME a velikost. Storage Rules potom povolí upload přesně tohoto objektu. Cesta obsahuje SHA-256 a je neměnná podle obsahu; opakovaný požadavek tak použije stejný objekt. Adapter ověří serverová metadata a stáhne obsah zpět k plnému ověření SHA-256 před lokálním ACK. Před ACK také opakovatelně odstraňuje staré objekty u nahrazení/odstranění fotografie. U smazání Catch nejprve odešle Firestore tombstone a následně uklízí objekty pod jeho soukromou cestou; neúspěšný úklid ponechá Catch operaci ve frontě.

Při delta pullu se soubor stáhne, ověří a uloží jako Blob do stejného Catch záznamu v IndexedDB ještě před atomickým uložením změn a kurzoru. Pokud objekt ještě není dostupný a zařízení nemá místní Blob, stránka ani kurzor se nepotvrdí; synchronizace zobrazí chybu a uživatel ji může zopakovat. Pokud má toto zařízení původní Blob a právě čekající upload, může jej ponechat lokálně a frontu neztratí.

Storage Rules vyžadují přihlášeného vlastníka, odpovídající Catch metadata, správný SHA-256 v cestě i custom metadata, MIME a limit 10 MiB. Klient nepoužívá veřejné URL. Současný UI limit jedné fotografie na Catch a lokální komprese do 1920 px zůstávají. Náhled se nevytváří jako další Storage objekt; detail a galerie používají ověřený původní Blob. Read-back pro ověření hashe přidává přenosová data, což je nutné vyhodnotit před produkčním zapnutím.

## Ověření

- `npm test` obsahuje testy in-memory adapteru a služby: push/pull, explicitní změna vlastníka, řešení Catch i Trip konfliktu, retry, legacy záznamy, lokální Blob, změna během čekajícího ACK a cursor.
- `npm run test:rules` ověřuje odmítnutí přístupu bez vlastníka, napříč vlastníky a přímých zápisů mimo receipt/cursor protokol, a samostatná Storage pravidla.
- `npm run test:sync` ověřuje skutečný SDK/Auth/Firestore tok výprava → úlovek, vazbu trip, metadata-only fotografii, ponechání lokálního Blobu, opakování a tombstone v emulátoru.
- `npm run test:photos` ověřuje Storage upload a obsah, opakování po výpadku před uploadem i po uploadu při selhání úklidu, druhou izolovanou IndexedDB, Blob integrity, nahrazení/odstranění fotky, odhlášení, explicitní ownerless migraci a smazání Catch.

Emulátorové výsledky neprokazují produkční fakturaci, region, indexy/kvóty, zálohy Storage objektů, skutečné e-maily, mobilní background sync ani chování při dlouhém síťovém přerušení na reálných zařízeních. Produkční projekt, region/fakturace, object backup/retence a migrace nejsou povoleny tímto nastavením.
