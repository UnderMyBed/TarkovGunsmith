/**
 * Filter a list of named rows by case-insensitive substring match on `name`.
 * Empty / whitespace-only queries return the input unchanged.
 *
 * @example
 *   filterRowsByName(ammos, "m8")
 */
export function filterRowsByName<T extends { name: string }>(
  rows: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...rows];
  return rows.filter((r) => r.name.toLowerCase().includes(q));
}
