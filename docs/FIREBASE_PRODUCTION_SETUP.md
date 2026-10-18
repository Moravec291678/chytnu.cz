# Firebase staging a production setup

Kód rozlišuje `emulator`, `staging` a `production` přes `VITE_BACKEND_MODE`. Chybějící nebo neúplná cloudová konfigurace skončí viditelnou chybou; nikdy se tiše nepřepne z emulátoru do cloudu. Staging a produkce musí být dva samostatné Firebase projekty.

## Staging

1. V konzoli Firebase vytvoř samostatný projekt určený jen pro staging.
2. Pro Firestore a Storage zvol evropský region podle očekávaných uživatelů a požadavků na umístění dat. Region po vytvoření nejde jednoduše změnit.
3. V Authentication zapni Email/Password. Google zapni až po nastavení autorizovaných domén a OAuth consent screen.
4. Vytvoř Firestore databázi a Storage bucket ve zvoleném regionu.
5. Nasaď a znovu otestuj [firestore.rules](../firestore.rules) a [storage.rules](../storage.rules). Projekt zatím nepotřebuje vlastní indexy; při budoucí změně dotazů ulož požadované indexy do repozitáře.
6. Nastav odesílatele, doménu a české šablony pro ověření e-mailu a obnovu hesla. Ověř doručení do běžných poskytovatelů.
7. Nastav rozpočtové upozornění a denní kontrolu Auth, Firestore a Storage využití. Aktivaci billingu musí schválit vlastník.
8. Do prostředí Vercel Preview vlož hodnoty z `.env.example`, `VITE_BACKEND_MODE=staging` a stagingový web config. Service account do Vercelu ani frontendu nepatří.
9. Proveď smoke test: registrace, ověření, login/logout, Catch s fotografií a GPS, Trip, sync na druhém izolovaném klientu, konflikt, smazání/tombstone a obnova zálohy.

## Production

1. Vytvoř nový produkční Firebase projekt; nekopíruj testovací uživatele ani data.
2. Zvol a zdokumentuj evropský region před vytvořením Firestore a Storage.
3. Zapni jen schválené Auth providery. Přidej produkční doménu do Authorized domains a dokonči Google OAuth branding/consent.
4. Nasaď stejné ověřené rules. Před prvním uživatelem zopakuj emulator testy a bezpečnostní review diffu pravidel.
5. Nastav skutečné e-mailové šablony, support adresu a redirect URL na produkční HTTPS doménu.
6. Nastav budget alerty, kvóty, vlastníka incidentů a plán reakce na růst Storage fotografií.
7. Ve Vercel Production nastav `VITE_BACKEND_MODE=production` a produkční web config. `VITE_FIREBASE_GOOGLE_AUTH_ENABLED=true` použij až po ověření provideru.
8. Ověř export, smazání účtu a dat podle `ACCOUNT_DATA_LIFECYCLE.md`; bez důvěryhodného serverového mazání není veřejná účtová verze připravená.
9. Proveď smoke test na čistém účtu a na dvou zařízeních. Zkontroluj Firestore, Storage, tombstones, e-mailové odkazy, náklady a logy.

## Tajné údaje

Firebase web config je identifikace klienta, nikoli administrátorský klíč; přístup chrání Auth a Security Rules. Do frontend env nikdy nepatří service-account JSON, private key, refresh token, Admin SDK credential ani heslo.
