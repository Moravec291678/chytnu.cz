# Supporter — produktový základ

## Stav

Supporter je připravený pouze jako návrh produktu. Feature flag `FEATURES.supporter` v `src/product/config/featureFlags.js` zůstává `false`. Neexistuje checkout ani integrace Stripe, App Store nebo Google Play. Žádná platba se neprovádí.

## Bezplatná verze

Současné bezplatné funkce zůstávají beze změny. Limit nových fotografií je stále 4 na úlovek. Supporter logika tento limit při výchozím vypnutém flagu nezvýší.

## Navržené schopnosti

Stabilní capability IDs a budoucí limity jsou v `src/product/config/supporter.js`:

- `catch.photos.extended` — budoucí limit 8 fotografií; Free zůstává 4.
- `stats.advanced` — pokročilé statistiky.
- `filters.saved` — uložené filtry.
- `profile.supporter-style` — vzhled profilu.
- `share.extra-themes` — další motivy sdílecí karty.

Před zapnutím každé funkce je potřeba připojit serverem ověřený entitlement a ověřovat jej také na serverových operacích. `canUse()` je klientská UX pomůcka, ne bezpečnostní hranice.

## Kde se co mění

- Návrh výhod: `src/product/config/supporter.js`.
- Globální vypínač: `src/product/config/featureFlags.js`.
- Rozhodování o přístupu a expiration: `src/features/entitlements/data/entitlementAccess.js`.
- Testy stavů a zachování fotek: `src/features/entitlements/data/entitlementAccess.test.js`.

## Před jakýmkoli budoucím zapnutím

Je nutné přidat owner-scoped serverový entitlement zdroj, bezpečné ověřování a revokaci, API/rules testy, migraci jen pokud se mění uložené schéma, a ověřit offline chování. Nepřepínej produkční flag, dokud server není schopen entitlement autoritativně ověřit. Tato etapa platební infrastrukturu nezavádí.
