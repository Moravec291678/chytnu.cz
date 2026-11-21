# Provozní příručka ChytnuCz · Prompt 19

Pilotní obsluha používá stávající Vercel, Firebase, Cloudinary a /admin/monitoring. Vlastník potvrdí kontaktní mailbox a zastupující osobu. Produkční plán nepočítá s placeným monitoringem.

1. Po změně a denně v pilotu otevři produkční alias v čistém profilu, přihlašovací obrazovku a veřejné právní stránky. Vercel Deployments má být READY na schváleném SHA. Při potížích se startem zaznamenej čas, status, build a typ zařízení. Firebase Auth ověř s určeným testovacím účtem po povolení živé zkoušky.
2. Vercel Runtime Logs filtruj podle /api/cloudinary/cleanup a události cloud_cleanup. Denní plán je 00:00 UTC. Stav completed potvrzuje doběhnutí funkce. partial_failure a unavailable mají být v pilotu zkontrolovány týž den. Schválené syntetické nahrání sleduj odděleně v testovacím účtu, protože přímý upload do Cloudinary může selhat před aplikační API. Do provozního záznamu přepiš vlastní bezpečný kód a HTTP status bez hlaviček, přihlašovacích údajů a podepsaných URL.
3. V Administrace → Provoz se oprávněným rolím zobrazují oddělené agregáty výmazu fotografií a účtů. Každý dotaz má limit 1 001 a ukáže výsledek do 1 000. Nedostupný nebo přesahující údaj je označený jako nedostupný. Příznak k prověření vyžádá kontrolu již od jedné blokované položky. Čtecí akce nespouští práci ve frontě.
4. AI kapacitu sleduj z agregovaných kódů a denní rezervace. Konfigurace provideru sama nedokládá aktivní inferenci. Údaj o soukromé synchronizační frontě zůstává na zařízení. Testovací uživatel může předat čas, typ chyby, build a počet čekajících změn z Nastavení bez obsahu.
5. Při neúspěšné kontrole použij [triáž](INCIDENT_RESPONSE.md). Pro rollback prohlédni [bezpečný postup](RELEASE_ROLLBACK.md). Produkční runtime log a přijetí upozornění odpovědnou osobou ověř po schválení pilotu.

Test míchal syntetický provider výsledek s privátním identifikátorem a simulovanou chybou. Výstup logu tvořily jen event, stav a povolené číselné počty. Lokální emulátor ověřil stejné počty OWNER a CO_CREATOR a odmítnutí běžného účtu a návštěvníka.
