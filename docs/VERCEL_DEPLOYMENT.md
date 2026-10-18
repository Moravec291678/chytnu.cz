# Vercel deployment

Skutečný deployment nebyl proveden. `vercel.json` nastavuje Vite build, výstup `dist`, SPA fallback pro přímé otevření rout a okamžitou revalidaci service workeru.

| Prostředí | Backend mode | Firebase projekt | Build | Ověření |
| --- | --- | --- | --- | --- |
| Local development | `emulator` | `demo-chytnucz-local` | `npm run dev` | Auth/Firestore/Storage emulátory, unit a emulator testy |
| Preview / staging | `staging` | samostatný staging projekt | `npm run build`, `dist` | preview URL, deep links, dva testovací klienty, e-mail a Google provider |
| Production | `production` | samostatný production projekt | `npm run build`, `dist` | produkční smoke test, právní odkazy, monitoring a budget alerty |

## Proměnné prostředí

Požadovaný seznam je v `.env.example`. Webové hodnoty `VITE_FIREBASE_*` budou součástí klientského balíku a nesmějí být považované za tajemství. Přístup musí vynucovat Firebase Auth a rules.

Do Vercelu nikdy nevkládej jako frontend proměnné service-account JSON, private key, Admin SDK credential, token uživatele, heslo ani jiné serverové tajemství. Důvěryhodný backend pro lifecycle účtu musí mít vlastní oddělené serverové prostředí.

## Kontrola Preview

1. Nastav stagingové env jen pro Preview.
2. Build command: `npm run build`; output directory: `dist`.
3. Otevři přímo `/profile`, `/map`, `/catch/neexistujici` a `/trips`; všechny musí načíst SPA a zobrazit správný stav.
4. Zkontroluj manifest, `/sw.js`, ikony a update po novém deployi.
5. Ověř, že Preview nepoužívá produkční projekt a že chybějící config skončí chybou bez fallbacku.
