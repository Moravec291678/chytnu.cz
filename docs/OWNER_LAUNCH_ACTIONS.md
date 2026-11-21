# ChytnuCz · podmínky, které schvaluje David

## Pro soukromou web/PWA betu

- [ ] **Otevření izolované akceptace.** Schval názvy samostatných Firebase a Cloudinary prostředí a neveřejný Vercel projekt pro testy. V GitHubu odsouhlas přesný vývojový SHA pro testování. Pověř Codex ověřením pravidel a provozních přístupů a výslovně schval dva syntetické účty a limitovaný živý upload, doručení, revokaci a úklid. Před autorizací stačí identita projektů a potvrzení bezplatného tarifu. [Přesný postup izolace a A/B průchodu](QA_CLOUDINARY_LIVE.md)
- [ ] **Výběr režimu.** Vercel → izolovaný projekt → Settings → Environment Variables → Preview. Položka `VITE_PRIVATE_JOURNAL_PILOT=1` se nastaví při přípravě schváleného prostředí a vyžádá čerstvý build. Na stejném SHA ověř, že běžný uživatel otevře deník a API odmítne přímé veřejné profily, sdílení, chat a další sociální akce. První pilot může obsahovat soukromý deník, fotografie, synchronizaci, výlety, export a účet. Sociální beta a obchody mají vlastní přijetí. Konečný výběr rozsahu a `main` potvrzuje David po živé akceptaci.

- [ ] **Rozsah.** Potvrď soukromý rybářský deník jako první veřejně testovatelnou variantu. Rozhodni, které rozpracované sociální vstupy se mají uzavřít také serverově. Navržený pilot je 10–20 pozvaných testerů po dokončení akceptace. Mapy, katalog a počasí schval samostatně podle zdroje a licence.
- [ ] **Přístupy a skutečné tarify.** Ve Firebase Console → Project settings a Firestore → Usage/Rules, ve Vercel → Project/Team settings a Usage, v Cloudinary Console → Settings/Usage ověř projekt, regiony a kvóty. Zapiš jen názvy, statusy a limity. Umožni Codexu ověřit konfiguraci v rozsahu přijatelném pro tebe. Nevkládej do chatu klíče, session cookies ani service-account JSON. Tarif nebo billing měň jen po samostatném rozhodnutí.
- [ ] **Testovací účty a skutečné telefony.** Založ nebo označ dva výslovně testovací účty pro izolované prostředí s poskytovatelem. Na iPhonu otevři aplikaci v Safari → Sdílet → Přidat na plochu, na Androidu v Chrome → Instalovat aplikaci. Ulož testovací JPEG i HEIC, zkontroluj fotky na počítači, zapni režim Letadlo, napiš úlovek, ukonči a otevři PWA, obnov síť. Nech dokončit synchronizaci, ověř fotky, editaci a smazání z druhého zařízení. Testovací soubor nepoužívej s osobními souřadnicemi.
- [ ] **Podpora.** Potvrď kontaktní adresu a schopnost vyřídit export/výmaz a bezpečnostní hlášení. Urči kdo dostane upozornění, kdo vrátí webovou verzi a kdo je záloha. Nabízená kapacita, provozní časy a retence musí odpovídat realitě.
- [ ] **Právní rozhodnutí.** Nech posoudit rozsah zveřejňování, právní postavení správce, zpracovatele a přenosy, práva uživatelů, retenci, zásady pro děti, RIS a zobrazení rybářských pravidel, počasí a OSM. Pokud je součástí sociální beta, nech posoudit rozsah povinností DSA a nastav moderaci, blokace, stížnosti a oprávnění k obsahu. [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj) · [DSA](https://eur-lex.europa.eu/eli/reg/2022/2065/oj).
- [ ] **Rozšíření.** Schval zprávu o týdnu pilotu, trvale udržitelný rozpočet a případné zaškrcení kvót. Počítej s tím, že stávající Vercel doména už je živá. Otevření bety znamená řízenou akceptaci a nábor. Vlastní doména je volitelná, pokud hostitelské URL a OAuth splní pilotní požadavky.

## Pouze pro obchody

- [ ] **Android.** Play Console → registrace/ověření → App signing → Internal testing. Schval registrační poplatek, podmínky, vlastnictví upload klíče, skutečné údaje Data safety a veřejné URL výmazu. Dolož účast 12 testerů 14 dní, pokud to režim osobního účtu požaduje. Pozdější než web. [Google Play](https://support.google.com/googleplay/android-developer/answer/6112435) · [Testování](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
- [ ] **iOS.** Apple Developer → Enrollment → App Store Connect → TestFlight. Schval členství, vlastníka týmu, signing, App Privacy a odeslání k review. Zajisti Mac a fyzický iPhone, případně iPad. Členství je povinné až pro požadovanou distribuci, web ho nepotřebuje. [Apple](https://developer.apple.com/programs/enroll/).
- [ ] **Rozšíření o další placenou službu.** Pouze pokud pilot doloží nutnost a odsouhlasíš rozpočet, nebo ji nahraď omezením feature/kapacity. Případné sdílení dat s externí AI schval odděleně po popisu účelu, dat, logování a nákladů.

## Delegovatelné kroky

Codex může připravit emulátor, syntetický foto scénář, build a testovací inventář, dokumentovat konzole bez hodnot klíčů, zavést měření bez osobních dat, připravit rollback a vyplnění store formulářů. Vlastník potvrzuje identity, licence, právní přesnost, výběr plánu a držená oprávnění. Odborník na ochranu údajů nebo právník posoudí otázky GDPR/DSA podle skutečného provozu.

[Zpráva](PUBLIC_LAUNCH_READINESS.md) · [Pořadí kroků](PUBLIC_LAUNCH_BACKLOG.md) · [Mobilní checklist](MOBILE_STORE_RELEASE_CHECKLIST.md).
