# Známé problémy a blokátory

## Release blokátory

1. Produkční Firebase projekt, EU region, billing a maximální rozpočet nejsou schválené.
2. Produkční e-mailové šablony/doručování, smazání účtu, export cloudových dat a retenční politika nejsou implementované.
3. PWA/offline shell nebyl potvrzen na reálném Chrome/Safari; IAB po vypnutí serveru zobrazil prázdnou stránku.
4. Chybí fyzické iOS/Android testy, store účty, privacy policy, podmínky, provozní kontakt a release metadata.
5. Open-Meteo produkční licence/atribuce pro zamýšlený provoz musí být ověřena.

## Technický dluh

- Produkční `npm audit --omit=dev` hlásí 6 nálezů: 4 high v Firebase/@grpc stromu a 2 moderate v React Routeru. Celý vývojový strom hlásí 17 nálezů (9 high, 8 moderate). Navrhované opravy vyžadují major změny nebo nevhodný downgrade; nebyl použit `--force`.
- Hlavní minifikovaný JS chunk má přibližně 831 kB. Build je funkční, ale před veřejnou beta verzí je vhodné změřit start na slabším telefonu a případně bezpečně rozdělit bundle.
- Jedna fotografie na Catch; samostatný thumbnail objekt a odstranění EXIF nejsou implementované.
- Tombstones a operation receipts zatím nemají produkčně schválenou retenční/purge politiku.
- Konfliktové UI nabízí praktickou volbu lokální/vzdálená a časy, nikoli detailní rozdíl jednotlivých polí.
- GPS je volný text. Nelze nad ním stavět spolehlivou osobní mapu.

## Omezení testů

- Emulator testy nedokazují produkční kvóty, region, IAM, fakturaci, doručování e-mailu ani mobilní background sync.
- Browser QA použilo izolovaný IAB na 390 px a syntetická data. Smazání přes UI nebylo v tomto bloku zopakováno.
