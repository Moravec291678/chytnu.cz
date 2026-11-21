# App Store a TestFlight

Stav k 21. 11. 2026 · **BLOCKED**. Bez podepsaného archivu, fyzického iPhonu a přístupu k Apple Developer účtu. Technický výchozí bod a ověřené výsledky z Windows jsou v [iOS Native Build Evidence](IOS_NATIVE_BUILD_EVIDENCE.md).

## Kandidát a App Store Connect

- Název ChytnuCz. Bundle ID `cz.chytnu.app`. Minimum projektu iOS 15. Finální verze, číslo sestavení, SHA kandidáta, Apple Team ID, podpis a UUID archivu jsou k doplnění z ověřeného buildu. Upload vyžaduje Xcode 26 s iOS SDK 26 nebo novější. [Požadavky Apple](https://developer.apple.com/news/upcoming-requirements/)
- David v Apple Developer ověří členství, roli Account Holder nebo přidělené oprávnění, smlouvy a App ID. V App Store Connect otevře Apps → New App nebo existující záznam, vybere bundle ID a zadá vlastní SKU. Pokud chybí členství, registrace může být placená a vyžaduje samostatné rozhodnutí vlastníka. [Registrace Apple](https://developer.apple.com/programs/enroll/)
- Na Macu v Xcode otevřít `ios/App/App.xcodeproj` → Signing & Capabilities → vybrat schválený Team. Ověřit archiv a provisioning pro distribuci v Organizeru. Zkontrolovat souhrnný privacy report ze skutečného archivu včetně SDK. V repu je deklarace přístupu k datům souborů v sandboxu s důvodem C617.1. Do sign-off uložit verzi, build, SHA, team a výsledek Validate App.
- V App Store Connect vyplnit App Privacy podle skutečně zapnutých cest a dat aplikace i partnerů. K ověření patří účet, fotografie, obsah deníku, poloha a služby Firebase, Cloudinary a případně Cloudflare pro výslovně povolené textové AI. Rozlišit shromáždění, vazbu na identitu a zveřejnění. [App Privacy](https://developer.apple.com/app-store/app-privacy-details/)
- App Information → Age Rating vyplnit podle dostupného obsahu výsledného buildu. Pro distribuci v EU vyplnit obchodní status pouze podle údajů vlastníka. Support URL, privacy URL, odpovědný kontakt, review kontakt a přesné údaje o provozovateli musí vlastník potvrdit. Podklady má [kontrola před vydáním](PUBLIC_WEB_RELEASE_SIGNOFF.md).
- U účtů prokázat zahájení a potvrzení smazání přímo v aplikaci. Nativně ověřit všemi zpřístupněnými metodami přihlášení. Pokud Google slouží k hlavnímu účtu, posoudit dostupnou rovnocennou alternativu nebo platnou výjimku podle 4.8. Pro dostupné UGC ověřit filtrování, hlášení, blokaci, reakci moderátora a dostupný kontakt. Pro přenos osobních údajů službě AI ověřit předchozí explicitní souhlas. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) [Mazání účtu](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- Po akceptaci pořídit skutečné české snímky z kandidáta na podporovaných rozměrech. Použít syntetický deník, úlovek, vycházku a mapu revíru. [Specifikace snímků](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)

## Návrh českého záznamu

**Podtitul** · Rybářský deník, úlovky a revíry

**Popis** · Zaznamenávejte úlovky a vycházky, ukládejte revíry a sledujte osobní rekordy. Deník si můžete vést i u vody bez signálu.

Popis a snímky schválit podle reálně fungujícího podepsaného buildu. Reviewerovi poskytnout oddělený schválený testovací účet, postup k fotografii, offline deníku a smazání účtu bezpečným kanálem mimo Git.

## TestFlight po autorizaci

1. V odděleném prostředí vyřešit přihlášení nativního WebView a autorizaci cloudových fotografií. Preflight z `capacitor://localhost` v promptu 26 vrátil 405. Připravit schválené syntetické účty a žádná soukromá produkční data.
2. Z Xcode po kontrole podpisu odeslat schválený archiv do App Store Connect. Vyplnit beta popis, kontakt a skutečnou odpověď k exportu kryptografie. V TestFlight → Internal Testing přiřadit konkrétní build interní skupině.
3. Na fyzickém iPhonu nainstalovat beta build a podle [iOS akceptace](DEVICE_IOS_PWA_ACCEPTANCE.md) ověřit login, restart bez sítě, fotografie po opětovném připojení, soukromé a sdílené zobrazení, smazání účtu a čitelnost klíčových obrazovek. Do záznamu přidat model a iOS, SHA, build a skutečné výsledky. Podpis, beta účty, fotografie, offline, login, fyzický telefon i nativní privacy průchod jsou dnes **NOT TESTED**.
4. Externí skupinu a její schválení v Beta App Review řešit až po interním průchodu. Sbírat TestFlight feedback a pády, bezpečnostní nález zastaví rozšiřování bety. App Store Review a zveřejnění pouze po dokumentovaném souhlasu vlastníka. [Postup TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
