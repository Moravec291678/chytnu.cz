# Akceptace komunitního obsahu revírů

**PARTIAL · 21. 11. 2026.** V izolované betě se na detailu katalogu zobrazí ručně potvrzené a výslovně veřejně sdílené úlovky z tohoto revíru. `waterCommunity` i serverové `adminConfig/social.waterCommunityEnabled` zůstávají zavřené. Nové publikace používají existující Deník → Sdílet úlovek → zahrnout revír. Nevzniká druhá kopie úlovku, fotografie ani XP.

- Server ověří Firebase identitu, existující RIS ID, právě platný veřejný souhlas, viditelnost sekce, ruční zaškrtnutí zveřejnění revíru a vazbu na uložený revír přihlášeného autora. Změna, odstranění nebo přemapování zdrojového revíru, blok a revokace sdílení zneplatní čtení. Podklady publiku neodhalují privátní souřadnice, název osobního místa ani ID privátního zdroje.
- Stránka čte nejvýše jedenáct kandidátů podle kanonického ID a stabilního identifikátoru příspěvku. Podepsaný kurzor je nepřenositelný mezi účty a revíry. Server odmítá přímý Firestore přístup. Limit je šest dotazů za minutu a čtyřicet za den na účet. Detail používá stávající reakce, komentáře, hlášení a moderaci.
- 44 čerstvých Auth/Firestore kontrol PASS. Veřejný, soukromý a nepublikovaný úlovek, neoprávněný uživatel, přemapování, blok, hlášení, moderace, přístup ke kurzoru, formát a limit. Chromium 390 px se dvěma účty otevřel tentýž skutečný příspěvek a po odvolání ho odstranil z výsledků. Lint, produktový inventář a diff PASS.
- Rozsah tvoří výslovně sdílené úlovky. Samostatné textové příspěvky o revíru, live Cloudinary, povolení práv k RIS a fyzická akceptace čekají na další milník.
