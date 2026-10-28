# Průvodce produktovými změnami

Produktové hodnoty jsou data v `src/product/config/`. Výpočty a chování zůstávají ve feature enginech. Generovaný katalog aktualizuj příkazem `npm run product:inventory`; ruční přehled je v `docs/PRODUCT_CATALOG.md`.

## Jak změnit XP

Uprav `src/product/config/xp.js`. XP za achievements patří přímo k definici v `achievements.js`; odměny challenge odkazují na `xpKey`.

Serverové claimy načítají stejné XP konfigurace přes `src/server/serverRewardCalculator.js`. Změna ovlivní budoucí výpočty, sama nepřepíše již uložené reward events ani staré XP. Před změnou capu, multiplieru nebo pravidel ověř ledger testy a serverové claim testy.

## Jak přidat achievement

1. Přidej definici do `src/product/config/achievements.js`.
2. Dej jí nové stabilní ID tvořené z ASCII, například `first-night-catch`. ID neodvozuj od českého názvu.
3. Vyber podporovaný `ruleKey` a nastav název, popis, cíl a XP.
4. Pokud potřebuješ nové pravidlo, rozšiř achievement engine v `src/features/progression/data/progression.js` a přidej testy.
5. Spusť validátor a progression/ledger testy.

Achievement ID se ukládá do reward ledgeru. Už vydaná ID nepřejmenovávej ani znovu nepoužívej.

## Jak vytvořit challenge

Denní, týdenní a sezónní definice jsou v `src/product/config/challenges.js`. Pro denní/týdenní položku použij existující `ruleKey`, platný `xpKey`, unikátní ID a kladný cíl. Nový typ vyžaduje odpovídající vyhodnocení v `src/features/progression/data/challenges.js` nebo `seasonalChallenge.js`, povolení v `src/product/config/validateProductConfig.js` a business testy.

Challenge ID se promítá do progression eventů. Změna období, podmínek nebo ID může ovlivnit další odměny; nejdřív projdi ledger deduplikaci a legacy chování.

## Jak vypnout feature

Nastav příslušnou hodnotu v `src/product/config/featureFlags.js` na `false`. Potom vyhledej její čtení (`isFeatureEnabled` nebo přímý import) a ověř, že všechny vstupy do feature skutečně respektují flag. Definice flagu sama automaticky nezakryje stránku ani nezastaví backend.

## Jak změnit text oznámení

Uprav `src/product/config/notifications.js`. Ověř, že deep link stále odpovídá route v `src/app/App.jsx`. Typ notification, který již mohl být uložen, nepřejmenovávej bez migrace. Příkaz `npm run product:inventory` kontroluje, zda odkazy ukazují na existující routy.

## Co vyžaduje migrační plán

- Změna nebo odstranění uloženého ID achievementu, challenge, notification type či jiného ledger reason key.
- Změna tvaru uloženého Catch, preference, notification nebo progression ledgeru.
- Změna pravidel/odměn, která má přepočítat již uložené XP nebo stav výzvy.
- Změna limitu, kterou současné Firestore rules, backup/restore nebo validace nepodporují.

Pouhá změna názvu či popisu obvykle migraci nevyžaduje. Neměň historické záznamy jen kvůli textu nebo novému defaultu.

## Jak změnu otestovat

Po každé produktové změně spusť:

```sh
npm run product:inventory
npm run lint
npm test
npm run build
git diff --check
```

Podle oblasti spusť také progression/ledger, notifications, sync, backup nebo rules testy. Generovaný katalog je kontrolní výstup; commituj jej spolu s úpravou produktových dat, aby změna byla přezkoumatelná. Pokud validace nebo test selže, neopravuj výstup ručně — oprav zdrojovou konfiguraci či engine.
