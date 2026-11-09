const number = value => Number.isFinite(value) && value >= 0 ? value : undefined;
export function supportProgressionSnapshot(summary, events) {
  const rows = (items, key) => (items ?? []).slice(0, 100).map(item => ({ id: String(item.id ?? item.speciesKey ?? "").slice(0, 180), label: String(item.title ?? item.name ?? item.speciesKey ?? item.id ?? key).slice(0, 180),
    ...(number(item.xp) !== undefined ? { xp: item.xp } : {}), ...(typeof item.isCompleted === "boolean" ? { completed: item.isCompleted } : {}), ...(number(item.progress) !== undefined ? { progress: item.progress } : {}) }));
  return { baseXp: Math.max(0, Math.round(summary.xp - (summary.adminAdjustmentXp ?? 0))), achievements: rows(summary.achievements, "Achievement"), mastery: rows(summary.mastery, "Druhové mistrovství"),
    challenges: events.filter(e => e.type === "challenge.completed").slice(-100).map(e => ({ id: e.reasonKey.slice(0, 180), label: "Dokončená výzva", xp: e.xp, completed: true, ...(e.occurredAt ? { occurredAt: e.occurredAt } : {}) })),
    rewards: events.slice(-100).map(e => ({ id: e.id.slice(0, 180), label: e.type, xp: Math.max(0, Number(e.xp) || 0), ...(e.occurredAt ? { occurredAt: e.occurredAt } : {}) })),
    ...(Number.isInteger(summary.streak?.weeks) ? { streak: summary.streak.weeks } : {}) };
}
