# Bezplatná kapacita a provozní limity · Prompt 20

**PARTIAL.** Read-only Cloud Billing API HTTP 200 pro chutnucz potvrdilo billingEnabled=false. Správný tým Vercel je aktivní Hobby. Vercel Usage odpovědělo Costs not found (404), takže účtovaná nebo historická spotřeba Vercelu v pokusu zůstala nedostupná. Cloudinary capability HTTP 200 dokládá konfiguraci transportu, skutečný tarif a spotřebu musí potvrdit vlastník v Cloudinary Console → Usage. David potvrdil Workers Free bez placených kreditů, konzole účtu ani inference se v tomto promptu nepoužily.

## Závazné hranice

- Cloud Firestore má pro jednu bezplatnou databázi 50 000 čtení, 20 000 zápisů a 20 000 smazání za den, 1 GiB uložených dat a 10 GiB odchozího přenosu za měsíc. Placené TTL deletes a PITR zůstávají mimo rozsah. Expirované Nearby a přítomnost u vody se filtrují v aplikaci i po ponechání starého dokumentu. [Firestore billing](https://firebase.google.com/docs/firestore/pricing).
- Vercel Hobby je pro osobní nekomerční použití. Zahájení komerčního provozu vyžaduje jiné oprávněné řešení. Open-Meteo Free klade vlastní nekomerční podmínku. Katalog a záměr zveřejnění potvrzuje vlastník před pilotem. [Vercel Fair Use](https://vercel.com/docs/limits/fair-use-guidelines), [Open-Meteo](https://open-meteo.com/en/terms).
- Veřejná nabídka Cloudinary Free uvádí 25 měsíčních kreditů, které mohou spotřebovávat úložiště, přenos i transformace. Tato informace neurčuje tarif tohoto účtu. Aplikace má 4 fotky na nový úlovek, 10 MiB na snímek, 20 sign / 30 verify / 120 delivery za minutu na účet. Tvrdý limit při přímém uploadu vyžaduje akceptaci REL-03. [Cloudinary plány](https://cloudinary.com/pricing).
- Workers Free má 10 000 neuronů za den a zastavení dalších operací při vyčerpání. Interní hranice zůstala nejvýše 7 500 celkem, 1 000 pro text a rezervace 350 na textový požadavek. Při výchozích hodnotách se do textového limitu současně vejdou dvě plné rezervace, zatímco vypořádání podle skutečné spotřeby může dostupnost změnit. Druhová AI je vypnutá. Admin nově zobrazuje rozdíl mezi zastavením providerem a kapacitou pod aktuálním interním limitem. [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

## Výpočet kapacity

Předpokládaná denní aktivita 40 % účtů. Jeden denně aktivní uživatel (DAU) vytvoří 0,5 úlovku s 1,2 fotky na úlovek. Příklad 2 MiB na uloženou fotku, tři doručení derivátu po 0,5 MiB, 30 dní bez odmazání. Deník včetně delta sync, krátkého reconnectu a dalších operací předpokládá 80 čtení a 10 zápisů na DAU a den. Sociální scénář přidá 100 čtení a 12 zápisů na DAU, modelově za dvě návštěvy feedu s autorizací detailů, několik interakcí, občasné Nearby a omezený chat. Čísla jsou plánovací předpoklady, dostupnost chatu nebo schopnost obsloužit špičku musí potvrdit samostatný test. Bez čtení velkého počátečního importu, záloh, indexů a mimořádných obnov.

- **10 účtů / 4 DAU** · 320 čtení a 40 zápisů deníku, se sociálnem 720 / 88. Nové fotky za 30 dní 0,14 GiB a doručení 0,11 GiB.
- **20 účtů / 8 DAU** · 640 / 80, se sociálnem 1 440 / 176. Fotky 0,28 GiB a doručení 0,21 GiB.
- **100 účtů / 40 DAU** · 3 200 / 400, se sociálnem 7 200 / 880. Fotky 1,41 GiB a doručení 1,05 GiB.
- **1 000 účtů / 400 DAU** · 32 000 / 4 000, se sociálnem 72 000 / 8 800. Fotky 14,06 GiB a doručení 10,55 GiB. Sociální scénář překročí kvótu čtení.
- **10 000 účtů / 4 000 DAU** · 320 000 / 40 000, se sociálnem 720 000 / 88 000. Fotky 140,63 GiB a doručení 105,47 GiB. I deníkový scénář překročí denní limity Firestore.

## Měření a postup při limitu

- Firestore Monitoring read-only za 21. listopadu 07:06–09:06 místního času vrátil 189 úspěšných čtení a 16 zápisů. Metrika mazání neměla datapoint. Jedná se o malý anonymní provozní vzorek, bez odhadu účtovaných indexových čtení. [Metriky Firestore](https://docs.cloud.google.com/firestore/native/docs/understand-performance-monitoring?hl=en).
- Instrumentovaná vlastní administrativní operace v emulátoru naměřila 5 čtení dokumentu, 1 omezený dotaz diagnostiky a 4 agregace. Feed používá cursor, kandidátní výběr do 21 a nejvýše 20 kontrol přístupu. Inbox omezuje čtení na 250 a sync listener na nejnovější změnu. Před růstem měřit čtení zvlášť při reconnectu, scrollu a při maximalizaci batch operací.
- Při 70 % kvóty (35 000 čtení nebo 14 000 zápisů denně) kontrolovat trendy a pozastavit nové pozvánky. Při 85 % (42 500 / 17 000) schválit omezení volitelných modulů a nové publikace. Základní offline deník, soukromé fotografie, odvolání a výmaz mají přednost. Pro Cloudinary a Vercel použít 70/85 % až po potvrzení skutečných limitů. Nespouštět automatický přechod na placený tarif.
- 45 administrátorských kontrol, 83 Nearby a 22 přítomností v emulátoru. 32 cílených testů, lint a build PASS. Kritérium Safe Pilot čeká na několik dní skutečné spotřeby, Cloudinary Console a přijetí provozního plánu vlastníkem.
