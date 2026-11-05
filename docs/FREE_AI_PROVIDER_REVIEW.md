# Bezplatná AI pro ChytnuCz — ověření poskytovatelů

Ověřeno z aktuálních oficiálních stránek **5. 11. 2026** a jediným skutečným serverovým požadavkem na veřejnou fotografii USFWS. Nebyly použity zákaznické záznamy ani soukromé fotografie; nebyla aktivována fakturace. Vlastník výslovně potvrdil Workers Free bez placených služeb a AI kreditů.

## Rozhodnutí

Nejvhodnější nalezený kandidát pro skutečně bezplatné hostované zpracování je **Cloudflare Workers AI na Workers Free** s modelem **`@cf/google/gemma-4-26b-a4b-it`**. Cloudflare model uvádí s podporou obrázků i textu a výslovně jej řadí mezi modely dostupné na Free. Google k němu odkazuje licenci Apache 2.0. Nejde o Gemini API, jehož podmínky jsou jiné. Schopnost rozlišovat podobné české ryby a kvalita českého vyprávění však nebyly prakticky ověřeny; samotný katalog tyto výsledky nedokazuje. [Model](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/), [dostupnost na Free](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/), [licence](https://ai.google.dev/gemma/apache_2), [model card Googlu](https://ai.google.dev/gemma/docs/core/model_card_4).

Skutečná inference nyní prošla (viz záznam níže). Denní statistiky a místní doporučení nadále fungují deterministicky bez externí AI. Generované vysvětlení je oddělený návrh, který vyžaduje souhlas; nic samo nemění ani nezveřejňuje.

## Cena, limity a soukromí

| Varianta | Aktuálně ověřená bezplatná možnost | Rozhodnutí pro rozpočet 0 Kč |
|---|---|---|
| Cloudflare Workers AI, Workers Free | 10 000 neuronů za den; po vyčerpání další operace selžou | Kandidát, pouze skutečný Free účet bez upgradu či předplacených kreditů |
| Gemini API pro českou aplikaci | Podmínky vyžadují Paid Services pro klienty dostupné v EHP | Neaktivovat |
| Hugging Face Inference Providers | Aktuální živý ceník uvádí pro Free účty **žádné** měsíční kredity | Neaktivovat placené inference |
| Lokální ONNX/Transformers.js | Bez poplatku za inferenci na zařízení; stažení modelů a zařízení mají své nároky | Technicky možné; samostatně ověřit model, licenci, přesnost a iPhone |

Cloudflare limit se obnovuje v **00:00 UTC**, v Praze 01:00 v zimě / 02:00 v létě. Jde o neuronový limit účtu, nikoli příslib určitého počtu fotografií. Workers Paid umožňuje zpoplatněné překročení; pro tuto aplikaci jej nezapínat. Některé jiné modely vyžadují platbu i před vyčerpáním kvóty. Oficiální produktová stránka uvádí zahájení bez platební karty. [Ceník a tvrdé omezení Free](https://developers.cloudflare.com/workers-ai/platform/pricing/), [bez platební karty](https://www.cloudflare.com/products/workers-ai/).

Cloudflare pro standardní nestavové inference uvádí nepoužívání obsahu k tréninku a neuchovávání vstupů/výstupů po nezbytném zpracování. Existují právní a bezpečnostní výjimky; mohou zůstávat provozní metadata. Zapnuté logování, cache, batch či jiné stavové funkce mají vlastní pravidla. Nesmíme slibovat absolutní nulovou retenci nebo zpracování výhradně v EU. Fotografie vyžaduje výslovný souhlas; GPS a EXIF se nemají posílat. [Pravidla zpracování](https://developers.cloudflare.com/workers-ai/platform/data-usage/).

Gemini podmínky dále omezují klienty pravděpodobně používané nezletilými. Pro EHP vyžadují placenou službu, tedy rozpor se zadáním bez aktivace fakturace. Žádný Gemini klíč se proto nemá vytvářet pro tuto cestu. [Aktuální podmínky](https://ai.google.dev/gemini-api/terms).

Hugging Face má ve vyhledávačích stále starší úryvky s $0.10 kreditem. Přímé otevření aktuálního ceníku však uvádí **Free Users: None**. Nezaměňovat bezplatné stažení vah za bezplatnou hostovanou inferenci. Samostatné Inference Endpoints vyžadují platební metodu. [Živý ceník](https://huggingface.co/docs/inference-providers/pricing), [Endpoints](https://huggingface.co/docs/inference-endpoints/guides/access).

## Lokální rozpoznávání ryb a čeština

Existuje relevantní Fishial projekt s MIT licencí repozitáře a publikovanými TorchScript klasifikátory. Seznam tříd obsahuje například `Cyprinus carpio`, `Esox lucius`, `Sander lucioperca`, `Rutilus rutilus` a `Silurus glanis`, takže má věcný průnik s katalogem ChytnuCz. To není důkaz přesnosti na našich snímcích ani doklad licence všech samostatně hostovaných checkpointů. Je nutné spárovat konkrétní checkpoint s odpovídajícími labels, ověřit jeho licenci, export ONNX, předzpracování a velikost. Současná dokumentace/README různých verzí uvádí rozdílné počty tříd; nelze svévolně kombinovat jejich váhy a indexy. [Oficiální repozitář](https://github.com/Wye-Foundation/Fishial-Fish-Identification), [labels](https://raw.githubusercontent.com/Wye-Foundation/Fishial-Fish-Identification/main/labels.json).

Fishial vlastní FAQ uvádí bezplatné API, současně popisuje vydané modely jako desktop/server. Pro API nebyl ověřen dostatečně přesný tvrdý provozní limit a smluvní režim soukromých fotografií; proto jej neaktivovat pouze na základě slova „free“. [FAQ](https://www.fishial.ai/help-center), [API dokumentace](https://docs.fishial.ai/api/api_reference).

Pro lokální text je realistický výzkumný kandidát **Qwen3-0.6B**: původní model uvádí Apache 2.0, rodina zahrnuje češtinu a existuje převod pro Transformers.js. Jen soubor `model_q4f16.onnx` v aktuálně zveřejněném převodu má přibližně **570 MB**; tokenizer a běhová paměť jsou navíc. Nejde o vhodnou automatickou součást rychlého pořízení úlovku. Dobrá čeština, zachování faktů a přijatelná odezva na iPhonu nebyly tímto průzkumem měřeny. [Původní model](https://huggingface.co/Qwen/Qwen3-0.6B), [podporované jazyky](https://qwenlm.github.io/blog/qwen3/), [ONNX použití](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX), [konkrétní soubory](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX/tree/main/onnx).

Transformers.js může používat WASM nebo WebGPU. Podpora Safari závisí na verzi a sama o sobě neprokazuje funkční iPhone PWA. ONNX Runtime pro více vláken vyžaduje podporu prohlížeče a cross-origin isolation; bez toho je nutný vhodný fallback. Ověření musí zahrnout paměť, zrušení inference, chování při uzamčení telefonu, offline načtení skutečně uložených vah a běh po restartu. [WebGPU](https://huggingface.co/docs/transformers.js/guides/webgpu), [ONNX nastavení](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html).

## David: bezplatný Cloudflare účet a klíč

Níže uvedené názvy nabídek jsou ověřené z aktuální oficiální dokumentace, nikoli přihlášením do Davidova účtu. Pokud účet vyžádá kartu, placený plán nebo kredity, tento krok zastavit; nic z toho není schváleno.

1. Otevři [Cloudflare dashboard](https://dash.cloudflare.com/), přihlas se nebo vytvoř bezplatný účet. Vyber účet, který bude mít **Workers Free**. Nepřidávej kartu a nevybírej Workers Paid. Není nutné převádět doménu ani vytvářet nový Worker: Vercel server může volat REST API přímo.
2. Otevři **Workers AI** → **Use REST API**.
3. Zvol **Create a Workers AI API Token**, zkontroluj předvyplněná oprávnění, pak **Create API Token** → **Copy API Token**. Ručně vytvořený token musí mít `Workers AI - Read` a `Workers AI - Edit` pro správný účet. Použij úzký token pro tuto aplikaci, nikoli globální API klíč.
4. V části **Get Account ID** zkopíruj **Account ID**. Ověř na přehledu Workers AI, že kvóta a plán odpovídají Free. Ulož si token bezpečně, neposílej ho do chatu ani Gitu. [Oficiální postup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/).

Potvrzené názvy této integrace jsou `CLOUDFLARE_ACCOUNT_ID`, serverové tajemství `CLOUDFLARE_API_TOKEN`, `AI_PROVIDER=cloudflare` a `AI_CLOUDFLARE_MODEL=@cf/google/gemma-4-26b-a4b-it`. David mezitím oznámil jejich nastavení ve Vercelu; tento průzkum tajné hodnoty nečte. Samotná konfigurace nenahrazuje ověření účtu Workers Free, skutečný test modelu, souhlas uživatele ani kontrolovaný release. Konečný stav aktivace patří do aktuálního release reportu. Nepřidávej Gemini konfiguraci.

5. Otevři [Vercel dashboard](https://vercel.com/dashboard), vyber projekt připojený k `Moravec291678/chytnu.cz` a otevři **Environment Variables** v postranním panelu projektu. Přidej potvrzené proměnné adaptéru pro **Production**; token ulož jako **Secret**. Nepoužívej `VITE_` ani veřejné proměnné.
6. Ulož změny. Nové proměnné vyžadují nové nasazení; na staré deploymenty se automaticky nepromítnou. [Oficiální nastavení](https://vercel.com/docs/environment-variables/managing-environment-variables).
7. Po uložení proměnných dej Codexu vědět pouze, že je konfigurace připravená; tajné hodnoty neposílej. Codex následně ověří nesoukromý český text a legálně použitelný testovací snímek, strukturovaný výstup, nejistotu a případnou chybu kvóty. Žádný test nesmí použít placený fallback. Aktivace vyžaduje kontrolovaný release zdrojových příznaků, souhlasu a právního oznámení; nejde jen o přepnutí proměnné. Teprve úspěšný skutečný požadavek opravňuje označení modelu za ACTIVE.
8. U jednotlivých funkcí se poté zapne nabídka souhlasu v aplikaci. Model nikdy nesmí přepsat ručně potvrzený druh či poznámky bez schválení. Po selhání nebo vyčerpání kvóty zůstane dostupné lokální ukládání, deterministický přehled a deník.

## Podmínky tvrdého nulového rozpočtu

- Použít samostatný Workers Free účet bez platební metody/upgradu; přihlášený stav plánu musí být doložen vlastníkem nebo bezpečně ověřen před aktivací.
- Připnout jeden ověřený model; žádné automatické přesměrování na jiného poskytovatele nebo placený model.
- Uplatnit autentizaci, vlastnictví, souhlas, omezenou velikost vstupů a výstupů, souběžnost a limity uživatele i celé aplikace. Samotný počet požadavků nelze prezentovat jako přesný neuronový rozpočet.
- Při providerově chybě kvóty přestat opakovat a počkat do dalšího bezplatného období. Nepoužívat placené navýšení.
- Zašifrované tajemství patří pouze do serverového prostředí; diagnostika nesmí obsahovat fotografie, GPS, deník či klíče.
- Dokumentované limity se týkají AI služby. Nejsou příslibem neomezeného bezplatného provozu existujícího hostingu, databáze nebo fotografického úložiště. Žádné jejich placené změny nejsou součástí tohoto návrhu.

## Podklady k oznámení v aplikaci

Aktuální zásady v `src/pages/legalDocuments.js` popisují poskytovatele, dobrovolný souhlas pro každou funkci, odvolání, zpracování zbavené nepotřebných metadat, ruční potvrzení návrhů a export/výmaz účtových údajů. Text používá podmíněné formulace dostupnosti, takže netvrdí úspěšné zapnutí před skutečným testem.

V aktuálně otevřených Cloudflare podmínkách nebyl nalezen stejný obecný zákaz pravděpodobně nezletilých uživatelů jako v Gemini API. Toto zjištění není právním stanoviskem ani nezbavuje provozovatele povinností pro souhlas nezletilých; aplikace zachovává vlastní informaci o věku a potřebném souhlasu zákonného zástupce. Apache 2.0 licence Gemma 4 umožňuje i komerční použití při splnění licenčních podmínek. Cloudflare self-serve smlouva pro evropské osobní údaje odkazuje DPA; z něj nelze dovozovat výhradní umístění zpracování v EU. [Licence](https://ai.google.dev/gemma/apache_2), [Cloudflare smlouva, část 6.1](https://www.cloudflare.com/terms/), [DPA](https://www.cloudflare.com/cloudflare-customer-dpa/).

Před zapnutím každé funkce musí oznámení odpovídat skutečné implementaci: fotografie samotné mohou ukazovat osoby/místo i po odstranění EXIF, poznámka může obsahovat uživatelem napsané osobní údaje a již odeslaný požadavek nelze odvoláním souhlasu vzít zpět. Smazání lokálně přijatého textu a smazání poskytovatelových provozních záznamů nejsou totožné operace. Tyto rozdíly se nesmějí skrýt za tvrzení „žádné údaje se neukládají“.

## Skutečný test a vydání 5. 11. 2026

- Čtyři požadované proměnné ověřeny jako šifrované v Production projektu chytnu-cz. Dodatečná AI_ZERO_COST_CONFIRMED=true vychází z výslovného potvrzení vlastníka. Žádná tajná hodnota nebyla vypsána ani zapsána do repozitáře.
- Původně přerušené nasazení dpl_DLAPj1Lomp9qnjoTD2HwzBC5MsW6 bylo READY, ale mělo commit32565fa, nikoli místní změny.
- Testovací commit511d083, nové nasazení dpl_96TUn9HyZoxJMjmb8ADdH4RRLGof READY. Jediné skutečné modelové volání přes autentizovanou serverovou diagnostiku: veřejná fotografie kapra USFWS, zbavená metadat. Výstup HTTP200: {"status":"suggestion","speciesKey":"commonCarp","confidence":0.95,"alternatives":[],"fishCount":1}. Skóre není kalibrovaná pravděpodobnost. Předchozí pokus skončil na ochraně Vercel401 a poskytovatele nevolal.
- Dočasný přístupový klíč odstraněn po testu; obsluha operator_check/operator_fish_check se ve finálním zdroji odstraňuje. Fixture je archivována pouze v tools/fixtures/ai, mimo veřejný web a offline cache.
- Výsledek dokazuje dostupnost účtu/modelu, obrazový vstup a validní strukturovaný návrh na jednom snímku. Neprokazuje obecnou přesnost ryb, kalibraci skóre, kvalitu českých historek ani chování fyzického iPhonu. Samostatné živé textové volání nebylo provedeno, protože zadání dovolilo právě jeden omezený test. Textové operace mají automatické testy kontraktu/validace/bezpečnosti a používají stejný ověřený endpoint/model.
- Produkční obsluha získává data pouze serverově po Firebase ověření vlastníka a samostatném souhlasu pro danou funkci. Fotografie JPEG se ověřují hashem a zbavují metadat. Textové úpravy jsou návrhy; druh vyžaduje potvrzení v editoru. Ruční text lze přijmout jen atomicky proti původní poznámce a revizi; smazaný úlovek nevznikne znovu.
- Limit je záměrně malý: jedna nová inference na účet za UTC den a tři pro celou aplikaci, se společnou transakční rezervací (ne skutečné měření neuronů); cache nečerpá další inferenci. Jedno dnešní místo spotřeboval ověřovací snímek. Tvrdou hranici nákladů tvoří Workers Free bez upgradu. Při vyčerpání aplikace odmítne další volání; bez placeného fallbacku či opakování.
- David: v aplikaci Nastavení → Umělá inteligence a místní postřehy → dobrovolně vyber funkce a Uložit souhlas s AI. Žádná další konfigurace klíčů ani placený účet nejsou potřeba. Pro vlastní kontrolu přijatelnosti použij nejprve jednu funkci; denní limit je společný všem čtyřem.
