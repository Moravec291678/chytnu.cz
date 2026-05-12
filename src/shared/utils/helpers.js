export function getSeason() {
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return "Jaro";
  if (month >= 6 && month <= 8) return "Léto";
  if (month >= 9 && month <= 11) return "Podzim";
  return "Zima";
}

export function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
