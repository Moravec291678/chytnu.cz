export function buildHomeInsight(catches) {
  const methods = new Map();
  for (const record of catches) {
    const key = record.method?.key;
    if (!key) continue;
    const current = methods.get(key) ?? { label: record.method.label || key, count: 0 };
    current.count += 1;
    methods.set(key, current);
  }

  const topMethod = [...methods.values()].sort((left, right) => right.count - left.count)[0];
  if (catches.length >= 5 && topMethod && topMethod.count / catches.length >= 0.6) {
    return {
      title: "Tvůj rybářský vzorec",
      message: `${topMethod.label} je zatím nejčastější metoda: ${topMethod.count} z ${catches.length} úlovků.`,
      source: "Osobní deník",
      basedOnRecords: catches.length,
      isInsight: true,
    };
  }

  return {
    title: "Tip pro tvůj deník",
    message: catches.length < 5
      ? "S několika dalšími záznamy se začnou rýsovat první osobní vzorce."
      : "Přidej metodu nebo poznámku k úlovku, aby budoucí přehledy vycházely z úplnějších údajů.",
    source: catches.length < 5 ? `Zatím ${catches.length} ${catches.length === 1 ? "záznam" : "záznamů"}` : "Tip pro přesnější statistiky",
    basedOnRecords: catches.length,
    isInsight: false,
  };
}
