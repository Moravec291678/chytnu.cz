# Firebase staging a production setup

Kód rozlišuje `emulator`, `staging` a `production` přes `VITE_BACKEND_MODE`. Neúplná cloudová konfigurace skončí viditelnou chybou a nikdy se nepřepne do jiného projektu.

## Staging `chutnucz`

Stav ověřený 21. 10. 2026:

- projekt běží na bezplatném tarifu Spark;
- Email/Password a Google provider jsou zapnuté;
- `localhost`, `chutnucz.firebaseapp.com`, `chutnucz.web.app` a `chytnu-cz.vercel.app` jsou autorizované domény;
- aktuální [firestore.rules](../firestore.rules) byly samostatně nasazeny přes `--only firestore:rules --project chutnucz`;
- reálný smoke test se dvěma syntetickými účty ověřil e-mailový Auth, Catch/Trip/Water sync, receipts, changes, tombstones, idempotenci, stale-revision konflikt, default deny a izolaci účtů; syntetické účty a jejich Firestore podstromy byly po testu odstraněny;
- Firebase Storage, Functions, Cloud Run, Extensions ani placené služby nebyly aktivovány.

Před Vercel release zbývá provést koncový Google popup test na `chytnu-cz.vercel.app`, ověřit OAuth consent/branding a skutečné doručení e-mailových šablon. Vercel musí používat názvy z `.env.example`, `VITE_BACKEND_MODE=staging` a `VITE_FIREBASE_GOOGLE_AUTH_ENABLED=true`.

Izolovaný smoke runner je `tools/firebase-staging.smoke.mjs`. Vyžaduje explicitně injektovaný veřejný web config projektu `chutnucz`; konfiguraci ani testovací heslo neukládá do repozitáře.

Firebase Storage se nepoužívá. Fotografie zůstávají pouze v IndexedDB a lokální záloze. Proměnná `VITE_FIREBASE_STORAGE_BUCKET` je zatím součástí existujícího veřejného Firebase web config kontraktu, ale runtime na bucket neposílá požadavky.

## Produkce

Použij samostatný produkční projekt. Přenes jen ověřenou konfiguraci, ne staging uživatele ani data. Zopakuj test pravidel, Authorized domains, Google OAuth, e-mailových odkazů, účtového lifecycle, kvót, monitoringu a rollback postupu.

## Tajné údaje

Firebase web config je veřejná identifikace klienta. Do frontendu ani Vercelu nepatří service-account JSON, private key, refresh token, Admin SDK credential nebo heslo. Přístup vynucuje Auth a Firestore Rules.
