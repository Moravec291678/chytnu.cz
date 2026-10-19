// FishBase Bayesian length-weight estimates (Ref. 93245), accessed 2026-10-19.
// FishBase reports W in grams and total length (TL) in centimetres. These are
// species-level population estimates, not individual measured weights.
const FISHBASE_REFERENCE = "https://www.fishbase.se/summary/";

export const LENGTH_WEIGHT_RELATIONSHIPS = Object.freeze({
  commonCarp: { speciesId: "commonCarp", scientificName: "Cyprinus carpio", fishBaseId: 1450, a: 0.01778, b: 2.95, lengthType: "TL", lengthUnit: "cm", weightUnit: "g", source: "FishBase Bayesian length-weight (Ref. 93245)", sourceReference: `${FISHBASE_REFERENCE}1450` },
  northernPike: { speciesId: "northernPike", scientificName: "Esox lucius", fishBaseId: 258, a: 0.00447, b: 3.08, lengthType: "TL", lengthUnit: "cm", weightUnit: "g", source: "FishBase Bayesian length-weight (Ref. 93245)", sourceReference: `${FISHBASE_REFERENCE}258` },
  zander: { speciesId: "zander", scientificName: "Sander lucioperca", fishBaseId: 360, a: 0.00589, b: 3.12, lengthType: "TL", lengthUnit: "cm", weightUnit: "g", source: "FishBase Bayesian length-weight (Ref. 93245)", sourceReference: `${FISHBASE_REFERENCE}360` },
  europeanPerch: { speciesId: "europeanPerch", scientificName: "Perca fluviatilis", fishBaseId: 358, a: 0.00912, b: 3.11, lengthType: "TL", lengthUnit: "cm", weightUnit: "g", source: "FishBase Bayesian length-weight (Ref. 93245)", sourceReference: `${FISHBASE_REFERENCE}358` },
  tench: { speciesId: "tench", scientificName: "Tinca tinca", fishBaseId: 269, a: 0.01122, b: 3.02, lengthType: "TL", lengthUnit: "cm", weightUnit: "g", source: "FishBase Bayesian length-weight (Ref. 93245)", sourceReference: `${FISHBASE_REFERENCE}269` },
  welsCatfish: { speciesId: "welsCatfish", scientificName: "Silurus glanis", fishBaseId: 289, a: 0.00631, b: 2.99, lengthType: "TL", lengthUnit: "cm", weightUnit: "g", source: "FishBase Bayesian length-weight (Ref. 93245)", sourceReference: `${FISHBASE_REFERENCE}289` },
  brownTrout: { speciesId: "brownTrout", scientificName: "Salmo trutta", fishBaseId: 238, a: 0.00871, b: 3.03, lengthType: "TL", lengthUnit: "cm", weightUnit: "g", source: "FishBase Bayesian length-weight (Ref. 93245)", sourceReference: `${FISHBASE_REFERENCE}238` },
  rainbowTrout: { speciesId: "rainbowTrout", scientificName: "Oncorhynchus mykiss", fishBaseId: 239, a: 0.00933, b: 3.03, lengthType: "TL", lengthUnit: "cm", weightUnit: "g", source: "FishBase Bayesian length-weight (Ref. 93245)", sourceReference: `${FISHBASE_REFERENCE}239` },
});

export function estimateFishWeight(speciesId, lengthCm) {
  const relationship = LENGTH_WEIGHT_RELATIONSHIPS[speciesId];
  const length = typeof lengthCm === "string"
    ? Number(lengthCm.trim().replace(",", "."))
    : lengthCm;
  if (!relationship || !Number.isFinite(length) || length <= 0) return null;
  const grams = relationship.a * Math.pow(length, relationship.b);
  const roundedKg = Math.round(((grams / 1000) + Number.EPSILON) * 100) / 100;
  return Number.isFinite(roundedKg) && roundedKg > 0 ? roundedKg : null;
}

export function formatEstimatedWeight(weightKg) {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return "";
  return weightKg.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
