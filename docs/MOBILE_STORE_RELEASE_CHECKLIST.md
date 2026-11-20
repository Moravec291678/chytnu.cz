# ChytnuCz · akceptace pro obchody

Stav k 20. 11. 2026. Obě platformy mají existující Capacitor zdroj v `android/` a `ios/`, konfigurace `capacitor.config.json` používá balík `cz.chytnu.app`, název ChytnuCz a výstup `dist`. Web build prošel. Nativní sestavení, podepsané artefakty, účty a přijetí v obchodě jsou neověřené. Tento checklist nemění stav produkce.

## Společné podmínky

- [ ] Schválený rozsah a backend kandidáta, release SHA a verze, závislosti Capacitor a pluginů, oddělený staging, logy bez citlivých údajů.
- [ ] Kamera a galerie JPEG/HEIC, čtyři snímky, přístup k vybraným fotkám, přerušený výběr, povolené i odmítnuté GPS, background/resume a offline restart. Test pomalé sítě, chybějící storage, nahrávání z místního souboru, systémové klávesnice a safe areas.
- [ ] WebView OAuth a reset e-mailem, deep links z relevantních relací, sdílení a návrat do aplikace. Přihlášení nesmí otevřít zbytečnou navigaci nebo nebezpečný origin. Hlášení neplatné relace a jasný sign-out.
- [ ] Pozitivní a negativní account export/delete a revokace fotek ve stejném buildu. Pokud sociální funkce zůstanou viditelné, odzkoušet report, blok, kontakty a moderaci nebo je serverově i klientsky uzavřít.
- [ ] Branding: ikony ve všech formátech, kontrast splash, snímky skutečného releasu, český popis a kontakty. Ověřit licenční a věková prohlášení, důvody oprávnění a stáří podmínek.
- [ ] Zkouška aktualizace z dřívějšího buildu s lokálním outboxem, kontrola crash logů na testovacích zařízeních, mechanismus pozastavení rolloutů s kompatibilním backendem.

## MOB-01 · Android, místní build a Play Console

- [x] `android/variables.gradle` uvádí compile a target 36 a min 24. Play chce pro nové telefonní aplikace a aktualizace od 31. 8. 2026 alespoň API 36. To prokazuje splnění verze v konfiguraci. [Target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).
- [ ] Android SDK platform 36, kompatibilní Build Tools, Gradle wrapper, JDK a Android Studio, Gradle lint a assembleDebug z čisté kopie. JDK 21 přítomné v auditním prostředí, nativní SDK a běh nebyly doloženy. `npm run build:android` synchronizuje webové assety; samotný tento příkaz nenahrazuje Gradle sestavení.
- [ ] Fyzický Android s aktuálním OS a slabší/minimální podporovanou variantou. Ověřit app Back, edge-to-edge, rotaci, kameru/galerii, coarse/fine mapu, Files, povolené HTTPS originy, obnovení a app links. Manifest má foreground location, držet bez background oprávnění; notifikace vyžadují samostatné ověření pouze v povolené variantě.
- [ ] Nastavit Play Console, ověřit osobní/organizační typ a identitu. Jednorázový registrační poplatek 25 USD, pokud účet zatím neexistuje. [Registrace](https://support.google.com/googleplay/android-developer/answer/6112435).
- [ ] Upload klíč bezpečně uložit mimo Git, povolit Play App Signing podle schválení vlastníka. Inkrementovat versionCode, podepsat release AAB a ověřit certifikát. Prohlédnout kompatibilitu nativních knihoven, zarovnání a běh s 16kiB paměťovými stránkami včetně aktuálního Play pre-launch reportu. [Android 16 KB](https://developer.android.com/guide/practices/page-sizes).
- [ ] Internal testing, vyřešit pre-launch report a zásady. U osobních účtů založených po 13. 11. 2023 platí alespoň 12 testerů po 14 po sobě jdoucích dnů v uzavřeném testu před žádostí o produkční přístup. Ověřit příslušný typ účtu a stav v Play Console. [Uzavřené testování](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
- [ ] App content: Data safety, obsahové hodnocení a věková skupina, privacy URL, přístup review účtu pro chráněné toky, seznam citlivých oprávnění, popis dat sdílených s poskytovateli, listing, grafika a živé URL mimo aplikaci pro žádost o výmaz. [Pravidla mazání](https://support.google.com/googleplay/android-developer/answer/13327111).
- [ ] Vlastník schválí podání, release kanál a řízené rozšíření po úspěšném interním a případném uzavřeném testu.

## MOB-02 · iOS, Xcode, TestFlight a App Store Connect

- [x] `ios/App/App.xcodeproj/project.pbxproj` obsahuje bundle ID `cz.chytnu.app` a minimum iOS 15. `ios/App/App/Info.plist` obsahuje české vysvětlení kamery a polohy při používání. Tato metadata prokazují zdrojovou přípravu.
- [ ] macOS a Xcode 26 nebo novější s iOS 26 SDK. Aktuální minimum pro upload je cílit iOS 13 či novější, a to je nezávislé na povinném SDK. Zkompilovat a otestovat `npm run build:ios` plus skutečné řešení závislostí, sestavení a archiv Xcode. [Apple SDK a minimum systému](https://developer.apple.com/news/upcoming-requirements/).
- [ ] Přihlásit a ověřit Apple Developer Program, členství 99 USD ročně s regionálními odchylkami. App ID, Team signing, distribution certifikát či spravované signing identity a provisioning, verze a build number, archiv pro App Store. [Apple členství](https://developer.apple.com/programs/enroll/).
- [ ] Fyzický iPhone, verze iOS na starším podporovaném a současném zařízení, iPad pokud je uveden jako podporovaný. Ověřit WebView, ztrátu foto oprávnění, limited library, HEIC/iCloud knihovnu, bezpečné okraje, callback OAuth, síť a privacy manifests používaných SDK. Posoudit požadavek Apple na další přihlašovací možnost v případě Google přihlášení a jeho výjimky. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).
- [ ] TestFlight nejdřív interní, potom případný externí beta review. App Privacy štítky podle reálného toku, věkový rating, identita, privacy URL, screenshoty, popis, podpůrná URL a instrukce pro recenzenta. Pokud je dostupné vytvoření účtu, funkční podání výmazu uvnitř aplikace. [Apple account deletion](https://developer.apple.com/go/?id=ar-ad-support).
- [ ] David schválí zaslání k review a datum řízeného vydání. Hotový archiv ani TestFlight samy neznamenají schválené veřejné vydání.

## MOB-03 · Zavření vydání a odpovědnosti

Produkční settings mají funkci zahájit výmaz, veřejná samoobslužná stránka /account/delete v routeru není. Pro Play ověřit a zveřejnit trvalou webovou cestu žádosti mimo aplikaci, s jasnou identifikací ChytnuCz a podmínkami. Pro oba obchody doložit skutečný výmaz a platnou deklaraci, metriky release, kontaktní osobu a návrat verze v případě P0. Vlastník řeší ověření účtu, platby, certifikáty a právní souhlasy. Codex může připravit build, scénáře, anonymizované výsledky a podklady. Závisí na [webovém plánu](PUBLIC_LAUNCH_BACKLOG.md) a [vlastníkovi](OWNER_LAUNCH_ACTIONS.md).
