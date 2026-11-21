# Kritéria uzavřeného pilotu

**Rozhodnutí dnes: NO-GO.** Pilot se nejprve připravuje. O jeho zahájení a veřejném rozšíření rozhoduje vlastník samostatně.

## Zahájení

- [ ] Kandidát s exact SHA, zvolený rozsah a omezené testovací přístupy. Ověřit projekty a přístupové hranice preview Vercel, Firebase a Cloudinary.
- [ ] Žádné otevřené P0 a všechny P1 uzavřené nebo písemně schválené jako neblokující při skutečně omezeném rozsahu. Ztráta dat, cizí přístup nebo nefunkční výmaz bránu vždy blokují.
- [ ] Živý A/B, upload, povolené doručení a revokace. Dva účty ověřené mimo emulátor. Funkční test výmazu a obnovy.
- [ ] Android a iPhone PASS pod fyzickým protokolem nebo schválená omezená kompatibilita s uvedeným rozsahem. Ověřený provozní kontakt, přijetí upozornění a rollback.
- [ ] Potvrzený nezpoplatněný rozsah, licence RIS a potřebné poskytovatelské podmínky. Pozvánky schválené Davidem a žádný neautorizovaný příjemce.

## Provoz, zastavení a výstup

- Zastavit nábor okamžitě při potvrzeném úniku, ztrátě dat nebo opakovaném neúspěšném výmazu. Kapacitní prahy a incidenty řešit podle [provozní příručky](OPERATIONS_RUNBOOK.md). Uživatelům zachovat cestu k lokální záloze a odvolání sdílení.
- Tento pilot má návrh jednoho týdne se skutečně zapojenými 10–20 účty a zaznamenanými pozitivními i neúspěšnými scénáři. Opravy revalidovat na podporovaných fyzických zařízeních. Vyhodnotit retry, úspěšnost fotek, frontu, přihlášení, privátní hranice, crash a dostupnost podpory.
- Web může přejít k veřejnému oznámení jen s doloženými výsledky, udržitelnými kvótami, uzavřenými kritickými nálezy, živým smoke testem, rollbackem a písemným GO vlastníka. Viditelnost historických záznamů se při otevření nemění.
