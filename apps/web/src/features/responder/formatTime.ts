/** Displays an ISO-8601 UTC timestamp in local time plus a relative hint. */
export function formatTimestamp(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "Unknown time";
  const absolute = new Date(t).toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
  return `${absolute} (${formatRelative(t, now)})`;
}

export function formatRelative(t: number, now: Date): string {
  const diffSec = Math.round((now.getTime() - t) / 1000);
  if (diffSec < 0) return "in the future — check device clock";
  if (diffSec < 60) return "just now";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ${min % 60} min ago`;
  return `${Math.floor(hr / 24)} d ago`;
}
