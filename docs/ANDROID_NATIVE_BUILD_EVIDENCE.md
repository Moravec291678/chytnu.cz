# Android Capacitor · protokol sestavení · Prompt 24

**BLOCKED.** Windows má Temurin JDK 21.0.12.1 a Gradle wrapper 8.14.3. Ubuntu/Android emulátor ani připojený telefon se nepoužily. Chybí Android SDK 36, fyzické zařízení a produkční podpis.

## Co se skutečně ověřilo

- Izolovaná dočasná kopie posledního webového kandidáta. Capacitor sync android PASS, vloženo 178 statických souborů včetně index.html, sw.js a manifestu. Sync identifikoval Filesystem 8.1.5 a Capgo uploader 8.3.26. Android wrapper 8.5.3, core 8.6.0 a CLI 8.6.2. Capacitor upozorňuje na rozdílnou verzi core a Androidu. Sjednocení před vydáním ověřit s funkčním sestavením a plugin testy.
- První offline Gradle pokus sestavení zastavil u neuložených AGP 8.13.0 a Google Services 4.4.4. Běžný online assembleDebug závislosti načetl, nakonfiguroval app a Cordova pluginy a skončil před kompilací chybou SDK location not found. APK ani AAB nevzniklo.
- Manifest obsahuje INTERNET a foreground coarse/fine location. FileProvider je neveřejný a exportovaná je launcher aktivita. Repozitář má zdroje ikon a splash, applicationId cz.chytnu.app, minSDK 24, compile/target 36, verzi 1.0/1. AllowBackup je nyní true, dopad na obnovu soukromé místní historie potvrdit na zařízení a s vlastníkem. Žádná nová oprávnění ani signing soubory.
- 15 testů platformy, API směrování a release config PASS. Nativní build vyžaduje nastavené VITE_API_BASE_URL s HTTPS. Read-only OPTIONS na současném /api/cloudinary/sign s Android WebView originem https://localhost vrátilo 405 bez CORS hlavičky. Browserové požadavky z tohoto originu vyžadují schválený způsob komunikace s API, opakovaný preflight a end-to-end ověření před distribucí. Nativní Capgo transport binárního uploadu sám nedokládá dostupnost grantu.
- Stav fyzické akceptace otevřený pro fotoaparát/galerii, HEIC/JPEG, file URI, přesnou a přibližnou polohu, instalaci, Back, klávesnici, rotaci, přepnutí popředí, offline restart WebView, upload, doručení a výmaz. Webový worker se v nativním wrapperu neregistruje.

## Kroky pro Davida a sestavení bez tajemství

1. Android Studio → Tools → SDK Manager → SDK Platforms → Android 16 (API 36), SDK Tools → Android SDK Build-Tools a Platform-Tools. Potvrď licenční dialog vlastními údaji. Ověř SDK Location a nastav ANDROID_HOME nebo místní android/local.properties mimo Git. [SDK Manager](https://developer.android.com/studio/intro/update#sdk-manager).
2. V izolované konfiguraci nastav schválený HTTPS VITE_API_BASE_URL. Na čisté kopii spusť npm ci, npm run build:android a ve složce android Gradle assembleDebug, lint a bundleRelease. Pro AAB použij Android Studio → Build → Generate Signed Bundle / APK → Android App Bundle a schválený upload klíč. Přístupové údaje patří do bezpečného úložiště, mimo repozitář a terminálové logy. [Capacitor Android](https://capacitorjs.com/docs/android), [Android podpis](https://developer.android.com/studio/publish/app-signing).
3. Připoj telefon se schváleným USB Debugging a ověř adb devices. Nainstaluj testovací APK nebo podepsaný build z interního kanálu a vyplň scénáře výše. Ověř app ID, verzi, certifikát a 16KiB kompatibilitu před Play.
