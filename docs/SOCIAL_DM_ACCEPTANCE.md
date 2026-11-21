# Akceptace soukromých zpráv

**PARTIAL · 21. 11. 2026.** Funkce je dostupná v izolované beta konfiguraci. Produkční trasa i API jsou zavřené. Běžné použití vyžaduje oba příznaky `directMessages` a `adminConfig/social.directMessagesEnabled === true`.

- Dva přihlášení účastníci s aktuálně potvrzeným přátelstvím používají jednu kanonickou konverzaci. Blokování, zrušené přátelství a mazání účtu okamžitě brání dalšímu autorizovanému přístupu. Firestore přímý přístup odmítá. Systém drží účastnické relace mimo veřejné projekce a bez údajů o deníku nebo GPS.
- Český seznam konverzací a detail podporují počet nepřečtených, potvrzení přečtení, stránkování, odeslání, smazání vlastní zprávy pro oba a soukromé hlášení. Opakované odeslání se stejnou operací je idempotentní. Odeslání je omezeno na osm požadavků za minutu a čtyřicet za den na účet. Zpráva se vykresluje jako text. Offline se načtený obsah skryje.
- Hlášení vstupuje do existující soukromé moderace. Moderátor pracuje pouze s označenou zprávou a oprávněnou akcí, bez přístupu k celé konverzaci. Vymazání účtu po dávkách maže celou soukromou konverzaci i podřízené zprávy. Klient neumí přepisovat soukromé počty ani účastníky.
- Chromium 390 px na dvou oddělených syntetických účtech PASS. Odeslání, seznam s jednou nepřečtenou, označení jako přečtené a zmizení smazané zprávy na druhém účtu. 67 čerstvých Auth/Firestore kontrol včetně cizího účtu, UID injection, idempotence, ochrany kurzoru, blokace, bezpečnostních limitů, moderace a account cleanup.
- Před rolloutem ověřit fyzický mobil/klávesnici, provozní proces moderace, politiku retence a schválené produkční účty. Browser push pro soukromý text se neposílá.
