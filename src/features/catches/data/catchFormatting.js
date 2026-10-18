const BOTTOM_TYPE_LABELS = Object.freeze({
  mud: "Bahno",
  sand: "Písek",
  gravel: "Štěrk",
  rocks: "Kamení",
});

export function formatBottomType(value) {
  if (!value) return null;
  return BOTTOM_TYPE_LABELS[value] ?? value;
}
