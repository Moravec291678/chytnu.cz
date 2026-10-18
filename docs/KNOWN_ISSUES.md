# Známé problémy a blokátory

## Release blokátory

1. Produkční Firebase projekt, EU region, billing a maximální rozpočet nejsou schválené.
2. Produkční e-mailové šablony/doručování, Google OAuth konfigurace, smazání účtu, export cloudových dat a retenční politika nejsou implementované.
3. PWA/offline shell nebyl potvrzen na reálném Chrome/Safari; IAB po vypnutí serveru zobrazil prázdnou stránku.
4. Chybí fyzické iOS/Android testy, store účty, privacy policy, podmínky, provozní kontakt a release metadata.
5. Open-Meteo komerční licence, kapacita a finální atribuce musí být schváleny.
6. OpenStreetMap veřejné tiles nemají SLA a nejsou produkčním mapovým kontraktem; před veřejným provozem je nutné zvolit poskytovatele podle očekávaného provozu.

## Technický dluh

- Produkční `npm audit --omit=dev` hlásí 6 nálezů: 4 high v Firebase/@grpc stromu a 2 moderate v React Routeru. Celý vývojový strom hlásí 17 nálezů (9 high, 8 moderate). Navrhované opravy vyžadují major změny nebo nevhodný downgrade; nebyl použit `--force`.
- Hlavní minifikovaný JS chunk klesl z přibližně 831–844 kB na přibližně 321 kB. Firebase sync a Leaflet se načítají odděleně; start je stále nutné změřit na slabším telefonu.
- Jedna fotografie na Catch; samostatný thumbnail objekt a odstranění EXIF nejsou implementované.
- Tombstones a operation receipts zatím nemají produkčně schválenou retenční/purge politiku.
- Konfliktové UI nabízí praktickou volbu lokální/vzdálená a časy, nikoli detailní rozdíl jednotlivých polí.
- Přesná GPS je soukromá, ale současný model zatím nerozlišuje přibližnou polohu. Mapový podklad vyžaduje síť; offline zůstávají Catch a souřadnice dostupné.
- Google popup v izolovaném in-app prohlížeči nešel dokončit; Google credential flow prošel proti Auth Emulatoru. Produkční popup/redirect vyžaduje běžný prohlížeč, autorizovanou doménu a skutečnou konfiguraci.

## Omezení testů

- Emulator testy nedokazují produkční kvóty, region, IAM, fakturaci, doručování e-mailu ani mobilní background sync.
- Browser QA použilo izolovaný IAB na 390 px a syntetická data. Google popup a plný offline restart zůstaly omezením IAB.
