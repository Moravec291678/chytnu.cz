# ChytnuCz — minimální první verze a plán implementace backendu

> **Aktuální rozhodnutí 21. 10. 2026:** části popisující Firebase Storage a přenos foto bytes jsou historické. Současný MVP synchronizuje Catch/Trip/Water metadata přes Firestore; fotografie jsou local-only v IndexedDB a lokální záloze.

**Stav:** etapový plán; etapa 6I je ověřena pouze proti lokálním emulátorům, bez produkčního projektu
**Vazba:** dílčí plán pro ETAPU 6 hlavního promptu; navazuje na `docs/CATCH_STORAGE.md` a `docs/CLOUD_SYNC_DECISION.md`
**Rozhodnutí Firebase:** pracovní doporučení, nikoli souhlas s účtem, fakturací nebo migrací

## 1. Cíl první veřejné verze

První vydání je spolehlivý soukromý rybářský deník pro iOS a Android, který funguje i bez internetu. Uživatel může rychle zaznamenat skutečný úlovek, dohledat historii, udržet výpravy a bezpečně získat stejné záznamy po přihlášení na dalším zařízení. Každý úlovek a výprava jsou dostupné lokálně; synchronizace je navíc, nikdy podmínkou pro použití deníku.

### Povinný rozsah (P0)

1. Záznam, úprava, potvrzené smazání a prohlížení úlovků; neznámá měření zůstávají neznámá.
2. Fotografie úlovků s jasnými limity, optimalizací, soukromým ukládáním a odstraněním při smazání podle schválené retenční politiky.
3. Výpravy se začátkem/koncem, historií a vazbou `tripId` na úlovky.
4. Deník s hledáním, filtry, řazením a statistikami odvozenými pouze ze skutečných uživatelských záznamů.
5. Lokální ukládání do IndexedDB pro web; příslušné lokální úložiště pro mobilní platformu, které používá stejný doménový kontrakt.
6. Soukromý účet: registrace, přihlášení, obnovení přístupu, odhlášení, obnova session, srozumitelné chyby a smazání účtu.
7. Dobrovolné propojení existujícího místního deníku s účtem a obousměrná synchronizace úlovků, výprav a fotografií mezi zařízeními. Po synchronizaci se záznamy dají číst i vytvářet bez připojení.
8. Trvalá synchronizační fronta, opakování po výpadku, idempotentní operace, konflikty bez tichého přepsání a tombstony pro smazání.
9. Export a obnovení lokálních dat; ověřitelný export účtu/data lifecycle, pokud je cloudový účet zaveden.
10. Soukromí a bezpečnost: výchozí přístup jen vlastníkovi, žádné veřejné GPS/fotografie, serverová pravidla, omezení nahrávání a testy přístupu.
11. Prázdné, načítací, offline, chybové a úspěšné stavy. Uživatel musí poznat, že záznam je uložen lokálně, zda čeká na synchronizaci a zda synchronizace selhala.
12. Přístupné a použitelné mobilní UI v současném vizuálním stylu, automatické testy klíčových modelů/datových toků a ověřené iOS/Android buildy.
13. Ověřené právní odkazy, zásady ochrany soukromí, store konfigurace a release checklist podle skutečně zavedených funkcí.

### Výslovně mimo první verzi

- veřejný profil, veřejný feed, komentáře, reakce, přátelé, Crew, chat a živá poloha;
- veřejné mapy, heatmapy a databáze revírů bez spolehlivých zdrojů a provozního vlastníka;
- veřejné sdílení úlovků/fotografií jako sociální síť (nativní exportní karta lze později posoudit samostatně);
- achievementy, XP, levely, streaky, questy, rarity a žebříčky;
- AI příběhy/predikce, složité podmínkové skóre, placené tarify, předplatné a nákupy v aplikaci;
- zbytečné profily/nastavení nebo opakované ovládání existujících funkcí.

Tyto funkce nejsou podmínkou osobního deníku, ale přidávají moderování, veřejná oprávnění, náklady, právní otázky a další UI. Lze je posoudit po stabilním P0 a zpětné vazbě uživatelů.

## 2. Pracovní architektura a míra jistoty

### Dostatečně podložené

- Projektová dokumentace popisuje React/Vite, současné routy, Context/repository vrstvy a místní IndexedDB `chytnu-local`; záznamy `catches`/`trips` mají stabilní ID a úlovky odkazují na výpravy přes `tripId`.
- [docs/CATCH_STORAGE.md](CATCH_STORAGE.md) dokládá export/obnovu `chytnucz-local-backup` v1, lokální účty/frontu/tombstones a emulátorovou synchronizaci Catch/Trip/fotografií. Export je nešifrovaný a produkční cloud zůstává nenakonfigurovaný.
- [docs/CLOUD_SYNC_DECISION.md](CLOUD_SYNC_DECISION.md) vyhodnotil Firebase Auth + Firestore + Storage jako levnější provozní kandidát, s IndexedDB jako lokálním zdrojem pravdy. Uvádí také, že Firestore používá při kolizi LWW a že EU Storage nemá americké Always Free kvóty.
- Tento model se dá rozšiřovat za současnými repository vrstvami. Není důvod nahradit React/Vite, přepsat obrazovky nebo přidávat druhé lokální úložiště do webové aplikace.

### Pracovní varianta

- Zachovat společný doménový kontrakt `Catch`, `Trip`, `Photo` a `OutboxOperation`.
- Lokální repository zůstává jedinou cestou pro UI. Cloud adapter je oddělená implementace vzdálené portové vrstvy, nikoli přímá volání Firebase v komponentách.
- IndexedDB je pro web lokální zdroj pravdy; záznam a jeho outbox operace se ukládají atomicky. Mobilní adaptér zvolit podle schválené platformní architektury, se stejnými entitami, ID, revizemi a pravidly.
- Firebase/Auth/Firestore/Storage je pouze **pracovní poskytovatel**. Cloud SDK cache nesmí vytvořit druhý zdroj pravdy ani nahradit aplikační outbox. Dokumentová pole nesou vlastní revize; server přijme změnu pouze proti očekávané základní revizi. LWW se nepoužije.
- Přesné GPS, soukromé poznámky a fotky mají zůstat soukromé. V první verzi neexistuje veřejný datový model ani pravidla pro sdílení.

### Nevyřešené před reálným backendem

1. Vlastník ještě neschválil Firebase jako poskytovatele, umístění Firestore/Storage, Blaze fakturaci ani maximální přijatelný rozpočet. Blaze budget alert není pevný limit útraty.
2. Cenový odhad z 6B předpokládá průměrnou velikost fotografie, četnost čtení a roční růst, které na produkčních datech nebyly změřeny. Je nutné doplnit telemetrii agregovaných nákladových metrik bez citlivých GPS/fotek a skutečný odhad backupů.
3. Záloha Firestore a fotografie mají odlišný životní cyklus. Samostatná kopie fotek, její region, retence, šifrování, cena a test obnovy nejsou vybrané.
4. E-mailová doručitelnost, obnova účtu, ochrana proti zneužití, přesné regionální limity a účtování je třeba potvrdit pro zvolenou konfiguraci před produkcí.
5. Web IndexedDB není na aplikační úrovni šifrovaná. Ještě je třeba rozhodnout zacházení s lokálními daty na sdíleném zařízení po odhlášení/přepnutí účtu.
6. Export existuje, ale bezpečné obnovení do úložiště zatím není implementováno ani otestováno; to je první technická závislost před migrací.
7. Náhledové fotky, odstranění EXIF, ověření velikosti/typu a reálná distribuce iOS/Android buildů vyžadují samostatné ověření; plán netvrdí, že tyto platformní části už fungují.

Původní strategický dokument podporuje Firebase a plán Firebase Auth/Firestore/Storage, ale také radí odložit offline-first PWA a ukládání soustředit na Firebase. To je zastaralé proti novějšímu schválenému požadavku, že záznamy musí být dostupné offline a lokálně zachované. V této etapě proto platí aktuální IndexedDB/offline zadání a strategie se používá pro produktovou vizi, nikoli k přepsání současného modelu.

## 3. Implementační pořadí

Každý níže uvedený bod je samostatná dílčí etapa. Následující etapa nezačne, pokud nejsou splněna její závislostní kritéria nebo není výjimka písemně schválena. Všechny UI změny musí zachovat současné barvy, typografii, layout a navigaci. Nepřidávat obrazovky či tlačítka bez konkrétní potřeby uživatele.

### ETAPA 6D — bezpečné obnovení lokální zálohy

- **Jediný hlavní cíl:** uživatel může bezpečně obnovit svou platnou lokální zálohu v1 bez poškození stávajícího deníku.
- **Rozsah:** úplné parsování a validace před zápisem, kontrola formátu/verze a Blob/Base64, náhled počtu úlovků/výprav/fotek, duplicitních ID a vazeb, výslovná volba bezpečného sloučení/nahrazení, před-zápisový export/rollback. Zachovat ID, `tripId`, nullable hodnoty, revize a Blob.
- **Mimo rozsah:** cloud, účet, automatické nahrávání, změna schématu úlovku/výpravy.
- **Závislosti:** současný export v1 a modely catch/trip.
- **Rizika:** poškozený nebo záměrně nadměrný JSON, paměť při Base64, konflikt existujících dat, fotografie bez platného typu/obsahu. Nesmí být částečně aplikován neplatný soubor.
- **Automatické testy:** formát/verze, neplatný JSON, neplatné datum/ID/fotka, chybějící trip vazba, duplicitní ID, soubor bez fotek/s fotkou, merge konflikt, atomické selhání.
- **Ruční testy:** exportovat deník s úlovky, výpravou a fotkou, obnovit v čistém profilu; obnovit s překrývajícím se ID; zavřít tok a potvrdit, že původní deník zůstal beze změny.
- **Brána:** import buď skončí kompletně a kontrolovatelně, nebo nezmění jediný původní záznam; počty a kontrolní součty sedí; uživatel rozumí destruktivní volbě.

### ETAPA 6E — kontrakt lokálního repository a synchronizačního portu

- **Jediný hlavní cíl:** doménové repository má testovatelný, provider-neutral kontrakt, přes který může budoucí synchronizátor pracovat bez Firebase volání z UI.
- **Rozsah:** přesné rozhraní pro read/write/delete/list/delta, ID, revize, identifikaci vlastníka a chyby; fake/in-memory adapter pro testy; dokumentované pořadí operací a stavů. Rozhraní odpovídá současným repository vrstvám a stejným doménovým entitám pro web/mobil.
- **Mimo rozsah:** síťové SDK, přihlášení, UI účtu, IndexedDB migration.
- **Závislosti:** ETAPA 6D; modely a repository zůstávají stabilní.
- **Rizika:** abstrakce nesmí duplikovat existující repository nebo zkomplikovat lokální CRUD.
- **Automatické testy:** contract tests nad lokálním a fake adaptérem pro Catch/Trip, null měření, chyby, tripId a revize.
- **Ruční testy:** stávající přidávání, editace, detail a smazání fungují stejně jako před změnou.
- **Brána:** UI mluví pouze přes existující repository/context; kontrakt jde ověřit bez sítě a SDK.

### ETAPA 6F — trvalá lokální outbox fronta

- **Jediný hlavní cíl:** žádná lokálně uložená změna určená k syncu se neztratí při zavření aplikace nebo výpadku sítě.
- **Rozsah:** aditivní IndexedDB upgrade z aktuální verze; outbox/store pro sync meta a případně konfliktní varianty. Catch/Trip změna a outbox operace v jedné transakci, stabilní `operationId`, `ownerId`, entity/revize, upsert/delete, pokusy/last error. Přesná pravidla přechodu stavů; migrační test existující verze DB.
- **Mimo rozsah:** síťové odesílání, Firebase, autentizace, uživatelská obrazovka správy fronty.
- **Závislosti:** 6E; předchozí IndexedDB data musí být zachována.
- **Rizika:** upgrade nesmí vymazat stores; přihlášení k jinému účtu nesmí přivlastnit cizí frontu; síťový stav není potvrzením serveru.
- **Automatické testy:** existující v2 data zůstávají po upgrade; atomický zápis a rollback; deduplikace operationId; tombstone záznam; obnova po restartu; opakované pokusy neodstraní operaci.
- **Ruční testy:** přidat/editovat/smazat offline, zavřít/otevřít aplikaci a ověřit stejná data i čekající změny; lokální CRUD nesmí čekat na internet.
- **Brána:** schéma je aditivní, všechny mutace mají odpovídající trvalou operaci, žádná operace nezmizí bez acku.

**Stav:** implementováno v DB verzi 3. Catch/Trip mutace i obnovení zálohy zapisují entity a outbox atomicky; čekající změny se slučují po entitě a mazání zůstává jako tombstone. Automatické testy používají `fake-indexeddb` pro IndexedDB API a transakční chování simulátoru; ruční UI smoke test je odděleně ověřen v izolovaném profilu. Síťové odesílání, autentizace a přidělení vlastníka zůstávají mimo tuto etapu.

### ETAPA 6G — lokální Firebase Emulator a bezpečnostní pravidla

- **Jediný hlavní cíl:** bezpečnostní pravidla a datová cesta jsou ověřitelné vůči emulátoru bez produkčního Firebase projektu.
- **Rozsah:** pouze po schválení Firebase jako cílového kandidáta; lokální Emulator Suite/test konfigurace, Firestore/Storage default-deny pravidla, test fixtures pro owner IDs, testy anonymního, vlastnického a cizího přístupu, změny `ownerId`, neplatných polí, velikostí/MIME a mazání. Zkontrolovat repository sloupce/cesty podle 6E.
- **Mimo rozsah:** vytvoření projektu v cloudu, billing, produkční klíče, produkční data, veřejné sdílení.
- **Závislosti:** 6E/6F a Firebase jako místní testovací kandidát. Schválení lokálního emulátoru není souhlasem s cloudovým projektem, účty, regionem ani fakturací.
- **Rizika:** testovací pravidla nesmějí povolit více než produkční pravidla; tajné/admin klíče nesmějí být v klientovi; testy nesmějí používat osobní data.
- **Automatické testy:** emulator rules suite pro anonymní/owner/other owner; cizí upload/download/delete odmítnut; validace objektu; opakovaný operation ID; všechny default-deny cesty.
- **Ruční testy:** emulator se spustí lokálně bez účtu, celý test suite projde a žádná konfigurace se nenačítá z `.env.local` v této práci.
- **Brána:** všechna pravidla mají záporné testy; neexistuje veřejný přístup; žádný produkční účet/účtování nebyly aktivovány.
- **Stav (2026-10-17):** hotovo lokálně. Firestore a Storage pravidla mají 6/6 testů přes Firebase Emulator; Auth, Firestore a Storage emulátory se spouštějí s demo project ID. Produkční projekt, účty, klíče, síťová synchronizace a fakturace nejsou nastavené.

### ETAPA 6H — soukromé účty a session

- **Jediný hlavní cíl:** uživatel dokáže bezpečně vytvořit a spravovat soukromý účet bez ztráty možnosti práce offline.
- **Rozsah:** Firebase Auth (jen pokud schválen), e-mail/heslo jako jednoduchá první varianta, ověření e-mailu/obnova přístupu, session při startu, přihlášení/odhlášení, chyba a opakování, minimální soukromý profil. Bez Google loginu se v první verzi vyhnout další Apple login povinnosti.
- **Mimo rozsah:** veřejný profil, sociální identity, telefon/SMS, týmové účty.
- **Závislosti:** 6G emulátor/rules; majitel musí před jakýmkoli cloud projektem schválit poskytovatele, region, účet a fakturaci. Cloud provisioning není automaticky povolen tímto plánem.
- **Rizika:** session tokeny, reset e-mailů, přepnutí účtů, lokální data na sdíleném zařízení, existence účtu bez potvrzeného e-mailu.
- **Automatické testy:** session restore, chybný/expirující stav, zrušený tok, reset, odhlášení, zamítnuté přístupy a nulové uživatelské údaje; žádné heslo v logu.
- **Ruční testy:** registrace, ověření, přihlášení, restart, obnova přístupu, offline použití, odhlášení a změna účtu v emulatoru/stagingu.
- **Brána:** account flow neblokuje lokální deník; lokální data/fronta se nikdy automaticky nepřipojí k jinému uživateli; smazání účtu má navržený end-to-end lifecycle.

**Stav:** základ e-mail/heslo je implementován pouze proti lokálnímu Auth Emulatoru. Registrace, přihlášení, odhlášení, session restore, požadavky na ověření e-mailu a obnovu hesla, chybové stavy a izolace lokálního deníku/outboxu jsou ověřeny emulátorovým testem. UI účtu je v existující stránce Profil. Produkční Auth, doručování e-mailů, Google provider, smazání účtu a account-link/import nejsou dokončené.

### ETAPA 6I — synchronizace metadat Catch a Trip

- **Jediný hlavní cíl:** úlovky a výpravy se bezpečně synchronizují mezi účty/zařízeními bez fotografií a bez tiché ztráty změn.
- **Rozsah:** ack/operation ID, server revision + compare-and-set, delta cursor, idempotence, bounded retry/backoff, konfliktová kopie, tombstone a stale-client politika. Lokální DB zůstává čitelná/zapisovatelná offline; chyba/čekající změna se vysvětlí bez zahlcení rozhraní.
- **Mimo rozsah:** foto transfer, veřejné profily, feed, automatické slučování stejných měněných polí.
- **Závislosti:** 6F, 6G, 6H; Firebase server cesta/rules nebo samostatně schválený backend. Produkční migrace dat není součástí.
- **Rizika:** duplicitní operace, server/client revize, dlouho offline zařízení, přepnutí owner, chybný cursor, tombstone cleanup.
- **Automatické testy:** opakovaný request; konflikt shodných i rozdílných polí; dvě offline klientské větve; update po delete; delete na A/starý offline upsert na B; pád mezi server ackem a lokálním ackem; retry po 401/timeout/5xx.
- **Ruční testy:** dvě izolované testovací instance, offline změny na obou, reconnect, ověření konfliktu a smazání; testovat Chrome/Android/iOS podle dostupnosti.
- **Brána:** žádná testovaná souběžná změna se tiše nepřepíše; po opakování nejsou duplicity; chyby zůstávají ve frontě; oba klienti se po vyřešení shodnou.

### ETAPA 6J — synchronizace soukromých fotografií

- **Aktuální rozhodnutí:** cloudová synchronizace fotografií není součástí MVP. Fotografie a jejich Blob zůstávají pouze v IndexedDB a v uživatelem vytvořené lokální záloze; Firebase Storage se nepoužívá.
- **Synchronizovaný rozsah:** Firestore nese jen neškodná metadata `id`, `name`, `type`, `size` a volitelné orámování `focalX`, `focalY`, `zoom`. Neobsahuje Blob, veřejnou URL, Storage cestu ani hash objektu.
- **Chování dalšího zařízení:** Catch se stáhne bez obrazových bajtů a UI použije branded fallback. Lokální Blob se při sloučení stejného photo ID zachová.
- **Automatické testy:** `npm run test:photos` ověřuje zachování lokálních bajtů, omezenou Firestore projekci, absenci Firebase Storage runtime a bezpečný metadata-only stav druhého klienta. `npm run test:rules` testuje pouze Auth/Firestore pravidla.
- **Budoucí možnost:** případný cloud fotografií vyžaduje samostatné produktové a bezpečnostní rozhodnutí o providerovi, soukromí, EXIF, limitech, retenci, zálohách a nákladech.

### ETAPA 6K — bezpečná volitelná migrace lokálního deníku do účtu

- **Jediný hlavní cíl:** uživatel může výslovně a obnovitelně propojit existující lokální data se svým účtem.
- **Rozsah:** detekce prázdného/plného lokálního úložiště a prázdného/plného účtu; potvrzovací souhrn; volby „ponechat lokálně“, „sloučit“ a „stáhnout účet“ dle skutečně podporované logiky; zachování Catch/Trip ID, tripId, fotek, revizí; checkpointy, idempotence, integritní souhrn, rollback/backup.
- **Mimo rozsah:** automatický upload při prvním přihlášení, mazání zdroje po importu, migrační běh nad uživatelskými daty bez potvrzení.
- **Závislosti:** 6D, 6H, 6I, 6J; účet a staging pouze po vlastnickém schválení. Stará exportní záloha se zachová jako návratová cesta.
- **Rizika:** shodná UUID s rozdílným obsahem, orphan trips/photos, výpadek po části dávky, nejasné vlastnictví při změně účtu.
- **Automatické testy:** prázdný/plný stav obou stran, stejné/rozdílné UUID, upload crash po každé dávce, resume, hash/počty/foreign key integrity, žádné odstranění zdroje.
- **Ruční testy:** pouze syntetická data; migrace a návrat po přerušení; kontrola souhrnu a exportu před/po.
- **Brána:** úplné počty a hash fotek sedí, každý tripId je platný, lokální data stále existují, uživatel potvrdil souhrn a má export.

### ETAPA 6L — integrovaný sync QA a omezená beta

- **Jediný hlavní cíl:** prokázat hlavní offline/account/photo/data lifecycle scénáře na testovacích účtech před veřejným vydáním.
- **Rozsah:** automatizované unit/integration/rules/e2e testy, device smoke tests, cenové dashboardy/alerty, obnova DB i fotografií, account delete, export, smazání dat a interní/uzavřená beta malému počtu testerů s hlášením chyb.
- **Mimo rozsah:** otevřená sociální beta, veřejné spuštění, slib dostupnosti/SLA, monetizace.
- **Závislosti:** 6D–6K; pravý staging jen s oddělenými syntetickými/testovacími účty; pro cloudovou fakturaci zvláštní souhlas vlastníka.
- **Rizika:** neotestovaná obnova, uniklé testovací účty, reálné soukromé GPS v logu/diagnostice, nečekané náklady, rozdíly mezi webem a nativní platformou.
- **Automatické testy:** celý Master Prompt smoke matrix včetně offline, počasí bez sítě, účtu, syncu, fotek, konfliktů, mazání, backup/restore a produkce bez fixtures.
- **Ruční testy:** minimálně reálné Android a iOS zařízení, slabá síť/restart/background, report od testerů na rychlost zadání a důvěru v data.
- **Brána:** žádná otevřená kritická chyba; backup restore pro DB i fotky je prokázán; pravidla prošla negativními testy; jsou známé reálné limity/ceny; owner schválil účty a beta rozsah.

## 4. Rizika nákladů a soukromí napříč etapami

- Firebase Blaze nemá pevné minimum, ale vyžaduje billing account a budget alert není tvrdý cap. Před připojením billing rozhodnout strop přijatelné ztráty a rozpočet; technická omezení uploadů nejsou garancí horní faktury.
- Před beta změřit průměr a p95 reálně optimalizované fotky; podle nich aktualizovat 6B tabulku. Omezit počet a typ fotek, používat levné náhledy a originál stahovat na vyžádání; nesynchronizovat již lokálně dostupná data znovu.
- Ověřit, co přesně je součástí Firestore/Storage záloh. Záloha DB bez objektů nestačí k obnově deníku. Udělat restore drill, ne jen tvrdit, že data jsou zálohovaná.
- Oddělit staging a production IDs, pravidla, účty a fakturaci. Nepoužívat osobní data ve fixtures/logách/emulátoru.
- Pravidla backendu vynucují owner ID pro každou operaci i přímé API; klientská tlačítka nejsou bezpečnostní hranice. Nikdy nedat Admin SDK/service credentials do klienta.
- Přesná GPS, soukromé poznámky a EXIF nejsou veřejné. K jakémukoli budoucímu sdílení je třeba zvláštní souhlas, projekce údajů bez GPS, moderace/reportování a právní kontrola.
- Export v1 je plain JSON a může odhalit lokaci/fotografie; bezpečné obnovení se musí otestovat před migrací účtů.
- Data nesmí být odstraněna při logoutu, neúspěšném synchronizačním pokusu ani po částečné migraci. Smazání účtu musí mít uživatelskou potvrzovací cestu, vysvětlené důsledky a ověřitelné odstranění cloudových objektů podle schválené retenční politiky.

## 5. Rozhodnutí čekající na vlastníka

Před jakýmkoli produkčním cloudem (a před produkční částí 6J) potřebuji:

1. Potvrzení či odmítnutí **Firebase** jako cloudového kandidáta.
2. Schválení EU regionu (doporučeno Frankfurt) pro databázi i fotografie.
3. Schválení Blaze fakturačního účtu a přijatelného měsíčního rozpočtu/variability. Připojení účtu ani projekt zde nejsou vytvořeny.
4. Potvrzení e-mail/heslo jako jediné první metody účtu (doporučeno, bez SMS a sociálního loginu).
5. Zálohovací požadavek: retence DB a fotografií, umístění druhé kopie, očekávané náklady a interval testu obnovy.
6. Rozhodnutí, zda lokální data při odhlášení zůstávají přístupná na zařízení, nebo je uživatel může uzamknout/odstranit. Doporučení: data nesmazat automaticky; frontu pevně přivázat k původnímu owner ID.
7. Potvrzení jednoho cloudového obrazu na úlovek pro MVP (odpovídá současnému UI); maximální upload velikost, náhled a politika přenosu přes mobilní data.
8. Potvrzení, že migrace bude pouze dobrovolná, s předchozím exportem a lokálními daty ponechanými po dokončení (doporučeno).

Lokální ETAPA 6G byla provedena bez cloudového účtu. Před produkčním backendem zůstávají výše uvedená vlastnická rozhodnutí otevřená.

## 6. Stav projektu a tohoto plánu

Etapa 6H přidala e-mailové účty pouze pro lokální Auth Emulator; ověřené jsou syntetické registrace, přihlášení, session restore, resetovací požadavek a izolace místních dat. Emulátor nedoručuje skutečné e-maily.

Etapy 6I–6J přidaly lokální emulatorový sender a receiver pro Catch/Trip metadata i soukromé fotografie, serverové revize/CAS, operation receipts, delta kurzor, tombstones, conflict snapshots a retry. Nové záznamy se při aktivním lokálním účtu přiřazují jeho UID. Existující ownerless záznamy zůstávají nepřipojené, dokud uživatel nepotvrdí explicitní migraci. Blob zůstává lokálně dostupný a ověřená kopie se ukládá do soukromého Storage. Přímé Firestore zápisy obcházející sync receipt protokol jsou zakázané.

**Výsledek 6I:** `npm test` (viz závěrečný report etapy), `npm run lint`, `npm run test:rules` a `npm run test:sync` prošly; `npm run build` ověřen s izolovaným prázdným env adresářem, bez čtení `.env.local`; `git diff --check` prošel. Emulator testy používají syntetické fixture a dočasný JRE 21, neprodukční projekt.

Produkční projekt, region, billing/rozpočet, zálohy, skutečné e-maily, smazání účtu a background sync na mobilu jsou nedokončené. Explicitní account-link, řešení konfliktů v UI a přenos Blobů jsou hotové proti lokálním emulátorům. Pracovní strom i `stash@{0}` s předchozími změnami zůstávají zachované; commit ani push nebyl proveden.

## 7. Další doporučená etapa

**Přesný název další etapy: RELEASE PŘÍPRAVA — FYZICKÉ PWA TESTY A PRODUKČNÍ INFRASTRUKTURA.**

Před nasazením jakéhokoli produkčního cloudu je nutný samostatný souhlas vlastníka s providerem, regionem, fakturací/rozpočtem, zálohami a migrací. Etapa 6J se musí držet `Product UX principles`, zachovat offline Blob a přenášet jen soukromá data schváleným způsobem.
