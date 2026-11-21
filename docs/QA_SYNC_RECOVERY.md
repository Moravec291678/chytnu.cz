# QA obnovení synchronizace · Prompt 05

**PARTIAL.** Důkazy jsou z Auth/Firestore emulátoru, oddělených lokálních databází a skutečného desktopového Chromia. Fyzické dva telefony, skutečný provider a přihlášený restart s reálným uploadem vyžadují akceptaci Promptů 06, 11 a 12.

## Zapisovací cesty

- Catch (druh, poznámka, soukromí, ruční metadata), výprava a revír mají owner-scoped lokální úložiště. Mutace vytvoří outbox operaci s ID a revizí, Firestore v transakci ověří identitu, typ dokumentu a očekávanou serverovou revizi. Změny a potvrzení slouží ke čtení přírůstků a opakování.
- Foto blob zůstává v IndexedDB. Firestore přenáší metadata a revize, binární upload poskytovatel ověřuje samostatně. Opakování používá zachované foto ID, fingerprint, oprávnění a durable stav. Smazání vlastníka uzavře tok a smazání záznamu vytvoří tombstone.
- Guest účet zůstává místní. Připojení staršího deníku vyžaduje explicitní rozhodnutí a zachovává identifikátory, fotografie, vazby a scope. První přihlášení potřebuje síť. Přihlášený uživatel může běžné lokální operace dokončit offline.

## Matice přerušení

| Přerušení | Ověřené chování |
| --- | --- |
| Server neodpovídá | Lokální outbox přetrvá, retry později odešle bez nového ID. Zaseknuté metadata uvolní zámek a manuální retry pokračuje. |
| Výpadek po serverovém zápisu | Stejné operationId vrátí existující revizi, nevytvoří druhou entitu. Novější lokální změna se zachová. |
| Stará revize na druhém zařízení | Obě verze se zachovají. Volba místní nebo vzdálené verze v Profilu se opírá o aktuální konflikt. |
| Přepnutí účtu při pull | Starý asynchronní výsledek nesmí zapsat do jiného scope. Staré auth chyby nesmějí schovat pozdější úspěch. Přihlášení A/B prověřeno v 02. |
| Chyba čtení fotky | Catch zůstane, chyba se projeví, související metadata se opakují odděleně od cursoru a ostatních záznamů. |
| Smazání úlovku a fotografie | Trvalé tombstones. Fixture má čtyři nové fotky včetně zrušené položky photo-4. Po výmazu jsou všechny child dokumenty označené a relevantní fronta prázdná. |
| Pozdní automatické doplnění | Revizní test Quick Catch uchovává ruční metodu, hloubku i teplotu na druhém zařízení. Obnoví se původní Catch a foto ID, žádná duplicita. |
| Úplný restart bez sítě | V auditním checkpointu Chromium načetl JPEG a Catch po úplném restartu. Prompt 01 znovu ověřil offline čtení po nové navigaci. Přihlášený fyzický restart s neodeslaným cloud uploadem neověřen. |

ID operací a úlovků jsou v izolovaném emulátoru generovaná. Test porovnává stejné konkrétní ID před a po replay, čtyři nové foto řádky a šest legacy tombstones; žádné produkční UID ani URL se nevypisují.

Uživatelský detail v Oznámeních odlišuje čekání, odesílání, synchronizováno, opakování a stav vyžadující pomoc. Neověřený idle stav již netvrdí, že je vše synchronizované. Tlačítko používá existující autentizovaný retry mechanismus. Globální indikátor zůstává krátký a při neaktivním nebo tichém retry neruší deník.

[Akceptace webu](RELEASE_ACCEPTANCE_CHECKLIST.md) · [Účty a relace](QA_AUTH_ACCOUNT_LIVE.md) · [Registr](RELEASE_EXECUTION_STATE.md).
