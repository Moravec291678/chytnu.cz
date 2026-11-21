# QA autentizace a účtu · Prompt 02

**Stav PARTIAL · 21. listopadu 2026.** Lokální Auth se dá akceptovat z emulátorových a prohlížečových scénářů. Produkční doručení e-mailu, skutečný Google provider a stav skutečně pozastaveného či smazaného účtu v živé relaci čekají na schválený test. Produkční záznamy nebyly upraveny.

## Ověřené scénáře

- Auth emulátor `demo-chytnucz-local`. Nový A, získání a použití ověřovacího OOB kódu a potvrzený emailVerified po reloadu. Reset kód ověřen proti účtu, jednorázově použit, pokus podruhé odmítnut. Staré heslo odmítnuto, nové povoleno, nová instance SDK obnoví relaci. Účetně odlišný uživatel B současně existuje a odhlášení B nezruší A.
- Guest záznam, vycházky a outbox beze změny po auth scénářích. Jeden nový očekávaný záznam scope A a jeho outbox operace se nikdy neobjeví ve scope B ani hosta. Neznámý e-mail a chybné heslo jsou odmítnuty. České aplikační hlášení je pro oba případy shodné.
- Google credential ověřen v emulátoru s testovacím providerem. Zavření popupu a bezpečné chybové mapování pokryty jednotkově. Zablokovaný popup přepíná na redirect dle existujícího testu. Chybějící připojení k Auth je odmítnuto s network-request-failed.
- Přímé API a role využívají platný rozsah aktuálně znovu ověřené Rules a sociální sady z Promptu 01. Chybějící a neplatný bearer, role a owner scope jsou ověřené v emulátoru. Produkční stav a chování starého tokenu po živém výmazu/suspendu zůstávají v 04/17. Emulátorový OOB kód nedokládá doručenou skutečnou zprávu.

- Dva izolované profily Chromium, jeden s trvalou relací a jeden bez volby Zapamatovat přihlášení. Oba prošly loginem, plným načtením Profilu, reloadem a odhlášením. Druhý profil má i po reloadu záznam pouze v sessionStorage. Reprodukovaný nedostatek bylo načítání pouze z trvalé persistence při startu; inicializace Firebase Auth nyní zohlední obě úložiště.

## Živý A/B smoke a kroky vlastníka

1. David vymezí izolované preview a dva vyhrazené testovací účty A/B s testovací schránkou. Ověří cílový projekt ve Firebase Console v přehledu projektu, v Authentication ověří metody Email/Password a Google a doménu v Settings → Authorized domains. V Authentication → Templates potvrdí odesílatele, jazyk, URL akce a bezpečný návrat.
2. V Chrome profilu A s testovacím guest úlovkem bez GPS založit účet, ověřit doručený e-mail, přihlásit a obnovit relaci. Použít pouze testovací média. Ve druhém profilu vytvořit B, porovnat vlastní scope a skutečně doručený reset u A. Zkusit chybné heslo, vypršelý nebo použitý odkaz, odhlášení, obnovu a volbu Zapamatovat přihlášení. Žádné skutečné adresy mimo schránky A/B.
3. Přihlásit se přes schválený Google účet, zkusit zavřít popup i odpovídající redirect. V odpojené relaci ověřit síťovou chybu a zachování hostovského záznamu. U neznámého testovacího e-mailu potvrdit stejnou veřejnou odpověď resetu a bezpečné chybové hlášení bez zveřejnění existence účtu.
4. V dohodnutém sandboxu vyzkoušet suspend a zneplatnění, nové ověření a výmaz pouze syntetického účtu v návaznosti na 04. Doložit výsledek nového přihlášení i odmítnutí privilegované operace v původní relaci. Do protokolu zapsat SHA, poskytovatele, stav/čas doručení a očekávání. Fotky, OOB kódy, bearer tokeny a identifikátory se nedokládají.

Dokončení živého testu závisí na REL-02 a povolených účtech. Viz [registr](RELEASE_EXECUTION_STATE.md) a [checklist](RELEASE_ACCEPTANCE_CHECKLIST.md).
