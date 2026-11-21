# QA Quick Catch a Deník · Prompt 08

**PARTIAL.** Trasa v aplikaci a místní fotografie jsou ověřené v Chromiu. Kamera fyzického telefonu a skutečná cloudová binární synchronizace vyžadují Prompty 06, 11 a 12. Žádné produkční údaje nebyly zapsány.

## Provedený přihlášený průchod

Ve dvou nezávislých Chromium profilech s Auth/Firestore emulátorem a vlastním syntetickým účtem se postupně založila vycházka, zvolil JPG v Quick Catch, ověřilo objevení v Deníku i načtení obrázku v detailu, vybral ručně druh Štika obecná, doplnila délka 53 cm a v plném editoru se explicitně přiřadila vycházka. Detail vycházky obsahoval tentýž Catch. Vyhledání „stika“ položku našlo, odlišný řetězec ji skryl a potvrzené smazání ji odstranilo z Deníku.

- **360 px:** Catch `d716bed2-0ac5-4c34-8274-48a7c9c6060d`, Trip `2d167cf0-dcc8-450d-8431-9928db02a8b2`.
- **390 px:** Catch `b61116f0-4bb8-4e47-a8cf-203f04ccec7f`, Trip `ab99e501-d599-414b-bb4d-8cdf5efd325e`.

První dva pokusy v pomocném skriptu předpokládaly dostupnost rychlé druhové volby ve všech režimech a automatickou vazbu na právě založenou vycházku. Skript byl zpřesněn na skutečný tok. Galerie dnes záměrně nepřebírá kontext právě probíhající vycházky, protože může obsahovat historickou fotku. Ověřený průchod nevyžadoval změnu produktového kódu.

## Pole a jejich zdroje

- Druh a míry mohou začínat neznámé. Druh vybírá uživatel a délka, váha a případný označený odhad mají samostatná pole. Čas ze snímku a odhad uloženého času se odlišují pomocí provenance.
- Revír a metoda mají volitelný kontext vycházky u pořízení kamerou. Galerijní datum je volitelný zdroj. Manuální druh, upravená míra, lokalita a metadata zůstávají včetně zdroje. Počasí je doplnění s poctivým fallbackem a posouzenou dobou, GPS volitelné a soukromé.
- AI species a samostatné diary explanation jsou vypnuté. Quick Catch nepoužívá AI. Ve zdroji zůstávají jen výslovně vyžádané příběhy a rady z deníku. Doplnění druhu a připojení vycházky proběhlo skutečnými tlačítky.
- 124 cílených Node testů a Photos PASS. Samostatný desktopový běh 180 kontrol v deseti šířkách, šest offline navigací a úplný restart bez HTTP obnovil JPEG a Catch `ddeb4179-7067-4843-aaad-7d622c6d72aa`. Pokrytí kalendáře, galerie, řazení a filtrů je doplněné zdrojovými a jednotkovými testy. Nepotvrzuje úplné vyzkoušení všech nastavení při plném mobilním běhu.
