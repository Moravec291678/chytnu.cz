# ChytnuCz — ETAPA 6B: výběr cloudu, účtů a synchronizace

> **Aktuální rozhodnutí 21. 10. 2026:** Firebase Storage se v MVP nepoužívá a fotografie zůstávají local-only v IndexedDB a lokální záloze. Níže uvedené varianty a náklady na cloudové fotografie jsou historická analýza, ne popis současného runtime.

**Stav:** návrh k rozhodnutí, nic z tohoto dokumentu cloudově neimplementuje
**Cenové údaje ověřeny:** 16. 10. 2026
**Rozsah:** porovnání služeb, realistický model nákladů a doporučená migrace z aktuální IndexedDB

## Rozhodnutí ve zkratce

Pro ChytnuCz doporučuji jako první kandidát **Firebase Authentication + Cloud Firestore Standard + Cloud Storage**, ale výhradně jako backend za současným lokálním úložištěm. IndexedDB zůstane zdrojem pravdy pro práci v aplikaci; cloud bude replikou účtu pro druhá zařízení. Vlastní synchronizační vrstva musí zajišťovat trvalou frontu, idempotenci, verzování a řešení konfliktů. Firebase SDK samo o sobě tyto požadavky na konflikty nesplňuje: Firestore při souběžné změně dokumentu používá „poslední zápis vyhrává“.

Tato varianta nejlépe odpovídá preferenci nízkých provozních nákladů: nemá pevný měsíční paušál a běžné databázové požadavky a autentizace zůstanou při níže uvedeném modelu pod základními kvótami. Její nevýhodou je, že nové Firebase Storage buckety vyžadují tarif Blaze s připojeným fakturačním účtem. Evropské umístění fotografií je zpoplatněné od prvního bajtu; nulová částka tedy není zaručena. Před ostrým provozem je nezbytné výslovně schválit fakturační účet, region a měsíční rozpočet.

**Pokud je nepřekročitelnou prioritou relační model, silnější SQL dotazy a čitelnější pravidla sdílení, doporučuji místo toho Supabase Pro.** Pro produkční projekt stojí nejméně 25 USD měsíčně. Free plán Supabase není vhodný jako produkční synchronizační backend: může se pozastavit po týdnu neaktivity a nemá automatické zálohy.

Toto je doporučení, ne výběr poskytovatele za vlastníka. Založení projektu, fakturace, napojení a migrace jsou výslovně mimo tuto etapu.

## Zjištěný základ projektu

Aktuální aplikace je React/Vite. Úlovky a výpravy se ukládají do IndexedDB databáze `chytnu-local` ve stores `catches` a `trips`; repozitáře čekají na potvrzení transakce před ohlášením úspěchu. Úlovek odkazuje na výpravu stabilním `tripId`. Záznamy mají stabilní ID a metadata `schemaVersion`, `createdAt`, `updatedAt` a `sync` s lokální revizí. Fotografie jsou nyní jeden Blob uložený u úlovku; vstupní soubor může mít nejvýše 10 MB a při dostupném `createImageBitmap` se optimalizuje na nejvýše 1920 px a JPEG kvalitu 0,82.

Lokální záloha je JSON `chytnucz-local-backup`, verze 1. Export zachovává záznamy, fotografie v Base64, ID, revize a vazby. Je nešifrovaný a může obsahovat GPS. Import/obnovení zatím není implementováno. Současná aplikace nemá účty, cloudové úložiště, frontu synchronizace, tombstony ani konfliktové řešení.

Současná architektura proto umožňuje doplnit cloud přes existující repository a IndexedDB; není důvod nahrazovat celý projekt ani zavádět druhou lokální databázi. V budoucnu musí web, iOS a Android sdílet stejný doménový kontrakt, zatímco úložiště může být na každé platformě jiné.

## Srovnání kandidátů

| Varianta | Vhodnost pro React/Vite a současné IndexedDB | Účty a databáze | Offline a konflikty | Fotografie, soukromí, záloha | Cena, přenositelnost a údržba |
|---|---|---|---|---|---|
| **Firebase Auth + Firestore + Storage** | Dobré SDK pro web i mobilní klienty. Lze používat pouze jako vzdálené API za existující repository; není nutné přejít na Firestore cache. | Hotový Auth: e-mail/heslo, sociální poskytovatelé, obnova přístupu. Firestore NoSQL; úlovek a výprava budou samostatné dokumenty s `tripId`. | Firestore má offline cache pro Android/iOS; web ji má vypnutou ve výchozím nastavení a při zapnutí zůstává mezi relacemi. Přímý LWW není přijatelné. Transakce selhávají offline, proto je potřeba vlastní lokální outbox a online doručení/porovnání revizí. | Storage je GCS; pravidla musí ověřovat `request.auth.uid` na každé cestě. EU region volit před vytvořením, bucket pak nelze přemístit. Firestore zálohy/PITR jsou další zpoplatněné funkce; fotky je třeba zálohovat zvlášť. | Bez pevného měsíčního paušálu, ale Storage vyžaduje Blaze/billing account. Levné při uvedeném běžném provozu. Vyšší vendor lock-in než PostgreSQL; export dat je možný, ale schéma NoSQL a Rules/Functions je nutné přepsat. Nízká až střední údržba, vyšší složitost bezpečného konfliktového protokolu. |
| **Supabase Auth + PostgreSQL + Storage** | Dobrá podpora přes JS SDK. Zachová se repository a IndexedDB; offline frontu je nutné naprogramovat stejně. | Auth podporuje heslo, magic link/OTP a OAuth. PostgreSQL přirozeně modeluje `catches`, `trips`, vlastníka a budoucí sdílení. SQL/constraints zjednodušují integritu `tripId`. | Supabase nezajišťuje automatickou offline frontu aplikace. Navržená lokální fronta a serverové revize/CAS jsou stále potřeba. Relační transakce a unikátní ID operací se dobře hodí pro konfliktové RPC. | RLS u každé vystavené tabulky a Storage policies. `service_role` obchází RLS a nesmí se dostat do klienta. Pro je $25/měsíc a zahrnuje denní DB zálohy na 7 dní; DB backup nezahrnuje soubory ve Storage. | Vyšší předvídatelný základní náklad, ale PostgreSQL snižuje přenositelnostní riziko. Free projekt se může pozastavit po týdnu a nemá automatické zálohy. Střední počáteční práce, střední údržba. |
| **Vlastní API + PostgreSQL + objektové úložiště (např. Hetzner + Cloudflare R2)** | Technicky vhodné; současné repository může mluvit s vlastním API. Žádná změna lokálního zdroje pravdy není nutná. | Účty, ověření e-mailu, reset hesla, ochrana proti útokům, session, API, správa účtů a export/mazání musí být dodány a provozovány. | Maximální kontrola nad frontou, verzemi a sdílením; vše se však musí správně navrhnout, implementovat, zabezpečit a monitorovat. | Lze zvolit soukromé S3-kompatibilní objekty a vlastní přístupové tokeny. Provozovatel nese zálohy, obnovu, aktualizace, incidenty a dostupnost. | Hetzner CX23 je od 15. 6. 2026 uváděn za 5,49 EUR/měsíc bez DPH v Německu/Finsku, bez IPv4; to je pouze VM, nikoli plný produkční backend. R2 má 10 GB-měsíc zdarma a egress zdarma, poté $0,015/GB-měsíc; stále chybí databáze, Auth e-maily, zálohy, redundantní provoz a čas správce. Nedoporučuji pro malý tým bez provozní kapacity. |

**Závěr srovnání:** Firebase vyhrává při prioritě nízkých počátečních nákladů; Supabase vyhrává při prioritě relačního schématu, auditovatelnosti přístupů a předvídatelného produkčního režimu. Vlastní backend teď přidává příliš mnoho provozních povinností. Cloudflare R2 může být později samostatným alternativním úložištěm fotografií, ale přidání druhého dodavatele v první synchronizační verzi by zbytečně komplikovalo oprávnění, obnovu i fakturaci.

## Aktuální ceny a podmínky ověřené 16. 10. 2026

### Supabase

- [Oficiální ceník Supabase](https://supabase.com/pricing): Free $0, 50 000 MAU, 500 MB databáze, 1 GB Storage a 5 GB egress; Free projekt se pozastaví po týdnu neaktivity. Free nemá automatické zálohy. Pro začíná na **$25/měsíc**, první projekt zahrnut, 8 GB DB, 100 GB Storage, 250 GB egress a automatické denní zálohy s retencí 7 dní. Nad limity: DB $0,125/GB, Storage $0,0213/GB, egress $0,09/GB. Základní Pro compute je pokryt měsíčním kreditem $10; PITR začíná na $100/měsíc, proto není v modelu.
- Fotografie ve Storage **nejsou zahrnuté v databázových zálohách**. Je potřeba jejich vlastní plán zálohy a obnovy. Pro zálohy databáze tedy neznamenají úplnou zálohu uživatelských fotografií.
- Free se hodí pro neprodukční prototyp, ne jako spolehlivá služba, na kterou se uživatel spoléhá pro obnovení dat.

### Firebase / Google Cloud

- [Oficiální Firebase ceník](https://firebase.google.com/pricing): Auth do 50 000 MAU bez poplatku pro běžné poskytovatele; SMS autentizace je placená. Firestore Standard: 1 GiB databáze, 50 000 čtení/den, 20 000 zápisů/den, 20 000 mazání/den a 10 GiB egress/měsíc zdarma. Kvóty databáze se vztahují jen na jednu bezplatnou databázi projektu.
- Od **3. 2. 2026** Cloud Storage for Firebase vyžaduje tarif Blaze a připojený Cloud Billing účet, i když služba zůstane v bezplatných kvótách. Nový bucket `*.firebasestorage.app` používá Google Cloud Storage ceny. Ceník Firebase uvádí až 5 GB-měsíc, 100 GB stažení/měsíc, 5 000 upload operací/měsíc a 50 000 download operací/měsíc bez nákladů; rozhoduje však region bucketu.
- [Oficiální pravidla umístění a cen GCS](https://firebase.google.com/docs/storage/locations): evropský bucket nepoužívá Cloud Storage Always Free. Tento bezplatný tarif platí pouze pro `us-central1`, `us-east1`, `us-west1`. V EU proto v nákladovém modelu účtuji běžné GCS ceny od první uložené/stažené fotografie. Region bucketu se po vytvoření nedá změnit. [Google Cloud Storage ceník](https://cloud.google.com/storage/pricing) uvádí pro regionální Standard Storage $0,000027397/GiB-hodinu (asi **$0,020/GiB-měsíc**), třídu A $0,005/1 000 operací, třídu B $0,0004/1 000 operací a přenos z GCS do internetových destinací mimo Asii/Austrálii $0,12/GiB v prvním pásmu. Sazba egressu a umístění Firestore se mohou lišit podle regionu/projektu.
- [Firestore ceník](https://cloud.google.com/firestore/pricing) účtuje nad bezplatné limity čtení, zápisy, mazání, uložený objem a egress. Ceník uvádí jako referenční příklad $0,03/100 000 reads, $0,09/100 000 writes a přibližně $0,15/GiB-měsíc databázového úložiště; regionální ceny je třeba potvrdit v kalkulátoru při výběru Frankfurtu/Varšavy.
- Firebase projekty nemají jeden společný geografický přepínač; Firestore a každý Storage bucket si volí lokaci samostatně. Zvolit EU u obou služeb je návrhová volba kvůli latenci a umístění dat, nikoli tvrzení, že tím automaticky odpadnou všechny povinnosti ochrany soukromí.
- Firebase neposkytuje v tomto odhadu automatickou zálohu fotografií. Firestore scheduled backup/PITR a druhá kopie objektů se účtují zvlášť; tyto výdaje nejsou v cenových součtech níže zahrnuty a musí se dopočítat podle schválené retenční politiky.

### Jiná varianta: Cloudflare R2 pro fotografie

- [Oficiální ceník R2](https://developers.cloudflare.com/r2/pricing/), aktualizován 1. 10. 2026: 10 GB-měsíc, 1 milion tříd A, 10 milionů tříd B a internetový egress zdarma; nad limit Standard Storage $0,015/GB-měsíc, A $4,50/milion, B $0,36/milion. To by výrazně snížilo opakované stahování fotek, ale samo o sobě není backend účtů ani relační databáze. Vyžaduje bezpečné API/Worker k vystavení soukromých upload/download oprávnění. Zatím doporučuji zůstat u jednoho dodavatele.

### Vlastní backend

- [Aktualizace cen Hetzner od 15. 6. 2026](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) uvádí CX23 v Německu/Finsku za 5,49 EUR/měsíc bez DPH, IPv4 zvlášť. Tuto cenu **nelze považovat za celkový odhad**: nezahrnuje obnovitelné zálohy, objektové úložiště, e-mailovou službu, redundanci, monitoring, obnovu po incidentu ani administrátorský čas. Celkový měsíční náklad vlastního backendu proto bez rozhodnutí o topologii poctivě stanovit nelze.

## Model využití a nákladové scénáře

Jde o model pro srovnání, ne cenovou nabídku. Ceny jsou v USD bez DPH; převod měny, transakční poplatky banky a práce vývojáře nejsou zahrnuty.

### Společné předpoklady

1. Počty znamenají **aktivní účty za měsíc (MAU)**, ne instalace.
2. Každý účet za rok zaznamená 20 úlovků a v průměru 70 % z nich má jednu fotku. To je 14 fotek/rok, tedy 1,67 catch a 1,17 fotografie měsíčně na uživatele.
3. Pro výpočet má optimalizovaná cloudová fotografie průměrně 1 MiB. **Jde o předpoklad, ne o změřený průměr projektu**; skutečné fotografie je třeba změřit na reprezentativním vzorku.
4. Catch, trip a pomocná databázová metadata společně počítám jako 0,2 MiB na uživatele/rok. Zaokrouhleně tedy 14,2 MiB uložených dat na uživatele po roce; Firestore může mít vyšší indexový overhead.
5. Každý účet provozuje průměrně 30 dokumentových čtení a 2,5 zápisů měsíčně. Při 10 000 MAU je to 300 000 reads a 25 000 writes měsíčně (asi 10 000 reads a 833 writes denně v průměru). Bez náročných listenerů a širokých dotazů zůstává pod denními bezplatnými databázovými limity; špičky, pravidla, indexy a první plná synchronizace se mohou lišit.
6. Typické stahování fotek: měsíčně se otevře 10 % existující galerie a nové fotografie se stáhnou ještě na jednom dalším zařízení. Při roční galerii 14 fotek jde o přibližně 2,57 MiB/uživatel/měsíc. Konzervativní varianta: celá galerie se na druhém zařízení načte dvakrát za měsíc, plus synchronizace nových fotek, přibližně 29,6 MiB/uživatel/měsíc.
7. Není započteno veřejné sdílení, anonymní návštěvníci, náhledové transformace, nadstandardní logy, záložní kopie fotografií ani záloha Firestore. Jejich provoz se přičte až po návrhu konkrétní funkce a retence.

### Velikost a průběžné přenosy

| MAU | Catch/měsíc | Nahrané fotografie/měsíc | Nová data/měsíc | Data uložená po 12 měsících | Stažené fotky/měsíc: typicky | Stažené fotky/měsíc: konzervativně | Odhad DB sync operací za měsíc |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 167 | 117 (~0,11 GiB) | ~0,12 GiB | ~1,39 GiB | ~0,25 GiB | ~2,89 GiB | 3 000 read / 250 write |
| 1 000 | 1 667 | 1 167 (~1,14 GiB) | ~1,16 GiB | ~13,87 GiB | ~2,51 GiB | ~28,9 GiB | 30 000 read / 2 500 write |
| 10 000 | 16 667 | 11 667 (~11,4 GiB) | ~11,56 GiB | ~138,7 GiB | ~25,1 GiB | ~288,8 GiB | 300 000 read / 25 000 write |

Čísla pro cloudové storage a transfer jsou GiB; počty fotek/úlovků jsou zaokrouhlené. Přenos fotografií neznamená, že se celá galerie stáhne při každém startu: implementace musí používat thumbnail, cache a explicitní stažení originálu.

### Měsíční náklady: produkční Supabase Pro a Firebase s EU bucketem

| MAU | Supabase Pro: první měsíc včetně migrace | Supabase Pro: rok dat, typické stahování | Supabase Pro: rok dat, konzervativní stahování | Firebase EU: první měsíc včetně migrace a jednoho stažení galerie na další zařízení | Firebase EU: rok dat, typicky | Firebase EU: rok dat, konzervativně |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | ~$25,00 | ~$25,00 | ~$25,00 | ~$0,20 | ~$0,06 | ~$0,39 |
| 1 000 | ~$25,00 | ~$25,00 | ~$25,00 | ~$2,00 | ~$0,59 | ~$3,77 |
| 10 000 | ~$26,05 | ~$26,05 | ~$31,45 | ~$20,00 | ~$6,00 | ~$37,80 |

**Jak tabulku číst:** Supabase část záměrně počítá s Pro už od prvního produkčního dne; Free by snížil účet na $0, ale nepovažuji jej kvůli pozastavení a chybějícím zálohám za produkčně přijatelný. Pro 10 000 uživatelů po roce je předpokládaná galerie ~149 GB, tedy nad Pro limitem 100 GB; konzervativní foto egress překročí 250 GB/měsíc. Výpočty používají sazby ceníku a zaokrouhlují.

Firebase část předpokládá evropské Storage i Firestore, běžné standardní GCS sazby pro fotografie a 1 účetní databázi. U evropského GCS neodečítám americké Always Free kvóty. U roční varianty přibližně 10 000 účtů vychází: Storage ~$2,77, typický photo egress ~$3,01 (konzervativně ~$34,7), upload/download operace centy a Firestore metadata nad 1 GiB přibližně další desetiny dolaru. Ceny Firestore závisí na zvoleném regionu a indexech; odhad zaokrouhluji. Pro 100 a 1 000 účtů počítám cloudový databázový provoz pod bezplatnými limity.

Firebase neúčtuje pevný paušál, ale **Blaze vyžaduje připojené platební údaje**. Zobrazené částky pro první měsíc odpovídají jednorázovému převodu existujícího ročního lokálního deníku (všechny dosavadní fotografie se nahrají) a jednorázovému stažení jeho galerie na další zařízení; nezahrnují záložní kopie fotek. U úplně nového účtu bez historických lokálních dat by tento počáteční měsíc byl levnější.

### Kdy bezplatné limity přestanou stačit

- **Supabase Free:** souborový limit 1 GB by podle modelu po roce překročilo přibližně 73 účtů, pokud každý pořídí předpokládaných 14 fotek. Navíc může projekt usnout po týdnu neaktivity, nemá automatické DB zálohy a jen 5 GB egress. Nelze jej považovat za garantovaný veřejný backend.
- **Firestore:** databázových 1 GiB se při 0,2 MiB metadat na uživatele/rok začne blížit kolem 5 000 účtů; odhad provozu čtení/zápisů zůstává nízký, dokud se neobjeví časté opakované čtení/listenery. Je nutné hlídat denní špičky, ne jen měsíční součet.
- **Firebase Storage v EU:** nepočítat s GCS Always Free. Náklady vznikají od prvních uložených a stažených fotografií; konzervativní opakované stahování může být u 10 000 MAU výrazně dražší než samotné uložení. Uživatel může povolit pouze Wi-Fi pro velké originály a náhledy synchronizovat zvlášť.
- **Blaze rozpočet:** Google Cloud budget alerts upozorňují, ale samy o sobě negarantují tvrdé zastavení provozu. Nejde tedy o pevný cenový strop. Je nutné nastavit alerty, omezit velikosti/počty uploadů, bezpečnostní limity a pravidelně kontrolovat skutečnou fakturaci.
- **Nezapočtená ochrana záloh:** pokud se bude vyžadovat druhá kopie fotek nebo Firestore point-in-time backup, připočítat samostatně. Toto je produkční požadavek, ne volitelný benefit zahrnutý v tabulce.

## Doporučená datová a synchronizační architektura

### Doménový model

Udržet existující model a přidávat pouze synchronizační obálku, kterou mohou web/iOS/Android společně serializovat:

- `Catch`: stávající obsah, stabilní `id`, `schemaVersion`, `createdAt`, `updatedAt`, nullable měření, `tripId`, metadata fotek; přidat `ownerId` až při explicitním spárování s účtem, `serverRevision`, `localRevision`, `deletedAt`/tombstone a sync status.
- `Trip`: obdobně stabilní `id`, `ownerId`, `serverRevision`, lokální revize, tombstone; `tripId` vazby zůstávají stabilní napříč zařízeními.
- `Photo`: přesunout synchronizovatelná metadata do samostatného modelu (`photoId`, `catchId`, MIME, rozměry, byte size, hash SHA-256, verze variant, stav uploadu, `remoteObjectId`). Blob dál držet lokálně v IndexedDB. Backendové záznamy obsahují jen identifikátor a metadata, ne Base64 obrázek.
- `OutboxOperation`: `operationId` (UUID idempotency key), `ownerId`, `entityType`, `entityId`, `operation`, `localRevision`, `baseServerRevision`, `createdAt`, stav/pokusy a poslední chybu bez tajných tokenů. Záznam outboxu se zapisuje ve stejné IndexedDB transakci jako změněný catch/trip.

Ve Firestore lze entity uložit do oddělených uživatelských kolekcí/dokumentových cest, např. `users/{uid}/catches/{catchId}` a `users/{uid}/trips/{tripId}`. Tato NoSQL reprezentace nesmí změnit doménový kontrakt repository. U Supabase by stejné entity byly tabulky s `owner_id`, `id`, revizemi a FK `trip_id`.

### Spolehlivá synchronizace

1. Aplikace ukládá lokální zápis a outbox atomicky. Uživatel okamžitě vidí lokální výsledek a pravdivý stav „čeká na synchronizaci“/„synchronizace se nezdařila“; chyba zůstává dostupná a položka ve frontě se nesmaže.
2. Synchronizátor spouští pokusy při startu, návratu spojení a občasném foregroundu. Každá operace má omezený exponential backoff s jitterem. `online` event pouze spouští pokus, není potvrzením zápisu.
3. Odeslat operaci s `operationId`. Server uloží přijaté ID/idempotency receipt a změnu ve stejné transakci; opakované odeslání stejné operace vrátí stejné potvrzení bez duplikace.
4. Při update poslat `baseServerRevision`. Server přijme změnu pouze pokud tato revize odpovídá poslední serverové revizi; jinak vrátí konflikt a obě verze zůstanou zachované.
5. Když uživatel upraví různé nezávislé fieldy, lze je sloučit jen tehdy, pokud je to výslovně definováno a testováno. Změna stejného pole (např. hmotnost, výsledek nebo soukromá lokalita) nesmí být tiše přepsána. V nabídce konfliktu ukázat obě verze a dovolit vybrat/zkopírovat hodnoty; ponechat originál.
6. Mazání synchronizovat jako tombstone `{deletedAt, deletedBy, serverRevision, operationId}`. Tombstone musí zabránit starému offline zařízení znovu založit smazaný úlovek. Nesmí se prostě zahodit po pevném počtu dnů: lze jej zkompaktovat až po změně account epoch/checkpointu, která vyžádá plný resync všech zastaralých klientů.
7. Po úspěchu serveru ověřit ack operationId, entity ID a revision; až pak označit záznam jako synchronizovaný a odstranit outbox položku. Při pádu mezi ackem a lokálním zapsáním acku opakovat idempotentně.
8. Při opětovném připojení dvou offline zařízení každé nejprve odešle vlastní frontu, poté stáhne rozdíly od známého serverového cursoru. Nová ID se slučují bez duplicit; shodná ID s nekompatibilními revizemi jdou do konfliktu. Mazací tombstone má přednost před starším upsertem.
9. Autentizace nesmí být nutná pro lokální práci. Při vypršení přihlášení se fronta zachová; záznamy uživatele A se nikdy nesmějí poslat po přihlášení účtu B. Na přepnutí účtu ukázat, že lokální data patří původnímu profilu, a vyžádat rozhodnutí.

### Fotografie a soukromí

- Pokračovat v současném lokálním zmenšení na nejvýše 1920 px a kvalitě 0,82. Před ostrým nasazením změřit medián a p95 velikosti skutečných fotografií; 1 MiB je pouze nákladový předpoklad.
- Ukládat soubor samostatně od catch/trip dokumentu. Zachovat lokální Blob do ověření hash + velikosti vzdáleného objektu a potvrzení metadat; při uploadu s výpadkem pokračovat po opakování bez smazání lokální kopie.
- Cloud objekt privátní, cesta vázaná na `ownerId/catchId/photoId`. Klient získá krátkodobé autorizované čtení; žádné veřejné permanentní URL. Serverová pravidla kontrolují vlastníka i mazání, MIME, maximální velikost a limity požadavků.
- Do budoucna vytvořit samostatný malý náhled, například delší strana 320 px/JPEG a cíl 50–100 KiB; originál zůstane optimalizovaný do 1920 px. Náhled není v současné aplikaci implementovaný ani změřený.
- Odstranit GPS EXIF při převodu a před každým uploadem ověřit, že nebyly ponechány původní EXIF metadata. Přesná lokalita a fotografie zůstávají soukromé. Veřejné sdílení bude samostatný explicitní přístupový grant; výchozí veřejný payload neobsahuje GPS ani foto.
- Cache fotografií na dalším zařízení musí mít jasnou politiku velikosti a mazání při odhlášení/smazání účtu; současné IndexedDB není šifrované na aplikační úrovni.

## Migrace z dnešních lokálních dat

1. **Před migrací vytvořit a zkontrolovat export.** Uživatel může stáhnout `chytnucz-local-backup` v1. Není šifrovaný; upozornit na GPS/fotky, nenahrávat jej do cloudu bez výslovného kroku.
2. **Registrace / přihlášení.** Vysvětlit stručně, že účet umožní synchronizaci mezi zařízeními a že lokální deník zůstává dostupný offline. Zvolit e-mail/heslo nebo e-mailový odkaz; žádné SMS přihlášení v MVP kvůli ceně a přidaným krokům. Přidat obnovu přístupu, ověření e-mailu, bezpečné session a account deletion.
3. **Detekovat stav obou stran.** Rozlišit prázdný lokální deník, existující lokální data, prázdný účet a účet s cloudovými daty. Nikdy automaticky neposlat lokální data k prvnímu náhodnému účtu po přihlášení.
4. **Výslovná volba vlastníka dat.** Pokud existují záznamy lokálně i v cloudu, nabídnout jasnou volbu: „Sloučit místní deník s účtem“, „stáhnout účet do tohoto zařízení“ nebo „teď ne“. Při shodě UUID ale rozdílném obsahu vytvořit konflikt, nepřepsat.
5. **Zachovat identitu a vazby.** Přenést každý catch/trip se stejným stabilním ID; nejprve trips a entity metadata, následně catches odkazující na původní `tripId`, pak samostatné fotky přes `photoId`. Revalidovat, že každý trip reference existuje nebo jde o `null`.
6. **Zápis s checkpointy.** Vytvořit trvalou frontu. Po dávce potvrdit serverový cursor/ack; nesmazat lokální záznamy, Blob ani export. Po restartu pokračovat z posledního potvrzeného checkpointu.
7. **Idempotence a integrita.** `operationId` brání duplikaci. Po dávce porovnat počet/ID úlovků a výprav, počet/velikost/hash fotek, trip vazby, nejvyšší revize a tombstony. Chyby zobrazit s dalším krokem a možností opakování.
8. **Potvrdit dokončení až po kontrole.** Nejdříve zobrazit souhrn „nahráno X úlovků, Y výprav, Z fotografií“, až po všech ackech a integrity checku. Neodstraňovat místní data po úspěšné migraci; cloudová kopie nenahrazuje export ani zálohu.
9. **Další zařízení.** Po přihlášení stáhnout cloudový snapshot/delta do lokální DB přes importní transakce a znovu ověřit ID/vazby. Po stažení je možné číst deník offline. Lokální i cloudové změny se zase zapisují do outboxu.

## Hlavní rizika a opatření

| Riziko | Dopad | Opatření před produkcí |
|---|---|---|
| Nesprávná bezpečnostní pravidla / IDOR | Únik cizích úlovků nebo fotografií včetně přesných revírů | Default-deny rules, testy anonymního uživatele, vlastníka, cizího uživatele a změněného `ownerId`; foto URL krátkodobé; žádné admin klíče v klientovi. |
| Poslání lokálního deníku do nesprávného účtu | Soukromí a nevratné smíchání dat | Explicitní propojení účtu a lokálního deníku, jasná účetní identita na zařízení; u každé fronty pevné `ownerId`. |
| Tiché přepsání při souběhu | Ztráta údajů o úlovku | Serverové revize/CAS, zachované konfliktní verze, uživatelský výběr. Native Firestore last-write-wins nepoužít jako konfliktovou politiku. |
| Mazání a zastaralé zařízení | Smazaný záznam se vrátí | Tombstone, operation ID, synchronizační cursor/account epoch; test dlouho offline klienta. |
| Přerušený upload / nedostupné úložiště | Fronta se ztratí, chybný stav UI nebo chybějící foto | Uchovat Blob dokud server nepotvrdí hash, resumovat/opakovat, chybu zobrazit a zachovat frontu. |
| Náklady fotek a abuse | Nečekaný Blaze účet | Limity na soubor, počet/uživatele, rychlost, egress; odložené načtení originálu; billing alerts a pravidelná kontrola. Alert není tvrdý limit. |
| Ztráta nebo smazání providerových dat | Ztráta cloudu i fotek | Samostatná šifrovaná a obnovitelná záloha DB i objektů, test obnovy, export pro uživatele. Pro Supabase daily backup neobsahuje Storage objekty. |
| Trvalá data v prohlížeči po odhlášení | Další uživatel zařízení může vidět deník | Navrhnout chování sdíleného zařízení; nabídnout uzamčení/odstranění lokální kopie pouze po potvrzení, tokeny nikdy neukládat do outbox payloadu. |
| Přesná GPS / EXIF fotografie | Odhalení soukromého místa | Soukromé defaulty, odstranit EXIF, explicitní sdílení, veřejnou projekci bez GPS, audit download oprávnění. |

## Rozhodnutí vyžadující schválení vlastníka

1. **Poskytovatel:** Firebase (doporučení podle nízkých počátečních nákladů) vs Supabase (doporučení pokud je prioritou SQL, auditovatelnost a predikovatelný produkční paušál) vs vlastní backend (nedoporučeno nyní).
2. **Fakturace:** Firebase Blaze nemá pevný měsíční poplatek, ale vyžaduje billing account a nemá tvrdý globální cenový strop; Supabase Pro je nejméně $25/měsíc. Potvrdit, jakou variabilitu a jaký měsíční limit jste ochoten přijmout.
3. **Region:** doporučení EU (např. Frankfurt) pro Firestore i Storage; americká bezplatná Storage kvóta by znamenala umístění v USA a výše uvedené odhady pro EU by neplatily. Bucket nelze později přemístit.
4. **Přihlášení:** doporučení začít e-mailem + heslem nebo e-mailovým odkazem, bez SMS/telefonu; Google/Apple přihlášení lze přidat později podle pravidel mobilních obchodů a UX.
5. **Historická data:** zda má uživatel výchozí volbu „ponechat pouze lokálně“ a nabídku importu do účtu. Doporučení: přenos jen po výslovném potvrzení, nabídka nejprve stáhnout zálohu.
6. **Zálohy:** schválit požadovanou retenci, místo druhé kopie a nákladovou toleranci; Firebase odhad nezahrnuje zálohu fotek. Supabase Pro denní DB backup nezahrnuje Storage.
7. **Fotografie:** schválit limit jedné fotky na úlovek pro první synchronizační verzi (současný limit produktu), velikostní limit, generování náhledu, stažení originálu na mobilních datech/Wi-Fi a retenční politiku při mazání účtu.
8. **Odhlášení a lokální data:** doporučení ponechat data lokálně a frontu uzamknout pod původní owner ID; přepnutí účtu nesmí připojit lokální data k novému profilu bez potvrzení. Rozhodnout, zda nabídnout lokální odstranění na sdíleném zařízení.

## Doporučené pořadí navazující implementace

1. Schválit provider, region, účty/fakturaci, rozpočet, přihlášení a politiku dat (rozhodnutí výše).
2. Navrhnout provider-neutral kontrakt synchronizátoru, revize, conflict DTO, outbox/tombstone stores a testovací scénáře; nejprve jen plán migrace IndexedDB bez změny schématu produkčních dat.
3. Implementovat Auth/session a default-deny pravidla v izolovaném projektu/stagingu; otestovat pravidla samostatně pro oba poskytovatele/role. Nikdy nenahrávat skutečné osobní záznamy do testovacího projektu.
4. Přidat transakční lokální outbox a synchronizaci catch/trip metadata. Zachovat Blob v IndexedDB, viditelně zobrazovat čekající/chybné operace a ověřit offline → reconnect → restart.
5. Odděleně implementovat upload/download fotografií, hash, autorizaci, mazání a rozpočtové metriky.
6. Připravit dry-run import existujícího deníku, konflikty, odvolání/rollback a test integritní kontroly; migraci produkčních záznamů provést až po výslovném potvrzení uživatele.
7. Ověřit scénář dvou offline zařízení, konflikt stejného pole, mazání na jednom zařízení/starý klient na druhém, opakovaný request, pád během fotky, změnu účtu, odhlášení, export, smazání účtu a obnovu zálohy.

## Zdroje

Všechny cenové a technické stránky níže byly ověřeny **16. 10. 2026**. Ceny se mění; před aktivací je nutné zopakovat kalkulaci v konkrétním regionu/projektu.

- [Supabase Pricing](https://supabase.com/pricing) — limity Free/Pro, minimum, egress, storage, MAU, zálohy, compute.
- [Supabase Auth](https://supabase.com/docs/guides/auth) — podporované metody, JWT a vztah k RLS.
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — grants, RLS policies, `service_role` bypass.
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control) — oprávnění k objektům.
- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) — Pro 7 dní denních DB záloh, záloha neobsahuje Storage objekty, PITR ceník.
- [Supabase Free Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing) — pozastavení po období nízké aktivity.
- [Firebase Pricing](https://firebase.google.com/pricing) — Auth, Firestore quotas, Cloud Storage Blaze quotas.
- [Firebase Cloud Storage billing change FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) — Blaze povinný od 3. 2. 2026.
- [Firebase Storage locations](https://firebase.google.com/docs/storage/locations) — US-only Always Free, region bucketu neměnný.
- [Google Cloud Storage Pricing](https://cloud.google.com/storage/pricing) — Standard Storage, operace, internet egress a regionální Free Tier.
- [Firebase project locations](https://firebase.google.com/docs/projects/locations) — lokace volená po produktu/zdroji.
- [Firebase Auth](https://firebase.google.com/docs/auth) — e-mail/heslo, reset, Google/Apple providery.
- [Firestore pricing](https://cloud.google.com/firestore/pricing) a [Firestore billing details](https://firebase.google.com/docs/firestore/pricing) — quota, metriky a regionální ceny.
- [Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline) — offline cache, LWW, web persistence a sdílené zařízení.
- [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions) — atomické operace a selhání transakcí při offline stavu.
- [Firebase Security Rules](https://firebase.google.com/docs/rules) — samostatná pravidla databáze a Storage, testování emulátorem.
- [Hetzner price adjustment June 2026](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) — cena CX23.
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) — egress-free úložiště, free kvóty a sazby.

## Stav Gitu a provedené změny

Report byl přidán jako nový samostatný soubor `docs/CLOUD_SYNC_DECISION.md`. Zdrojový kód, konfigurace a schéma IndexedDB nebyly měněny. K datu ověření je Git root `C:/Users/David/Desktop/catchlog/chytnu`, větev `main`, HEAD `408444c40fa73a92cbc6612aa187be2b0302e148`; existuje mnoho starších necommitnutých změn a `stash@{0}`. Tyto změny jsem neupravoval; stash jsem ponechal. Záložní patch jsem neotevíral ani neměnil. `.env.local` jsem nečetl; projekt `sklad-kovu` jsem neotevřel. Commit ani push nebyl proveden.

## Otevřená práce a další prompt

Hotovo je porovnání variant, doložení cen a limitů, scénář nákladů, doporučení a návrh migrace/synchronizace. Otevřené je rozhodnutí vlastníka o poskytovateli, regionu, fakturaci/rozpočtu, metodě přihlášení, zálohách a pravidlech migrace. Zatím neexistuje cloudový projekt ani automatická synchronizace.

Po schválení doporučuji zadat:

> **ChytnuCz — ETAPA 6C: návrh a bezpečnostní příprava vybraného backendu.** Schvaluji použití [DOPLNIT Firebase / Supabase] v regionu [DOPLNIT], s plánem [DOPLNIT] a maximálním měsíčním rozpočtem [DOPLNIT]. Pokračuj pouze v projektu `C:\Users\David\Desktop\catchlog\chytnu`. Před změnami zkontroluj Git a zachovej všechny stávající změny, `stash@{0}` i záložní patch; nečti `.env.local`, nezasahuj do `sklad-kovu`, neprováděj commit ani push. Nejprve připrav izolované/staging prostředí, provider-neutral datový kontrakt, migrační a rollback plán, bezpečnostní pravidla a testovací scénáře. Produkční data ani skutečné účty nepřipojuj. Zachovej React/Vite, IndexedDB a repository architekturu; nepřidávej paralelní lokální úložiště. Dodrž `Product UX principles` v `AGENTS.md`: praktické, pohodlné, intuitivní rozhraní, bez duplicitních akcí a zbytečného UI. Jakýkoli krok, který by založil externí účet, připojil billing, migroval osobní data nebo aktivoval placenou funkci, nejdříve předlož jako konkrétní review výsledek k mému samostatnému schválení.
