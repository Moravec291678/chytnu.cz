# ChytnuCz · závěrečné rozhodnutí o vydání

**Prompt 33 · PARTIAL · veřejné rozšíření NO-GO · 21. 11. 2026**

Web a PWA prošly lokální regresí včetně offline deníku. Android a iOS mají ověřený základ Capacitoru. Sociální moduly prošly izolovanými A/B/C scénáři. Podmínky pro širší webový release, obchody a nové sociální funkce zůstávají otevřené. [Matice akceptace](FINAL_ACCEPTANCE_MATRIX.md)

## Kandidát a ověření

- Vývojová větev `codex/public-launch-readiness-audit`, kandidát aplikace `e45f963f4d4433d5542b1209beaf2574e523d848`, Vercel preview READY. Závěrečný commit eviduje výsledky a test rozšiřující ověření zavřených rozhraní, bez runtime změny vůči tomuto kandidátu.
- `origin/main` a produkční Vercel deployment `dpl_excxrvWSUebVCKKQxXMXLP4dEv24` shodně na `68fbf04b70e123b226bac90ee83f12dde1dc352b`, stav READY. Produkční smoke je pouze read-only. [Preview](https://chytnu-bm2zjn04f-moravec291678s-projects.vercel.app) · [Produkce](https://chytnu-cz.vercel.app)
- Firebase `chutnucz`, aktivní ruleset `4d8e7a75-aa85-43e4-8796-3921131cdc0e`, přesná shoda pravidel, 12 složených indexů a 2 výjimek polí. Kandidát nemění Firestore Rules ani indexy. Firebase deploy nebyl potřeba.
- 1 193 jednotkových a 1 919 dílčích Auth/Firestore kontrol. Samostatné Auth, Sync a Photos skripty PASS. Lint, build, produktová validace a `git diff --check` PASS. Build ověřil 157 souborů offline manifestu a 165 klientských souborů na nepřítomnost Cloudinary tajného klíče. Npm audit runtime 0, celkem 14 středních nálezů v nástrojích vývoje a 0 vysokých nebo kritických.
- Původní worktree `chytnu-terminology` zůstal na `208baf2afd16a7841422386a344da711ddca9e85`, 22 upravených a 5 nových souborů, žádné staged změny. Release pracuje v odděleném `chytnu-terminology-ux-checkpoint`.

## Změny připravené od živé verze

- Zpevnění izolace a obnovy relací, veřejných projekcí, smazání účtu, synchronizace a revokace fotografií. Čistší stav exportu a synchronizace, mobilní formuláře, navigace, zobrazení aktivity a menší společný klientský balík.
- Ověřený manuální výběr revíru s 1 451 stabilními ID. Soukromý deník a lokální statistiky fungují bez AI. Externí AI podle pravidel zůstává pouze pro schválené příběhy a tipy z deníku. Bez nového aktivního poskytovatele nebo placených služeb.
- Odděleně testované rozšíření sociálního serveru a UI za zavřenými přepínači. Chráněný chat, soukromé zprávy, role Crew, vyhledání schválených úlovků podle revíru, bezpečná moderace a úklid.

## Rozhodnutí a další krok

1. David potvrdí rozsah deníkového pilotu, určí odpovědné osoby pro podporu, bezpečnost a návrat, schválí právní podklady a provozní režim. [Přesné kroky vlastníka](OWNER_LAUNCH_ACTIONS.md) · [Právní schválení](LEGAL_OWNER_SIGNOFF.md)
2. V izolovaném schváleném Vercel/Firebase/Cloudinary prostředí připravit dva syntetické účty. Na fyzickém Androidu a iPhonu projít přihlášení, dvě zařízení, JPEG a HEIC, letecký režim, restart, další synchronizaci, export, revokaci a smazání. Zaznamenat obrácení přístupu a realitu CDN. [Android PWA](DEVICE_ANDROID_PWA_ACCEPTANCE.md) · [iOS PWA](DEVICE_IOS_PWA_ACCEPTANCE.md) · [Cloudinary](QA_CLOUDINARY_LIVE.md)
3. Teprve po povolení spustit omezený pilot a uložit reálné týdenní výsledky. Samostatně připravit fyzické a podepsané sestavení Android/iOS se store údaji. [Pilot](PILOT_RUNBOOK.md) · [Obchody](MOBILE_STORE_RELEASE_CHECKLIST.md)
4. Po všech bránách vlastník schválí konkrétní kódový SHA, pak lze provést `main`, ověření nového Vercel produkčního SHA a release tag. Dnes pouze vývojová větev. Firebase billing ani placené integrace se nezapínaly.

## Otevřené P2/P3

- **P2 / RISK-02** · CSP report-only po ověření izolovaného preview. Otestovat Firebase, OAuth, Cloudinary, mapy, počasí a service worker před případným enforcementem.
- **P2 / RISK-03** · Reprodukce stejného osobního revíru ze dvou offline zařízení. Zachovat napojené úlovky a vycházky, nabídnout potvrzené sloučení.
- **P2 / POST-01** · Zátěž velkého deníku, delší fotografie, cache, měření p75 a neinvazivní provozní metriky.
- **P3 / POST-02** · Moderace a živá sociální beta. Doložit retenci, nativní/telefonní průchod, oddělené otázky skupinového obsahu a textu u revírů, přesnost a práva k prostorovým zdrojům.
- **P3 / POST-03** · Pokročilé XP, serverový web push, Supporter a případné schválené AI příběhy/tipy až s odpovídající akceptací a náklady. Přesné GPS, fotografie, kontaktní údaje a soukromá historie zůstávají chráněné.
