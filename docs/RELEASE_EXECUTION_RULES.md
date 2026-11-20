# ChytnuCz · pravidla provádění vydání

Platí pro prompty 00–33. Aktuální úkoly, stav a pracovní mapování jsou v [registru](RELEASE_EXECUTION_STATE.md). Podrobné akceptační scénáře jsou v [QA](QA_COVERAGE_MATRIX.md), [akceptaci webu](RELEASE_ACCEPTANCE_CHECKLIST.md) a [akceptaci obchodů](MOBILE_STORE_RELEASE_CHECKLIST.md). Relace po načtení nového zadání použije jen jeho skutečný rozsah.

## Začátek relace

1. Ověř pracovní cestu, `git status --short --branch`, aktuální SHA, index i rozdíl. Při změně větve nebo vydání ověř `origin/main` i skutečný produkční alias. Nepoužívej divergentní lokální main jako referenci produkce.
2. Přečti poslední checkpoint, přesný následující krok a relevantní kritéria v auditu. Zkontroluj nové zadání proti pracovní mapě 00–33. Při odlišnosti uprav mapu, zachovej původní ID a dolož nové rozhodnutí.
3. Vyber příslušné ID a jednu kontrolovatelnou část úkolu. Pokračuj se stejnými daty a architekturou. Shodný už provedený test můžeš převzít s datem, SHA, scénářem a prostředím. Test opakuj tam, kde se změnila jeho hranice, kód, konfigurace nebo kandidát. Podle rizika spusť odpovídající širší gate.
4. Původní `chytnu-terminology` je pracovní kopie vlastníka. Její staged, unstaged i nové soubory patří do scope pouze po výslovném zadání. Dřívější lokální změny mohou mít částečný překryv s vydanými commity, nedokazuje to shodu. Nepřesouvej je hromadně. Pro ověření použij čtení diffu a porovnání commitů.

## Stavy a důkaz

- **NOT STARTED** Úkol čeká na zahájení.
- **IN PROGRESS** Úkol má provedenou dílčí práci s odkazem na změnu nebo důkaz. Uveď zbývající rozsah.
- **BLOCKED** Konkrétní krok vyžaduje hardware, syntetický účet, oprávnění, schválení, živou verifikaci nebo nesplněné závislé ID. Uveď přesně, kdo či co překážku odstraní, a pokračuj nezávislou prací. U kritické brány zachovej NO-GO.
- **VERIFIED** Všechna kritéria úkolu jsou splněna v prostředí, kde mají platit. Uveď kandidáta, datovaný protokol, počty testů a kdo ověřil ruční část. Dílčí PASS emulátoru nebo browseru patří pod konkrétní scénář.
- **DEPLOYED** VERIFIED změna je na určeném cíli. Ověř shodu SHA, stav READY, hlavní akceptační smoke a případně odpovídající pravidla/indexy Firebase. Otevřená dřívější funkce na produkci se eviduje jako dílčí nasazení u příslušného ID.

Při nové reprodukci P0 aktualizuj existující ID a připoj prostředí, kroky, očekávání, skutečnost a rozsah rizika. Chybu neoznačuj za potvrzenou jen z absence důkazu. Po potvrzeném P0 zastav dotčené vydání a uveď bezpečný způsob triáže bez práce s osobními daty. P1 se uplatňuje pro zvolený rozsah. Modul odložený z webového pilotu musí být pro běžný účet bezpečně uzavřen i přes přímou adresu a server.

## Produkt a ochrana dat

- Zachovej současný tmavý a zelený design, hlavní navigaci, stávající architekturu a uživatelská data. Opravu začínej nejmenším reprodukovatelným případem.
- AI smí být jen pro rybářské příběhy a tipy či rady z deníku. Zachovej nezávislost Quick Catch, deterministické analýzy a offline úložiště. Externí služba zůstává volitelná, v rámci schváleného scope a ověřené bezplatné kapacity.
- Soukromá historie, přesná GPS a privátní originály zůstávají ve vlastnickém scope. Veřejné sdílení musí server ověřovat, včetně odvolání, revizí, bloků a přístupu k médiím. Zastaralý klient nesmí obnovit odvolané zpřístupnění.
- U offline záznamů, fotografií a fronty ověř po změně trvanlivost a opakování operací, správnou izolaci účtů a stav po smazání. Zachovej rozpracované commity i lokální fotografie. Testovací data jsou syntetická, bez skutečné GPS a zákaznických médií.
- Nepovoluj placené služby, fakturaci ani placené zkušební tarify. Tokeny, přihlašovací údaje, skutečné fotografie a přesná GPS nepatří do historie, logů ani dokumentace. Nehotové online funkce nesmějí být veřejně přístupné jako funkční.

## Git, uložení a předání

- Každé zadání uzavři samostatným přezkoumatelným commitem na příslušné vývojové větvi. Explicitně přidej jen zamýšlené cesty. Zkontroluj `git diff --check` i staged rozdíl. Potom ověř nový HEAD, Git status a rozsah commitu.
- Prompt 00 je dokumentační. Oprávnění pro pozdější staging, push do main, produkční nasazení, změny Firebase a živé operace se řídí konkrétním zadáním. Zachovej lokální změny ve všech worktrees. Nepoužívej reset, clean, rebase přepisující sdílenou historii ani force-push.
- Registr aktualizuj po každé dokončené části: datum, výchozí a aktuální kódový SHA, větev, změněný stav ID, soubory, test a jeho prostředí, zbývající blokátor s odpovědností, skutečné nasazení a první příkaz či soubor pro navázání. U právě vytvářeného checkpointu použij odkaz na commit dokumentu přes `git log -1 --format=%H -- docs/RELEASE_EXECUTION_STATE.md`, protože vlastní hash uvnitř commitu nelze zapsat před vytvořením. V odpovědi použij již ověřený hash.
- Při přerušení ulož rozpracovaný stav i výsledek posledního testu a dopiš přesný další krok. Při sporu mezi historickým auditem a novým měřením zapiš novější důkaz odděleně. Před schválením webu znovu vyhodnoť správný rozsah, otevřené P0/P1 a soulad kandidáta s produkcí. Android, iOS a sociální rozšíření mají vlastní brány.
