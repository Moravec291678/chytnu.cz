# Supporter expiration a zachování dat

## Pravidlo pro fotografie

Ukončení Supporter entitlement nikdy nemaže, neořezává ani neznepřístupňuje uložené fotky. Catch s osmi fotografiemi zůstane celý dostupný v deníku, detailu i galerii. Existující `createCatchRecord()` už při editaci dovoluje ponechat původní počet fotek; nový Catch zůstává omezený na Free limit 4.

Po skončení entitlement engine vrací pro `catch.photos.extended` limit nového přidávání 4. Počet existujících fotografií se uchovává samostatně (`getCatchPhotoPreservationLimit`) a nic v policy helperu nemění data. Takový catch lze dál prohlížet a upravovat; při expiraci se nesmí fotografická pole automaticky přepsat limitem.

## Stav po expiraci

1. Serverový snapshot přejde na `expired` nebo `cancelled` (případně skončí serverem určená `grace`).
2. Klient po synchronizaci znovu vyhodnotí `canUse()` a přídavný limit.
3. Přidávání nad Free limit se zablokuje; existující fotografie zůstanou čitelné a synchronizované.
4. Odstranění fotografie je vždy výslovná akce uživatele. Expirace ji nikdy neprovede.

Server musí stejný limit znovu vynutit při ukládání. Klientská kontrola je pouze UX; v současné etapě není serverový entitlement writer ani nákupní zdroj. Výchozí flag `supporter` je vypnutý, takže reálný limit nových Catch zůstává 4.

## Testovací případy

- serverový `active` grant zpřístupní capability pouze pokud je testovací feature flag zapnutý;
- `grace` funguje pouze před `graceUntil`;
- `expired`, `cancelled`, neplatný či chybějící snapshot přístup neposkytne;
- expired Catch s osmi uloženými fotkami stále vrátí osm zachovaných položek, ale nové přidávání je omezené na čtyři;
- běžný build a existující photo persistence/upload/recovery testy zůstávají beze změny.
