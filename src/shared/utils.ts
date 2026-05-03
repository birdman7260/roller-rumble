export function nowIso(): string {
  return new Date().toISOString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function groupBy<TValue, TKey extends string | number>(
  values: TValue[],
  keySelector: (value: TValue) => TKey
): Record<TKey, TValue[]> {
  const grouped = values.reduce<Partial<Record<TKey, TValue[]>>>((acc, value) => {
    const key = keySelector(value);
    const existing = acc[key];
    if (!existing) {
      acc[key] = [];
    }
    acc[key]?.push(value);
    return acc;
  }, {});

  return grouped as Record<TKey, TValue[]>;
}

export function sortBy<TValue>(
  values: TValue[],
  selector: (value: TValue) => string | number
): TValue[] {
  return [...values].sort((left, right) => {
    const a = selector(left);
    const b = selector(right);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
}
