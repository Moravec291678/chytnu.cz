# Uzavřený pilot pro 10–20 testerů · Prompt 21

**NO-GO, pilot nezahájen.** Produkční alias dál běží na stávající verzi. Schválený seznam, bezpečné prostředí a skutečné testovací účty se doplní po potvrzení Davidem.

## Rozsah

Pilot ověřuje soukromý deník, úlovky, fotky, vycházky, revíry a místní statistiky. Rozsah zařízení schvaluje vlastník po [Androidu](DEVICE_ANDROID_PWA_ACCEPTANCE.md) a [iPhonu](DEVICE_IOS_PWA_ACCEPTANCE.md). Komunitní funkce mohou být součástí pouze samostatně schváleného rozsahu s ověřeným sdílením a revokací. Water Chat, Nearby, přítomnost u vody, soukromé zprávy a Crew se v pilotu neotevírají. Externí AI má vlastní souhlas a provozní bránu.

ChytnuCz používá existující Firebase účty a role. Pozvánka sama neposkytuje oprávnění. Pilot se provozuje na ověřeném izolovaném preview s omezením přístupu na schválené účty. Vercel konfigurace má ochranu all_except_custom_domains, bez přihlášení vrátilo preview 319b520 HTTP 302 na vercel.com. To ověřuje přístup k nasazení, nikoli izolaci Firebase a Cloudinary. Vlastník ověří způsob zpřístupnění preview pozvaným a samostatnou konfiguraci projektu před pozvánkami. Veřejnou produkční registraci nelze považovat za zámek pilotu.

## Příprava a instrukce

1. David potvrdí pilotního správce, kontakt a 10–20 dobrovolníků. Dva syntetické účty A/B vytvoří pouze v izolovaném preview. A použije dvě zařízení, B má oddělená data. Sdílet jen neosobní vzorové fotky a přibližná místa. Vlastník potvrdí, že data A/B zůstanou oddělená od živého deníku.
2. Před pozvánkou provést síť / Letadlo / restart / obnovení, Reload s uloženou fotkou, chybějící GPS, kontrolu sync, export a úplný výmaz schváleného A. B nesmí vidět A soukromá data. Záznam exportu/výmazu neuveřejňovat.
3. V sociálním pilotu výslovně oznámit, že režim veřejného profilu je navržený v nastavení, aktivuje se samostatným potvrzením a soukromá volba je dostupná. Emulátorový prohlížeč ověřil čtyři skutečné kroky, včetně zablokovaného uložení bez souhlasu a nepřístupného soukromého profilu anonymně. Rozšíření na veřejný web nemění dříve uložené preference ani historické záznamy.
4. Sběr závad směřuje na schválený kontakt ze zásad. Tester uvádí model, OS, datum, build, kroky a očekávané chování bez souřadnic, obsahu deníku, tokenu či veřejně uložené fotografie. Pro skutečné sdílení použít Nahlásit tam, kde je schválené. Vlastník sleduje [denní provoz](OPERATIONS_RUNBOOK.md), [70/85 % limity](CAPACITY_COST_GUARDRAILS.md) a [kritéria zastavení](PILOT_EXIT_CRITERIA.md).

## Návrh pozvánky

Ahoj, zveme tě do uzavřeného testu ChytnuCz, rybářského deníku pro ukládání fotek, úlovků a vycházek. Po potvrzení termínu ti pošleme přístup a krátký scénář. Nejvíc nám pomůže, když zkusíš uložit testovací úlovek při vypnuté síti, aplikaci úplně zavřít a po otevření ověřit fotku. Používej prosím neosobní snímky a žádná přesná místa. Pokud se něco pokazí, napiš nám postup, typ telefonu a číslo sestavení. Účast je dobrovolná, test můžeš kdykoli ukončit a požádat o odstranění testovacích dat.
