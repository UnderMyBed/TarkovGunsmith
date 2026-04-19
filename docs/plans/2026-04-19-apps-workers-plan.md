# `apps/data-proxy` + `apps/builds-api` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two Cloudflare Workers from the design spec — `data-proxy` (GraphQL cache layer in front of `api.tarkov.dev`) and `builds-api` (KV-backed short-URL build sharing). Both fully tested locally via `@cloudflare/vitest-pool-workers` (real `workerd` runtime, real KV). **No CI deploys in this plan** — deploy wiring and Cloudflare secrets are a separate follow-up PR per user direction.

**Architecture:** Two `apps/*` packages, each a single Worker with a small manual router (no Hono — endpoints are trivial). Both export the standard Workers fetch handler. Tests run inside `workerd` via the official `@cloudflare/vitest-pool-workers`, exercising real `Request`/`Response`/Cache/KV — no mocks. `wrangler.jsonc` per Worker; `wrangler dev` for local. Manual deploy via `pnpm --filter <app> deploy` after `wrangler login` (out of scope for this plan).

**Tech Stack:** TypeScript 6, Wrangler 4, `@cloudflare/workers-types`, `@cloudflare/vitest-pool-workers`, `nanoid` v5 (builds-api). Vitest 4. No React, no Node deps.

---

## File map (what exists at the end of this plan)

```
apps/
├── data-proxy/
│   ├── CLAUDE.md
│   ├── README.md
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.test.json
│   ├── vitest.config.ts
│   ├── wrangler.jsonc
│   └── src/
│       ├── index.ts              fetch handler — routes /healthz, /graphql
│       ├── index.test.ts         end-to-end fetch tests via workerd
│       ├── cache-key.ts          sha256(query + variables + operationName)
│       └── cache-key.test.ts
└── builds-api/
    ├── CLAUDE.md
    ├── README.md
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.test.json
    ├── vitest.config.ts
    ├── wrangler.jsonc
    └── src/
        ├── index.ts              fetch handler — routes /healthz, POST /builds, GET /builds/:id
        ├── index.test.ts
        ├── id.ts                 newBuildId() — nanoid wrapper
        └── id.test.ts
```

`pnpm-workspace.yaml` already includes `apps/*` from milestone 0a — no workspace config changes needed.

---

## Phase 1: `data-proxy` Worker

### Task 1: Scaffold `apps/data-proxy/package.json`

**Files:**

- Create: `apps/data-proxy/package.json`

- [ ] **Step 1: Create directory + package.json**

```bash
mkdir -p apps/data-proxy/src
```

Create `apps/data-proxy/package.json` with EXACTLY:

```json
{
  "name": "@tarkov/data-proxy",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Cloudflare Worker: GraphQL cache proxy in front of api.tarkov.dev.",
  "license": "MIT",
  "scripts": {
    "build": "wrangler deploy --dry-run --outdir dist",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "tail": "wrangler tail"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "@cloudflare/workers-types": "^4.20240000.0",
    "wrangler": "^4.0.0"
  }
}
```

`build` uses `wrangler deploy --dry-run --outdir dist` — Wrangler bundles the Worker the same way it would for production but writes to disk instead of uploading. This proves the build artifact is shippable without needing Cloudflare creds.

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: pnpm reports new package, installs deps, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/data-proxy/package.json pnpm-lock.yaml
git commit -m "feat(data-proxy): scaffold @tarkov/data-proxy worker package"
```

---

### Task 2: TypeScript + Vitest + Wrangler configs

**Files:**

- Create: `apps/data-proxy/tsconfig.json`
- Create: `apps/data-proxy/tsconfig.test.json`
- Create: `apps/data-proxy/vitest.config.ts`
- Create: `apps/data-proxy/wrangler.jsonc`

- [ ] **Step 1: Create `apps/data-proxy/tsconfig.json`** with EXACTLY:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": ".tsbuildinfo",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types/2024-09-23"]
  },
  "include": ["src/**/*", "worker-configuration.d.ts"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

The `worker-configuration.d.ts` glob preempts the file `wrangler types` will generate (gives the `Env` interface). It may not exist yet — TypeScript handles missing globs gracefully.

- [ ] **Step 2: Create `apps/data-proxy/tsconfig.test.json`** with EXACTLY:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": ".",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types/2024-09-23", "@cloudflare/vitest-pool-workers"]
  },
  "include": ["src/**/*", "vitest.config.ts", "worker-configuration.d.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create `apps/data-proxy/wrangler.jsonc`** with EXACTLY:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tarkov-data-proxy",
  "main": "src/index.ts",
  "compatibility_date": "2024-09-23",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "vars": {
    "UPSTREAM_GRAPHQL_URL": "https://api.tarkov.dev/graphql",
  },
}
```

`nodejs_compat` is enabled to make `crypto.subtle` and other shared APIs behave consistently. `vars` lets us swap the upstream URL for tests/staging without code changes.

- [ ] **Step 4: Create `apps/data-proxy/vitest.config.ts`** with EXACTLY:

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 95,
        statements: 100,
      },
    },
  },
});
```

The `vitest-pool-workers` requires `istanbul` for coverage (v8 has issues inside `workerd`). `src/index.ts` is excluded from threshold (it's the fetch-handler shell; routing logic moves into testable helpers).

- [ ] **Step 5: Generate the `Env` types**

```bash
pnpm --filter @tarkov/data-proxy exec wrangler types
```

This writes `apps/data-proxy/worker-configuration.d.ts` with an `Env` interface derived from `wrangler.jsonc` (just `UPSTREAM_GRAPHQL_URL: string` for now).

- [ ] **Step 6: Update root `eslint.config.js`** to add this worker's test files to `allowDefaultProject`

Read the current `eslint.config.js`. Add to the `allowDefaultProject` array:

- `"apps/data-proxy/src/*.test.ts"`
- `"apps/data-proxy/worker-configuration.d.ts"`

(`packages/*/vitest.config.ts` glob does NOT cover `apps/*/vitest.config.ts` — add `"apps/*/vitest.config.ts"` if not already present.)

- [ ] **Step 7: Verify typecheck on the empty package fails clean**

```bash
pnpm --filter @tarkov/data-proxy typecheck
```

Expected: `error TS18003: No inputs were found in config file` — `src/` is empty until next tasks.

- [ ] **Step 8: Commit**

```bash
git add apps/data-proxy/tsconfig.json apps/data-proxy/tsconfig.test.json apps/data-proxy/vitest.config.ts apps/data-proxy/wrangler.jsonc apps/data-proxy/worker-configuration.d.ts eslint.config.js
git commit -m "feat(data-proxy): add tsconfig, vitest, wrangler config"
```

---

### Task 3: `cache-key` helper (TDD)

**Files:**

- Create: `apps/data-proxy/src/cache-key.ts`
- Create: `apps/data-proxy/src/cache-key.test.ts`

- [ ] **Step 1: Write `apps/data-proxy/src/cache-key.test.ts`** with EXACTLY:

```ts
import { describe, expect, it } from "vitest";
import { cacheKeyFor } from "./cache-key.js";

describe("cacheKeyFor", () => {
  it("produces a deterministic URL for the same query + variables", async () => {
    const a = await cacheKeyFor({ query: "{ items { id } }", variables: {} });
    const b = await cacheKeyFor({ query: "{ items { id } }", variables: {} });
    expect(a).toBe(b);
  });

  it("differs when the query text differs", async () => {
    const a = await cacheKeyFor({ query: "{ items { id } }", variables: {} });
    const b = await cacheKeyFor({ query: "{ items { id name } }", variables: {} });
    expect(a).not.toBe(b);
  });

  it("differs when variables differ", async () => {
    const a = await cacheKeyFor({ query: "q", variables: { id: "1" } });
    const b = await cacheKeyFor({ query: "q", variables: { id: "2" } });
    expect(a).not.toBe(b);
  });

  it("differs when operationName differs", async () => {
    const a = await cacheKeyFor({ query: "q", variables: {}, operationName: "A" });
    const b = await cacheKeyFor({ query: "q", variables: {}, operationName: "B" });
    expect(a).not.toBe(b);
  });

  it("treats missing operationName the same as undefined", async () => {
    const a = await cacheKeyFor({ query: "q", variables: {} });
    const b = await cacheKeyFor({ query: "q", variables: {}, operationName: undefined });
    expect(a).toBe(b);
  });

  it("returns a parseable URL whose pathname is a hex hash", async () => {
    const key = await cacheKeyFor({ query: "q", variables: {} });
    const url = new URL(key);
    expect(url.protocol).toBe("https:");
    expect(url.pathname).toMatch(/^\/[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run, verify failure (module not found)**

```bash
pnpm --filter @tarkov/data-proxy test src/cache-key.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write `apps/data-proxy/src/cache-key.ts`** with EXACTLY:

```ts
export interface CacheKeyInput {
  readonly query: string;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly operationName?: string;
}

const CACHE_KEY_HOST = "https://tarkov-data-proxy.cache.local";

/**
 * Build a stable Cache API key URL for a GraphQL request. The Cache API
 * requires keys to be Request/URL objects; we encode the request shape as a
 * SHA-256 hex digest in the URL path so identical queries hash to the same
 * cache entry regardless of header ordering.
 */
export async function cacheKeyFor(input: CacheKeyInput): Promise<string> {
  const canonical = JSON.stringify({
    query: input.query,
    variables: input.variables,
    operationName: input.operationName ?? null,
  });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${CACHE_KEY_HOST}/${hex}`;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @tarkov/data-proxy test src/cache-key.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/data-proxy/src/cache-key.ts apps/data-proxy/src/cache-key.test.ts
git commit -m "feat(data-proxy): add cacheKeyFor helper"
```

---

### Task 4: Worker `fetch` handler — `/healthz` + `/graphql` proxy

**Files:**

- Create: `apps/data-proxy/src/index.ts`
- Create: `apps/data-proxy/src/index.test.ts`

- [ ] **Step 1: Write `apps/data-proxy/src/index.test.ts`** with EXACTLY:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "./index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("/healthz", () => {
  it("returns 200 with body 'ok'", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/healthz"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});

describe("/graphql", () => {
  it("rejects non-POST requests with 405", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/graphql"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(405);
  });

  it("forwards a POST to the upstream and returns the response body", async () => {
    const upstream = vi.fn(
      () =>
        new Response(JSON.stringify({ data: { ping: "pong" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    globalThis.fetch = upstream as typeof fetch;

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ ping }", variables: {} }),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { ping: string } };
    expect(body.data.ping).toBe("pong");
    expect(upstream).toHaveBeenCalledTimes(1);
    const calledUrl = upstream.mock.calls[0]?.[0];
    expect(String(calledUrl)).toBe(env.UPSTREAM_GRAPHQL_URL);
  });

  it("falls through to 404 for unknown paths", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/anything-else"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run, verify failure (module not found)**

```bash
pnpm --filter @tarkov/data-proxy test src/index.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write `apps/data-proxy/src/index.ts`** with EXACTLY:

```ts
import { cacheKeyFor } from "./cache-key.js";

interface GraphQLRequestBody {
  query?: unknown;
  variables?: unknown;
  operationName?: unknown;
}

const CACHE_TTL_SECONDS = 60;

async function handleGraphQL(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: GraphQLRequestBody;
  try {
    body = (await request.clone().json()) as GraphQLRequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query : "";
  const variables =
    body.variables && typeof body.variables === "object"
      ? (body.variables as Record<string, unknown>)
      : {};
  const operationName = typeof body.operationName === "string" ? body.operationName : undefined;

  if (!query) {
    return new Response("Missing query", { status: 400 });
  }

  const keyUrl = await cacheKeyFor({ query, variables, operationName });
  const cache = caches.default;
  const cacheKey = new Request(keyUrl);

  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("X-Cache", "HIT");
    return new Response(cached.body, { status: cached.status, headers });
  }

  const upstream = await fetch(env.UPSTREAM_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables, operationName }),
  });

  const upstreamBody = await upstream.text();
  const response = new Response(upstreamBody, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
      "X-Cache": "MISS",
    },
  });

  if (upstream.ok) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return new Response("ok", { status: 200 });
    }
    if (url.pathname === "/graphql") {
      return handleGraphQL(request, env, ctx);
    }
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @tarkov/data-proxy test src/index.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 5: Run the full test suite + verify build works**

```bash
pnpm --filter @tarkov/data-proxy test
pnpm --filter @tarkov/data-proxy build
```

Expected: 10 tests passing total (6 cache-key + 4 index). Build produces `dist/` with the bundled Worker.

- [ ] **Step 6: Commit**

```bash
git add apps/data-proxy/src/index.ts apps/data-proxy/src/index.test.ts
git commit -m "feat(data-proxy): add fetch handler with /healthz and /graphql cache+proxy"
```

---

### Task 5: Per-package CLAUDE.md and README

**Files:**

- Create: `apps/data-proxy/CLAUDE.md`
- Create: `apps/data-proxy/README.md`

- [ ] **Step 1: Create `apps/data-proxy/CLAUDE.md`** with EXACTLY:

````markdown
# `@tarkov/data-proxy`

Cloudflare Worker that fronts `api.tarkov.dev/graphql` with edge caching. The SPA points at this Worker (same-origin via Pages → Workers binding) instead of hitting tarkov-api directly, keeping latency low and reducing upstream load.

## Endpoints

- `GET /healthz` → `200 ok`
- `POST /graphql` → forwards to `UPSTREAM_GRAPHQL_URL`, caches the response keyed on `(query, variables, operationName)` for 60s. Sets `X-Cache: HIT|MISS`.
- Anything else → `404`.

## Local dev

```bash
pnpm --filter @tarkov/data-proxy dev    # wrangler dev → http://localhost:8787
pnpm --filter @tarkov/data-proxy test   # vitest in workerd, real Cache API
pnpm --filter @tarkov/data-proxy build  # wrangler --dry-run --outdir dist (no deploy)
```

`wrangler dev` simulates Cache API + bindings locally; state persists in `.wrangler/state/`. Use `wrangler dev --remote` to test against real Cloudflare resources before a production deploy.

## Deploy (manual, for now)

```bash
wrangler login                                    # one-time
pnpm --filter @tarkov/data-proxy deploy           # wrangler deploy
pnpm --filter @tarkov/data-proxy tail             # live log stream
```

CI deploy + Cloudflare secrets land in a separate follow-up PR.

## Conventions

- Logic-bearing helpers go in their own files (e.g. `cache-key.ts`); test them directly.
- The fetch handler in `index.ts` is the routing shell — keep it thin, delegate to handlers.
- 100% coverage on logic files; `index.ts` is excluded from coverage thresholds (the fetch tests cover its behavior end-to-end).
- Use `caches.default` (Cache API), not Workers KV, for the GraphQL proxy. Cache API is the right tool for response caching by request URL.

## Out of scope

- The `builds-api` Worker — that's `apps/builds-api`.
- A bespoke caching service (`the-hideout/cache`) — we use the built-in Cache API.
- Schema-aware caching (per-field TTLs, etc.) — current implementation caches whole responses.
````

- [ ] **Step 2: Create `apps/data-proxy/README.md`** with EXACTLY:

````markdown
# @tarkov/data-proxy

Cloudflare Worker — GraphQL cache layer in front of `api.tarkov.dev`.

## Run locally

```bash
pnpm --filter @tarkov/data-proxy dev
curl -s http://localhost:8787/healthz                                       # → ok
curl -s -X POST http://localhost:8787/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}' | jq .                                    # cached after first call
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions.
````

- [ ] **Step 3: Commit**

```bash
git add apps/data-proxy/CLAUDE.md apps/data-proxy/README.md
git commit -m "docs(data-proxy): add per-package CLAUDE.md and README"
```

---

## Phase 2: `builds-api` Worker

### Task 6: Scaffold `apps/builds-api/package.json`

**Files:**

- Create: `apps/builds-api/package.json`

- [ ] **Step 1: Create directory + package.json**

```bash
mkdir -p apps/builds-api/src
```

Create `apps/builds-api/package.json` with EXACTLY:

```json
{
  "name": "@tarkov/builds-api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Cloudflare Worker: KV-backed short-URL build sharing for TarkovGunsmith.",
  "license": "MIT",
  "scripts": {
    "build": "wrangler deploy --dry-run --outdir dist",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "tail": "wrangler tail"
  },
  "dependencies": {
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "@cloudflare/workers-types": "^4.20240000.0",
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

- [ ] **Step 3: Commit**

```bash
git add apps/builds-api/package.json pnpm-lock.yaml
git commit -m "feat(builds-api): scaffold @tarkov/builds-api worker package"
```

---

### Task 7: TypeScript + Vitest + Wrangler configs (with KV binding)

**Files:**

- Create: `apps/builds-api/tsconfig.json`
- Create: `apps/builds-api/tsconfig.test.json`
- Create: `apps/builds-api/vitest.config.ts`
- Create: `apps/builds-api/wrangler.jsonc`

- [ ] **Step 1: Create `apps/builds-api/tsconfig.json`** with EXACTLY:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": ".tsbuildinfo",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types/2024-09-23"]
  },
  "include": ["src/**/*", "worker-configuration.d.ts"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

- [ ] **Step 2: Create `apps/builds-api/tsconfig.test.json`** with EXACTLY:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": ".",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types/2024-09-23", "@cloudflare/vitest-pool-workers"]
  },
  "include": ["src/**/*", "vitest.config.ts", "worker-configuration.d.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create `apps/builds-api/wrangler.jsonc`** with EXACTLY:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tarkov-builds-api",
  "main": "src/index.ts",
  "compatibility_date": "2024-09-23",
  "observability": { "enabled": true },
  "kv_namespaces": [
    {
      "binding": "BUILDS",
      "id": "REPLACE_ON_FIRST_DEPLOY",
    },
  ],
  "vars": {
    "BUILD_TTL_SECONDS": "2592000",
  },
}
```

The KV `id` is a placeholder — `wrangler kv:namespace create BUILDS` produces a real ID on first deploy; replace then. Local dev + tests use a Miniflare-backed namespace and ignore the `id` value entirely.

- [ ] **Step 4: Create `apps/builds-api/vitest.config.ts`** with EXACTLY:

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 95,
        statements: 100,
      },
    },
  },
});
```

- [ ] **Step 5: Generate `Env` types**

```bash
pnpm --filter @tarkov/builds-api exec wrangler types
```

Writes `apps/builds-api/worker-configuration.d.ts` — `Env` will include `BUILDS: KVNamespace` and `BUILD_TTL_SECONDS: string`.

- [ ] **Step 6: Update root `eslint.config.js`** to add this worker's test files to `allowDefaultProject`

Add to the array:

- `"apps/builds-api/src/*.test.ts"`
- `"apps/builds-api/worker-configuration.d.ts"`

(`apps/*/vitest.config.ts` was added in Task 2; reuse.)

- [ ] **Step 7: Verify typecheck on the empty package fails clean**

```bash
pnpm --filter @tarkov/builds-api typecheck
```

Expected: `error TS18003: No inputs were found in config file`.

- [ ] **Step 8: Commit**

```bash
git add apps/builds-api/tsconfig.json apps/builds-api/tsconfig.test.json apps/builds-api/vitest.config.ts apps/builds-api/wrangler.jsonc apps/builds-api/worker-configuration.d.ts eslint.config.js
git commit -m "feat(builds-api): add tsconfig, vitest, wrangler config with KV binding"
```

---

### Task 8: `newBuildId` helper (TDD)

**Files:**

- Create: `apps/builds-api/src/id.ts`
- Create: `apps/builds-api/src/id.test.ts`

- [ ] **Step 1: Write `apps/builds-api/src/id.test.ts`** with EXACTLY:

```ts
import { describe, expect, it } from "vitest";
import { newBuildId, BUILD_ID_REGEX } from "./id.js";

describe("newBuildId", () => {
  it("returns an 8-character lowercase alphanumeric string", () => {
    const id = newBuildId();
    expect(id).toMatch(BUILD_ID_REGEX);
    expect(id).toHaveLength(8);
  });

  it("produces unique ids across many calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(newBuildId());
    expect(ids.size).toBe(1000);
  });

  it("uses only the safe alphabet (no ambiguous characters)", () => {
    for (let i = 0; i < 200; i++) {
      const id = newBuildId();
      expect(id).not.toMatch(/[0OIl1]/);
    }
  });
});

describe("BUILD_ID_REGEX", () => {
  it("accepts known-good ids", () => {
    expect("a2b4c6d8").toMatch(BUILD_ID_REGEX);
  });

  it("rejects ids with disallowed characters", () => {
    expect("a2b4c6dO").not.toMatch(BUILD_ID_REGEX); // contains O
    expect("UPPERCAS").not.toMatch(BUILD_ID_REGEX); // uppercase
    expect("short").not.toMatch(BUILD_ID_REGEX); // too short
    expect("toomanychars").not.toMatch(BUILD_ID_REGEX); // too long
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
pnpm --filter @tarkov/builds-api test src/id.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write `apps/builds-api/src/id.ts`** with EXACTLY:

```ts
import { customAlphabet } from "nanoid";

// Lowercase alphanumeric, with 0/O/I/l/1 removed to avoid ambiguity in URLs.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const ID_LENGTH = 8;

const generate = customAlphabet(ALPHABET, ID_LENGTH);

/**
 * Generate a fresh 8-character build id from the safe alphabet.
 *
 * @example
 *   newBuildId(); // "k7m4n8p2"
 */
export function newBuildId(): string {
  return generate();
}

/**
 * Regex matching valid build ids — exactly 8 chars from the safe alphabet.
 * Use to validate path parameters before any KV lookup.
 */
export const BUILD_ID_REGEX = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @tarkov/builds-api test src/id.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/builds-api/src/id.ts apps/builds-api/src/id.test.ts
git commit -m "feat(builds-api): add newBuildId and BUILD_ID_REGEX"
```

---

### Task 9: Worker `fetch` handler — `/healthz` + `POST /builds` + `GET /builds/:id`

**Files:**

- Create: `apps/builds-api/src/index.ts`
- Create: `apps/builds-api/src/index.test.ts`

- [ ] **Step 1: Write `apps/builds-api/src/index.test.ts`** with EXACTLY:

```ts
import { describe, expect, it } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "./index.js";

const samplePayload = {
  schema_version: 1,
  weapon: { id: "fixture-m4a1", name: "M4A1" },
  mods: [{ id: "fixture-grip", name: "Grip" }],
  notes: "test build",
};

async function postBuild(payload: unknown): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request("https://x/builds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function getBuild(id: string): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://x/builds/${id}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("/healthz", () => {
  it("returns 200 ok", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/healthz"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});

describe("POST /builds", () => {
  it("stores a build and returns the id + url", async () => {
    const res = await postBuild(samplePayload);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; url: string };
    expect(body.id).toMatch(/^[a-z2-9]{8}$/);
    expect(body.url).toContain(`/builds/${body.id}`);
  });

  it("rejects non-JSON bodies with 400", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });

  it("rejects empty bodies with 400", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "",
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });

  it("rejects payloads larger than 32KB with 413", async () => {
    const huge = { ...samplePayload, notes: "x".repeat(40_000) };
    const res = await postBuild(huge);
    expect(res.status).toBe(413);
  });

  it("rejects non-POST methods with 405", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/builds"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(405);
  });
});

describe("GET /builds/:id", () => {
  it("returns the stored build", async () => {
    const post = await postBuild(samplePayload);
    const { id } = (await post.json()) as { id: string };

    const get = await getBuild(id);
    expect(get.status).toBe(200);
    const body = (await get.json()) as typeof samplePayload;
    expect(body.weapon.id).toBe(samplePayload.weapon.id);
    expect(body.mods).toHaveLength(1);
  });

  it("returns 404 for unknown ids", async () => {
    const res = await getBuild("zzzzzzzz");
    expect(res.status).toBe(404);
  });

  it("returns 400 for ids that don't match the build-id pattern", async () => {
    const res = await getBuild("BAD-ID");
    expect(res.status).toBe(400);
  });
});

describe("unknown routes", () => {
  it("falls through to 404", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/elsewhere"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
pnpm --filter @tarkov/builds-api test src/index.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write `apps/builds-api/src/index.ts`** with EXACTLY:

```ts
import { newBuildId, BUILD_ID_REGEX } from "./id.js";

const MAX_BODY_BYTES = 32 * 1024;

async function readBody(request: Request): Promise<{ size: number; text: string }> {
  const text = await request.text();
  return { size: new TextEncoder().encode(text).byteLength, text };
}

async function handlePost(request: Request, env: Env): Promise<Response> {
  const { size, text } = await readBody(request);
  if (size === 0) return new Response("Empty body", { status: 400 });
  if (size > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const id = newBuildId();
  const ttl = Number(env.BUILD_TTL_SECONDS);
  await env.BUILDS.put(`b:${id}`, JSON.stringify(parsed), { expirationTtl: ttl });

  const requestUrl = new URL(request.url);
  const url = `${requestUrl.origin}/builds/${id}`;
  return new Response(JSON.stringify({ id, url }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleGet(id: string, env: Env): Promise<Response> {
  if (!BUILD_ID_REGEX.test(id)) {
    return new Response("Invalid id", { status: 400 });
  }
  const value = await env.BUILDS.get(`b:${id}`);
  if (!value) return new Response("Not Found", { status: 404 });
  return new Response(value, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/healthz") return new Response("ok", { status: 200 });

    if (path === "/builds") {
      if (request.method === "POST") return handlePost(request, env);
      return new Response("Method Not Allowed", { status: 405 });
    }

    const buildMatch = /^\/builds\/([^/]+)$/.exec(path);
    if (buildMatch && request.method === "GET") {
      return handleGet(buildMatch[1] ?? "", env);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @tarkov/builds-api test src/index.test.ts
```

Expected: 10 passing tests.

- [ ] **Step 5: Run the full suite + verify build works**

```bash
pnpm --filter @tarkov/builds-api test
pnpm --filter @tarkov/builds-api build
```

Expected: 15 tests passing total (5 id + 10 index). Build produces `dist/`.

- [ ] **Step 6: Commit**

```bash
git add apps/builds-api/src/index.ts apps/builds-api/src/index.test.ts
git commit -m "feat(builds-api): add fetch handler with /healthz and KV-backed /builds CRUD"
```

---

### Task 10: Per-package CLAUDE.md and README

**Files:**

- Create: `apps/builds-api/CLAUDE.md`
- Create: `apps/builds-api/README.md`

- [ ] **Step 1: Create `apps/builds-api/CLAUDE.md`** with EXACTLY:

````markdown
# `@tarkov/builds-api`

Cloudflare Worker that backs the "share this build" feature. Saves arbitrary build JSON to KV under an 8-char nanoid; returns the id + URL. Reads come back as the original JSON (no validation here — apps/web validates with the current build schema).

## Endpoints

- `GET /healthz` → `200 ok`
- `POST /builds` → body is the build JSON (≤32KB). Returns `201 { id, url }` and writes to KV with `BUILD_TTL_SECONDS` TTL (default 30 days).
- `GET /builds/:id` → returns the JSON if it exists; `404` if expired/unknown; `400` if the id doesn't match `BUILD_ID_REGEX`.
- Anything else → `404`.

## Local dev

```bash
pnpm --filter @tarkov/builds-api dev    # wrangler dev → http://localhost:8787 (real KV simulated)
pnpm --filter @tarkov/builds-api test   # vitest in workerd, real KV per test
pnpm --filter @tarkov/builds-api build  # wrangler --dry-run --outdir dist
```

`wrangler dev` simulates the `BUILDS` KV namespace locally; values persist in `.wrangler/state/`.

## First deploy

The KV id in `wrangler.jsonc` is a placeholder. Before the first `wrangler deploy`:

```bash
wrangler login
wrangler kv:namespace create BUILDS         # prints { "id": "<real-id>" }
# replace REPLACE_ON_FIRST_DEPLOY in wrangler.jsonc with the printed id
pnpm --filter @tarkov/builds-api deploy
```

This is a one-time manual step; tracked as a follow-up so CI deploys can take over.

## Conventions

- Build values are stored opaquely under `b:<nanoid>` keys. We don't validate their shape here — that's the web app's job using the current build schema. We DO validate the id format (`BUILD_ID_REGEX`) before any KV op to bound key cardinality.
- `MAX_BODY_BYTES = 32 KB` — anyone posting bigger is doing something weird; reject early.
- `expirationTtl` is read from the env var so we can dial it without code changes.
- 100% coverage on logic files; `index.ts` covered by the fetch tests end-to-end.

## Out of scope

- Schema validation of build JSON — apps/web owns that.
- A delete endpoint — KV TTL handles cleanup. Users sharing rebuild via re-POST.
- A "pin" mode (long-TTL builds) — future feature; will need a write key/auth.
- Rate limiting — Cloudflare Turnstile or similar; future.
````

- [ ] **Step 2: Create `apps/builds-api/README.md`** with EXACTLY:

````markdown
# @tarkov/builds-api

Cloudflare Worker — KV-backed short-URL build sharing.

## Run locally

```bash
pnpm --filter @tarkov/builds-api dev
curl -s -X POST http://localhost:8787/builds \
  -H "Content-Type: application/json" \
  -d '{"weapon":{"id":"m4a1"},"mods":[]}' | jq .                  # → {"id":"...", "url":"..."}
curl -s http://localhost:8787/builds/<id> | jq .                  # → the build
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions and first-deploy steps.
````

- [ ] **Step 3: Commit**

```bash
git add apps/builds-api/CLAUDE.md apps/builds-api/README.md
git commit -m "docs(builds-api): add per-package CLAUDE.md and README"
```

---

## Phase 3: Ship

### Task 11: Update root `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Status callout**

Find:

```markdown
> **Status:** Foundation + all four packages shipped (`packages/ballistics`, `packages/tarkov-types`, `packages/tarkov-data`, `packages/ui`). ...
```

Replace with:

```markdown
> **Status:** All four packages + both Workers shipped (`packages/ballistics`, `packages/tarkov-types`, `packages/tarkov-data`, `packages/ui`, `apps/data-proxy`, `apps/builds-api`). Workers run + test locally via `wrangler dev` + `@cloudflare/vitest-pool-workers`; CI deploys are a separate follow-up (see each Worker's CLAUDE.md). Still pending: `apps/web`. See [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) for the full design.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note both Workers shipped in CLAUDE.md status"
```

---

### Task 12: Final verification + PR + merge + release

**Files:** none (operational)

- [ ] **Step 1: Final clean install + all gates**

```bash
rm -rf node_modules apps/*/node_modules apps/*/dist apps/*/.tsbuildinfo apps/*/.wrangler packages/*/node_modules packages/*/dist packages/*/.tsbuildinfo
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: all exit 0. Test count across the monorepo should now include the Worker tests (10 + 15 = 25 new).

- [ ] **Step 2: Push branch + open PR**

The branch name is `feat/apps-workers`.

```bash
git push -u origin feat/apps-workers
gh pr create --base main --head feat/apps-workers --title "feat(workers): add data-proxy and builds-api Cloudflare Workers" --body "Implements 0b. Two Cloudflare Workers — \`data-proxy\` (GraphQL cache layer in front of api.tarkov.dev) and \`builds-api\` (KV-backed short-URL build sharing). Both fully tested locally via @cloudflare/vitest-pool-workers (real workerd, real Cache, real KV). CI deploys deferred to a follow-up PR."
```

Capture the PR number.

- [ ] **Step 3: Wait for CI green explicitly**

```bash
sleep 8
RUN_ID=$(gh run list --repo UnderMyBed/TarkovGunsmith --branch feat/apps-workers --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --repo UnderMyBed/TarkovGunsmith
gh run view $RUN_ID --repo UnderMyBed/TarkovGunsmith --json conclusion --jq '.conclusion'
```

Expected: `success`.

- [ ] **Step 4: Squash-merge**

```bash
gh pr merge <pr-number> --repo UnderMyBed/TarkovGunsmith --squash --delete-branch
```

- [ ] **Step 5: Wait for release-please + auto-triggered CI on the release branch**

```bash
sleep 15
gh pr list --repo UnderMyBed/TarkovGunsmith --state open
RUN_ID=$(gh run list --repo UnderMyBed/TarkovGunsmith --workflow ci.yml --branch release-please--branches--main--components--tarkov-gunsmith --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --repo UnderMyBed/TarkovGunsmith
gh run view $RUN_ID --repo UnderMyBed/TarkovGunsmith --json conclusion --jq '.conclusion'
```

Expected: `success`.

- [ ] **Step 6: Admin-merge the release PR**

```bash
gh pr merge <release-pr-number> --repo UnderMyBed/TarkovGunsmith --squash --delete-branch --admin
```

Expected: `v0.6.0` tag and GitHub Release.

- [ ] **Step 7: Cleanup**

```bash
git switch main && git pull --ff-only
git worktree remove ~/.config/superpowers/worktrees/TarkovGunsmith/feat-apps-workers --force
git branch -D feat/apps-workers
git remote prune origin
```

---

## Done — what's true after this plan

- `apps/data-proxy` and `apps/builds-api` both exist as workspace `0.0.0` packages; repo released as `v0.6.0`.
- Each Worker has `wrangler dev`, `wrangler deploy --dry-run` build, real-runtime tests via `@cloudflare/vitest-pool-workers`.
- `data-proxy`: `/healthz` + cached GraphQL proxy (60s TTL, `X-Cache: HIT|MISS` header). 10 tests.
- `builds-api`: `/healthz` + `POST /builds` (KV write, 30-day TTL) + `GET /builds/:id` (KV read). 15 tests.
- `pnpm dev` / `pnpm test` / `pnpm build` work for both Workers locally with **no Cloudflare credentials**.

## What's NOT true yet (intentionally deferred)

- **No CI deploy wiring.** Per Option 2 — Workers ship as code-only. Deploy via `wrangler login` + `pnpm --filter <worker> deploy` on demand. Follow-up PR adds `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets and a deploy step in CI.
- **`builds-api` KV namespace not created in production.** First `wrangler deploy` needs `wrangler kv:namespace create BUILDS` + replacing the placeholder id in `wrangler.jsonc`. Documented in the per-Worker CLAUDE.md.
- **No rate limiting** on `POST /builds`. Cloudflare Turnstile or similar — future.
- **No "pin this build" mode** (long-TTL writes). Future feature; needs an auth model.
- **No tarkov-api `update` webhook integration** for cache invalidation. Currently `data-proxy` uses 60s TTL; webhook-driven busting is a future improvement.
- **Workers don't share a binding to each other yet** — `apps/web` (in 0c) will configure Pages → Workers service bindings to wire `/api/data/*` → `data-proxy` and `/api/builds/*` → `builds-api`.
