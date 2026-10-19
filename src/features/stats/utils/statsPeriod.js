export function getPeriodRange(period, date) {
  if (period === "year") return [new Date(date.getFullYear(), 0, 1), new Date(date.getFullYear() + 1, 0, 1)];
  if (period !== "season") return null;

  const seasonStartYear = date.getMonth() >= 2 ? date.getFullYear() : date.getFullYear() - 1;
  return [new Date(seasonStartYear, 2, 1), new Date(date.getFullYear(), date.getMonth() + 1, 1)];
}

export function getPeriodLabel(period, date) {
  if (period === "total") return "Za celou dobu";
  if (period === "year") return `Rok ${date.getFullYear()}`;

  const seasonStartYear = date.getMonth() >= 2 ? date.getFullYear() : date.getFullYear() - 1;
  const seasonYear = seasonStartYear === date.getFullYear()
    ? String(seasonStartYear)
    : `${seasonStartYear}–${date.getFullYear()}`;
  const currentMonth = new Intl.DateTimeFormat("cs-CZ", { month: "long" }).format(date);
  return `Sezóna ${seasonYear} · březen až ${currentMonth}`;
}

export function getMonthlyCatchSeries(catches, period, date) {
  const range = getPeriodRange(period, date);
  const start = range?.[0] ?? new Date(date.getFullYear(), date.getMonth() - 5, 1);
  const end = range?.[1] ?? new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const counts = new Map();

  for (const record of catches) {
    const timestamp = Date.parse(record.caughtAt);
    if (!Number.isFinite(timestamp) || timestamp < start.getTime() || timestamp >= end.getTime()) continue;
    const caughtAt = new Date(timestamp);
    const key = `${caughtAt.getFullYear()}-${String(caughtAt.getMonth() + 1).padStart(2, "0")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const months = [];
  for (const cursor = new Date(start); cursor < end; cursor.setMonth(cursor.getMonth() + 1)) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: new Intl.DateTimeFormat("cs-CZ", { month: "short" }).format(cursor).replace(/\.$/, ""),
      count: counts.get(key) ?? 0,
    });
  }

  return { months, datedCatchCount: [...counts.values()].reduce((total, count) => total + count, 0) };
}
