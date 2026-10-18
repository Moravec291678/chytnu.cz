# Počasí a orientační aktivita ryb

## Zdroj a soukromí

Počasí se načítá z veřejného Forecast API Open-Meteo až poté, co uživatel zvolí „Zobrazit odhad“ a udělí prohlížeči přístup k poloze. Souřadnice se používají pouze v požadavku na počasí a neukládají se trvale. Krátká pětiminutová cache zůstává v paměti aplikace a používá přesnou dvojici souřadnic jako klíč.

Úspěšné zobrazení uvádí Open-Meteo jako zdroj s licencí CC BY 4.0, čas modelového údaje a čas načtení. Aktuální hodnoty jsou modelový výstup, nikoli místní měření nebo garantované pozorování. Neúplné a mimo rozsah ležící hodnoty se odmítnou a skóre se nevypočítá.

Bezplatné veřejné API Open-Meteo je určeno pro vyhodnocení a prototypování. Open-Meteo nabízí pro komerční použití placený customer endpoint s API klíčem; zdrojová data vyžadují atribuci podle CC BY 4.0. Před veřejným vydáním je proto nutné potvrdit očekávaný objem, komerční licenci a podobu atribuce, případně schválit jiného providera. Jde o release rozhodnutí; současný weather kód se automaticky nepřepíná a žádný placený plán nebyl aktivován. Ověřeno proti veřejné stránce Open-Meteo Pricing dne 18. 10. 2026.

## Verze algoritmu 1

Skóre 1–10 je pouze interní, orientační heuristika vypočítaná z modelového tlaku, větru, teploty vzduchu, oblačnosti, hodinové pravděpodobnosti srážek, denní doby, ročního období a fáze měsíce. Váhy faktorů jsou postupně 23 %, 18 %, 22 %, 12 %, 12 %, 8 %, 3 % a 2 %. Jednotlivé podmíněné body a váhy jsou produktové předpoklady bez ověření na reprezentativní databázi úlovků. Skóre proto neudává pravděpodobnost záběru ani biologicky potvrzenou aktivitu ryb. Mění se podle druhu, vody, ročního období a místních podmínek.

Změna výpočtu musí zvýšit `FISH_ACTIVITY_ALGORITHM_VERSION` a doplnit deterministický test. Uživatelské rozhraní uvádí, že nejde o předpověď záběrů.
