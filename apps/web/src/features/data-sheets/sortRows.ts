export type SortDirection = "asc" | "desc";

/**
 * Stable sort of rows by a given key. String keys use locale-aware compare;
 * numeric keys use simple subtraction. Direction flips the result. The input
 * is never mutated.
 *
 * @example
 *   sortRows(ammos, "damage", "desc");
 */
export function sortRows<T extends Record<string, unknown>, K extends keyof T>(
  rows: readonly T[],
  key: K,
  direction: SortDirection,
): T[] {
  const sign = direction === "asc" ? 1 : -1;
  const copy = [...rows];
  copy.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * sign;
    }
    const as = String(av);
    const bs = String(bv);
    return as.localeCompare(bs) * sign;
  });
  return copy;
}
