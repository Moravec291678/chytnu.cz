# Sociální síť 11/18 – geometrie revírů ČRS

Ověřený podklad je katalogová verze `be90ad549cf77679` z RIS. Index obsahuje 1 451 záznamů a každý má jeden detail a jedinečný interní identifikátor. Číslo revíru 4510091 patří dvěma samostatným záznamům. Pro vazby mezi funkcemi proto používáme katalogový identifikátor.

- 1 263 revírů má platný referenční bod shodný s detailem. U 188 revírů bod chybí.
- 1 260 různých bodů zahrnuje tři dvojice revírů se stejnými souřadnicemi. Jde o Horní a Malý rybník Únětice, Úhlavu 6 a Úhlavu 6 RMV a dvě položky Mlynařice 3 – Dvorce. Vyhledávání u společného bodu zachovává oba záznamy.
- V indexu ani detailech není strukturovaná ověřená hranice revíru. Bod a vzdálenost od něj nestačí k potvrzení, na které vodě se rybář nachází.
- Návrhy řadíme podle geografické vzdálenosti k bodu. Test prostorového indexu porovnává sto míst s přímým výpočtem přes celý katalog. Test vyhledávání pokrývá název bez diakritiky i nejednoznačné číslo revíru.
- Chybějící a neplatné body nevstupují do výpočtu. Revír zůstává dohledatelný podle názvu a čísla. Výběr potvrzuje uživatel v aplikaci.

Pro etapu 12 lze použít uživatelem potvrzený katalogový revír. Vzdálenost k referenčnímu bodu je pomocný údaj a výsledný stav nesmí tvrdit, že byla poloha ověřena proti hranici revíru.
