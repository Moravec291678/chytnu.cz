# Akceptace instalované PWA na Androidu · Prompt 11

**BLOCKED DEVICE TEST.** Na vývojovém počítači se nezobrazilo připojené zařízení Android. Proveď průchod na fyzickém telefonu až po potvrzení izolovaného HTTPS preview a schválení syntetického účtu a úložiště. Druhý klient patří ke stejnému testovacímu účtu; cizí syntetický účet se použije pouze k ověření izolace. Podklad k oprávněním, synchronizaci a konfliktu je v [Android QA](PHYSICAL_TEST_ANDROID.md).

## Záznam pro jeden průchod

- Datum a čas včetně časové zóny, model, Android, verze Chrome, izolovaná URL. Build A a B z Profil → Nastavení → diagnostika → Build.
- Nainstalovat z menu Chrome → Přidat na plochu / Nainstalovat aplikaci. Otevřít z ikony, ověřit standalone, spodní navigaci a systémové Zpět z detailu. Výsledek a snímek obrazovky.
- Pořídit neosobní JPEG kamerou a vybrat JPEG z knihovny. Pokud zařízení vytváří HEIC, zopakovat s HEIC. Odmítnout kameru a GPS, potvrdit použitelný ruční tok, pak ověřit povolenou GPS. Zapsat formát a stav každého oprávnění.
- V režimu Letadlo přidat syntetický úlovek s lokální fotkou. Zapsat cestu detailu, čas uložení a stav fronty. Úplně ukončit aplikaci, spustit ji offline z ikony a z detailu zobrazit čitelnou fotografii. Ověřit shodu identifikátoru, čekající stav a místní editaci.
- Při čekající fotce na stejném schváleném originu zpřístupnit build B s využitím kontrolovaného spojení, které dovolí načíst shell a dočasně nepustí upload. Zapsat oba identifikátory sestavení a zachování dat po úplném restartu. Ověřit, že úlovek, fotka a fronta zůstaly zachované. Poté obnovit spojení s poskytovatelem, ověřit dokončení a stejný úlovek a fotografii na druhém klientovi. Zapsat čas, stavy retry a výsledek. Bez této části je update s čekající fotkou neověřený.
- Při malé šířce, systémové klávesnici, rotaci a slabé síti ověřit dosažitelné Uložit, spodní navigaci a absenci duplikátu. Zametení či smazání úložiště by změnilo podmínky průchodu. Zapisovat jen syntetické ID, stavy, build a čas. Neukládat tokeny, URL s podpisem ani surové databázové exporty.

## Lokální doplňkový důkaz

Build shellu z předchozího checkpointu má manifest ChytnuCz, standalone, tři přítomné ikony a index-Bguo4bcE.js v cache chytnucz-shell-123ea6ce4cc24e87. SHA-256 assetu 4546ae408a4eaf1c8df939a15041a070dd01314a778d14a0c50b5af377537607. Worker promazává jen starší klíče vlastního cache prostoru a ponechává předchozí shell. Pro logy desktopového Chrome připojit Android přes USB a chrome://inspect/#devices. V konzoli je bezpečné číst navigator.serviceWorker.controller?.scriptURL a await caches.keys(); záznam soukromých IndexedDB hodnot není součástí protokolu. Desktopový restart a obnovení JPEG je doložené v [Promptu 08](QA_CORE_CATCH_JOURNAL.md).
