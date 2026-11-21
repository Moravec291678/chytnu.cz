# QA exportu a výmazu účtu · Prompt 04

**PARTIAL.** Cílené testy pracují se syntetickými daty. Skutečný výmaz živého účtu a odstranění jeho Cloudinary souborů čekají na schválený testovací účet. Samoobslužný JSON zatím neobsahuje komunitní příspěvky, komentáře ani reakce. Uživatel dostane pravdivé vysvětlení a cestu ke správci.

## Inventář dat

| Datová oblast | Přenositelnost a hranice | Výmaz |
| --- | --- | --- |
| Firebase Auth a profil | Povolený snapshot profilu a metadat účtu, bez credentialů a tokenů. | Po bariéře revokace refresh relací a následný výmaz Auth. Koncový přístup kryje 04 a 17. |
| Firestore Catch, Trip, Water, notifikace, XP | Stránkovaný JSON s povoleným obsahem. Push klíče, synckurzory, interní limity, anti-cheat a receipts mimo. Data z více čtení tvoří snapshot bez atomického timestampu. | Rekurzivní úklid owner podstromů. Jiný účet a jeho záznamy zůstávají. |
| Firestore AI souhlas a výsledky | Součást povoleného exportu v rámci existujícího schématu. | Podstrom účtu a osobní quota data. Zůstává sdílená agregace služby. |
| Komunitní profil, příspěvky, komentáře, reakce, vztahy a blokace | Vlastní projekce mají oddělený serverový model. Současný export je nezahrnuje, kontakt uveden v Nastavení a zásadách. | Serverový manifest a postupné odstranění referencí účtu. Vlastní příspěvek včetně interakcí se čistí rekurzivně. Vlastní obsah cizího účtu se nemaže. |
| Cloudinary a foto metadata | Správná velikost a SHA-256, dostupné originály přes autorizovaný export, chybějící mají explicitní varování. JPEG deriváty mají separátní oprávnění. | Před zrušením zdrojů se zapíší trvalé foto joby včetně legacy a orphan odkazů. Avatar používá vlastní úklid. Dokončení přiznáno až po potvrzení workeru. |
| Lokální IndexedDB, preference, fronta, foto cache | Místní záloha tohoto profilu je oddělená. Cloudový export přidává explicitní deviceLocal supplement. | Mazání scope aktuálního zařízení, návrat k přihlášení. Guest a jiné zařízení mají vlastní data, absence cloudu neznamená odstranění místní zálohy. |
| Podpora, audit a trvalé fronty | Servisní záznamy jsou oddělené od účtového exportu; cesta přes správce. | Vybrané případy a poznámky uživatele se mažou. Bezpečnostní audit a retenční evidence mají oddělenou správu. Nedokončený provider job musí přežít expiraci markeru. |

## Limity a životní cyklus

Cloudový export zastaví akumulaci před odhadem 64 Mi znaků a jednotlivá fotografie je omezena aplikačním limitem 10 MiB. Jednotkové scénáře pokrývají 0 a 100 úlovků, 120 snímků, legacy víc než čtyři fotky, chybná metadata, nedostupné binární soubory, ukončení při změně identity a bezpečnou chybu při překročení limitu. Skutečné paměťové maximum iPhone a Android není odvozené z odhadu JSON znaků. Fyzický test má použít známý dataset bez citlivých souřadnic, měřit spotřebu a ověřit čitelnou chybu.

Výmaz vyžaduje ověřený Firebase token s čerstvým auth_time. Po zápisu markeru se původní účet zastaví na rules a serverových hranách i proti pozdnímu zápisu. Stavový běh `requested → revoke → photos → data → auth → cleanup-pending` pokračuje v omezených průchodech, s lease a opakováním. Dokončení se pozná podle prázdné množiny nepotvrzených foto úloh. `partial-failure` znamená zásah obsluhy. `listDocuments` zahrne osiřelé rodiče a načítá seznam před dělením, výkonnost velmi velkého účtu je otevřená.

Oprava Promptu 04 odděluje odpověď na přijetí žádosti a výsledek první iterace fronty. Pokud se zápis markeru podařil, klient dostane 202 i při následné dočasné chybě workeru. Cron může navázat od markeru. Selhání samotného zápisu vrací 503. Opakovaný požadavek používá dřívější stav a ověřený completed stav nevrací do fronty.

Lokální důkaz: 45 cílených kontrol, 22 Firestore Rules kontrol a syntetický A/B integrační průchod se skutečnými Auth a Firestore emulátory PASS. Účet A a jeho privátní Catch/photo dokumenty odstraněny, účet B zachován, stav cleanup-pending do simulovaného potvrzení média. Opakování oznámilo completed. Lint, build a 1 190 jednotkových testů PASS.

## Akceptace

- Ověřit, že se dva syntetické účty ve schváleném prostředí nepřekrývají. A exportuje aktivní a dostupná data, B vidí jen svoje. Vypnout síť u A, opakovat bezpečný export a ověřit nedokončené fotografie v reportu.
- U A zanechat nahrávanou soukromou fotku, případnou schválenou sociální projekci a neodeslanou změnu na druhém zařízení. Vyžádat čerstvý token, zahájit výmaz, sledovat marker a stav front. Přerušený klient obnovit, dokončení zkontrolovat až po úklidu. Ověřit, že profil A zmizel, B zůstává a Cloudinary aktiva A jsou odstraněna.
- Před širším sociálním vydáním ověřit přenositelnost vlastního sociálního obsahu včetně cesty žádosti. Případné automatické doplnění má dělat autorizovaný server bez míchání cizích interakcí a bez vystavení interních dat.

[Protokol auth](QA_AUTH_ACCOUNT_LIVE.md) · [Média a rozsah](RELEASE_SCOPE_MATRIX.md) · [Stav vydání](RELEASE_EXECUTION_STATE.md).
