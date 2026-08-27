// No date library is used anywhere in this codebase — plain Date math only,
// matching the existing convention (e.g. `new Date(Date.now() + n * 86_400_000)`).
export function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function isSameUTCDay(a: Date, b: Date): boolean {
  return startOfUTCDay(a).getTime() === startOfUTCDay(b).getTime();
}
