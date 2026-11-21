# Veřejný web 1.0 · rozhodnutí o vydání · Prompt 23

**BLOCKED / NO-GO.** Existuje kandidát `fbb87cc88b43735417c7cf55fb175761b62a11e0` na `codex/public-launch-readiness-audit`, GitHub push ověřen a Vercel preview READY. Produkční projekt má samostatné nasazení dpl_excxrvWSUebVCKKQxXMXLP4dEv24 na 68fbf04b70e123b226bac90ee83f12dde1dc352b. Kontrola produkčního aliasu, GitHub main a Firebase proběhla čtením. Kandidát čeká na rozhodnutí vlastníka a skutečnou uzavřenou akceptaci.

## Rozsah kandidáta

- Web 1.0 · soukromý deník, rychlý fotozápis, manuální úlovek, vycházky, revíry, místní přehledy a postup, přihlášení, členění exportu a zahájení výmazu. Příběhy a rady z deníku mají místní variantu. Externí inference vyžaduje zvláštní souhlas a schválení konfigurace.
- Veřejná komunitní část může být zahrnuta jen po zvláštním prokázání veřejných projekcí, blokování, ochrany a odvolání fotografií. Nearby, přítomnost u vody, chat, soukromé zprávy a Crew zůstávají mimo tento release scope. Zvolená omezení před GO doložit v [matici](RELEASE_SCOPE_MATRIX.md).
- Retence, provozní kontakt, povinné podklady, obnovitelnost a kvóty mají vlastní protokoly [právo](LEGAL_OWNER_SIGNOFF.md), [provoz](OPERATIONS_RUNBOOK.md), [rollback](RELEASE_ROLLBACK.md) a [kapacita](CAPACITY_COST_GUARDRAILS.md).

## Přehled změn oproti současné produkci

- Relace jen pro relaci prohlížeče po reloadu, srozumitelné stavy sync a trvalé potvrzení přijatého výmazu účtu.
- Ochrana schválených veřejných projekcí a odvolání fotografií, dodatečný fence pozastaveného účtu v serverových XP transakcích, no-store pro cron a provozní souhrny bez uživatelských identifikátorů.
- Čeština v aktivitě ryb, žádné překrytí spodní navigace v editoru revíru, kontrast smazání, menší počáteční přenos profilu a aktualizované právní vysvětlení.

## Kontrola

- Produkční HTTP smoke 200 pro Home, login, privacy-policy, terms, manifest, worker a Cloudinary capability. V nezávislém Chromium profilu při 390 px prošla obrazovka registrace bez odeslání, hostovské Domů s Quick Catch vstupem, Deník, Profil, Soukromí, Nastavení a obě právní stránky. Živý účet, export, upload a mazání čekají na výslovné povolení a izolovaná data.
- Lokální úplná sada a autentizovaný průchod kandidáta jsou v checkpointu Prompt 23.
- Firebase Rules a indexy odpovídaly produkci čtením v Promptu 17. Produkční konfigurace Firebase se při ověřování neměnila.

## Podpisy před publikací

- [ ] Skutečný pilot, fyzické PWA, dva povolené účty, živá média včetně revokace a úplný výmaz.
- [ ] Ověřená izolace preview, schválené licence, kontakt, testovací protokol upozornění, schválený nekomerční rozsah a funkční rollback.
- [ ] David potvrdí exact SHA a finální GO. Teprve potom lze přesunout příslušné ověřené změny na origin/main a potvrdit Vercel READY na totožném commitu. Produkční release tag vznikne po podpisu.
