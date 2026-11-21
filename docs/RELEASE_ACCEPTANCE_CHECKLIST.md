# ChytnuCz · akceptační podmínky webu a PWA

Zaškrtnuto znamená ověřeno v uvedeném prostředí. Nový kandidát musí mít vlastní připojený protokol se SHA, datem, verzí zařízení, testovací rolí a výsledkem. Pro veřejnou betu projít celé jádro, produkční a fyzickou část a položky odpovídající povolenému společenskému rozsahu. Podmínky podrobněji v [backlogu](PUBLIC_LAUNCH_BACKLOG.md) a [QA](QA_COVERAGE_MATRIX.md).

Výsledky Promptu 33 a stav nového kandidáta eviduje [závěrečná matice](FINAL_ACCEPTANCE_MATRIX.md). Níže uvedené dřívější počty patří k původnímu produkčnímu auditu.

## Základ a CI

- [x] HEAD auditu, origin/main a Vercel READY shodně `68fbf04b70e123b226bac90ee83f12dde1dc352b`; HTTPS Home, /privacy-policy, /terms, SW a manifest vracejí 200.
- [x] Lint, 1 184 Node testů, build, validace 154 offline souborů a kontrola 162 assetů na serverový Cloudinary secret.
- [x] Produkční npm audit s nulou hlášených nálezů při kontrole.
- [x] Nový běh Rules 1 667 kontrol, Auth, Sync, Photos a product PASS. Aktivní Firestore pravidla a 12 indexů i dvě výjimky jednotlivých polí v chutnucz shodné s auditovaným SHA.
- [ ] Schválená release kontrola běží před propagací. Prokázat, že testovací adresy nemohou zapisovat do produkce.
- [x] Desktop Chromium, host, 180 případů a šest offline navigací. Foto znovu načtena po zavření a spuštění celého procesu bez HTTP serveru.
- [ ] Diagnostika na produkci rozlišuje nesprávná pravidla, neověřený token a nedostupnou službu bez vyzrazení informací.
- [ ] Nastavený návrat verze a recovery drill. Obnovovací kopii prověřit v čistém scope; žádná fronta se nesmí ztratit při rollbacku.
- [ ] Provozní přehled a alerty pro dostupnost, login, upload/delivery, cron, backlog a kvóty mají pojmenovaného příjemce a ověřené zaslání.

## Účet, deník a data

- [ ] Živá registrace, přijetí ověření a reset e-mailu, login, expirace, odhlášení a obnovení po restartu se syntetickým účtem.
- [ ] Ověřený Google OAuth popup/redirect na webu a vybraný mechanismus nativních wrapperů, pokud v rozsahu.
- [ ] Host → A → B → A se souběžnou frontou, záznamy A nikdy viditelné B ani hostovi. Připojení starších ne-scoped dat vyžaduje výslovnou volbu.
- [ ] Rychlá fotka i plný ruční záznam, druh, datum, míry, metoda, poznámky, trip, ruční i RIS revír. Chybné/volitelné hodnoty, žádné opakované uložení při dvojkliku.
- [ ] Editace dvou zařízení, viditelný konflikt, přerušení připojení, opakovaný sync a korektní vlastní změny po posledním potvrzení. Smazání při čekající foto operaci a žádný návrat záznamu.
- [ ] Deník: vyhledání s diakritikou i bez, kombinace filtrů, řazení, prázdný stav, stránkování/velký seznam, kalendář a detail. Statistiky, rekord a XP po editaci, duplicitním uploadu a výmazu.
- [ ] Vycházka: začít, přiřadit úlovek, spočítat dobu, ukončit, upravit, odstranit offline i online. Po smazání nesmí vzniknout neviditelný osiřelý úlovek.
- [ ] Výběr revíru zachová explicitní údaje uživatele, více stejně číslovaných revírů má odlišnou stabilní identitu. Mapa při odmítnutí GPS a při výpadku dlaždic umožní ruční práci. Souřadnice zůstávají soukromé.
- [ ] Špatné nebo staré počasí se označí, skóre je přiznaný odhad. Vlastník potvrdil zdroj počasí, východisko RIS a atribuci map.
- [ ] Export JSON a obnovení v čistém scope, velký export, nedostupný cloudový soubor, stažení na iPhonu i Androidu. Historická lokální data zachována.
- [ ] Mazání syntetického účtu s čerstvým ověřením, dokončení Cloudinary/Firebase/local lifecycle, následný sign-in odmítnut, obsah jiných účtů zachován. Podpis a audit privilegovaného přístupu vyzkoušen v stagingu.

## Fotografie a mobilní web

- [ ] A/B autorizovaný test uploadu, READY, nový load a zobrazení na obou zařízeních. Čtyři JPEG/HEIC, starší kompatibilita, poškozený soubor a limit 10 MiB.
- [ ] Při přerušení neroste počet fotek a fronta se po návratu vyprázdní. Ztráta lokálního bloku nabídne korektní obnovu nebo viditelný důvod.
- [ ] Nepodepsaný originál nedostupný, odmítnutí A → B, oprávněný testovací obraz bez EXIF/GPS, revokovaný sdílený obraz a dokončené smazání ověřeny také u poskytovatele.
- [ ] Safari instalovaná PWA a Chrome Android, kamera, galerie, zpět, safe area, systémová klávesnice, režim bez GPS. Restart při offline i po aktualizaci s neodeslanou frontou.
- [x] Přihlášené Chromium, reálný Auth emulátor, 140 kombinací a lokální založení, znovunačtení, dokončení a výmaz prázdné vycházky.
- [ ] Deset šířek i autorizované transakční stránky s naplněnými daty, dlouhými názvy, chybami a formuláři. Kontrola hlasové čtečky, klávesnice, zvětšení, kontrastu a ploch dotyku.
- [ ] Měření p75 a operací s velkým deníkem na slabším mobilu. Ukládání funguje při omezení kvóty, nízké paměti a slabém signálu podle definované UX hranice.

## Sociální a volitelné funkce

- [x] Kandidát Promptu 01 v hostovském Chromiu uzavírá přímé Crew, chat a Okolí a zachovává offline foto. Automatické HTTP testy ověřily uzavření geo akcí a zachování odvolání pro starou relaci. [Matice rozsahu](RELEASE_SCOPE_MATRIX.md).
- [ ] Veřejná trasa a serverová operace pro funkci mimo pilot konzistentně nedostupné bez ztráty místních konceptů. Nepovinný AI provider zůstává vypnutý, pokud nebyl výslovně schválen.
- [ ] Pokud komunita v rozsahu, A/B/C ověří disclosure, serverové potvrzení a zákaz tiché publikace starších záznamů. Odvolání ze dvou zařízení včetně staré fronty. Publikace, blok, zákaz interakce, přístupnost sdílených médií, odstranění a report.
- [ ] Role OWNER a CO_CREATOR testovány serverově. Moderátor nemá plošný přístup k přesnému GPS. Revokace přístupu účinná na existující relaci. Moderace má určenou odpovědnost a zaznamenaný výsledek.
- [ ] Pokud Nearby v rozsahu, bez zapnutí ani poloha ani příspěvek nevstupuje do výstupu. Prah 5, dvě zařízení, vypnutí opt-in, vypršení relace a chybějící pozice, neprůkazný referenční bod revíru.
- [ ] Soukromé zprávy, live Water Chat, cloudová Crew, push a Supporter povolit jen po vlastní akceptaci. Lokální upozornění a serverové události v aplikaci otestovat odděleně.
- [ ] Externí AI tip/příběh, pokud povolen, ověřit se syntetickými agregačními daty, odvoláním souhlasu, kvótou a offline fallbackem. Žádná fotka, přesné místo, osobní poznámka nebo nevyžádané automatické volání.

## Uzavření

- [ ] Podmínky, soukromí, skutečné kontakty, SLA výmazu, proces podpory a zveřejňování schválené pro rozsah pilotu.
- [ ] Pilotní provoz má stanovený počet účtů, měří kvóty a umí okamžitě pozastavit nábor.
- [ ] David akceptoval uživatelské toky na vlastním hardware, poslední ověřený SHA a pravidla rozšiřování.
