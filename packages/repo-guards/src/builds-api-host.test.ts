import { describe, expect, it } from "vitest";
import { readRepoFile } from "./repo.js";

/**
 * The builds-api Worker's public hostname is written down twice, in two languages:
 *
 *   apps/builds-api/wrangler.jsonc          `routes[].pattern`  — creates the DNS record
 *   apps/web/functions/lib/builds-api.ts    DEFAULT_BUILDS_API_URL — where the edge fetches
 *
 * They cannot be collapsed into one: wrangler needs a bare hostname in a config file it
 * parses before any code runs, and the Pages Functions need an absolute URL in a module
 * the Worker never loads. So instead of pretending there is one source of truth, this
 * guard asserts the two agree.
 *
 * Why it earns its place: production served
 * `500 BUILDS_API_URL not configured on this environment` for months while every gate
 * stayed green, because nothing anywhere asserted that the edge could actually reach the
 * Worker. Making the hostname a default rather than a requirement removes that failure
 * mode; this test stops it being replaced by a quieter one, where the default points at a
 * host the Worker no longer answers on.
 */
const WRANGLER = "apps/builds-api/wrangler.jsonc";
const RESOLVER = "apps/web/functions/lib/builds-api.ts";

function workerRoutePattern(): string {
  const raw = readRepoFile(WRANGLER);
  const match = /"pattern"\s*:\s*"([^"]+)"/.exec(raw);
  if (!match?.[1]) throw new Error(`no routes[].pattern found in ${WRANGLER}`);
  return match[1];
}

function resolverDefaultHost(): string {
  const raw = readRepoFile(RESOLVER);
  const match = /DEFAULT_BUILDS_API_URL\s*=\s*"([^"]+)"/.exec(raw);
  if (!match?.[1]) throw new Error(`no DEFAULT_BUILDS_API_URL found in ${RESOLVER}`);
  return new URL(match[1]).host;
}

describe("builds-api hostname", () => {
  it("is declared as a custom domain rather than left to workers.dev", () => {
    const raw = readRepoFile(WRANGLER);
    expect(raw).toMatch(/"custom_domain"\s*:\s*true/);
    // Explicit false, not merely absent: an omitted `workers_dev` is how the Worker ended
    // up with no reachability declared anywhere in the repo.
    expect(raw).toMatch(/"workers_dev"\s*:\s*false/);
  });

  it("matches the default the Pages Functions fetch", () => {
    expect(resolverDefaultHost()).toBe(workerRoutePattern());
  });

  it("is https in the resolver default", () => {
    const raw = readRepoFile(RESOLVER);
    const match = /DEFAULT_BUILDS_API_URL\s*=\s*"([^"]+)"/.exec(raw);
    expect(new URL(match![1]!).protocol).toBe("https:");
  });
});
