# Akceptace přítomnosti na revíru

**PARTIAL · 21. 11. 2026.** Katalog `be90ad549cf77679` má 1 451 unikátních RIS ID a 1 451 detailů. 1 263 bodů (87,04 %) odpovídá detailům, 188 jich chybí a ověřených polygonů je 0. Tři dvojice používají společný bod, jedno číslo patří dvěma ID. Seznam revírů je veřejně dostupný; oprávnění k dalšímu šíření převzatých popisů, pravidel a dat zůstává k potvrzení vlastníkem. [Zdroj ČRS/RIS](https://www.rybsvaz.cz/seznam-reviru) · [Kontrola geometrie](SOCIAL_RIS_GEOMETRY.md)

## Klasifikace

- **Potvrzeno uživatelem** · Uživatel explicitně zvolil platné RIS ID. Server zná současný revír a relaci, bez GPS. Změna názvu se stejným ID relaci nepřepisuje. ID nepřítomné v katalogu nepovolí nový vstup.
- **Blízký návrh** · Referenční bod a vzdálenost slouží při výběru. Výběr zůstává na uživateli, včetně případů více vod na jednom bodě.
- **Ověřená hranice** · V tomto datasetu nedostupná. Členství je výslovně potvrzená relace k revíru. Neukazuje fyzickou přítomnost ani spolehlivost polohy.
- **Nedostupná poloha** · Revír lze vybrat názvem či číslem. Chybějící souřadnice nevytvoří náhradní bod.

## Server a důkaz

- Firestore odmítá přímé čtení a zápisy. Handler ověřuje Firebase identitu. Služba přijme explicitně potvrzené katalogové ID. Blokuje suspendované a mazané účty a chrání obnovení/přepnutí rotací ID relace. Relace trvá 30 minut; starý stav zařízení nemůže ukončit nebo přepsat novější relaci.
- 22 skutečných emulátorových kontrol v promptu 29, včetně anonymního přístupu, cizí relace, odmítnutých GPS polí, expiry a zastaralého ID. 23 cílených testů v promptu 30 ověřilo členství a stav na jiném revíru, souřadnice, stabilní ID, duplicitní číslo a manuální fallback. Čerstvý fyzický průchod chybí.
- Serverová relace umožňuje vázat budoucí chat na potvrzené členství. Členství samo nepouští žádný produkční chat. Blokování mezi účty se ověřuje navíc při čtení příspěvků a zpráv. Veřejné zapnutí čeká na akceptaci chatu, moderaci a potvrzení práv.
