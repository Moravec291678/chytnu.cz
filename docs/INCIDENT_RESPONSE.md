# Reakce na incident ChytnuCz

1. Zaznamenej čas, stručný popis problému, skutečný Vercel SHA a dopad na přihlášení, uložení, upload, výmaz nebo veřejné sdílení. Pro porovnání použij schválený syntetický účet. Ve sdílených poznámkách ponechej jen anonymizované stavy a počty.
2. Při podezření na cizí přístup, únik médií nebo nevratnou ztrátu zastav nábor a vydání. Nahlas vlastníkovi přes schválený kontakt, uchovej provozní důkaz bez uživatelských dat a urči bezpečné omezení dotčené funkce. Nikdy nemaž lokální úlovky ani plošně neměň pravidla.
3. Při závadě nahrání posuď lokální čitelnost fotky, capability, sign, stav fronty a ověření kopie. Při 5xx zajisti konzistentní retry a u výmazu pokračování existujících durable úloh. Nevytvářej duplicitní Catch ani prostředek ve vzdáleném úložišti.
4. Jedna blokovaná úloha nebo chybějící denní cloud_cleanup je důvod ke kontrole vlastníka. Požadavky se zpožděním fronty sleduj v odděleném testovacím prostředí. Při nedostupné AI pokračuje místní deník a deterministické doporučení.
5. Jestli problém souvisí s webovým deployem, proveď schválený rollback a smoke podle [postupu](RELEASE_ROLLBACK.md). Při podezření na pravidla Firestore nejprve porovnej aktivní verzi a emulátorové negativní scénáře. O výsledku a případném oznámení dotčeným lidem rozhoduje vlastník podle skutečného incidentu.
6. Změř čas obnovení a ověř frontu, ochranu dat a potvrzení vlastnictví. Návrh pro pilot je ověřená uživatelská záloha do 24 h a obnovení webu do 4 h. Jde o cíle k otestování v pilotu.

Vlastník před pilotem potvrdí funkční provozní kontakt a zastupování, zkušební doručení upozornění a kdo smí měnit přepínače či zastavit distribuci.
