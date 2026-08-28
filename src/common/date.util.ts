// No date library is used anywhere in this codebase — plain Date math only,
// matching the existing convention (e.g. `new Date(Date.now() + n * 86_400_000)`).
export function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function isSameUTCDay(a: Date, b: Date): boolean {
  return startOfUTCDay(a).getTime() === startOfUTCDay(b).getTime();
}

export function startOfUTCMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

// ISO week — Monday 00:00 UTC of the week containing `d`. getUTCDay() is
// 0=Sunday..6=Saturday; the `(day + 6) % 7` rotation makes Monday the 0th
// day instead of Sunday, so subtracting that many days always lands on
// this week's Monday regardless of which day `d` itself falls on.
export function startOfUTCWeek(d: Date): Date {
  const day = startOfUTCDay(d);
  const mondayOffset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - mondayOffset);
  return day;
}
