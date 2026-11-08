# Smart Quick Catch, osobní analytik a AI spolehlivost — 8. 11. 2026

## Dokončené milníky

- Zachována jedna lokální foto/datová fronta. Automatické AI rozpoznání má samostatný souhlas pro nové rychlé úlovky od okamžiku jeho udělení. Uložení nečeká na síť/model. Úlohy čekají na nahraný snímek, připojení a povolenou kapacitu; pokračují po probuzení aplikace, nikoli se slibem iOS background běhu.
- Job a návrh jsou oddělené od potvrzeného Catch druhu, trvalé v owner-scoped APP_META; serverový výsledek je v existující aiResults cache. Fotografie se identifikuje SHA, Catchem, vlastníkem a modelem. Firestore transakční lease brání souběžným Vercel instancím a kontroluje i výsledek dopsaný po původním cache read. Potvrzený/ručně vymazaný druh, nová fotografie, smazání Catch/účtu a revokace brání pozdním zápisům.
- Čekající úlohy mají odklad a omezení tří přechodných pokusů na den; tvrdé kvóty čekají na serverem určený reset. Neznámý provider429 se neoznačuje za prokázanou kapacitu ani za prokázaný denní limit. Osiřelé lokální joby se promazávají, nové Catchy tím nezanikají.
- Explicitní Trip defaults: vlastní uložená voda a katalogové nástrahy. Historické importované fotografie nedědí aktuální vycházku. Bez ověřeného zdroje zůstává voda neurčená; nejbližší voda se nevybírá.
- Přidány vlhkost, směr/nárazy větru, srážky, oblačnost, WMO podmínky a tříhodinová změna tlaku, pokud existuje souvislá UTC řada. Model počasí má zdroj a čas; není označovaný za přímé měření. Extended envelope zůstává přísně normalizovaný v existujícím JSON limitu4096B. Přibližný výpočet Slunce/Měsíce vyžaduje skutečný čas/polohu. Teplota vody/průtok/hladina se nevymýšlejí.
- Editor zachovává sekundy původního capture při nezměněné minutě. Změna času/polohy zahodí staré automatické počasí a znovu ho vyžádá; ručně zadané hodnoty a ruční vymazání zůstávají chráněné. Rozšířený Catch Detail ukazuje jen známé údaje a kompaktní stav doplnění.
- Osobní Home analytik porovnává kombinace čas×druh×metoda, voda×nástraha, délky stejného druhu/metody, zaznamenané počasí, měsíční posuny, vývoj délky/PB a známou délku dokončených vycházek včetně nulových. Pracuje s vícedenními vzorky, skutečnými čitateli/jmenovateli a odkazy. Malý vzorek vede ke konkrétnímu pokusu navázanému na skutečný záznam, ne k vymyšlenému vzorci.
- Home vybírá více kandidátů podle síly/dostupných podkladů a uchovává historii zobrazení. AI vykládá nejsilnější deterministický kandidát; číselná tvrzení zůstávají výsledkem výpočtu. Do modelu nejdou jména vod, GPS, poznámky ani ID záznamů. Generování je výslovným tlačítkem; žádná Home inference při mount/render/refresh. Trvalá cache zahrnuje vlastníka, sémantický fingerprint, verzi výpočtu/modelového kontraktu, consent revision a datum; odvolání, lokální výmaz, přepnutí účtu a změna podkladů ji zneplatňují.
- Opraven bonus prvního druhu u neurčeného Quick Catch. Návrh sám nepřidává potvrzený druh do statistik, mastery ani druhových rekordů. Staré již udělené XP se destruktivně nepřepisují.

## Přesná diagnóza staré hlášky a nulový rozpočet

Ve zdroji1ae97bb vracela createZeroCostQuota jediné false při osobním1/den, globálním3/den, provider circuit breakeru, poškozeném počítadle i výpadku Firestore. API z toho vždy dělalo rate_limited a klient hlášku o příliš mnoha požadavcích. Providerovy chyby se mezitím slévaly do jiného ai_unavailable. To prokazuje chybnou klasifikaci a velmi restriktivní aplikační limit; historické UI bez původní telemetry nedokazuje, které konkrétní počítadlo danému uživateli odmítlo požadavek. Není poctivé tuto chybějící informaci připsat přetíženému Cloudflare.

Nyní jsou odděleny user_daily_limit, app_daily_limit, text_daily_limit, provider_quota3036, provider_capacity3040, provider_throttled bez známého kódu, timeout, auth/config, nevalidní odpověď, chybějící fotografie a consent. Bezpečné logy obsahují pouze schválené kódy/HTTP status; nikdy payload, souřadnice, poznámky, autorizaci ani tokeny. Čas resetu UTC00 se uvádí jen u známé aplikační/denní kvóty. Ostatní odklady jsou vlastní cooldown, nikoli slib resetu poskytovatele.

Globální atomický rozpočet7500 zůstává. Obraz rezervuje2500, omezený text350; souhrnný textový rozpočet1000 dovoluje nejvýše dvě textová generování celé aplikace za UTC den a zachovává prostor nejméně pro dvě fotografie. Osobní rozpočet5000 dovoluje dvě fotografie, nebo fotografii a dvě textové úlohy, podle zbývající globální kapacity. Maximem jsou tři fotografie bez textu, případně čtyři smíšené úlohy (dvě fotografie+dva texty). Není slib rozpoznání každé fotografie tentýž den. Cache a status nic z modelového rozpočtu nespotřebují. Selhání po rezervaci se nevrací: timeout může být již zpracovaná inference. Nečitelný/chybějící snímek a revokace během jeho získání se odhalí před rezervací.

Plánovací rezerva vychází z aktuálně připnutého Gemma4:9091neurons/Minput a27273/Moutput, context256000, max_completion_tokens512. Texty mají nejvýše32768UTF8B;350 je konzervativní plánovací hodnota včetně režie. Nejde o měření skutečně účtovaných neuronů. Skutečnou tvrdou hranicí0CZK zůstává vlastníkem potvrzený Workers Free bez Paid a bez předplacených kreditů. Nezapnula se fakturace, Blaze, Gateway ani náhradní placený model.

Oficiální zdroje ověřené8.11.2026: [ceník](https://developers.cloudflare.com/workers-ai/platform/pricing/), [model a max_completion_tokens](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/), [chybové kódy](https://developers.cloudflare.com/workers-ai/platform/errors/).

## Doklady a praktické hranice

Dřívější skutečné vision volání5.11.2026 vrátilo HTTP200 commonCarp na veřejné USFWS fotografii (viz AI_FIXTURE_ATTRIBUTION.md). V této úpravě nebyl kvůli omezené sdílené kvótě opakován. Nové automatické workflow, textový Home výklad, rozšířené počasí a současné provider chyby mají cílené automatické testy; tyto testy nejsou vydávané za nový živý provider nebo Cloudinary test. Fyzický iPhone, instalovaná PWA close/reopen a reálné online automatické rozpoznání po skutečném nahrání zůstávají fyzickou/produkční akceptací.

UI kontrola je rozepsaná v UI_AI_ROUTE_AUDIT.md. Všech48 základních tras otevřel UI agent; plné přihlášené a všechny dynamické stavy nebyly dostupné. Odpovídající vizuální části se neoznačují jako ověřené fyzickým zařízením.

## David — jednorázové zapnutí

Na https://chytnu-cz.vercel.app se přihlas. Nastavení → Umělá inteligence a místní postřehy → povol Rozpoznávání druhů ryb z fotografie a Automaticky rozpoznávat ryby z fotografií nových rychlých úlovků → Uložit souhlas s AI. Nastavení nevyvolá analýzu starých úlovků. Pro novou fotografii stačí Rychlý úlovek; po uložení ji lze odložit. Při offline/suspendovaném PWA se dokončení ověří po opětovném otevření a synchronizaci. Návrh AI lze později potvrdit nebo upravit v editoru. Žádné další klíče ani placené služby nejsou potřeba.

## Validační doklady tohoto vydání

npm run lint PASS; npm test937/937PASS; npm run build PASS a client-secret scan124assetsPASS; npm run test:sync PASS včetně Quick Catch/second-device simulace; npm run test:photos PASS; npm run test:rules15/15PASS; npm run test:auth PASS; npm run product PASS; git diff --check PASS. Emulator/syntetická data se neoznačují za live Cloudinary ani fyzický iPhone. Před pushem se explicitně zařazují pouze zamýšlené soubory; logy jsou mimo commit. Produkční SHA/READY se ověřují až po odeslání posledního commitu.
