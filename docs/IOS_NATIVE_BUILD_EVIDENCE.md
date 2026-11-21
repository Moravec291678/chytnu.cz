# iOS Capacitor · protokol sestavení · Prompt 26

**BLOCKED XCODE / PHYSICAL DEVICE.** Testovací počítač běží na Windows bez Xcode a připojeného iPhonu. Archiv a podpis nevznikly.

- V izolované dočasné kopii prošlo Capacitor copy ios i sync ios. Zkopírovaná webová část a SPM manifest obsahují Capacitor 8.6.0, Filesystem 8.1.5 a Capgo uploader 8.3.26. Bundle ID cz.chytnu.app, verze 1.0 build 1, minimální nasazení iOS 15.0, automatický podpis dosud bez ověřeného týmu. Xcode 26 nebo novější a iOS SDK 26 či novější pro nahrání do App Store Connect. [Apple požadavky](https://developer.apple.com/news/upcoming-requirements/).
- Info.plist deklaruje uživatelsky vyvolanou kameru a foreground polohu českými větami. Široký přístup do knihovny, background location a push entitlement nejsou v aplikaci doložené. Použití systémového výběru ze souboru v WKWebView, aktuální SDK, deep links, stop/start a návrat z OAuth ověřit na zařízení. Nativní shell neregistruje PWA worker.
- Přidán PrivacyInfo.xcprivacy do App resources pro Filesystem a časové údaje souborů v kontejneru aplikace s deklarovaným důvodem C617.1. XML plist se skutečně parsuje, zdrojová reference je v Copy Bundle Resources. Souhrnnou privacy zprávu vytvoř v Xcode nad podepsaným XCArchive včetně všech SDK. [Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem), [Privacy Manifest](https://capacitorjs.com/docs/ios/privacy-manifest).
- 16 cílených testů zdrojové konfigurace, lint, diff check PASS. Produkční preflight Cloudinary sign z capacitor://localhost byl 405 bez CORS. Nativní trasa proto musí mít ověřenou komunikaci s API přes bezpečný HTTPS cíl a plný test cloudové fotografie. Test nepoužil autentizaci ani produkční údaje.

## Další kroky na Macu

1. Na autorizovaném Macu nainstaluj aktuální Xcode z App Store a otevři Settings → Components, ověř iOS SDK a xcodebuild -version. V izolované kopii nastav pouze schválené veřejné klientské proměnné včetně VITE_API_BASE_URL. npm ci, npm run build:ios, npx cap open ios. Příkaz build:ios připraví web a synchronizuje obal, archiv provede Xcode.
2. V Xcode vyber App → Signing & Capabilities, odpovídající Apple Developer Team a cz.chytnu.app. Schválená testovací identita, certifikát a provisioning zůstávají v Keychain, mimo Git. Na fyzickém iPhone povol schválený Developer Mode a připoj bezpečnou testovací instalaci.
3. Ověř kamera/knihovna a HEIC, GPS povolit/odmítnout, klávesnici, safe areas, úpravy v popředí a restart po vypnutí, offline lokální fotografii, nový upload, přihlášení i odhlášení a správný scope dat. Zaznamenej model, OS, build a syntetické ID. Pro App Store archivu po schválení použij Product → Archive a Organizer → Validate App. [Capacitor iOS](https://capacitorjs.com/docs/ios).
