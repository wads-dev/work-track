/** Structural identity only, not a data selector. Firestore object key order is irrelevant. */
export function stableDataKey(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v))
      return Object.fromEntries(
        Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      );
    return v;
  });
}
