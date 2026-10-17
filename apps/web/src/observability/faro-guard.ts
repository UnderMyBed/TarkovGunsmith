/**
 * The only origins Faro reports from. Must equal the corsOrigins of the Faro app in
 * infra/grafana/faro-app.yaml; packages/repo-guards asserts the two agree.
 */
export const PRODUCTION_ORIGINS: readonly string[] = [
  "https://tarkov-gunsmith-web.pages.dev",
  "https://tarkovgunsmith.undermybed.dev",
];

/**
 * The share of sessions Faro records. Lower it if sessions approach the Grafana Cloud free
 * limit (docs/operations/observability.md).
 */
export const SAMPLING_RATE = 1.0;

/**
 * The collector URL Faro should report to from this page, or `null` when it must not start:
 * off the production origins (local dev, `wrangler pages dev`, every e2e run, preview
 * deploys) or when the build carries no URL.
 */
export function faroUrlFor(origin: string, faroUrl: string | undefined): string | null {
  if (faroUrl === undefined || faroUrl.trim() === "") return null;
  return PRODUCTION_ORIGINS.includes(origin) ? faroUrl.trim() : null;
}
