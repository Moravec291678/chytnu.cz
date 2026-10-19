# Fyzický QA checklist — iOS

**Testovací cíl:** Vercel Preview URL doplněná po vytvoření staging deploymentu. Používej pouze syntetický staging účet a testovací data.

## Instalace a PWA

- Otevři Preview URL v aktuálním Safari na iOS.
- Přidej aplikaci na plochu a ověř název, ikonu, start URL a standalone zobrazení.
- Ukonči aplikaci přes přepínač aplikací a znovu ji spusť.
- Po novém Preview buildu ověř aktualizaci service workeru a obsahu bez nutnosti mazat osobní data.

## Hlavní scénáře

- Registrace e-mailem, ověření odkazu, logout, login, reset hesla a přetrvání session po restartu.
- Google přihlášení a korektní návrat do nainstalované PWA i do Safari.
- Catch create/detail/edit/delete a fotografie pořízená fotoaparátem i vybraná z knihovny.
- Explicitní GPS: povolit jednou, zamítnout a změnit oprávnění v Nastavení; deník musí fungovat bez polohy.
- Trip create/edit/end, vazba Catch na Trip a ochrana výpravy s navázaným Catch.
- Deník, filtry, statistiky, Species Album, XP, achievementy a soukromá mapa.

## Offline a synchronizace

- Po online načtení zapni režim Letadlo a aplikaci úplně ukonči.
- Spusť PWA offline, vytvoř a uprav syntetický Catch včetně lokální fotografie.
- Restartuj ji stále offline a ověř zachování IndexedDB dat i čekající změny.
- Obnov síť, ověř dokončení synchronizace a stejný stav na druhém izolovaném klientu.
- Vyvolej konflikt souběžnou úpravou a ověř zachování obou verzí a funkční volbu výsledku.

## Mobilní kvalita

- Ověř safe area kolem výřezu a home indikátoru, spodní navigaci, klávesnici a formulářový scroll.
- Zkontroluj větší systémové písmo, otočení displeje, návratové gesto a absenci vodorovného přetékání.
- Zaznamenej model zařízení, verzi iOS/Safari, datum, Preview URL a nalezené chyby.
