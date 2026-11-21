# Právní podklady k potvrzení vlastníkem · Prompt 18

**PARTIAL.** Ověřená věcná úprava aplikačních textů je na vývojové větvi. Produkční zveřejnění čeká na potvrzení níže. Technické ověření pokrývá konkrétní cesty, právní posouzení a schválení náleží vlastníkovi a podle potřeby právníkovi.

## Doložená implementace

- /privacy-policy a /terms byly otevřeny před přihlášením a z Nastavení přihlášeného účtu, včetně vzájemných odkazů. Čtyři scénáře v Chromiu a 10 cílených Node testů PASS.
- Podmínky popisují pouze příběhy a rady z deníku, odstranily zastaralý popis druhové inference a jméno modelu závislé na konfiguraci. Nově uvádějí rozsah výslovné publikace, možnost odvolat sdílení a kontakt pro obsah Komunity. Privacy doplňuje technické úložiště pro relaci a offline plán. Kontaktní osoba a e-mail zůstaly ze stávajících veřejných textů.
- Místní JSON používá data aktivního profilu. Cloudový export uvádí nedostupné fotografie, samoobslužné sociální položky chybí. Výmaz účtu vyžaduje nové ověření, cloudový úklid pokračuje ve frontě. Zkoušky a mezery zachycuje [export a výmaz](QA_EXPORT_DELETION.md).
- V klientovi jsou místní preference, Auth relace, IndexedDB a cache offline shellu. Kontrola zdrojového kódu nezjistila analytický nebo reklamní SDK. Skutečné cookies a administrativní integrace OAuth, Vercelu a poskytovatelů zkontroluje vlastník v určeném prostředí.
- GPS může sloužit k mapě, ručnímu kontextu vody a meteorologickému požadavku. Počasí používá Open-Meteo forecast nebo archiv a předává souřadnice požadovaného místa. Soukromý originál a přesná GPS nepatří do veřejné projekce. Katalogový bod a vlastní zaznamenaná poloha jsou odlišné zdroje. [Audit revírů](QA_TRIPS_WATERS_MAPS.md), [podmínky Open-Meteo](https://open-meteo.com/en/terms).
- Leaflet vykresluje viditelnou atribuci OSM ve čtyřech mapových plochách. Dlaždice používají HTTPS a běžné browser cache, worker je nepřednačítá. Distribuční oznámení Leafletu prověřit při přípravě obchodů. [Atribuce OSM](https://www.openstreetmap.org/copyright), [pravidla dlaždic](https://operations.osmfoundation.org/policies/tiles/), [licence Leaflet](https://github.com/Leaflet/Leaflet/blob/main/LICENSE).

## Retence k potvrzení

- Rozepsaný úlovek lokálně expiruje po sedmi dnech, úklid probíhá při práci s místním úložištěm.
- Fyzické kopie u poskytovatelů, smazání objemného účtu a odstranění CDN jsou asynchronní. Dokončené technické doklady mají v kódu úklid po 29 dnech, závislý na běhu workeru. Tombstones chrání před obnovou ze starších zařízení, pro všechny záznamy není jedna univerzální lhůta.
- Nedokončený Nearby má platnost viditelnosti 20 minut a přítomnost u vody 30 minut. Tyto hodnoty nejsou záruka fyzického výmazu. Obě funkce jsou v kandidátu uzavřené.
- Volitelné AI běží se souhlasem a jen z vybrané poznámky nebo odvozených čísel. Provider uvádí omezenou retenci standardní nestavové inference a výjimky. Firebase má vlastní databázovou retenci souhlasu a výsledků podle nastavení a výmazu. [Cloudflare Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/).

## Podpis před zveřejněním

- [ ] David ověří identitu správce a dosažitelnost současného kontaktního e-mailu, právní základy pro jednotlivé účely, odpovědnosti a údaje podle čl. 13/14. Zvlášť potvrdí záměr, komunikaci a praktické consent postupy pro děti a externí AI. [ÚOOÚ](https://uoou.gov.cz/profesional/metodiky-a-doporuceni-pro-spravce/metodika-k-plneni-informacni-povinnosti-a-k-souvisejicim-ujednanim-vuci-zakaznikum), [GDPR](https://eur-lex.europa.eu/legal-content/cs/TXT/?uri=CELEX%3A32016R0679).
- [ ] David zkontroluje regiony, případné přenosy, smlouvy, cookies a skutečný tarif a retenci v každé konzoli. Schválí přesný rozsah Cloudflare a provoz bez reklam nebo potvrzenou alternativu. [Firebase](https://firebase.google.com/support/privacy), [Cloudinary](https://cloudinary.com/privacy), [Vercel](https://vercel.com/legal/privacy-policy), [Cloudflare](https://developers.cloudflare.com/workers-ai/platform/data-usage/).
- [ ] David se správcem ČRS/RIS potvrdí písemně právo další distribuce celého katalogového exportu a podmínky aktualizace. Veřejné zobrazení RIS dokládá původ dat. Dále schválí dostupnost aktualizací, OSM atribuci a oprávnění k bezplatnému počasí pro zamýšlený model. [ČRS/RIS](https://ris.rybsvaz.cz/crs/reviry).
- [ ] Podle skutečného sociálního rozsahu vlastník nebo právník určí použitelnou klasifikaci DSA. Potvrdí veřejný kontakt, přijímání hlášení, oznámení rozhodnutí s odůvodněním a opravné prostředky, pokud se uplatní. Aktuální autorizované hlášení a moderace mají emulátorový důkaz, úplný právně posouzený veřejný proces zatím není doložen. [Evropská komise](https://digital-strategy.ec.europa.eu/en/faqs/dsa-transparency-database-questions-and-answers).
- [ ] Schválit nové znění a jeho účinnost. Ověřit export, výmaz a případný obchodový požadavek veřejné cesty výmazu. Publikovat po release gate.
