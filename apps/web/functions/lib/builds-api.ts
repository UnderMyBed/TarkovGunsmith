/**
 * Where the Pages Functions reach the builds-api Worker.
 *
 * `BUILDS_API_URL` remains the override — set it on a Pages environment and it
 * wins. What changed is what happens when it is UNSET. It used to mean every
 * `/api/builds`, `/api/pairs` and `/og/*` request returned
 * `500 BUILDS_API_URL not configured on this environment`, and because nothing
 * failed at deploy time that is exactly what production served, silently, for
 * months: build and comparison sharing were dead while every gate stayed green.
 *
 * A required-but-unset public hostname is a configuration trap, not a safety
 * feature. The Worker's address is not a secret — it is declared in
 * `apps/builds-api/wrangler.jsonc` as a custom domain and `wrangler deploy`
 * owns the DNS record — so the honest default is the address it actually has.
 *
 * Keep this in step with the `routes` entry in `apps/builds-api/wrangler.jsonc`;
 * `repo-guards` asserts the two agree, so a change to one fails a test rather
 * than quietly pointing the edge at a host that no longer answers.
 */
export const DEFAULT_BUILDS_API_URL = "https://api.tarkovgunsmith.undermybed.dev";

/**
 * Resolve the builds-api base for a request, preferring an explicit binding.
 * Trailing slashes are trimmed so callers can append `/builds/<id>` freely.
 */
export function buildsApiBase(env: { BUILDS_API_URL?: string }): string {
  const configured = env.BUILDS_API_URL?.trim();
  return (configured && configured.length > 0 ? configured : DEFAULT_BUILDS_API_URL).replace(
    /\/+$/,
    "",
  );
}
