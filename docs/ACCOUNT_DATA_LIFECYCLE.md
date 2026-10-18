# Životní cyklus účtu a dat

## Co bezpečně zvládá klient nyní

- export místních Catch, Trip a fotografií do verzované zálohy;
- lokální obnova se vstupní validací a atomickým zápisem;
- explicitní propojení ownerless deníku s přihlášeným účtem;
- smazání Catch/Trip přes synchronizovaný tombstone;
- odstranění nahrazené nebo smazané fotografie po potvrzené synchronizaci metadat.

## Co vyžaduje důvěryhodný backend

Veřejná verze potřebuje callable Cloud Function nebo jinou autentizovanou serverovou úlohu pro kompletní export cloudových dat a smazání účtu. Klient nesmí tvrdit, že odstranil vše, pokud nemůže spolehlivě vyčistit Auth, Firestore, Storage a pomocná synchronizační data.

Doporučené pořadí mazání:

1. vytvořit idempotentní požadavek se stabilním ID a zablokovat nové zápisy účtu;
2. označit účet jako pending deletion a uložit auditní stav bez citlivého obsahu;
3. po stránkách odstranit fotografie ve Storage;
4. po stránkách odstranit Catch, Trip, konflikty, syncChanges, syncOperations a sync state;
5. odstranit Firebase Auth uživatele jako poslední krok;
6. potvrdit dokončení, nebo zachovat bezpečný retry stav s viditelnou chybou.

Každý krok musí být opakovatelný. Částečné selhání nesmí obnovit tombstone ani ztratit seznam zbývajících objektů. Retenci tombstones, operation receipts, záloh a provozních logů musí vlastník schválit před produkcí včetně GDPR podkladů. Klientské odhlášení data nemaže.
