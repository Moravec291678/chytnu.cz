# Fyzický QA checklist — Android

**Testovací cíl:** Vercel Preview URL doplněná po vytvoření staging deploymentu. Používej pouze syntetický staging účet a testovací data.

## Instalace a PWA

- Otevři Preview URL v aktuálním Chrome na Androidu.
- Ověř HTTPS, manifest, ikonu, název ChytnuCz a nabídku instalace.
- Nainstaluj PWA, spusť ji z domovské obrazovky a ověř standalone režim.
- Po novém Preview buildu ověř, že se po ukončení a novém spuštění načte aktualizovaná verze.

## Hlavní scénáře

- Registrace e-mailem, ověření odkazu, logout, login, reset hesla a přetrvání session po restartu.
- Google přihlášení včetně návratu z popupu nebo přesměrování.
- Catch create/detail/edit/delete, fotografie z fotoaparátu i galerie a potvrzení smazání.
- Explicitní GPS: povolit, zamítnout, zkusit znovu a ověřit, že odmítnutí neblokuje uložení.
- Trip create/edit/end, vazba Catch na Trip a ochrana výpravy s navázaným Catch.
- Deník, filtry, statistiky, Species Album, XP, achievementy a soukromá mapa.

## Offline a synchronizace

- Po jednom online načtení zapni režim Letadlo a aplikaci úplně ukonči.
- Spusť PWA offline, vytvoř a uprav syntetický Catch včetně lokální fotografie.
- Restartuj PWA stále offline a ověř zachování dat i viditelnou čekající synchronizaci.
- Obnov síť, ověř odeslání fronty a načtení stejného výsledku na druhém izolovaném zařízení/profilu.
- Vyvolej konflikt souběžnou úpravou a ověř, že nedojde k tiché ztrátě dat.

## Mobilní kvalita

- Ověř malé i velké písmo systému, otočení displeje a viditelnost spodní navigace nad systémovými prvky.
- Zkontroluj dotykové plochy, klávesnici, scroll formulářů, safe area a absenci vodorovného přetékání.
- Zaznamenej model telefonu, verzi Androidu/Chrome, datum, Preview URL a nalezené chyby.
