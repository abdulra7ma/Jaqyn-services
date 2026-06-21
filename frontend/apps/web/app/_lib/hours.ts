// Open/closed from working_hours ({"mon":["09:00","21:00"], …}) vs local time.
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function isOpenNow(
  hours: Record<string, [string, string]> | Record<string, string> | null | undefined,
): boolean | null {
  if (!hours) return null;
  if ((hours as Record<string, string>).display) return null;
  const now = new Date();
  const span = (hours as Record<string, [string, string]>)[DAYS[now.getDay()]!];
  if (!span) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= toMinutes(span[0]) && cur <= toMinutes(span[1]);
}
