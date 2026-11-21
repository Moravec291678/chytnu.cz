# QA živého Cloudinary · Prompt 06

**BLOCKED · 21. listopadu 2026.** Produkční capability vrací HTTP 200 a enabled. Je to kontrola konfigurace, živý upload ani doručení z ní nelze vyvodit. Test Photos a 128 cílených testů foto normalizace, infrastruktury, uploadu a synchronizace prošly. Auth/Firestore simulují READY a doručení po opětovném načtení. Nebyl použit vyhrazený živý účet ani zavolán placený poskytovatel.

## Jediný živý akceptační průchod

1. David potvrdí izolované prostředí REL-02 s Cloudinary a jeho kapacitu, dva běžné účty A/B povolené jen pro syntetické záznamy a termín úklidu. Na dvou zařízeních nebo izolovaných profilech A1/A2 přihlaš tentýž účet A. B zůstane oddělený pro odepření přístupu. Do protokolu ulož release SHA, režim Firebase a čas zahájení.
2. Připrav neosobní JPG, PNG, podporovaný HEIC a další JPG s jiným časem pořízení. Do úlovku A přidej čtyři v jedné dávce, zkontroluj normalizaci JPEG, orientaci, rozměry, pořadí a místní uložení. Za úkon kontroluj před/po Catch ID a seznam foto ID. Po každém kroku zapisuj stav, HTTP kód a důvod případné chyby. Provider asset ID porovnávej pouze v oprávněné konzoli a ve výstupu sdílej maskované identifikátory.
3. U dalšího snímku přeruš připojení po zahájení uploadu, zavři zobrazení, otevři znovu a obnov síť. V DevTools sleduj sled sign → provider upload → verify-upload → metadata READY → delivery. Při 401 ověř obnovu relace, u 403 očekávej odmítnutí nesprávného účtu, 429 nebo CORS zdokumentuj a test dál nemačkej bez diagnózy. Chybný formát a limit otestuj v rámci testu klienta. Nepřekračuj kvótu.
4. Na čistém A2 otevři tentýž Catch. Očekává se stejný seznam ID, skutečný vykreslený obrázek s nenulovou šířkou, prázdná fronta a žádný nový Catch nebo duplicitní foto. B nedostane privátní foto přes UI ani autorizované čtení. Porovnej bezpečně správnou velikost, typ a shodu foto metadat; nikdy do protokolu nevkládej podpisy, bearer odkazy, originály a tokeny.
5. Testovací úlovek smaž ve schváleném sandboxu, zaznamenej stav cleanup jobu a ověř definitivní absenci assetu dle Promptu 07. Nečisti provider podle širokého prefixu. Do protokolu napiš pouze čas potvrzení, maskované ID a počet před/po. Oprávněná obsluha provider konzole potvrdí výsledek bez zásahu do jiného účtu.

[Obnova sync](QA_SYNC_RECOVERY.md) · [Stav vydání](RELEASE_EXECUTION_STATE.md).
