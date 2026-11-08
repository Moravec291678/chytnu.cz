# UI a AI — kontrola tras 8. 11. 2026

Zdroj pravdy: src/app/App.jsx, 48 registrovaných vzorů. UI agent otevřel všech 48 základních tras v místním IAB: existující místní testovací úlovky, prázdné/přihlašovací stavy a nenalezené dynamické objekty. Toto není ověření všech přihlášených vnořených stavů.

| Trasa | Kontrola |
|---|---|
| / | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /login | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /onboarding | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /journal | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /journal/calendar | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /journal/map | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /challenges | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /achievements | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /levels | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /streak | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /fish-activity | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /species/:speciesKey/mastery | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /species/:speciesKey | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /album | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /map | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /add | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /catch/:id/reward | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /catch/:id/share | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /catch/:id | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /catch/:id/edit | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /gallery | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /stats | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /profile | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /privacy | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /privacy-policy | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /terms | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /settings | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /notifications | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /insights | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /season-story | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /year-summary | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /supporter | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /trips | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /trips/new | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /trips/:id | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /trips/:id/edit | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /waters | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /waters/new | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /waters/:waterId/edit | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /waters/:waterId | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /waters/:waterId/chat | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /hotspots | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /community | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /community/catch/:catchId | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /community/:postId/report | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /nearby | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| /crew | Zdroj a základní místní trasa; přihlášené varianty neověřené |
| * | Zdroj a základní místní trasa; přihlášené varianty neověřené |

## Skutečně změřené rozměry

Home, Journal, Gallery, Insights, Settings a Add: agent provedl 48 kontrol pro šířky 320, 360, 375, 390, 430, 768, 1024, 1440 px; bez vodorovného přetečení dokumentu. Na Home mají Quick Catch tlačítka výšku 48 px a sdílené obsahové odsazení. Root znovu ověřil Home ve všech osmi šířkách, rozbalil podklady a zkontroloval Catch Detail v mobilu i v krajině 844×390. Dokument v krajině měl clientWidth=scrollWidth=829; žádná konzolová chyba.

Agent ověřil dialog filtrů Galerie v 390 px: celý viditelný, výška 449 px, ovladače neblokuje navigace. Základní detail a editor úlovku nepřetékaly v 320 px. Screenshot Home zobrazuje skutečné dva místní testovací záznamy; nebyla do něj vložena produkční osobní data.

## Úpravy a hranice

Sdílené tokeny a styly doplňují pouze nízkospecifické výchozí styly neostylovaných prvků. Zachovány komponenty Card/Button, tmavá/zelená identita, mapové vrstvy, existující dialogy a jejich chování. Rozbalovací analýzy, zdrojové seznamy, AI návrhy a nové Trip defaults mají vlastní čitelné styly. Ovladače mají viditelný focus, zalamování dlouhých českých textů a bezpečné rozměry.

Vizuálně NEOVĚŘENO: skutečně přihlášené AI výsledky a souhlasy v produkci, bohatý Catch Detail s reálným online doplněním, všechny dynamické komunitní/Trip/Water detaily s existujícím produkčním obsahem, fyzický iPhone, systémová kamera a nainstalovaná PWA po úplném zavření. Přístupnost byla kontrolována přes sémantiku/AX, focus a velikost prvků; neproběhl audit fyzickou čtečkou obrazovky. Supporter zůstává vypnutý.
