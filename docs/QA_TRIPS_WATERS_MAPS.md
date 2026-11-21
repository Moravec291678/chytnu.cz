# QA vycházek, revírů a map

Ověření 21. listopadu 2026 na oddělených emulátorech Auth a Firestore a v Chromiu při šířce 390 px. Produkční data se k testu nepoužila.

- Přihlášený uživatel odmítl GPS, ručně vyhledal „unetice“, vybral oficiální revír, zahájil vycházku a otevřel odkaz z detailu na stejný katalogový identifikátor. Upravil název, ukončil vycházku a znovu ji našel v historii po reloadu. Neplatný katalogový identifikátor zobrazil bezpečný stav.
- Dlaždice OSM byly cíleně nedostupné. Text revíru, historie a odkaz na záznam zůstaly použitelné. Předchozí [ověření jádra](QA_CORE_CATCH_JOURNAL.md) pokrývá připojení úlovku z detailu a zobrazení ve vycházce. Prompt 01 pokrývá i odstranění vycházky.
- Cílená sada měla 75 úspěšných kontrol. Vydané sociální trasy nepřidávají účast u vody při ručním výběru ani otevření mapy. Přesné souřadnice zůstávají v soukromých datech.

Katalog verze be90ad549cf77679 obsahuje 1 451 jedinečných interních identifikátorů a detailů. U 1 263 revírů je referenční bod, u 188 chybí. Dva revíry sdílejí číslo 4510091, proto vazby používají interní katalogové ID. Výpočet vzdálenosti od bodu je orientační doporučení k potvrzení uživatelem. Katalog nedokládá polygon ani přítomnost uvnitř hranic. Budoucí geometrii řeší Prompt 30.

[Veřejný přehled ČRS/RIS](https://ris.rybsvaz.cz/crs/reviry) dokládá původ dat. Podmínky redistribuce lokálního exportu musí potvrdit vlastník se správcem zdroje. Znění převzaté z exportu neověřuje aktuální podmínky lovu. Podrobnosti k aktualizaci jsou v [RIS_CATALOGUE.md](RIS_CATALOGUE.md). Mapové podklady podléhají [licenci a atribuci OSM](https://www.openstreetmap.org/copyright) a [pravidlům využití dlaždic](https://operations.osmfoundation.org/policies/tiles/).

Stav PARTIAL. Uspání a návrat z fyzického telefonu a potvrzení licence zůstávají otevřené.
