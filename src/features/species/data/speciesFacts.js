export function getSpeciesFacts(species) {
  const facts = Array.isArray(species?.facts)
    ? species.facts.filter((fact) => typeof fact === "string" && fact.trim())
    : [];
  return facts.length > 0 ? facts : null;
}
