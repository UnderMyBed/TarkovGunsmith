/**
 * Serves the captured upstream documents over HTTP for the OG Pages Functions.
 *
 * `page.route` covers everything the BROWSER fetches, but `/og/build/:id` and `/og/pair/:id`
 * run inside `wrangler pages dev` and call `json.tarkov.dev` themselves
 * (`apps/web/functions/lib/og-graphql.ts`), server-side, where no browser interception exists.
 * Playwright starts this alongside the other web servers and points those Functions here via
 * the `TARKOV_JSON_API_BASE` binding — see `apps/web/playwright.config.ts`.
 *
 * Resources are matched on the last path segment, so any base path works: `/regular/items`,
 * `/pve/items` and `/items` all resolve to the same capture.
 *
 *   pnpm exec tsx e2e/upstream-fixture-server.ts [port]
 */
import { createServer } from "node:http";
import { upstreamFixtureBody } from "./upstream-fixtures.js";

const port = Number(process.argv[2] ?? process.env.UPSTREAM_FIXTURE_PORT ?? 8790);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`upstream-fixture-server: invalid port ${String(process.argv[2])}`);
}

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://127.0.0.1");

  // Playwright's webServer readiness probe.
  if (pathname === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  const body = upstreamFixtureBody(pathname.split("/").pop() ?? "");
  if (body === null) {
    // 404 rather than an empty document: the OG Functions treat a missing translation sibling
    // as optional and a missing `items` as fatal, which is exactly the upstream behaviour a
    // fixture gap should reproduce.
    res.writeHead(404, { "content-type": "text/plain" });
    res.end(`no upstream capture for ${pathname}`);
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(body);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`upstream fixtures serving on http://127.0.0.1:${port}\n`);
});
