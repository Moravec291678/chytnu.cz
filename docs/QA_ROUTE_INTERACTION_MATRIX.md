# QA interakcí na 56 trasách · Prompt 13

Přihlášený Chromium s účtem emulátoru Auth/Firestore otevřel všech 56 cest přímo v rozměrech 390 a 1440 px. U všech 112 kombinací se zaznamenal cílový stav, žádné měření nepřekročilo šířku rámu o více než 1 px. 26 cílených opakování zpřesnilo čekání na konec úvodní obrazovky, chybový stav profilu a prázdný stav cizího revíru. Přehled níže ukazuje nadpis nebo stav, nav položku, pokud je přítomná, a očekávaná přesměrování. Zabezpečený provoz se hodnotí samostatně od vykreslení administrativního rámce.

## Katalog ověřených vstupů

- / · ChytnuCz
- /login · ChytnuCz · lišta / · přesměrování /
- /admin/* · Administrace ChytnuCz · lišta /profile
- /onboarding · Jak chceš rybařit?
- /journal · Deník · lišta /journal
- /journal/calendar · Deník · lišta /journal
- /journal/map · ChytnuCz
- /challenges · Výzvy · lišta /profile
- /achievements · Úspěchy · lišta /profile
- /levels · Úrovně a XP · lišta /profile
- /streak · Série · lišta /profile
- /fish-activity · Aktivita ryb · lišta /
- /species/:speciesKey/mastery · Štika obecná · lišta /journal
- /species/:speciesKey · Štika obecná · lišta /journal
- /album · Sbírky · lišta /journal
- /map · Deník · lišta /journal
- /add · Nový úlovek · lišta /add
- /catch/:id/reward · Úlovek nenalezen · lišta /journal
- /catch/:id/share · Úlovek nenalezen
- /catch/:id · Úlovek nenalezen · lišta /journal
- /catch/:id/edit · Úlovek nenalezen · lišta /journal
- /gallery · Galerie · lišta /journal
- /stats · Statistiky · lišta /journal
- /profile · Profil · lišta /profile
- /profile/social · Můj rybářský profil · lišta /profile
- /u/:identity · Profil není dostupný · lišta /community
- /privacy · Soukromí a poloha · lišta /profile
- /privacy-policy · Zásady ochrany osobních údajů
- /terms · Podmínky používání
- /settings · Nastavení · lišta /profile
- /notifications · Oznámení · lišta /community
- /insights · Tipy a postřehy · lišta /journal
- /season-story · Příběh sezóny · lišta /journal
- /year-summary · Tvůj rok 2026 · lišta /journal
- /supporter · Profil · lišta /profile · přesměrování /profile
- /trips · ChytnuCz
- /trips/new · ChytnuCz
- /trips/:id · Vycházka nenalezena · lišta /journal
- /trips/:id/edit · Vycházka nenalezena · lišta /journal
- /waters · Revíry · lišta /profile
- /waters/catalogue · Katalog revírů RIS · lišta /profile
- /waters/catalogue/:catalogueId · Horní rybník Únětice · lišta /profile
- /waters/new · Přidat revír · lišta /profile
- /waters/:waterId/edit · Revír nenalezen · lišta /profile
- /waters/:waterId · Požadovaný revír neexistuje · lišta /profile
- /waters/:waterId/chat · Stránka nenalezena · lišta /community
- /hotspots · Hotspoty · lišta /journal
- /friends · Přátelé · lišta /community
- /community/post/:postId · Příspěvek byl odstraněn nebo pro tebe není dostupný.Zkusit znovu · lišta /community
- /community · Komunita · lišta /community
- /community/find · Najít rybáře · lišta /community
- /community/catch/:catchId · Veřejný náhled není dostupný · lišta /community
- /community/:postId/report · Nahlásit · lišta /community
- /nearby · Stránka nenalezena · lišta /community
- /crew · Stránka nenalezena · lišta /community
- * · Stránka nenalezena


## Oprava a rozsah

- Na /fish-activity byl anglický nadpis v české navigaci. Nadpis Aktivita ryb se ověřil na 390 a 1440 px. Doprovodný text v /insights používá stejný český výraz a zachovává údaj o orientačním skóre.
- Lint, build včetně 154 offline souborů a 7 cílených testů přístupových cest a navigace PASS. K běhu byly převzaty 320 předchozích kombinací host/účet, oddělené přihlášení A/B, šest offline cest a skutečné načtení vlastního úlovku a vycházky z Promptů 01, 02, 08 a 09. Parametrické chyby jsou v testu úmyslně vyvolané neexistujícím ID.
- PARTIAL. Tento průchod nepokrývá kompletní matice načtených/online/offline stavů pro všechny parametrické sociální položky. Oprávněný preview, fyzické klávesnice a ohlášené sociální moduly mají vlastní akceptaci.
