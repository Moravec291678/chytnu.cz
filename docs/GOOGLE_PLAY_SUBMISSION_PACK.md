# Google Play · podklady k podání · Prompt 25

**BLOCKED.** Play Console se bez schválení nepoužila. Podání vyžaduje podpis vlastníka, nativní build, ověření telefonu, funkční webový prostředek výmazu a potvrzené formuláře. [Nativní protokol](ANDROID_NATIVE_BUILD_EVIDENCE.md).

## Návrh položek obchodu

- Název ChytnuCz, jazyk cs-CZ, applicationId cz.chytnu.app, kategorie Sport ke schválení.
- Krátký popis „Rybářský deník pro úlovky, fotografie, vycházky a osobní rekordy.“
- Dlouhý popis „Zapiš si úlovek, přidej fotografii a ulož ji do rybářského deníku. V deníku vyhledáš dřívější úlovky, přiřadíš je k vycházce a sleduješ osobní rekordy. Revír můžeš vybrat z katalogu ČRS nebo přidat vlastní. Deník umožňuje místní uložení a samostatnou zálohu. Rozsah synchronizace závisí na přihlášení a připojení.“ Použít po věcné a právní akceptaci posledního AAB.
- Poznámky k první testovací verzi „Ověřujeme rychlé uložení úlovku s fotkou, práci offline, vycházky, revíry, export a správu soukromí.“
- Specifikace vizuálů pro testovaný build. 512×512 PNG ikona, 1024×500 feature graphic, telefonní snímky z fyzického zařízení. Návrh čtyř s 1080×1920: Domů, Deník, syntetický úlovek, vycházka nebo revír. Pouze syntetické neosobní záznamy a bez přesné GPS. Fotky pro obchod získat po fyzické akceptaci. [Google Play grafika](https://support.google.com/googleplay/android-developer/answer/9866151).

## Zdroje a deklarace

- Od 31. srpna 2026 běžné nové aplikace a aktualizace cílí na API 36 a výš. Zdroj targetSdk 36 splňuje číselnou hranici. Ve skutečném AAB ověřit ABI, 16KiB, certifikát, názvy balíků a verzi. [Target API](https://developer.android.com/google/play/requirements/target-sdk), [16KiB](https://developer.android.com/guide/practices/page-sizes).
- Zásady soukromí navrhují veřejnou URL https://chytnu-cz.vercel.app/privacy-policy a schválené kontaktní údaje. In-app výmaz je v Nastavení po novém ověření. U webového prostředku výmazu musí jít o ověřenou použitelnou veřejnou cestu pro člověka bez nainstalované aplikace. Běžná stránka zásad sama tuto akceptaci nedokládá. Vlastník schválí URL, postup a skutečný test až do dokončení. [Google Play výmaz](https://support.google.com/googleplay/android-developer/answer/13327111).
- Data Safety vyplnit z finálního AAB a aktivních služeb. Návrh inventury e-mail a UID, volitelné úlovky/fotografie, poloha při povolené aktivní funkci, diagnostika, preference a případný sociální obsah. Firebase, Cloudinary, Vercel, mapy/počasí a případné volitelné AI posoudit jako konkrétní přenosy. Rozhodnutí o účelech, povinnosti a sdílení potvrzuje vlastník. [Formulář Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469).
- Deklarovat skutečný sloučený Android Manifest a účely. Umístění u vody je foreground; široký přístup k fotkám deklarovat jen pokud jej finální manifest skutečně vyžaduje a alternativy nestačí. Ve zdroji není background location ani široká oprávnění galerie. App content, content rating, cílový věk, UGC, reklamy a App access vyplnit podle testovaného rozsahu a odpovědí vlastníka. [Oprávnění Google Play](https://support.google.com/googleplay/android-developer/answer/16558241).

## OWNER-ONLY postup

1. Play Console → Developer account ověř typ, stav, identitu a podmínky registrace. Projekt poplatek neschválil. Create app až po schválení. Založ Test and release → Internal testing, přidej schválené testery, zajisti potvrzený upload klíč a Play App Signing. Nahraj ověřený AAB mimo tento běh. [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756).
2. Ve dvou reálných telefonech ověř instalaci ze store odkazu, přihlášení, foto/knihovnu, offline restart, synchronizaci, export, výmaz a oprávnění. V Release prohlédni verzi a certifikát, App Bundle Explorer a Pre-launch report. Doplň odkaz na log a výsledek. Zůstává otevřené.
3. Pro osobní účty vytvořené po 13. listopadu 2023 je před žádostí o produkční přístup vyžadován Closed testing s alespoň 12 nepřetržitě přihlášenými testery 14 dní. Internal testing tuto podmínku nenahrazuje. Po akceptaci vyplň Store listing, App content a data, potom požádej o Production access a schval účinný rollout. [Pravidla testování](https://support.google.com/googleplay/android-developer/answer/14151465).

Podepsaný AAB, stav tracků, funkční webový výmaz, fyzická akceptace a vlastníkovo schválení jsou zatím otevřené. K žádnému podání nedošlo.
