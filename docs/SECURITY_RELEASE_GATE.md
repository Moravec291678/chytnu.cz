# Bezpečnostní brána vydání · Prompt 17

**PARTIAL.** Lokální a emulátorové ověření prošlo. Veřejný launch čeká na živou autorizovanou akceptaci médií, účtů a schválené preview. Výsledky se vztahují k testovanému kandidátu a bezpečným anonymním sondám stávající produkce.

## Nálezy a opravy

- **P1 podmíněný aktivním serverovým XP.** Serverový zápis XP mohl původně projít v intervalu mezi zápisem pozastavení a aktualizací Auth. Nárok a reconciliation nově kontrolují blokaci při ověření účtu i uvnitř transakce. Totéž platí při zahájeném výmazu. Validní emulátorový token obou syntetických účtů dostal 403 v obou akcích. Evidence kontroluje absenci nové položky a zachování historického XP. Produkční sondě serverový XP vrátil 503, živý režim se pro test neaktivoval.
- **P2 cache HTTP.** Nepřihlášený cleanup vracel 401 a výchozí public, max-age=0, must-revalidate. Kandidát posílá no-store u všech výsledků údržby, včetně odmítnutí a chyby. Cílený test ověřuje 401, 405 i 207 a žádný běh úklidu bez oprávnění.
- **P2 CSP.** Kandidát má nosniff, referrer a permission policy. Úplnou report-only inventuru a ověření CSP ponechává RISK-02, dokud nebude k dispozici schválené izolované preview. Absence CSP během kontroly nedokládá konkrétní XSS.
- Závislosti v produkčním rozsahu npm audit --omit=dev měly 0 nálezů. Včetně vývoje 14 moderate, 0 high a 0 critical. Řetězec zahrnuje Firebase CLI a přechodné vývojové balíčky. Audit navrhl změnu hlavní verze CLI směrem dolů. Závislosti se neměnily.

## Ověřené hranice

Inventář endpointů, operací a rolí je v [rozsahu vydání](RELEASE_SCOPE_MATRIX.md), matice vlastnictví a vstupů v [QA](QA_COVERAGE_MATRIX.md). Cílená a emulator suite pokrývají autentizaci, role, omezení velikosti, 401/403/404/429, cizí dokumenty, soukromé originály, public projection, souhlasy, zneužití mutací, reporty, odvolání, export, GPS a uzavřené trasy. Media capability vrací pouze stav. Zvlášť se četlo 9 omezených anonymních odpovědí stávajícího Vercelu: capability 200, výmaz/admin/sign/delivery/cleanup 401, prázdná social a AI žádost 400 a shadow claim 503. Bez zátěžového testu a živých dat.

Read-only Firebase projekt chutnucz, aktivní ruleset 4d8e7a75-aa85-43e4-8796-3921131cdc0e, přesná shoda textu po normalizaci konců řádků, SHA-256 6395aea84cfd09123d323c6b63c7d9de03aaa19a105ef2533c2f2ff87ae57aa0. 12 složených indexů a 2 field overrides shodné po zohlednění výchozího density a implicitních polí __name__. Rules/indexy se při tomto promptu nezměnily.

## Testy a otevřené brány

- Původní plná sada test:rules 1 673 dílčích kontrol prošla. Nová cílená sada XP v reálných emulátorech 213 místo 203, tj. 10 dalších kontrol. Auth, Sync, Photos a product PASS. Node 1 192, cílené API 40, lint, build se secret scanem 166 klientských souborů a git diff check PASS.
- REL-02, REL-03, REL-04 a REL-05 zůstávají otevřené pro živou akceptaci. Další účinné ověření vyžaduje schválené syntetické účty, bezpečnou konfiguraci preview, měření provider limitů a revokaci přístupu k vydaným fotografiím. V produkčním Firebase nebylo nasazeno nic.
