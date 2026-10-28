export const SUPPORTER_BENEFITS = Object.freeze([
  "AI příběh sezóny",
  "Pokročilé statistiky",
  "Zmrazení série 2×",
  "Export deníku do PDF",
  "Nápověda ke skrytým úspěchům",
  "Vytvoření crew",
  "Badge Supporter",
]);

// Capability names are stable product IDs. Access rules live in the entitlement engine.
export const SUPPORTER_CAPABILITIES = Object.freeze({
  "catch.photos.extended": Object.freeze({ requiredEntitlement: "supporter", freeLimit: 4, supporterLimit: 8 }),
  "stats.advanced": Object.freeze({ requiredEntitlement: "supporter" }),
  "filters.saved": Object.freeze({ requiredEntitlement: "supporter" }),
  "profile.supporter-style": Object.freeze({ requiredEntitlement: "supporter" }),
  "share.extra-themes": Object.freeze({ requiredEntitlement: "supporter" }),
});

export const FREE_FEATURES = Object.freeze([
  "Neomezený deník",
  "XP, úrovně a úspěchy",
  "Feed a okolí podle dostupnosti služby",
  "Základní statistiky",
  "Revíry",
]);

export const SUPPORTER_COSMETICS = Object.freeze([
  { name: "Rám avatara", proposedPrice: "29 Kč" },
  { name: "Badge", proposedPrice: "39 Kč" },
  { name: "Zlatý záblesk", proposedPrice: "49 Kč" },
].map((item) => Object.freeze(item)));

export const SUPPORTER_COPY = Object.freeze({
  plan: "Plán podpory · návrh ceny od 69 Kč měsíčně",
  unavailable: "Nákup zatím není dostupný",
  note: "Cena je pouze návrh produktu. Checkout ani platby nejsou aktivní.",
});
