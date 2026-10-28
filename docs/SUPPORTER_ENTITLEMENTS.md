# Supporter entitlements

## Capability engine

Volání pro UI používá stabilní ID:

```js
import { createEntitlementEngine } from "../src/features/entitlements/data/entitlementAccess.js";

const entitlements = createEntitlementEngine({ snapshot: serverSnapshot });
entitlements.canUse("stats.advanced");
```

Engine a jednoduchá funkce `canUse(capabilityId, snapshot)` jsou v `src/features/entitlements/data/entitlementAccess.js`. Neznámá capability se zamítne. Supporter capability vyžaduje globální flag `supporter: true`, serverově označený ověřený snapshot, aktivní stav a odpovídající entitlement. Výchozí flag je `false`, proto všechny budoucí výhody zůstávají vypnuté.

Příklad návrhu serverového snapshotu:

```json
{
  "ownerId": "server-authenticated-owner",
  "planId": "supporter",
  "status": "active",
  "entitlements": ["supporter"],
  "startsAt": "2026-10-01T00:00:00.000Z",
  "expiresAt": "2026-11-01T00:00:00.000Z",
  "graceUntil": null,
  "updatedAt": "2026-10-01T00:00:00.000Z"
}
```

`source: "server"` a `verified: true` jsou interní důvěryhodné metadata předávané pouze z ověřené serverové vrstvy. Klient si je nesmí nastavit z profilu, localStorage ani z request payloadu. Samotný klientský `canUse()` nelze považovat za autorizaci; server musí před chráněnou operací sám načíst owner-scoped záznam a rozhodnout.

## Stavový model

| Stav | Přístup | Význam |
|---|---|---|
| `active` | ano, dokud nevyprší `expiresAt` | oprávnění právě platí |
| `grace` | ano pouze do `graceUntil` | dočasná ochranná lhůta potvrzená serverem |
| `expired` | ne | oprávnění skončilo |
| `cancelled` | ne | oprávnění bylo zrušeno |

Snapshot, který chybí, není označený jako serverový nebo má neplatné časové údaje, se zavře bez přístupu. Současná aplikace nemá zdroj, který by platný Supporter snapshot vydával; Preview proto nic neodemkne.

## Owner scope a budoucí server

Server musí odvodit owner ID z ověřené session, nikdy mu nevěřit ID majitele poslané klientem. Client rules nesmí dovolit klientovi upravit status, expiraci ani seznam oprávnění. Systém má podporovat revokaci, obnovení stavu napříč zařízeními a opětovné načtení po přihlášení.

Tento základ nevytváří platební API, webhook, Stripe secret, store nákup ani Firestore collection. Před připojením poskytovatele je potřeba navrhnout jeho serverové ověřování samostatně.
