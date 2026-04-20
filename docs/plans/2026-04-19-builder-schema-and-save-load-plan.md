# Builder Robustness PR 1 — Schema v1 + Save/Load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First PR of the Milestone 1.5 Builder Robustness arc. Add a versioned Zod build schema (`BuildV1`) in `@tarkov/data`, wire the `/builder` route to save a build to `apps/builds-api`, and add a `/builder/$id` route that loads a build and hydrates state. Closes the M1 promise of "Weapon Builder + share-URL via builds-api."

**Architecture:** Schema + builds-API client functions live in `@tarkov/data` alongside existing queries. Pure fetcher functions (`saveBuild`, `loadBuild`) are vitest-tested with mocked fetch (mirroring the `fetchWeaponList` pattern). React hooks (`useSaveBuild`, `useLoadBuild`) are thin TanStack Query wrappers, not unit-tested in this package (matches the existing package convention). The SPA talks to same-origin `/api/builds/*` paths; Vite dev proxy + a new Cloudflare Pages Function handle transport. No UI tests in this PR — save/load round-trip is verified manually against local `wrangler dev`. Playwright e2e is tracked as a separate follow-up plan (deviation from spec §11 — Playwright isn't set up yet; bundling its infra into this PR would bloat scope).

**Tech Stack:** Zod 3, TanStack Query 5, TanStack Router 1, Vite 6, Cloudflare Pages Functions, `graphql-request` (unrelated to build save/load — stays for GraphQL queries). No new runtime deps.

---

## File map (what exists at the end of this plan)

```
packages/tarkov-data/src/
├── build-schema.ts                 NEW — BuildV1 + discriminated union
├── build-schema.test.ts            NEW — parse/reject fixtures
├── buildsApi.ts                    NEW — saveBuild, loadBuild, LoadError taxonomy
├── buildsApi.test.ts               NEW — mocked-fetch round-trip + every error path
├── hooks/
│   ├── useSaveBuild.ts             NEW — useMutation wrapper
│   └── useLoadBuild.ts             NEW — useQuery wrapper
└── index.ts                        MODIFIED — export the above

apps/web/
├── vite.config.ts                  MODIFIED — fix /api/builds proxy rewrite
├── functions/
│   └── api/
│       └── builds/
│           └── [[path]].ts         NEW — Pages Function forwarding to builds-api Worker
├── src/routes/
│   ├── builder.tsx                 MODIFIED — Share button, copy toast, state-from-prop
│   └── builder.$id.tsx             NEW — loader route for saved builds
└── README.md or CLAUDE.md          MODIFIED — note BUILDS_API_URL env var required
```

---

## Prerequisites

- Checkout a fresh branch off `main` (or off `chore/release-1.0.0` if the v1.0.0 release PR hasn't merged yet): `feat/builder-robustness-pr1-schema-and-save-load`.
- `pnpm install` at repo root (workspaces).
- `apps/builds-api` must have a deployed production URL to reference in the Pages env var. It does (deployed via `v1.0.0`).

---

## Phase 1: Build schema v1 in `@tarkov/data`

The schema contract that every future Builder PR will extend. Keep v1 minimal — it's a 1:1 map of the current in-memory state. Future PRs add slot paths (v2), profile snapshot (v3), name/description (v4).

### Task 1: `BuildV1` Zod schema + discriminated union (TDD)

**Files:**

- Create: `packages/tarkov-data/src/build-schema.ts`
- Create: `packages/tarkov-data/src/build-schema.test.ts`

- [ ] **Step 1: Write `packages/tarkov-data/src/build-schema.test.ts`:**

```ts
import { describe, expect, it } from "vitest";
import { Build, BuildV1, CURRENT_BUILD_VERSION } from "./build-schema.js";

const validV1 = {
  version: 1 as const,
  weaponId: "weapon-abc",
  modIds: ["mod-1", "mod-2"],
  createdAt: "2026-04-19T12:00:00.000Z",
};

describe("BuildV1", () => {
  it("parses a valid v1 payload", () => {
    expect(BuildV1.parse(validV1)).toEqual(validV1);
  });

  it("rejects a missing version discriminator", () => {
    const { version: _v, ...bad } = validV1;
    expect(BuildV1.safeParse(bad).success).toBe(false);
  });

  it("rejects a wrong version literal", () => {
    expect(BuildV1.safeParse({ ...validV1, version: 2 }).success).toBe(false);
  });

  it("rejects an empty weaponId", () => {
    expect(BuildV1.safeParse({ ...validV1, weaponId: "" }).success).toBe(false);
  });

  it("rejects more than 64 mods", () => {
    const mods = Array.from({ length: 65 }, (_, i) => `mod-${i}`);
    expect(BuildV1.safeParse({ ...validV1, modIds: mods }).success).toBe(false);
  });

  it("rejects a malformed createdAt", () => {
    expect(BuildV1.safeParse({ ...validV1, createdAt: "yesterday" }).success).toBe(false);
  });
});

describe("Build (discriminated union)", () => {
  it("dispatches on version to BuildV1", () => {
    const parsed = Build.parse(validV1);
    expect(parsed.version).toBe(1);
  });

  it("rejects an unknown version", () => {
    expect(Build.safeParse({ ...validV1, version: 99 }).success).toBe(false);
  });
});

describe("CURRENT_BUILD_VERSION", () => {
  it("is 1 for PR 1 of the Builder Robustness arc", () => {
    expect(CURRENT_BUILD_VERSION).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL** (module not found):

```bash
pnpm --filter @tarkov/data test -- build-schema
```

Expected: `Cannot find module './build-schema.js'`.

- [ ] **Step 3: Write `packages/tarkov-data/src/build-schema.ts`:**

```ts
import { z } from "zod";

/**
 * Build schema v1 — flat model, minimum viable.
 *
 * Mirrors the current in-memory state of `/builder`: a weapon id and a flat
 * list of attached mod ids. Future schema versions (v2+) add slot paths,
 * player-profile snapshot, and name/description. See
 * `docs/superpowers/specs/2026-04-19-builder-robustness-design.md` §5.
 */
export const BuildV1 = z.object({
  version: z.literal(1),
  weaponId: z.string().min(1),
  modIds: z.array(z.string()).max(64),
  createdAt: z.string().datetime(),
});

export type BuildV1 = z.infer<typeof BuildV1>;

/**
 * Discriminated union over all known build versions. Grows one variant per
 * Builder Robustness PR. Never mutates existing variants — old shared URLs
 * must keep parsing forever (modulo the 30-day KV TTL on builds-api).
 */
export const Build = z.discriminatedUnion("version", [BuildV1]);
export type Build = z.infer<typeof Build>;

/**
 * The version a freshly-saved build should carry. Bump each PR. `as const`
 * so callers can use this literal in `{ version: CURRENT_BUILD_VERSION }`
 * without a cast.
 */
export const CURRENT_BUILD_VERSION = 1 as const;
```

- [ ] **Step 4: Run the test, expect PASS:**

```bash
pnpm --filter @tarkov/data test -- build-schema
```

Expected: 9 passing.

- [ ] **Step 5: Export from the package index — edit `packages/tarkov-data/src/index.ts`. Add after the existing `// Queries` block:**

```ts
// Build schema
export { Build, BuildV1, CURRENT_BUILD_VERSION } from "./build-schema.js";
```

- [ ] **Step 6: Typecheck + lint:**

```bash
pnpm --filter @tarkov/data typecheck
pnpm --filter @tarkov/data lint
```

Expected: both clean.

- [ ] **Step 7: Commit:**

```bash
git add packages/tarkov-data/src/build-schema.ts packages/tarkov-data/src/build-schema.test.ts packages/tarkov-data/src/index.ts
git commit -m "feat(tarkov-data): add BuildV1 Zod schema + discriminated union"
```

---

## Phase 2: Builds-API client + hooks in `@tarkov/data`

Pure fetcher functions first (testable), then thin React hooks (not tested in this package, per existing convention documented in `packages/tarkov-data/CLAUDE.md`).

### Task 2: `saveBuild` + `loadBuild` pure fetchers (TDD)

**Files:**

- Create: `packages/tarkov-data/src/buildsApi.ts`
- Create: `packages/tarkov-data/src/buildsApi.test.ts`

- [ ] **Step 1: Write `packages/tarkov-data/src/buildsApi.test.ts`:**

```ts
import { describe, expect, it, vi } from "vitest";
import { saveBuild, loadBuild, LoadBuildError, type LoadBuildErrorCode } from "./buildsApi.js";
import type { BuildV1 } from "./build-schema.js";

const sampleV1: BuildV1 = {
  version: 1,
  weaponId: "weapon-abc",
  modIds: ["mod-1"],
  createdAt: "2026-04-19T12:00:00.000Z",
};

function mockFetch(impl: (url: string, init?: RequestInit) => Response) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(impl(String(input), init)),
  ) as unknown as typeof fetch;
}

describe("saveBuild", () => {
  it("POSTs JSON to the builds endpoint and returns the id+url", async () => {
    const fetchImpl = mockFetch((url, init) => {
      expect(url).toBe("/api/builds");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
      expect(JSON.parse(String(init?.body))).toEqual(sampleV1);
      return new Response(JSON.stringify({ id: "k7m4n8p2", url: "https://x/builds/k7m4n8p2" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    });

    const out = await saveBuild(fetchImpl, sampleV1);
    expect(out).toEqual({ id: "k7m4n8p2", url: "https://x/builds/k7m4n8p2" });
  });

  it("throws on a non-201 response", async () => {
    const fetchImpl = mockFetch(() => new Response("nope", { status: 500 }));
    await expect(saveBuild(fetchImpl, sampleV1)).rejects.toThrow(/saveBuild failed.*500/);
  });

  it("throws on a malformed response body", async () => {
    const fetchImpl = mockFetch(
      () =>
        new Response(JSON.stringify({ wrong: "shape" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    );
    await expect(saveBuild(fetchImpl, sampleV1)).rejects.toThrow(/saveBuild/);
  });
});

describe("loadBuild", () => {
  it("GETs the build endpoint and parses a v1 response", async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toBe("/api/builds/k7m4n8p2");
      return new Response(JSON.stringify(sampleV1), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const build = await loadBuild(fetchImpl, "k7m4n8p2");
    expect(build).toEqual(sampleV1);
  });

  it("throws LoadBuildError('invalid-id') for a malformed id", async () => {
    const fetchImpl = mockFetch(() => new Response("", { status: 200 }));
    const err = await loadBuild(fetchImpl, "BAD-ID").catch((e) => e);
    expect(err).toBeInstanceOf(LoadBuildError);
    expect((err as LoadBuildError).code).toBe<LoadBuildErrorCode>("invalid-id");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws LoadBuildError('not-found') on 404", async () => {
    const fetchImpl = mockFetch(() => new Response("", { status: 404 }));
    const err = await loadBuild(fetchImpl, "k7m4n8p2").catch((e) => e);
    expect(err).toBeInstanceOf(LoadBuildError);
    expect((err as LoadBuildError).code).toBe<LoadBuildErrorCode>("not-found");
  });

  it("throws LoadBuildError('unreachable') on a network error", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.reject(new TypeError("network down")),
    ) as unknown as typeof fetch;
    const err = await loadBuild(fetchImpl, "k7m4n8p2").catch((e) => e);
    expect(err).toBeInstanceOf(LoadBuildError);
    expect((err as LoadBuildError).code).toBe<LoadBuildErrorCode>("unreachable");
  });

  it("throws LoadBuildError('unreachable') on a non-404 non-200 status", async () => {
    const fetchImpl = mockFetch(() => new Response("", { status: 500 }));
    const err = await loadBuild(fetchImpl, "k7m4n8p2").catch((e) => e);
    expect(err).toBeInstanceOf(LoadBuildError);
    expect((err as LoadBuildError).code).toBe<LoadBuildErrorCode>("unreachable");
  });

  it("throws LoadBuildError('invalid-schema') when JSON doesn't match Build", async () => {
    const fetchImpl = mockFetch(
      () =>
        new Response(JSON.stringify({ version: 999, totally: "wrong" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const err = await loadBuild(fetchImpl, "k7m4n8p2").catch((e) => e);
    expect(err).toBeInstanceOf(LoadBuildError);
    expect((err as LoadBuildError).code).toBe<LoadBuildErrorCode>("invalid-schema");
  });

  it("throws LoadBuildError('invalid-schema') when the body isn't JSON", async () => {
    const fetchImpl = mockFetch(
      () =>
        new Response("not json at all", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
    );
    const err = await loadBuild(fetchImpl, "k7m4n8p2").catch((e) => e);
    expect(err).toBeInstanceOf(LoadBuildError);
    expect((err as LoadBuildError).code).toBe<LoadBuildErrorCode>("invalid-schema");
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL** (module not found):

```bash
pnpm --filter @tarkov/data test -- buildsApi
```

- [ ] **Step 3: Write `packages/tarkov-data/src/buildsApi.ts`:**

```ts
import { Build, type BuildV1 } from "./build-schema.js";

const BUILDS_ENDPOINT = "/api/builds";

// Same alphabet + length as apps/builds-api/src/id.ts. Kept in sync manually —
// if the Worker's id format changes, update here too (and add a regression
// test in buildsApi.test.ts).
const BUILD_ID_REGEX = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

export type LoadBuildErrorCode = "invalid-id" | "not-found" | "unreachable" | "invalid-schema";

export class LoadBuildError extends Error {
  constructor(
    public readonly code: LoadBuildErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LoadBuildError";
  }
}

export interface SaveBuildResponse {
  id: string;
  url: string;
}

/**
 * Persist a build by POSTing to the builds-api Worker (via same-origin
 * `/api/builds`). Throws on any non-201 or malformed response. Callers should
 * surface the failure with a toast — no retry policy here; retries are the
 * caller's call.
 */
export async function saveBuild(
  fetchImpl: typeof fetch,
  build: BuildV1,
): Promise<SaveBuildResponse> {
  const res = await fetchImpl(BUILDS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(build),
  });
  if (res.status !== 201) {
    throw new Error(`saveBuild failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { id?: unknown }).id !== "string" ||
    typeof (body as { url?: unknown }).url !== "string"
  ) {
    throw new Error("saveBuild: malformed response");
  }
  return body as SaveBuildResponse;
}

/**
 * Load a build by id. Validates the id against the builds-api alphabet before
 * hitting the network, then Zod-parses the response through the `Build`
 * discriminated union. Throws `LoadBuildError` with a specific `code` for
 * every failure mode so the UI can pick an error state without re-classifying
 * exceptions.
 */
export async function loadBuild(fetchImpl: typeof fetch, id: string): Promise<Build> {
  if (!BUILD_ID_REGEX.test(id)) {
    throw new LoadBuildError("invalid-id", `Build id "${id}" is malformed`);
  }

  let res: Response;
  try {
    res = await fetchImpl(`${BUILDS_ENDPOINT}/${id}`);
  } catch (cause) {
    throw new LoadBuildError("unreachable", "Couldn't reach build storage", cause);
  }

  if (res.status === 404) {
    throw new LoadBuildError("not-found", `Build "${id}" not found`);
  }
  if (res.status !== 200) {
    throw new LoadBuildError("unreachable", `Build storage returned HTTP ${res.status}`);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (cause) {
    throw new LoadBuildError("invalid-schema", "Build body was not JSON", cause);
  }

  const parsed = Build.safeParse(raw);
  if (!parsed.success) {
    throw new LoadBuildError("invalid-schema", "Build failed schema validation", parsed.error);
  }
  return parsed.data;
}
```

- [ ] **Step 4: Run the test, expect PASS:**

```bash
pnpm --filter @tarkov/data test -- buildsApi
```

Expected: 11 passing.

- [ ] **Step 5: Typecheck + lint:**

```bash
pnpm --filter @tarkov/data typecheck
pnpm --filter @tarkov/data lint
```

Expected: both clean.

- [ ] **Step 6: Commit:**

```bash
git add packages/tarkov-data/src/buildsApi.ts packages/tarkov-data/src/buildsApi.test.ts
git commit -m "feat(tarkov-data): add saveBuild/loadBuild fetchers with LoadBuildError taxonomy"
```

### Task 3: `useSaveBuild` + `useLoadBuild` React hooks

Thin TanStack Query wrappers. No tests (`packages/tarkov-data/CLAUDE.md` explicitly documents that hooks aren't unit-tested here — consumers exercise them in `apps/web`).

**Files:**

- Create: `packages/tarkov-data/src/hooks/useSaveBuild.ts`
- Create: `packages/tarkov-data/src/hooks/useLoadBuild.ts`
- Modify: `packages/tarkov-data/src/index.ts`

- [ ] **Step 1: Write `packages/tarkov-data/src/hooks/useSaveBuild.ts`:**

```ts
import { useMutation } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { saveBuild, type SaveBuildResponse } from "../buildsApi.js";
import type { BuildV1 } from "../build-schema.js";

/**
 * Mutation hook wrapping `saveBuild`. Uses the global `fetch`. Consumers
 * should render a toast on `onSuccess` / `onError`.
 */
export function useSaveBuild(): UseMutationResult<SaveBuildResponse, Error, BuildV1> {
  return useMutation({
    mutationFn: (build: BuildV1) => saveBuild(fetch, build),
  });
}
```

- [ ] **Step 2: Write `packages/tarkov-data/src/hooks/useLoadBuild.ts`:**

```ts
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { loadBuild } from "../buildsApi.js";
import type { Build } from "../build-schema.js";

/**
 * Reactive build-load by id. Cached by TanStack Query under `["build", id]`.
 * Disabled when `id` is empty. Errors (including `LoadBuildError`) are
 * surfaced on the returned `error` field — the UI branches on
 * `error.code` to render the right empty state.
 */
export function useLoadBuild(id: string): UseQueryResult<Build, Error> {
  return useQuery({
    queryKey: ["build", id],
    queryFn: () => loadBuild(fetch, id),
    enabled: id.length > 0,
    retry: false, // 404/invalid-id/invalid-schema should not retry
  });
}
```

- [ ] **Step 3: Edit `packages/tarkov-data/src/index.ts` — add after the existing hook exports:**

```ts
export { useSaveBuild } from "./hooks/useSaveBuild.js";
export { useLoadBuild } from "./hooks/useLoadBuild.js";
export {
  saveBuild,
  loadBuild,
  LoadBuildError,
  type LoadBuildErrorCode,
  type SaveBuildResponse,
} from "./buildsApi.js";
```

- [ ] **Step 4: Typecheck + lint:**

```bash
pnpm --filter @tarkov/data typecheck
pnpm --filter @tarkov/data lint
```

Expected: both clean.

- [ ] **Step 5: Commit:**

```bash
git add packages/tarkov-data/src/hooks/useSaveBuild.ts packages/tarkov-data/src/hooks/useLoadBuild.ts packages/tarkov-data/src/index.ts
git commit -m "feat(tarkov-data): add useSaveBuild/useLoadBuild hooks"
```

---

## Phase 3: Transport — Vite proxy fix + Pages Function

### Task 4: Fix the Vite dev-proxy rewrite

The current rewrite strips `/api/builds` entirely. The Worker routes under `/builds/:id` and `POST /builds`, so the SPA request `POST /api/builds` becomes `POST /` on the Worker (404). Fix: only strip the `/api` prefix so `/api/builds/abc` → `/builds/abc` on the Worker.

**Files:**

- Modify: `apps/web/vite.config.ts`

- [ ] **Step 1: Edit `apps/web/vite.config.ts`, replace the existing `/api/builds` proxy block:**

Find this:

```ts
"/api/builds": {
  target: "http://localhost:8788",
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api\/builds/, ""),
},
```

Replace with:

```ts
"/api/builds": {
  target: "http://localhost:8788",
  changeOrigin: true,
  // Worker routes under `/builds/...` — strip only the `/api` prefix.
  rewrite: (path) => path.replace(/^\/api/, ""),
},
```

- [ ] **Step 2: Sanity check the proxy against a running Worker. Start builds-api in one terminal:**

```bash
pnpm --filter @tarkov/builds-api dev
```

Expected: `wrangler dev` starts on `http://localhost:8788`.

- [ ] **Step 3: In another terminal, start the web dev server:**

```bash
pnpm --filter @tarkov/web dev
```

- [ ] **Step 4: Verify round-trip with curl (from a third terminal):**

```bash
curl -sS -X POST http://localhost:5173/api/builds \
  -H 'Content-Type: application/json' \
  -d '{"version":1,"weaponId":"w","modIds":[],"createdAt":"2026-04-19T00:00:00.000Z"}'
```

Expected: `201` with JSON `{ "id": "<8chars>", "url": "http://.../builds/<id>" }`.

```bash
curl -sS http://localhost:5173/api/builds/<id-from-above>
```

Expected: `200` with the original JSON body.

- [ ] **Step 5: Stop both dev servers. Commit:**

```bash
git add apps/web/vite.config.ts
git commit -m "fix(web): preserve /builds path in dev proxy to builds-api"
```

### Task 5: Add the Cloudflare Pages Function proxy for production

In prod, the SPA lives on Pages and needs to route `/api/builds/*` to the `builds-api` Worker. Cloudflare Pages Functions provide a same-origin proxy with zero extra config. One catch-all handler does it.

**Files:**

- Create: `apps/web/functions/api/builds/[[path]].ts`
- Modify: `apps/web/CLAUDE.md` (document the new env var)

- [ ] **Step 1: Create the Pages Function — `apps/web/functions/api/builds/[[path]].ts`:**

```ts
/**
 * Cloudflare Pages Function — forwards `/api/builds/*` to the builds-api Worker.
 *
 * Uses a catch-all `[[path]]` param so both `/api/builds` (POST) and
 * `/api/builds/<id>` (GET) hit this handler. The downstream Worker expects
 * paths under `/builds/...`, so we strip `/api` before forwarding.
 *
 * The Worker URL is configured via the `BUILDS_API_URL` Pages env var —
 * typically `https://tarkov-gunsmith-builds-api.<subdomain>.workers.dev`.
 */

interface Env {
  BUILDS_API_URL: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.BUILDS_API_URL) {
    return new Response("BUILDS_API_URL not configured on this environment", { status: 500 });
  }

  const incoming = new URL(request.url);
  const downstream = new URL(env.BUILDS_API_URL);
  // Strip `/api` from the incoming path; keep `/builds/...` so the Worker routes it.
  downstream.pathname = incoming.pathname.replace(/^\/api/, "");
  downstream.search = incoming.search;

  const forwarded = new Request(downstream.toString(), request);
  return fetch(forwarded);
};
```

- [ ] **Step 2: Edit `apps/web/CLAUDE.md` — under the "Deploy" section, add a new subsection after the existing deploy block:**

```markdown
### Env vars on Cloudflare Pages

- `BUILDS_API_URL` (required in production) — URL of the `apps/builds-api` Worker (e.g. `https://tarkov-gunsmith-builds-api.<subdomain>.workers.dev`). Used by `apps/web/functions/api/builds/[[path]].ts` to proxy build save/load requests same-origin.

Set via `wrangler pages secret put BUILDS_API_URL --project-name tarkov-gunsmith-web` or via the Cloudflare dashboard. The Pages deploy action does not set this automatically — if the var is missing, the Pages Function returns a 500.
```

- [ ] **Step 3: Typecheck (Pages Functions are outside the web vite build but should still typecheck via tsconfig):**

```bash
pnpm --filter @tarkov/web typecheck
```

If this errors because `PagesFunction` isn't known, install the Cloudflare Workers types globally — they're already a transitive dep of wrangler. Add `"@cloudflare/workers-types"` to `apps/web/tsconfig.json` compilerOptions `types` array. (If the typecheck already passes, skip this.)

- [ ] **Step 4: Commit:**

```bash
git add apps/web/functions/api/builds/[[path]].ts apps/web/CLAUDE.md
git commit -m "feat(web): add Pages Function proxy to builds-api"
```

---

## Phase 4: Builder route wiring

### Task 6: Add "Share build" button + copy toast to `/builder`

Keep the toast primitive local to this route for now — there's no `@tarkov/ui` toast and only one route needs it. If `/matrix` or `/calc` grow toasts later, extract upstream in a follow-up.

**Files:**

- Modify: `apps/web/src/routes/builder.tsx`

- [ ] **Step 1: Add imports at the top of `apps/web/src/routes/builder.tsx`. Replace the existing `useWeaponList, useModList` import line with:**

```ts
import { useModList, useWeaponList, useSaveBuild, CURRENT_BUILD_VERSION } from "@tarkov/data";
import type { ModListItem } from "@tarkov/data";
```

(`@tarkov/data` exports `CURRENT_BUILD_VERSION` from Task 1 and `useSaveBuild` from Task 3.)

- [ ] **Step 2: Inside `BuilderPage`, after the `spec` `useMemo` block, add:**

```tsx
const saveMutation = useSaveBuild();
const [shareUrl, setShareUrl] = useState<string | null>(null);

function handleShare() {
  if (!selectedWeapon) return;
  saveMutation.mutate(
    {
      version: CURRENT_BUILD_VERSION,
      weaponId: selectedWeapon.id,
      modIds: [...selectedModIds],
      createdAt: new Date().toISOString(),
    },
    {
      onSuccess: async (result) => {
        try {
          await navigator.clipboard.writeText(result.url);
        } catch {
          // Clipboard permission denied — still show the URL so the user can copy manually.
        }
        setShareUrl(result.url);
        window.setTimeout(() => setShareUrl(null), 5000);
      },
    },
  );
}
```

- [ ] **Step 3: In the same file, add a Share button inside the weapon card. Replace the closing `</CardContent></Card>` of the weapon card (the one after the weapon `<select>`) so the card also renders the share button when a weapon is picked:**

Find the existing weapon card's `<CardContent>` block and replace its JSX body with:

```tsx
<CardContent className="flex flex-col gap-3">
  <select
    className="h-9 w-full rounded-[var(--radius)] border bg-[var(--color-input)] px-3 text-sm"
    value={weaponId}
    onChange={(e) => {
      setWeaponId(e.target.value);
      clearMods();
    }}
    disabled={isLoading || weaponOptions.length === 0}
  >
    <option value="">{isLoading ? "Loading…" : "Select weapon…"}</option>
    {weaponOptions.map((w) => (
      <option key={w.id} value={w.id}>
        {w.name}
      </option>
    ))}
  </select>
  {selectedWeapon && (
    <div className="flex items-center gap-3">
      <Button onClick={handleShare} disabled={saveMutation.isPending} size="sm">
        {saveMutation.isPending ? "Saving…" : "Share build"}
      </Button>
      {saveMutation.error && (
        <span className="text-sm text-[var(--color-destructive)]">Couldn't save — try again</span>
      )}
    </div>
  )}
</CardContent>
```

- [ ] **Step 4: Add a fixed-position toast near the bottom of the returned JSX, just before the closing `</div>` of the outermost `<div className="flex flex-col gap-6">`:**

```tsx
{
  shareUrl && (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-50 rounded-[var(--radius)] border bg-[var(--color-card)] p-4 shadow-lg"
    >
      <div className="text-sm font-medium">Build URL copied</div>
      <code className="mt-1 block max-w-xs truncate text-xs text-[var(--color-muted-foreground)]">
        {shareUrl}
      </code>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + lint:**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
```

Expected: both clean.

- [ ] **Step 6: Commit:**

```bash
git add apps/web/src/routes/builder.tsx
git commit -m "feat(web): add Share build button + copy toast to /builder"
```

### Task 7: Add `/builder/$id` loader route

New route file that reads the id from URL params, calls `useLoadBuild`, and on success mounts the existing `BuilderPage` with initial state derived from the loaded build. On error, renders a cause-specific empty state.

To keep `builder.tsx` the source of the page component, refactor it minimally: accept optional `initialWeaponId` and `initialModIds` props, otherwise behave exactly as today.

**Files:**

- Modify: `apps/web/src/routes/builder.tsx` (extract `<BuilderPage>` body + accept initial state)
- Create: `apps/web/src/routes/builder.$id.tsx`

- [ ] **Step 1: Edit `apps/web/src/routes/builder.tsx` — change `BuilderPage` to accept initial state. Find:**

```tsx
function BuilderPage() {
  const weapons = useWeaponList();
  const mods = useModList();

  const [weaponId, setWeaponId] = useState<string>("");
  const [selectedModIds, setSelectedModIds] = useState<Set<string>>(() => new Set());
```

Replace with:

```tsx
export interface BuilderPageProps {
  initialWeaponId?: string;
  initialModIds?: string[];
  notice?: React.ReactNode;
}

export function BuilderPage({ initialWeaponId = "", initialModIds, notice }: BuilderPageProps = {}) {
  const weapons = useWeaponList();
  const mods = useModList();

  const [weaponId, setWeaponId] = useState<string>(initialWeaponId);
  const [selectedModIds, setSelectedModIds] = useState<Set<string>>(
    () => new Set(initialModIds ?? []),
  );
```

- [ ] **Step 2: In the same file, add a `{notice}` slot inside the returned JSX — right after the `<section>` with the `<h1>` heading:**

```tsx
<section>
  <h1 className="text-3xl font-bold tracking-tight">Weapon Builder</h1>
  <p className="mt-2 text-[var(--color-muted-foreground)]">
    Pick a weapon, attach mods, see live <code>weaponSpec</code> output (ergonomics, recoil, weight,
    accuracy). v0.12.0 includes only mods with ergo/recoil/accuracy deltas (
    <code>ItemPropertiesWeaponMod</code>); slot-based compatibility comes in a follow-up.
  </p>
</section>;

{
  notice;
}
```

- [ ] **Step 3: Add a `React` import at the top of `apps/web/src/routes/builder.tsx` if not present:**

```ts
import type React from "react";
```

(Only needed for the `React.ReactNode` type — if you already have a default React import, skip.)

- [ ] **Step 4: Create `apps/web/src/routes/builder.$id.tsx`:**

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLoadBuild, LoadBuildError } from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";
import { BuilderPage } from "./builder.js";

export const Route = createFileRoute("/builder/$id")({
  component: LoadedBuilderPage,
});

function LoadedBuilderPage() {
  const { id } = Route.useParams();
  const query = useLoadBuild(id);

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="pt-6">Loading build…</CardContent>
        </Card>
      </div>
    );
  }

  if (query.error) {
    return <LoadErrorCard error={query.error} id={id} />;
  }

  if (!query.data) {
    return <LoadErrorCard error={new Error("No data")} id={id} />;
  }

  const build = query.data;
  return (
    <BuilderPage
      initialWeaponId={build.weaponId}
      initialModIds={build.modIds}
      notice={
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Loaded build <code>{id}</code>. Changes you make here won't update the saved copy —
              use "Share build" to create a new URL.
            </p>
          </CardContent>
        </Card>
      }
    />
  );
}

function LoadErrorCard({ error, id }: { error: Error; id: string }) {
  const code = error instanceof LoadBuildError ? error.code : "unreachable";

  const { title, body } = (() => {
    switch (code) {
      case "invalid-id":
        return {
          title: "Invalid build id",
          body: `The id "${id}" doesn't match the build-id format.`,
        };
      case "not-found":
        return {
          title: "Build not found",
          body: "This build has expired (30-day lifetime) or never existed.",
        };
      case "invalid-schema":
        return {
          title: "Build couldn't be loaded",
          body: "This build was stored in a format we can't read. It may have been created by a newer version of the app.",
        };
      case "unreachable":
      default:
        return {
          title: "Couldn't reach build storage",
          body: "Check your connection and try again.",
        };
    }
  })();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{body}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/builder" className="text-sm underline underline-offset-4 hover:opacity-80">
            Start a fresh build →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Add the upstream-drift warning. Edit `apps/web/src/routes/builder.tsx` — inside `BuilderPage`, add after the existing `filteredMods` / `selectedMods` memos and before the `saveMutation` block:**

```tsx
const upstreamDrift = useMemo(() => {
  // Only meaningful for loaded builds (fresh ones are built from current data).
  if (!initialWeaponId) return null;
  if (!weapons.data || !mods.data) return null; // wait for data before warning

  const missingWeapon = initialWeaponId && !weapons.data.some((w) => w.id === initialWeaponId);
  const knownModIds = new Set(mods.data.map((m) => m.id));
  const missingModIds = (initialModIds ?? []).filter((id) => !knownModIds.has(id));

  if (!missingWeapon && missingModIds.length === 0) return null;

  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-[var(--color-destructive)]">
          Some items in this build are no longer in the current game data.
          {missingWeapon && " The original weapon is missing."}
          {missingModIds.length > 0 &&
            ` ${missingModIds.length} mod${missingModIds.length === 1 ? "" : "s"} couldn't be resolved.`}{" "}
          Viewing what still exists.
        </p>
      </CardContent>
    </Card>
  );
}, [initialWeaponId, initialModIds, weapons.data, mods.data]);
```

Then render `{upstreamDrift}` immediately after `{notice}` in the returned JSX so the drift warning appears alongside the "Loaded build" notice.

- [ ] **Step 6: Regenerate the route tree and typecheck. TanStack Router plugin regenerates on `pnpm dev` — but for CI we can also trigger it via a dev-server start + kill. Simpler: just run typecheck; if it fails because of stale `route-tree.gen.ts`, run `pnpm --filter @tarkov/web dev` for 5s then Ctrl-C and try again:**

```bash
pnpm --filter @tarkov/web typecheck
```

Expected: clean. If errors mention missing `/builder/$id` in the route tree, start `pnpm --filter @tarkov/web dev`, wait for "generated route tree" log, Ctrl-C, re-run typecheck.

- [ ] **Step 7: Lint:**

```bash
pnpm --filter @tarkov/web lint
```

Expected: clean.

- [ ] **Step 8: Commit:**

```bash
git add apps/web/src/routes/builder.tsx apps/web/src/routes/builder.\$id.tsx apps/web/src/route-tree.gen.ts
git commit -m "feat(web): add /builder/\$id loader route with error taxonomy"
```

---

## Phase 5: Verification

### Task 8: End-to-end manual round-trip test

Playwright is deferred; this is the coverage for PR 1.

- [ ] **Step 1: Start both dev servers.**

Terminal 1:

```bash
pnpm --filter @tarkov/builds-api dev
```

Terminal 2:

```bash
pnpm --filter @tarkov/web dev
```

- [ ] **Step 2: In a browser, open `http://localhost:5173/builder`.**

- [ ] **Step 3: Select a weapon (e.g. AK-74N). Check 3-5 mods.**

- [ ] **Step 4: Click "Share build". Expect:**

- Button shows "Saving…" briefly.
- Toast appears in the bottom-right: "Build URL copied".
- Clipboard contains a URL like `http://localhost:8788/builds/<8chars>`.
- Toast disappears after 5 seconds.

- [ ] **Step 5: Copy the `<8chars>` id from the toast. Navigate to `http://localhost:5173/builder/<id>`.**

- [ ] **Step 6: Expect:**

- Page shows the same weapon selected.
- The same mods are checked.
- The "Loaded build" notice card appears above the weapon card.
- **No upstream-drift warning is visible** (ids all resolve against the current data).
- The spec panel shows the same numbers.

- [ ] **Step 7: Verify upstream-drift warning by crafting a build with a bogus weapon id:**

```bash
curl -sS -X POST http://localhost:5173/api/builds \
  -H 'Content-Type: application/json' \
  -d '{"version":1,"weaponId":"does-not-exist","modIds":["also-not-real"],"createdAt":"2026-04-19T00:00:00.000Z"}'
```

Copy the `id` from the response. Open `http://localhost:5173/builder/<that-id>`. Expect: the red drift warning ("Some items in this build are no longer in the current game data. The original weapon is missing. 1 mod couldn't be resolved…") appears under the "Loaded build" notice.

- [ ] **Step 8: Test error states:**

| URL                                                                | Expected UI                         |
| ------------------------------------------------------------------ | ----------------------------------- |
| `http://localhost:5173/builder/BAD-ID`                             | "Invalid build id" card             |
| `http://localhost:5173/builder/zzzzzzzz` (8 chars but never saved) | "Build not found" card              |
| Stop `builds-api` dev server, then navigate to a known-good id     | "Couldn't reach build storage" card |

- [ ] **Step 9: If all nine UI states look right (happy path, drift warning, invalid-id, not-found, unreachable), stop both dev servers and proceed. If anything is broken, add a regression test in the relevant `*.test.ts` before fixing.**

- [ ] **Step 10: Run the full repo test suite:**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

Expected: all clean.

- [ ] **Step 11: Commit any final fixes (if needed):**

```bash
git add -u
git commit -m "fix(web): <describe>"   # only if anything needed tweaking
```

---

## Phase 6: Ship

### Task 9: Open the PR

- [ ] **Step 1: Push the branch:**

```bash
git push -u origin feat/builder-robustness-pr1-schema-and-save-load
```

- [ ] **Step 2: Open the PR:**

```bash
gh pr create --base main --title "feat(builder): schema v1 + save/load round-trip (M1.5 PR 1)" --body "$(cat <<'EOF'
## Summary

First PR of the Milestone 1.5 Builder Robustness arc. See
[`docs/superpowers/specs/2026-04-19-builder-robustness-design.md`](docs/superpowers/specs/2026-04-19-builder-robustness-design.md)
for the umbrella design.

- `packages/tarkov-data`: adds `BuildV1` Zod schema + discriminated union,
  `saveBuild` / `loadBuild` fetchers with a typed `LoadBuildError` taxonomy,
  and `useSaveBuild` / `useLoadBuild` TanStack Query hooks.
- `apps/web`:
  - `/builder` gains a Share button that POSTs the current state and copies
    the resulting URL to the clipboard.
  - New `/builder/$id` route loads a saved build and hydrates `BuilderPage`
    with initial state. Cause-specific empty states for invalid id,
    not found, schema mismatch, and unreachable backend.
  - Fixes the Vite dev-proxy rewrite so the Worker sees `/builds/...`
    instead of the stripped-to-root path.
  - Adds `functions/api/builds/[[path]].ts` Cloudflare Pages Function to
    proxy same-origin requests to the `builds-api` Worker in prod (reads
    `BUILDS_API_URL` env var).

## Test plan

- [x] Unit: `BuildV1` + discriminated union parse/reject (9 tests in `build-schema.test.ts`)
- [x] Unit: `saveBuild` / `loadBuild` every happy and error path (11 tests in `buildsApi.test.ts`)
- [x] Manual: save build at `/builder` → open URL in same browser → state hydrates
- [x] Manual: invalid id, not-found, unreachable each render the right empty state
- [x] Manual: build with stale/removed item ids shows the upstream-drift warning banner
- [ ] Deploy: set `BUILDS_API_URL` on the tarkov-gunsmith-web Pages project before merging

## Out of scope for this PR (tracked in spec §11)

- Playwright e2e — separate follow-up plan (no Playwright infra in the repo yet)
- Slot-based mod compatibility — PR 2 of the arc
- Player-progression gating — PR 3
- Name / description on the build — PR 4

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 3: Manually set `BUILDS_API_URL` on the tarkov-gunsmith-web Pages project before merging.** The CI deploy will succeed without it, but the load route will 500 until it's set. This is a one-time setup, not repeated per deploy.

```bash
wrangler pages secret put BUILDS_API_URL --project-name tarkov-gunsmith-web
# Paste the builds-api Worker URL when prompted.
```

- [ ] **Step 4: Wait for CI to pass. Review PR. Squash-merge to `main`.** Release-please will roll a v1.1.0 bump PR shortly after.

---

## Deviations from the design spec

1. **Playwright e2e deferred.** Spec §11 lists Playwright "save → reload via URL" as part of PR 1. Playwright is not set up in the repo. Task 8 manual verification replaces it; Playwright setup + a replay of this test belongs in a separate infrastructure PR.

2. **Vite proxy rewrite bug fix.** Not called out in the spec — the dev proxy was silently broken because no code called it. Fixed as part of transport (Phase 3, Task 4).

3. **Toast primitive inlined in `builder.tsx` rather than added to `@tarkov/ui`.** Only one route needs it in PR 1. Extract upstream if PR 3 or 4 want toasts too.
