// "2026-11-07" in LOCAL time. Matches the deadline format the app already uses.
export function dateKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return dateKey(d);
}