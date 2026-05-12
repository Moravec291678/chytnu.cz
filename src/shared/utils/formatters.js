export function formatDurationFromStart(startedAt) {
  const now = new Date();
  const start = new Date(startedAt);
  const diffMs = now - start;

  const hours = Math.floor(diffMs / 1000 / 60 / 60);
  const minutes = Math.floor((diffMs / 1000 / 60) % 60);
  const seconds = Math.floor((diffMs / 1000) % 60);

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function formatCatchDateTime(date) {
  return `${date.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
  })} · ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

export function formatFightDuration(minutes) {
  return minutes ? `${minutes} min` : "-";
}
