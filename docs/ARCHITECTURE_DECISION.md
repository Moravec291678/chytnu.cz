# Architektonické rozhodnutí

## Rozhodnutí

Zachovat současný React/Vite projekt a offline-first repository architekturu. Pro první beta ověřit web/PWA. Pro následné iOS/Android balení preferovat Capacitor až po fyzickém PWA pilotu; Expo/React Native nyní nepoužívat.

## Důvody

- Aplikace už má funkční responsivní UI, doménové modely, IndexedDB, outbox a testovanou synchronizační vrstvu.
- Capacitor může později zachovat většinu UI a doménového kódu. Migrace na React Native by vyžadovala přepsání DOM/CSS, lokálního úložiště, fotografií, navigace a části testů.
- Web/PWA je nejlevnější cesta k ověření produktu. Nativní wrapper stále potřebuje bezpečné lokální úložiště, lifecycle/background testy a store proces.
- Firebase je vhodný pracovní backend pro malý soukromý produkt, ale je zatím pouze emulátorový kandidát. Repository/port hranice umožňuje výměnu poskytovatele.

## Datové hranice

- IndexedDB je zdroj pravdy pro UI.
- Mutace entity a outbox operace jsou atomické.
- Firestore používá owner-scoped projekce, revize, receipts, delta změny a tombstones.
- Storage je privátní, hash-addressed a oddělený od Catch metadat.
- Přesné GPS, fotografie a poznámky nejsou veřejné.

## Znovuposouzení

Rozhodnutí o Capacitoru potvrdit po testu instalace PWA, foto/file inputu, IndexedDB persistence a návratu do popředí na reálném iOS a Android zařízení. Pokud tyto testy ukážou zásadní omezení, teprve potom vyhodnotit React Native/Expo migraci.
