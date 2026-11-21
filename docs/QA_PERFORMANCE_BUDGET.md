# QA výkonu a přenosů · Prompt 16

**PARTIAL.** Ověřený menší počáteční přenos. Podmínky na fyzickém slabém Androidu a Firestore metriky pilota čekají na schválené prostředí.

## Reprodukovatelné srovnání

Produkční Vite build na místním serveru s gzip. Chrome 390 × 820, CPU 4× zpomalené, 150 ms latence, příjem 1,6 Mbit/s a odesílání 0,75 Mbit/s. HTTP cache vypnutá, worker pro měření obcházený. Dva průchody každou cestou jako host. Zobrazení měřeno od navigace k hlavnímu nadpisu a liště. Bajty jsou transferSize místního dokumentu a zdrojů v okně do 600 ms po zobrazení. Počty za dvě měření, bajty a časy jako průměr.

- Domů, 9/8 požadavků v obou buildech. 273 197 → 266 772 B, 2 315 → 2 522 ms.
- Deník, 12/12 požadavků v obou buildech. 278 843 → 272 422 B, 2 194 → 2 298 ms.
- Galerie, 11/11 → 12/12 požadavků. 281 676 → 277 729 B, 2 284 → 2 256 ms.
- Mapa, 14/14 požadavků v obou buildech. 328 365 → 321 942 B, 2 513 → 2 501 ms. Dlaždice externí sítě byly blokované.
- Komunita, 13/13 požadavků v obou buildech. 280 259 → 273 839 B, 2 234 → 2 176 ms. Host nevytvářel vzdálené dotazy.

Vzorek ukazuje úsporu 3,9–6,4 kB podle cesty. Časy nejsou s tak malým vzorkem průkazné. Retest zahrnul stejné trasy a podmínky; měření zahrnuje rozptyl po spuštění Chromia a počítače.

## Změna a ověření

První pokus pouze dal profil za lazy import. Vite doložil, že statický import SharedImage ze stejného modulu ponechal profil v hlavním balíku. Oddělení tohoto přístupu spolu se stylem zástupné fotografie umožnilo načítat veřejný profil až tam, kde se používá. Autentizovaný emulátorový průchod zobrazil vlastní syntetický profil přes přímou URL i náhled v Nastavení. Způsob autorizace fotografií se nezměnil.

- Hlavní JS 659,10 → 641,67 kB minifikovaný, 202,25 → 197,93 kB gzip. Hlavní CSS 80,39 → 67,67 kB minifikované, 13,98 → 11,87 kB gzip.
- Leaflet 150,07 / 43,60 kB JS se poptával až na mapě. HEIC 1 352,91 / 341,26 kB je již lazy. Vite stále upozorňuje na větší chunky. V běžných hostovských trasách se HEIC nestahoval, při instalaci offline shellu se přednačte stejně jako před změnou.
- Build a přítomnost všech 158 položek v offline manifestu, secret scan 166 assetů, lint, 1 191 Node testů a diff check PASS. 180 hostovských kombinací, šest offline navigací s vypnutým HTTP, JPEG read-back, tři odkazy z Deníku a deset uzavřených přímých cest PASS na výsledném buildu.
- Signed-in sync sleduje poslední změnu účtu s limitem 1 a přírůstky čte po stránkách. Oznámení používají per-account query s limitem 250. Hostovský test nevypovídá o počtu účtovaných dokumentů. Změřit skutečné operace, reconnect a jejich denní rozpočet v Promptech 19–21. Cíle auditu p75 LCP do 2,5 s, INP do 200 ms a CLS do 0,1 ověřit na reprezentativním pilotu.
