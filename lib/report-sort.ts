export function manualSort<T>(arr: T[], order: string[], key: (x: T) => string): T[] {
  const index = new Map(order.map((v, i) => [v, i] as const));
  return [...arr].sort((a, b) => {
    const ai = index.get(key(a)) ?? order.length;
    const bi = index.get(key(b)) ?? order.length;
    if (ai !== bi) return ai - bi;
    return key(a).localeCompare(key(b));
  });
}

export function uniqueOrdered<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
