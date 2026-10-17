/** Path segments that are ids, and the route template each one is sent as. */
const ROUTE_TEMPLATES: readonly [RegExp, string][] = [
  // A pair id grants access to the pair, and tells aggregation nothing.
  [/^\/builder\/compare\/[\w-]+/, "/builder/compare/:pairId"],
  // Likewise a build id; `/builder/compare` itself is a route, not an id.
  [/^\/builder\/(?!compare(?:\/|$))[\w-]+/, "/builder/:id"],
];

/**
 * One URL as Faro may send it: no query string or fragment, and a build or pair id replaced
 * by its route template.
 */
function scrubUrl(url: string): string {
  const match = /^(https?:\/\/[^/?#\s"'<>]*)([^?#\s"'<>]*)/.exec(url);
  if (!match) return url;
  const [, origin, path] = match as unknown as [string, string, string];
  let templated = path;
  for (const [pattern, template] of ROUTE_TEMPLATES) {
    if (pattern.test(templated)) {
      templated = templated.replace(pattern, template);
      break;
    }
  }
  return origin + templated;
}

/** Applies {@link scrubUrl} to every http(s) URL in `text`, wherever it appears. */
export function scrubText(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>]+/g, scrubUrl);
}

/**
 * Returns `value` with {@link scrubText} applied to every string in it, at any depth: page
 * URLs, navigation targets, error messages and stack frames. Faro's `beforeSend`.
 */
export function scrubUrls<T>(value: T): T {
  if (typeof value === "string") return scrubText(value) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => scrubUrls(v)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, scrubUrls(v as unknown)]),
    ) as T;
  }
  return value;
}
