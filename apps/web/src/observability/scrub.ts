/**
 * Removes query strings and fragments from every http(s) URL in `text`. Faro reports page
 * URLs, navigation targets and error messages; none of them may carry a query string.
 */
export function stripUrlQueries(text: string): string {
  return text.replace(/(https?:\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/g, "$1");
}

/**
 * Returns `value` with {@link stripUrlQueries} applied to every string in it, at any depth.
 * Used as Faro's `beforeSend`, so it sees each item exactly as it is about to be sent.
 */
export function scrubUrls<T>(value: T): T {
  if (typeof value === "string") return stripUrlQueries(value) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => scrubUrls(v)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, scrubUrls(v as unknown)]),
    ) as T;
  }
  return value;
}
