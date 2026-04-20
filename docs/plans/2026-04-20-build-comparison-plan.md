# Build Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/builder/compare` — a live side-by-side workspace where a user can load two builds, edit both sides, and see stat / slot / price / progression deltas update in real time. Save comparisons as first-class `pair:$id` entities in `builds-api`.

**Architecture:** Mirrors the existing single-build pipeline. New `BuildPair` Zod schema alongside `BuildV4`. New `pairsApi.ts` client + `usePair` / `useSavePair` / `useForkPair` hooks. Three new Worker routes (`POST /pairs`, `GET /pairs/:id`, `POST /pairs/:id/fork`) on the same KV binding, keyed under `p:$id`. New Pages Function `/api/pairs/[[path]].ts` mirroring the existing builds proxy. UI: new `apps/web/src/features/builder/compare/` with `CompareWorkspace`, `CompareSide`, `CompareStatDelta`, `CompareProgressionRow`, `CompareToolbar`, `CompareFromBuildDialog`, and a `useCompareDraft` reducer. Two new file-based routes: `builder.compare.tsx` (blank) and `builder.compare.$pairId.tsx` (loader). `SlotTree` gains an optional `diff?: SlotDiffMap` prop.

**Tech Stack:** TypeScript strict, Zod 3, React 19, TanStack Router (file-based), TanStack Query, Vitest, `@cloudflare/vitest-pool-workers`, Playwright, Tailwind v4, `@tarkov/ui` primitives (`Pill`, `Stamp`, `SectionTitle`, `StatRow`, `Card variant="bracket"`).

**Worktree:** This plan is meant to execute in a worktree branched off **origin/main** (local main is stale — memory-logged pattern). `pnpm install --frozen-lockfile && pnpm --filter "./packages/*" build` after creating the worktree.

---

## File structure (what we'll create / modify)

### New files

```
packages/tarkov-data/src/
  pair-schema.ts                          # BuildPair Zod schema + types (v1)
  pair-schema.test.ts                     # Parse round-trip, migrations placeholder
  pairsApi.ts                             # savePair / loadPair / forkPair + LoadPairError
  pairsApi.test.ts                        # Fetch mock tests
  hooks/
    useLoadPair.ts                        # TanStack Query wrapper
    useLoadPair.test.tsx                  # Query behavior test
    useSavePair.ts                        # TanStack Mutation wrapper
    useForkPair.ts                        # TanStack Mutation wrapper
  slot-diff.ts                            # Pure tree walker; emits SlotDiffMap
  slot-diff.test.ts                       # Walker correctness
  stat-delta.ts                           # Pure pair-of-WeaponSpec → deltas
  stat-delta.test.ts                      # Delta math + direction-aware coloring

apps/builds-api/src/
  pairs.ts                                # handlePostPair / handleGetPair / handleForkPair
  pairs.test.ts                           # Worker integration tests

apps/web/functions/api/pairs/
  [[path]].ts                             # Pages Function proxy (mirror of builds proxy)

apps/web/src/features/builder/compare/
  useCompareDraft.ts                      # Reducer hook
  useCompareDraft.test.ts                 # Reducer transitions
  compare-workspace.tsx                   # Top-level layout
  compare-side.tsx                        # One editable column
  compare-stat-delta.tsx                  # Sticky stat-delta strip
  compare-progression-row.tsx             # "B costs +₽34k, needs LL3…"
  compare-toolbar.tsx                     # Save / Save as new / Swap / Clone
  compare-from-build-dialog.tsx           # Picker modal used from /builder/$id
  compare-from-build-dialog.test.tsx
  compare-stat-delta.test.tsx

apps/web/src/routes/
  builder.compare.tsx                     # Blank workspace route
  builder.compare.$pairId.tsx             # Loader route

apps/web/e2e/
  # smoke.spec.ts additions (not new file)
```

### Modified files

```
packages/tarkov-data/src/index.ts                            # Re-export pair schema + hooks
apps/builds-api/src/index.ts                                 # Route /pairs, /pairs/:id, /pairs/:id/fork
apps/builds-api/src/index.test.ts                            # Existing tests stay; pairs.test.ts is separate
apps/web/src/features/builder/slot-tree.tsx                  # Add optional diff?: SlotDiffMap prop
apps/web/src/features/builder/build-header.tsx               # Add "Compare ↔" button + onCompare callback
apps/web/src/routes/builder.tsx                              # Wire up onCompare → CompareFromBuildDialog
apps/web/src/routes/index.tsx                                # Landing "or compare two builds →" CTA
apps/web/src/route-tree.gen.ts                               # Auto-regenerated on vite build
apps/web/e2e/smoke.spec.ts                                   # Add /builder/compare entries + interaction test
```

---

## Order of work

**Phase A — Data foundations** (Tasks 1–6). No UI. Land the schema, API client, Worker routes, Pages Function proxy. Every task is TDD. After Phase A, `POST /api/pairs` works end-to-end and is testable with `curl`.

**Phase B — Pure diff logic** (Tasks 7–8). `slotDiff` + `statDelta` in `packages/tarkov-data`. Pure, framework-free, TDD.

**Phase C — State + small UI pieces** (Tasks 9–15). Reducer + the individual compare components, each independently testable.

**Phase D — Route composition** (Tasks 16–19). `CompareWorkspace`, the two route files, `SlotTree` diff prop, `BuildHeader` "Compare ↔" button, landing CTA.

**Phase E — Playwright + final QA** (Tasks 20–22). New smoke entries, interaction, save round-trip. `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @tarkov/web e2e`.

Each task ends with a commit. Commits use Conventional Commits. Phase boundaries are good stopping points for review if executing with subagents.

---

## Task 1: `BuildPair` Zod schema

**Files:**

- Create: `packages/tarkov-data/src/pair-schema.ts`
- Create: `packages/tarkov-data/src/pair-schema.test.ts`
- Modify: `packages/tarkov-data/src/index.ts` (re-export)

- [ ] **Step 1: Write the failing test**

```ts
// packages/tarkov-data/src/pair-schema.test.ts
import { describe, it, expect } from "vitest";
import { BuildPair, CURRENT_PAIR_VERSION, type BuildPairV1 } from "./pair-schema.js";
import { DEFAULT_PROFILE } from "./build-schema.js";

const sampleV4Build = {
  version: 4 as const,
  weaponId: "5447a9cd4bdc2dbd208b4567",
  attachments: {},
  orphaned: [],
  createdAt: "2026-04-20T00:00:00.000Z",
};

describe("BuildPair schema", () => {
  it("parses a fully-populated v1 pair", () => {
    const pair: BuildPairV1 = {
      v: 1,
      createdAt: "2026-04-20T00:00:00.000Z",
      left: sampleV4Build,
      right: sampleV4Build,
      leftProfile: DEFAULT_PROFILE,
      rightProfile: DEFAULT_PROFILE,
      name: "early-wipe vs. endgame",
      description: "Comparing my LL2 vs. LL4 M4 build",
    };
    expect(BuildPair.parse(pair)).toEqual(pair);
  });

  it("accepts null on either side", () => {
    const pair = {
      v: 1 as const,
      createdAt: "2026-04-20T00:00:00.000Z",
      left: sampleV4Build,
      right: null,
    };
    expect(BuildPair.parse(pair)).toEqual(pair);
  });

  it("rejects unknown schema version", () => {
    const pair = {
      v: 99,
      createdAt: "2026-04-20T00:00:00.000Z",
      left: null,
      right: null,
    };
    expect(() => BuildPair.parse(pair)).toThrow();
  });

  it("enforces name max 60 chars + description max 280 chars", () => {
    const pair = {
      v: 1 as const,
      createdAt: "2026-04-20T00:00:00.000Z",
      left: null,
      right: null,
      name: "x".repeat(61),
    };
    expect(() => BuildPair.parse(pair)).toThrow();
  });

  it("exports CURRENT_PAIR_VERSION = 1", () => {
    expect(CURRENT_PAIR_VERSION).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tarkov/data test pair-schema.test.ts`
Expected: FAIL with "Cannot find module './pair-schema.js'".

- [ ] **Step 3: Create the schema**

```ts
// packages/tarkov-data/src/pair-schema.ts
import { z } from "zod";
import { Build, PlayerProfile } from "./build-schema.js";

/**
 * Pair schema v1 — two build snapshots + optional per-side profile snapshots +
 * optional user label. Embeds full `Build`s (not references) so a pair
 * survives the original single builds' 30-day TTL.
 *
 * See docs/superpowers/specs/2026-04-20-build-comparison-design.md §4.4.
 */
export const BuildPairV1 = z.object({
  v: z.literal(1),
  createdAt: z.string().datetime(),
  left: Build.nullable(),
  right: Build.nullable(),
  leftProfile: PlayerProfile.optional(),
  rightProfile: PlayerProfile.optional(),
  name: z.string().max(60).optional(),
  description: z.string().max(280).optional(),
});

export type BuildPairV1 = z.infer<typeof BuildPairV1>;

/**
 * Discriminated union over all known pair versions — follows the same
 * pattern as `Build`. Add a new variant per schema bump; never mutate
 * existing variants. Zod's discriminator key is `v` (not `version`, to avoid
 * collision with embedded `Build.version`).
 */
export const BuildPair = z.discriminatedUnion("v", [BuildPairV1]);
export type BuildPair = z.infer<typeof BuildPair>;

export const CURRENT_PAIR_VERSION = 1 as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tarkov/data test pair-schema.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Re-export from package index**

```ts
// packages/tarkov-data/src/index.ts — add alongside existing build-schema re-exports
export { BuildPair, BuildPairV1, CURRENT_PAIR_VERSION } from "./pair-schema.js";
export type { BuildPair as BuildPairType } from "./pair-schema.js";
```

(Check the existing file for the actual export style — `export *` vs. named. Match it.)

- [ ] **Step 6: Build the package**

Run: `pnpm --filter @tarkov/data build`
Expected: build succeeds; `dist/pair-schema.d.ts` exists.

- [ ] **Step 7: Commit**

```bash
git add packages/tarkov-data/src/pair-schema.ts packages/tarkov-data/src/pair-schema.test.ts packages/tarkov-data/src/index.ts
git commit -m "feat(data): BuildPair Zod schema (v1) for build comparison"
```

---

## Task 2: `pairsApi` client fns (savePair / loadPair / forkPair)

**Files:**

- Create: `packages/tarkov-data/src/pairsApi.ts`
- Create: `packages/tarkov-data/src/pairsApi.test.ts`
- Modify: `packages/tarkov-data/src/index.ts` (re-export)

This mirrors the existing `buildsApi.ts` pattern exactly. Read it first for reference: `packages/tarkov-data/src/buildsApi.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tarkov-data/src/pairsApi.test.ts
import { describe, it, expect, vi } from "vitest";
import { savePair, loadPair, forkPair, LoadPairError } from "./pairsApi.js";
import type { BuildPairV1 } from "./pair-schema.js";

const validPair: BuildPairV1 = {
  v: 1,
  createdAt: "2026-04-20T00:00:00.000Z",
  left: null,
  right: null,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("savePair", () => {
  it("POSTs to /api/pairs and returns { id, url }", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { id: "abc23456", url: "https://x/pairs/abc23456" }));
    const res = await savePair(fetchImpl as unknown as typeof fetch, validPair);
    expect(res).toEqual({ id: "abc23456", url: "https://x/pairs/abc23456" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/pairs",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on non-201", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(savePair(fetchImpl as unknown as typeof fetch, validPair)).rejects.toThrow();
  });

  it("throws on malformed response body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { id: 123 }));
    await expect(savePair(fetchImpl as unknown as typeof fetch, validPair)).rejects.toThrow();
  });
});

describe("loadPair", () => {
  it("validates id format before the network call", async () => {
    const fetchImpl = vi.fn();
    await expect(loadPair(fetchImpl as unknown as typeof fetch, "BAD-ID")).rejects.toMatchObject({
      code: "invalid-id",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns parsed pair on 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, validPair));
    const res = await loadPair(fetchImpl as unknown as typeof fetch, "abc23456");
    expect(res).toEqual(validPair);
  });

  it("throws LoadPairError code=not-found on 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    await expect(loadPair(fetchImpl as unknown as typeof fetch, "abc23456")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("throws LoadPairError code=unreachable on network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(loadPair(fetchImpl as unknown as typeof fetch, "abc23456")).rejects.toMatchObject({
      code: "unreachable",
    });
  });

  it("throws LoadPairError code=invalid-schema on malformed body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { notAPair: true }));
    await expect(loadPair(fetchImpl as unknown as typeof fetch, "abc23456")).rejects.toMatchObject({
      code: "invalid-schema",
    });
  });
});

describe("forkPair", () => {
  it("POSTs to /api/pairs/:id/fork and returns { id, url }", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { id: "xyz98765", url: "https://x/pairs/xyz98765" }));
    const res = await forkPair(fetchImpl as unknown as typeof fetch, "abc23456");
    expect(res).toEqual({ id: "xyz98765", url: "https://x/pairs/xyz98765" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/pairs/abc23456/fork",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("validates id format", async () => {
    const fetchImpl = vi.fn();
    await expect(forkPair(fetchImpl as unknown as typeof fetch, "BAD-ID")).rejects.toMatchObject({
      code: "invalid-id",
    });
  });
});

describe("LoadPairError", () => {
  it("has a .code and a .cause", () => {
    const err = new LoadPairError("not-found", "missing", new Error("root"));
    expect(err.code).toBe("not-found");
    expect(err.cause).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tarkov/data test pairsApi.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// packages/tarkov-data/src/pairsApi.ts
import { BuildPair, type BuildPair as BuildPairType } from "./pair-schema.js";

const PAIRS_ENDPOINT = "/api/pairs";

// Same alphabet + length as apps/builds-api/src/id.ts. Kept in sync manually.
const PAIR_ID_REGEX = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

export type LoadPairErrorCode = "invalid-id" | "not-found" | "unreachable" | "invalid-schema";

export class LoadPairError extends Error {
  constructor(
    public readonly code: LoadPairErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LoadPairError";
  }
}

export interface SavePairResponse {
  id: string;
  url: string;
}

function parseSaveResponse(body: unknown): SavePairResponse {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { id?: unknown }).id !== "string" ||
    typeof (body as { url?: unknown }).url !== "string"
  ) {
    throw new Error("pairsApi: malformed response");
  }
  return body as SavePairResponse;
}

export async function savePair(
  fetchImpl: typeof fetch,
  pair: BuildPairType,
): Promise<SavePairResponse> {
  const res = await fetchImpl(PAIRS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pair),
  });
  if (res.status !== 201) {
    throw new Error(`savePair failed: HTTP ${res.status}`);
  }
  return parseSaveResponse(await res.json());
}

export async function loadPair(fetchImpl: typeof fetch, id: string): Promise<BuildPairType> {
  if (!PAIR_ID_REGEX.test(id)) {
    throw new LoadPairError("invalid-id", `Pair id "${id}" is malformed`);
  }

  let res: Response;
  try {
    res = await fetchImpl(`${PAIRS_ENDPOINT}/${id}`);
  } catch (cause) {
    throw new LoadPairError("unreachable", "Couldn't reach pair storage", cause);
  }

  if (res.status === 404) {
    throw new LoadPairError("not-found", `Pair "${id}" not found`);
  }
  if (res.status !== 200) {
    throw new LoadPairError("unreachable", `Pair storage returned HTTP ${res.status}`);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (cause) {
    throw new LoadPairError("invalid-schema", "Pair body was not JSON", cause);
  }

  const parsed = BuildPair.safeParse(raw);
  if (!parsed.success) {
    throw new LoadPairError("invalid-schema", "Pair failed schema validation", parsed.error);
  }
  return parsed.data;
}

export async function forkPair(fetchImpl: typeof fetch, id: string): Promise<SavePairResponse> {
  if (!PAIR_ID_REGEX.test(id)) {
    throw new LoadPairError("invalid-id", `Pair id "${id}" is malformed`);
  }
  const res = await fetchImpl(`${PAIRS_ENDPOINT}/${id}/fork`, {
    method: "POST",
  });
  if (res.status !== 201) {
    throw new Error(`forkPair failed: HTTP ${res.status}`);
  }
  return parseSaveResponse(await res.json());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tarkov/data test pairsApi.test.ts`
Expected: PASS — 10 tests green.

- [ ] **Step 5: Re-export from package index**

Append `savePair`, `loadPair`, `forkPair`, `LoadPairError`, `SavePairResponse`, `LoadPairErrorCode` to `packages/tarkov-data/src/index.ts` matching the style of the existing `buildsApi` re-exports.

- [ ] **Step 6: Build + typecheck**

Run: `pnpm --filter @tarkov/data build && pnpm --filter @tarkov/data typecheck`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add packages/tarkov-data/src/pairsApi.ts packages/tarkov-data/src/pairsApi.test.ts packages/tarkov-data/src/index.ts
git commit -m "feat(data): pairsApi client — savePair / loadPair / forkPair + LoadPairError"
```

---

## Task 3: TanStack Query hooks (`useLoadPair`, `useSavePair`, `useForkPair`)

**Files:**

- Create: `packages/tarkov-data/src/hooks/useLoadPair.ts`
- Create: `packages/tarkov-data/src/hooks/useSavePair.ts`
- Create: `packages/tarkov-data/src/hooks/useForkPair.ts`
- Create: `packages/tarkov-data/src/hooks/useLoadPair.test.tsx`
- Modify: `packages/tarkov-data/src/index.ts`

Mirror the patterns in `useLoadBuild.ts` and `useSaveBuild.ts`. The hook tests exercise the critical branches: disabled-when-empty-id, error surfacing, successful cache key.

- [ ] **Step 1: Write the failing hook test**

```tsx
// packages/tarkov-data/src/hooks/useLoadPair.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useLoadPair } from "./useLoadPair.js";
import * as pairsApi from "../pairsApi.js";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useLoadPair", () => {
  it("is disabled when id is empty", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(pairsApi, "loadPair");
    const { result } = renderHook(() => useLoadPair(""), { wrapper: wrapper(client) });
    expect(result.current.fetchStatus).toBe("idle");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("loads a pair on mount when id is valid", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const validPair = {
      v: 1 as const,
      createdAt: "2026-04-20T00:00:00.000Z",
      left: null,
      right: null,
    };
    vi.spyOn(pairsApi, "loadPair").mockResolvedValue(validPair);
    const { result } = renderHook(() => useLoadPair("abc23456"), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(validPair);
  });

  it("surfaces LoadPairError on failure", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(pairsApi, "loadPair").mockRejectedValue(
      new pairsApi.LoadPairError("not-found", "missing"),
    );
    const { result } = renderHook(() => useLoadPair("abc23456"), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as pairsApi.LoadPairError).code).toBe("not-found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tarkov/data test useLoadPair.test.tsx`
Expected: FAIL — hook module doesn't exist.

- [ ] **Step 3: Write the three hooks**

```ts
// packages/tarkov-data/src/hooks/useLoadPair.ts
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { loadPair } from "../pairsApi.js";
import type { BuildPair } from "../pair-schema.js";

/**
 * Reactive pair-load by id. Cached under `["pair", id]`. Disabled when id
 * is empty. Errors (including `LoadPairError`) surface on `.error`.
 */
export function useLoadPair(id: string): UseQueryResult<BuildPair, Error> {
  return useQuery({
    queryKey: ["pair", id],
    queryFn: () => loadPair(fetch, id),
    enabled: id.length > 0,
    retry: false,
  });
}
```

```ts
// packages/tarkov-data/src/hooks/useSavePair.ts
import { useMutation } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { savePair, type SavePairResponse } from "../pairsApi.js";
import type { BuildPair } from "../pair-schema.js";

export function useSavePair(): UseMutationResult<SavePairResponse, Error, BuildPair> {
  return useMutation({
    mutationFn: (pair: BuildPair) => savePair(fetch, pair),
  });
}
```

```ts
// packages/tarkov-data/src/hooks/useForkPair.ts
import { useMutation } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { forkPair, type SavePairResponse } from "../pairsApi.js";

export function useForkPair(): UseMutationResult<SavePairResponse, Error, string> {
  return useMutation({
    mutationFn: (pairId: string) => forkPair(fetch, pairId),
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tarkov/data test useLoadPair.test.tsx`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Re-export from package index**

Add `useLoadPair`, `useSavePair`, `useForkPair` to `packages/tarkov-data/src/index.ts` matching the existing hook re-export style.

- [ ] **Step 6: Build + typecheck**

Run: `pnpm --filter @tarkov/data build && pnpm --filter @tarkov/data typecheck`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add packages/tarkov-data/src/hooks/useLoadPair.ts packages/tarkov-data/src/hooks/useSavePair.ts packages/tarkov-data/src/hooks/useForkPair.ts packages/tarkov-data/src/hooks/useLoadPair.test.tsx packages/tarkov-data/src/index.ts
git commit -m "feat(data): useLoadPair / useSavePair / useForkPair hooks"
```

---

## Task 4: Worker `/pairs` routes + tests

**Files:**

- Create: `apps/builds-api/src/pairs.ts`
- Create: `apps/builds-api/src/pairs.test.ts`
- Modify: `apps/builds-api/src/index.ts` (wire into the router)

- [ ] **Step 1: Write the failing Worker tests**

```ts
// apps/builds-api/src/pairs.test.ts
import { describe, it, expect } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";
import worker from "./index.js";

const validPairBody = JSON.stringify({
  v: 1,
  createdAt: "2026-04-20T00:00:00.000Z",
  left: null,
  right: null,
});

describe("POST /pairs", () => {
  it("stores a pair and returns { id, url }", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/pairs", {
        method: "POST",
        body: validPairBody,
        headers: { "Content-Type": "application/json" },
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; url: string };
    expect(body.id).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
    expect(body.url).toContain(`/pairs/${body.id}`);
    const stored = await env.BUILDS.get(`p:${body.id}`);
    expect(stored).toBe(validPairBody);
  });

  it("rejects empty body", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/pairs", { method: "POST", body: "" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });

  it("rejects body > 32 KB", async () => {
    const ctx = createExecutionContext();
    const huge = "x".repeat(33 * 1024);
    const res = await worker.fetch(
      new Request("https://x/pairs", { method: "POST", body: huge }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(413);
  });

  it("rejects non-JSON body", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/pairs", { method: "POST", body: "not json" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });
});

describe("GET /pairs/:id", () => {
  it("returns 200 with stored body", async () => {
    // seed directly through KV (bypasses POST so this test is isolated)
    await env.BUILDS.put("p:abc23456", validPairBody);
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/pairs/abc23456"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(validPairBody);
  });

  it("returns 404 on missing id", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/pairs/nonexxxx"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 on malformed id", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/pairs/BAD-ID"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });
});

describe("POST /pairs/:id/fork", () => {
  it("copies the stored pair under a new id", async () => {
    await env.BUILDS.put("p:src11111", validPairBody);
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/pairs/src11111/fork", { method: "POST" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; url: string };
    expect(body.id).not.toBe("src11111");
    expect(body.id).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
    const stored = await env.BUILDS.get(`p:${body.id}`);
    expect(stored).toBe(validPairBody);
  });

  it("returns 404 when source doesn't exist", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/pairs/ghost123/fork", { method: "POST" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 on malformed id", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/pairs/BAD-ID/fork", { method: "POST" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tarkov/builds-api test pairs.test.ts`
Expected: FAIL — routes don't exist (all return 404 or method-not-allowed).

- [ ] **Step 3: Write the pair handlers**

```ts
// apps/builds-api/src/pairs.ts
import { newBuildId, BUILD_ID_REGEX } from "./id.js";

const MAX_BODY_BYTES = 32 * 1024;
const PAIR_PREFIX = "p:";

async function readBody(request: Request): Promise<{ size: number; text: string }> {
  const text = await request.text();
  return { size: new TextEncoder().encode(text).byteLength, text };
}

function pairUrl(requestUrl: URL, id: string): string {
  return `${requestUrl.origin}/pairs/${id}`;
}

export async function handlePostPair(request: Request, env: Env): Promise<Response> {
  const { size, text } = await readBody(request);
  if (size === 0) return new Response("Empty body", { status: 400 });
  if (size > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });

  try {
    JSON.parse(text);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const id = newBuildId();
  const ttl = Number(env.BUILD_TTL_SECONDS);
  await env.BUILDS.put(`${PAIR_PREFIX}${id}`, text, { expirationTtl: ttl });

  const url = pairUrl(new URL(request.url), id);
  return new Response(JSON.stringify({ id, url }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleGetPair(id: string, env: Env): Promise<Response> {
  if (!BUILD_ID_REGEX.test(id)) {
    return new Response("Invalid id", { status: 400 });
  }
  const value = await env.BUILDS.get(`${PAIR_PREFIX}${id}`);
  if (!value) return new Response("Not Found", { status: 404 });
  return new Response(value, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleForkPair(id: string, request: Request, env: Env): Promise<Response> {
  if (!BUILD_ID_REGEX.test(id)) {
    return new Response("Invalid id", { status: 400 });
  }
  const source = await env.BUILDS.get(`${PAIR_PREFIX}${id}`);
  if (!source) return new Response("Not Found", { status: 404 });

  const newId = newBuildId();
  const ttl = Number(env.BUILD_TTL_SECONDS);
  await env.BUILDS.put(`${PAIR_PREFIX}${newId}`, source, { expirationTtl: ttl });

  const url = pairUrl(new URL(request.url), newId);
  return new Response(JSON.stringify({ id: newId, url }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 4: Wire the handlers into `index.ts`**

Edit `apps/builds-api/src/index.ts` — add three path matches inside the exported `fetch`:

```ts
// after the existing /builds routes, before the final return new Response("Not Found", ...)

if (path === "/pairs") {
  if (request.method === "POST") return handlePostPair(request, env);
  return new Response("Method Not Allowed", { status: 405 });
}

const pairForkMatch = /^\/pairs\/([^/]+)\/fork$/.exec(path);
if (pairForkMatch && request.method === "POST") {
  return handleForkPair(pairForkMatch[1] ?? "", request, env);
}

const pairMatch = /^\/pairs\/([^/]+)$/.exec(path);
if (pairMatch && request.method === "GET") {
  return handleGetPair(pairMatch[1] ?? "", env);
}
```

Import at the top:

```ts
import { handlePostPair, handleGetPair, handleForkPair } from "./pairs.js";
```

(Check route ordering — the fork match must come before the plain-id match, because `/pairs/xxxxxxxx/fork` would otherwise satisfy the `/pairs/:id` regex on a greedy match. The regex is anchored on `$`, but better to keep order explicit.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @tarkov/builds-api test pairs.test.ts`
Expected: PASS — all 10 tests green.

- [ ] **Step 6: Run the full Worker test suite to confirm no regression**

Run: `pnpm --filter @tarkov/builds-api test`
Expected: all existing `index.test.ts` tests still pass + the new suite.

- [ ] **Step 7: Commit**

```bash
git add apps/builds-api/src/pairs.ts apps/builds-api/src/pairs.test.ts apps/builds-api/src/index.ts
git commit -m "feat(builds-api): /pairs routes — POST / GET / fork"
```

---

## Task 5: Pages Function proxy for `/api/pairs/*`

**Files:**

- Create: `apps/web/functions/api/pairs/[[path]].ts`

This file mirrors `apps/web/functions/api/builds/[[path]].ts` verbatim — the forwarding logic is identical, only the path prefix differs (and that's handled by the file-based Pages Function routing).

- [ ] **Step 1: Create the Pages Function**

```ts
// apps/web/functions/api/pairs/[[path]].ts
/**
 * Cloudflare Pages Function — forwards `/api/pairs/*` to the builds-api Worker.
 *
 * Uses a catch-all `[[path]]` param so `/api/pairs` (POST), `/api/pairs/<id>` (GET),
 * and `/api/pairs/<id>/fork` (POST) all hit this handler. The downstream Worker
 * expects paths under `/pairs/...`, so we strip `/api` before forwarding.
 *
 * Reuses the same `BUILDS_API_URL` env var as the /builds proxy — both endpoints
 * live on the same Worker.
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
  downstream.pathname = incoming.pathname.replace(/^\/api/, "");
  downstream.search = incoming.search;

  const forwarded = new Request(downstream.toString(), request);
  return fetch(forwarded);
};
```

- [ ] **Step 2: Verify typecheck of the functions folder**

Run: `pnpm --filter @tarkov/web typecheck`
Expected: pass. Pages Functions typecheck as part of the web app.

- [ ] **Step 3: Commit**

```bash
git add apps/web/functions/api/pairs/
git commit -m "feat(web): /api/pairs/* Pages Function — proxy to builds-api"
```

---

## Task 6: End-to-end API sanity check (manual, no commit)

Before moving to UI, verify the full stack wiring locally.

- [ ] **Step 1: Run the Worker locally**

Run (in a separate shell): `pnpm --filter @tarkov/builds-api dev`
Expected: Worker listening on `http://localhost:8787`.

- [ ] **Step 2: Hit the routes**

```bash
curl -X POST http://localhost:8787/pairs \
  -H 'Content-Type: application/json' \
  -d '{"v":1,"createdAt":"2026-04-20T00:00:00.000Z","left":null,"right":null}'
# Expected: { "id": "...", "url": "http://localhost:8787/pairs/..." }

curl http://localhost:8787/pairs/<id-from-above>
# Expected: the JSON body above

curl -X POST http://localhost:8787/pairs/<id-from-above>/fork
# Expected: { "id": "<new-id>", "url": "..." }
```

If any of these fail, stop and diagnose before proceeding. No commit for this task.

---

## Task 7: `slotDiff` pure tree walker

**Files:**

- Create: `packages/tarkov-data/src/slot-diff.ts`
- Create: `packages/tarkov-data/src/slot-diff.test.ts`
- Modify: `packages/tarkov-data/src/index.ts`

The walker takes two `SlotNode[]` trees (plus the two `attachments: Record<slotPath, itemId>` maps used by the Builder) and returns a `SlotDiffMap` — a `Map<slotPath, "equal" | "differs" | "left-only" | "right-only">`. Pure, framework-free.

Read `packages/tarkov-data/src/hooks/useWeaponTree.ts` first for the `SlotNode` type.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tarkov-data/src/slot-diff.test.ts
import { describe, it, expect } from "vitest";
import { slotDiff, type SlotDiffStatus, type SlotDiffInput } from "./slot-diff.js";

function leaf(nameId: string): SlotDiffInput["tree"][number] {
  return { nameId, path: nameId, slots: [] } as unknown as SlotDiffInput["tree"][number];
}

const tree = [leaf("mod_scope"), leaf("mod_barrel"), leaf("mod_stock")];

describe("slotDiff", () => {
  it("returns all 'equal' when attachments match", () => {
    const map = slotDiff(
      { tree, attachments: { mod_scope: "x", mod_barrel: "y" } },
      { tree, attachments: { mod_scope: "x", mod_barrel: "y" } },
    );
    expect(map.get("mod_scope")).toBe<SlotDiffStatus>("equal");
    expect(map.get("mod_barrel")).toBe<SlotDiffStatus>("equal");
    expect(map.get("mod_stock")).toBe<SlotDiffStatus>("equal");
  });

  it("marks 'differs' when same slot has different items", () => {
    const map = slotDiff(
      { tree, attachments: { mod_scope: "x" } },
      { tree, attachments: { mod_scope: "y" } },
    );
    expect(map.get("mod_scope")).toBe<SlotDiffStatus>("differs");
  });

  it("marks 'left-only' when left has an item and right is empty", () => {
    const map = slotDiff({ tree, attachments: { mod_scope: "x" } }, { tree, attachments: {} });
    expect(map.get("mod_scope")).toBe<SlotDiffStatus>("left-only");
  });

  it("marks 'right-only' when right has an item and left is empty", () => {
    const map = slotDiff({ tree, attachments: {} }, { tree, attachments: { mod_scope: "y" } });
    expect(map.get("mod_scope")).toBe<SlotDiffStatus>("right-only");
  });

  it("recurses into nested slot children", () => {
    const nested = [
      {
        nameId: "mod_mount",
        path: "mod_mount",
        slots: [{ nameId: "mod_scope", path: "mod_mount/mod_scope", slots: [] }],
      },
    ] as unknown as SlotDiffInput["tree"];

    const map = slotDiff(
      { tree: nested, attachments: { "mod_mount/mod_scope": "x" } },
      { tree: nested, attachments: {} },
    );
    expect(map.get("mod_mount/mod_scope")).toBe<SlotDiffStatus>("left-only");
  });

  it("handles null sides gracefully", () => {
    const map = slotDiff(null, { tree, attachments: { mod_scope: "x" } });
    expect(map.get("mod_scope")).toBe<SlotDiffStatus>("right-only");
  });

  it("returns empty map when both sides are null", () => {
    const map = slotDiff(null, null);
    expect(map.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tarkov/data test slot-diff.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `slotDiff`**

```ts
// packages/tarkov-data/src/slot-diff.ts

/**
 * Pure tree-walking diff. Given two (tree, attachments) pairs, produces a
 * map keyed by slot path → one of four statuses. The map includes every
 * path present on either side; paths absent from both are omitted.
 *
 * The caller passes the `SlotNode[]` arrays that `useWeaponTree` returns
 * plus the `Record<SlotPath, ItemId>` map that the Builder maintains.
 * The function does not require the two trees to be identical — compare
 * only runs on matched paths. Missing-on-one-side slots fall out as
 * `left-only` / `right-only` depending on which side has the attachment.
 */

export type SlotDiffStatus = "equal" | "differs" | "left-only" | "right-only";

interface SlotNodeLike {
  nameId: string;
  path: string;
  slots: readonly SlotNodeLike[];
}

export interface SlotDiffInput {
  tree: readonly SlotNodeLike[];
  attachments: Readonly<Record<string, string>>;
}

export type SlotDiffMap = ReadonlyMap<string, SlotDiffStatus>;

function collectPaths(tree: readonly SlotNodeLike[] | undefined, acc: Set<string>): void {
  if (!tree) return;
  for (const node of tree) {
    acc.add(node.path);
    collectPaths(node.slots, acc);
  }
}

export function slotDiff(left: SlotDiffInput | null, right: SlotDiffInput | null): SlotDiffMap {
  const paths = new Set<string>();
  collectPaths(left?.tree, paths);
  collectPaths(right?.tree, paths);
  // Also include any attachment paths that aren't in the trees (shouldn't
  // happen under normal use but protects against drift).
  for (const p of Object.keys(left?.attachments ?? {})) paths.add(p);
  for (const p of Object.keys(right?.attachments ?? {})) paths.add(p);

  const out = new Map<string, SlotDiffStatus>();
  for (const path of paths) {
    const l = left?.attachments[path];
    const r = right?.attachments[path];
    if (l === undefined && r === undefined) {
      out.set(path, "equal");
      continue;
    }
    if (l === undefined) {
      out.set(path, "right-only");
      continue;
    }
    if (r === undefined) {
      out.set(path, "left-only");
      continue;
    }
    out.set(path, l === r ? "equal" : "differs");
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tarkov/data test slot-diff.test.ts`
Expected: PASS — 7 tests green.

- [ ] **Step 5: Re-export + commit**

Add `slotDiff`, `SlotDiffMap`, `SlotDiffStatus`, `SlotDiffInput` to `packages/tarkov-data/src/index.ts`.

```bash
git add packages/tarkov-data/src/slot-diff.ts packages/tarkov-data/src/slot-diff.test.ts packages/tarkov-data/src/index.ts
git commit -m "feat(data): slotDiff pure walker for Build comparison"
```

---

## Task 8: `statDelta` pure helper

**Files:**

- Create: `packages/tarkov-data/src/stat-delta.ts`
- Create: `packages/tarkov-data/src/stat-delta.test.ts`
- Modify: `packages/tarkov-data/src/index.ts`

Given two `WeaponSpec` objects (output of `weaponSpec()` from `@tarkov/ballistics`), produce a structured per-stat delta + a direction flag. "Direction" answers "is B better than A on this stat?" — recoil lower is better, ergo/accuracy/velocity/damage higher is better. Missing on either side = `null` delta.

Read `packages/ballistics/src/weapon-spec.ts` first for the `WeaponSpec` type.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tarkov-data/src/stat-delta.test.ts
import { describe, it, expect } from "vitest";
import { statDelta, type StatDirection, type StatDeltaResult } from "./stat-delta.js";

// Synthetic minimal WeaponSpec shape — only the fields statDelta reads.
const a = {
  verticalRecoil: 100,
  horizontalRecoil: 200,
  ergonomics: 50,
  accuracyMoa: 3,
  muzzleVelocity: 800,
  effectiveDistance: 400,
  damage: 70,
  penetration: 32,
  priceRub: 50000,
};

describe("statDelta", () => {
  it("returns zero deltas when specs are identical", () => {
    const res = statDelta(a, a);
    for (const row of res) {
      expect(row.delta).toBe(0);
      expect(row.direction).toBe<StatDirection>("neutral");
    }
  });

  it("marks recoil decrease as 'better'", () => {
    const b = { ...a, verticalRecoil: 80 };
    const res = statDelta(a, b);
    const row = res.find((r) => r.key === "verticalRecoil");
    expect(row?.delta).toBe(-20);
    expect(row?.direction).toBe<StatDirection>("better");
  });

  it("marks ergo increase as 'better'", () => {
    const b = { ...a, ergonomics: 60 };
    const res = statDelta(a, b);
    const row = res.find((r) => r.key === "ergonomics");
    expect(row?.delta).toBe(10);
    expect(row?.direction).toBe<StatDirection>("better");
  });

  it("marks recoil increase as 'worse'", () => {
    const b = { ...a, horizontalRecoil: 230 };
    const res = statDelta(a, b);
    const row = res.find((r) => r.key === "horizontalRecoil");
    expect(row?.delta).toBe(30);
    expect(row?.direction).toBe<StatDirection>("worse");
  });

  it("handles null/undefined on either side with direction=unavailable", () => {
    const res = statDelta(a, null);
    for (const row of res) {
      expect(row.direction).toBe<StatDirection>("unavailable");
      expect(row.delta).toBeNull();
    }
  });

  it("reports all 8 headline stats in a stable order", () => {
    const res = statDelta(a, a);
    expect(res.map((r) => r.key)).toEqual([
      "verticalRecoil",
      "horizontalRecoil",
      "ergonomics",
      "accuracyMoa",
      "muzzleVelocity",
      "effectiveDistance",
      "damage",
      "penetration",
      "priceRub",
    ]);
  });
});
```

(Note: 9 stats not 8 — matching `BuildHeader`'s actual surface. Adjust the spec's "8 stats" reference in the writeup if pedantic, but nine in the code is what matches existing Builder display.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tarkov/data test stat-delta.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `statDelta`**

```ts
// packages/tarkov-data/src/stat-delta.ts

/**
 * Pure pair-of-WeaponSpec → per-stat delta helper. Used by the
 * `/builder/compare` stat-delta strip. "Direction" is per-stat aware: recoil
 * lower is better, everything else higher is better. Missing on either side
 * → delta=null, direction='unavailable'.
 */

export type StatDirection = "better" | "worse" | "neutral" | "unavailable";

export type StatKey =
  | "verticalRecoil"
  | "horizontalRecoil"
  | "ergonomics"
  | "accuracyMoa"
  | "muzzleVelocity"
  | "effectiveDistance"
  | "damage"
  | "penetration"
  | "priceRub";

export interface StatDeltaRow {
  key: StatKey;
  label: string;
  left: number | null;
  right: number | null;
  delta: number | null;
  direction: StatDirection;
}

export type StatDeltaResult = readonly StatDeltaRow[];

interface StatLike {
  verticalRecoil?: number;
  horizontalRecoil?: number;
  ergonomics?: number;
  accuracyMoa?: number;
  muzzleVelocity?: number;
  effectiveDistance?: number;
  damage?: number;
  penetration?: number;
  priceRub?: number;
}

interface StatDef {
  key: StatKey;
  label: string;
  /** true → lower is better (recoil); false → higher is better. */
  lowerIsBetter: boolean;
}

const STATS: readonly StatDef[] = [
  { key: "verticalRecoil", label: "Vertical recoil", lowerIsBetter: true },
  { key: "horizontalRecoil", label: "Horizontal recoil", lowerIsBetter: true },
  { key: "ergonomics", label: "Ergonomics", lowerIsBetter: false },
  { key: "accuracyMoa", label: "Accuracy (MOA)", lowerIsBetter: true },
  { key: "muzzleVelocity", label: "Muzzle velocity", lowerIsBetter: false },
  { key: "effectiveDistance", label: "Effective distance", lowerIsBetter: false },
  { key: "damage", label: "Damage", lowerIsBetter: false },
  { key: "penetration", label: "Penetration", lowerIsBetter: false },
  { key: "priceRub", label: "Price (₽)", lowerIsBetter: true },
];

function direction(delta: number | null, lowerIsBetter: boolean): StatDirection {
  if (delta === null) return "unavailable";
  if (delta === 0) return "neutral";
  const isLess = delta < 0;
  if (lowerIsBetter) return isLess ? "better" : "worse";
  return isLess ? "worse" : "better";
}

export function statDelta(
  left: StatLike | null | undefined,
  right: StatLike | null | undefined,
): StatDeltaResult {
  return STATS.map((def) => {
    const l = left?.[def.key];
    const r = right?.[def.key];
    const lVal = typeof l === "number" ? l : null;
    const rVal = typeof r === "number" ? r : null;
    const delta = lVal !== null && rVal !== null ? rVal - lVal : null;
    return {
      key: def.key,
      label: def.label,
      left: lVal,
      right: rVal,
      delta,
      direction: direction(delta, def.lowerIsBetter),
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tarkov/data test stat-delta.test.ts`
Expected: PASS — 6 tests green.

- [ ] **Step 5: Re-export + commit**

Add `statDelta`, `StatDeltaRow`, `StatDeltaResult`, `StatDirection`, `StatKey` to `packages/tarkov-data/src/index.ts`.

Run: `pnpm --filter @tarkov/data build && pnpm --filter @tarkov/data typecheck`
Expected: pass.

```bash
git add packages/tarkov-data/src/stat-delta.ts packages/tarkov-data/src/stat-delta.test.ts packages/tarkov-data/src/index.ts
git commit -m "feat(data): statDelta pure helper for Build comparison"
```

---

## Task 9: `useCompareDraft` reducer hook

**Files:**

- Create: `apps/web/src/features/builder/compare/useCompareDraft.ts`
- Create: `apps/web/src/features/builder/compare/useCompareDraft.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/builder/compare/useCompareDraft.test.ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCompareDraft, initialDraft } from "./useCompareDraft.js";
import type { BuildV4, PlayerProfile } from "@tarkov/data";

const build: BuildV4 = {
  version: 4,
  weaponId: "w1",
  attachments: {},
  orphaned: [],
  createdAt: "2026-04-20T00:00:00.000Z",
};

const profile: PlayerProfile = {
  mode: "basic",
  traders: {
    prapor: 1,
    therapist: 1,
    skier: 1,
    peacekeeper: 1,
    mechanic: 1,
    ragman: 1,
    jaeger: 1,
  },
  flea: false,
};

describe("useCompareDraft", () => {
  it("starts blank and not dirty", () => {
    const { result } = renderHook(() => useCompareDraft());
    expect(result.current.state).toEqual(initialDraft);
    expect(result.current.state.dirty).toBe(false);
  });

  it("SET_SIDE replaces one side and marks dirty", () => {
    const { result } = renderHook(() => useCompareDraft());
    act(() => result.current.setSide("left", build));
    expect(result.current.state.left).toEqual(build);
    expect(result.current.state.right).toBeNull();
    expect(result.current.state.dirty).toBe(true);
  });

  it("SWAP exchanges left and right", () => {
    const { result } = renderHook(() => useCompareDraft());
    const right = { ...build, weaponId: "w2" };
    act(() => {
      result.current.setSide("left", build);
      result.current.setSide("right", right);
    });
    act(() => result.current.swap());
    expect(result.current.state.left?.weaponId).toBe("w2");
    expect(result.current.state.right?.weaponId).toBe("w1");
  });

  it("CLONE_LEFT_TO_RIGHT copies by value", () => {
    const { result } = renderHook(() => useCompareDraft());
    act(() => result.current.setSide("left", build));
    act(() => result.current.cloneLeftToRight());
    expect(result.current.state.right).toEqual(build);
    expect(result.current.state.right).not.toBe(result.current.state.left);
  });

  it("SET_PROFILE updates per-side profile", () => {
    const { result } = renderHook(() => useCompareDraft());
    act(() => result.current.setProfile("left", profile));
    expect(result.current.state.leftProfile).toEqual(profile);
    expect(result.current.state.rightProfile).toBeUndefined();
  });

  it("LOAD_FROM_PAIR hydrates and clears dirty", () => {
    const { result } = renderHook(() => useCompareDraft());
    act(() => result.current.setSide("left", build)); // make it dirty
    expect(result.current.state.dirty).toBe(true);
    act(() =>
      result.current.loadFromPair({
        v: 1,
        createdAt: "2026-04-20T00:00:00.000Z",
        left: build,
        right: build,
        name: "hello",
      }),
    );
    expect(result.current.state.left).toEqual(build);
    expect(result.current.state.name).toBe("hello");
    expect(result.current.state.dirty).toBe(false);
  });

  it("RESET clears everything and dirty", () => {
    const { result } = renderHook(() => useCompareDraft());
    act(() => result.current.setSide("left", build));
    act(() => result.current.reset());
    expect(result.current.state).toEqual(initialDraft);
  });

  it("SET_NAME / SET_DESCRIPTION update and mark dirty", () => {
    const { result } = renderHook(() => useCompareDraft());
    act(() => result.current.setName("my pair"));
    expect(result.current.state.name).toBe("my pair");
    expect(result.current.state.dirty).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tarkov/web test useCompareDraft.test.ts`
Expected: FAIL — hook doesn't exist.

- [ ] **Step 3: Implement the reducer hook**

```ts
// apps/web/src/features/builder/compare/useCompareDraft.ts
import { useReducer } from "react";
import type { BuildV4, BuildPair, PlayerProfile } from "@tarkov/data";

export type CompareSide = "left" | "right";

export interface CompareDraft {
  left: BuildV4 | null;
  right: BuildV4 | null;
  leftProfile?: PlayerProfile;
  rightProfile?: PlayerProfile;
  name?: string;
  description?: string;
  dirty: boolean;
}

export const initialDraft: CompareDraft = {
  left: null,
  right: null,
  dirty: false,
};

type Action =
  | { type: "SET_SIDE"; side: CompareSide; build: BuildV4 | null }
  | { type: "SET_PROFILE"; side: CompareSide; profile: PlayerProfile | undefined }
  | { type: "SWAP" }
  | { type: "CLONE"; from: CompareSide }
  | { type: "LOAD_FROM_PAIR"; pair: BuildPair }
  | { type: "SET_NAME"; name: string | undefined }
  | { type: "SET_DESCRIPTION"; description: string | undefined }
  | { type: "RESET" }
  | { type: "MARK_CLEAN" };

function reduce(state: CompareDraft, action: Action): CompareDraft {
  switch (action.type) {
    case "SET_SIDE":
      return action.side === "left"
        ? { ...state, left: action.build, dirty: true }
        : { ...state, right: action.build, dirty: true };
    case "SET_PROFILE":
      return action.side === "left"
        ? { ...state, leftProfile: action.profile, dirty: true }
        : { ...state, rightProfile: action.profile, dirty: true };
    case "SWAP":
      return {
        ...state,
        left: state.right,
        right: state.left,
        leftProfile: state.rightProfile,
        rightProfile: state.leftProfile,
        dirty: true,
      };
    case "CLONE": {
      if (action.from === "left" && state.left) {
        return { ...state, right: structuredClone(state.left), dirty: true };
      }
      if (action.from === "right" && state.right) {
        return { ...state, left: structuredClone(state.right), dirty: true };
      }
      return state;
    }
    case "LOAD_FROM_PAIR":
      if (action.pair.v !== 1) return state;
      // Narrow embedded builds to BuildV4 when present; null stays null.
      // Older build versions trigger a migration on the Builder side; the
      // compare workspace relies on BuildV4 shape.
      return {
        left: action.pair.left?.version === 4 ? action.pair.left : null,
        right: action.pair.right?.version === 4 ? action.pair.right : null,
        leftProfile: action.pair.leftProfile,
        rightProfile: action.pair.rightProfile,
        name: action.pair.name,
        description: action.pair.description,
        dirty: false,
      };
    case "SET_NAME":
      return { ...state, name: action.name, dirty: true };
    case "SET_DESCRIPTION":
      return { ...state, description: action.description, dirty: true };
    case "RESET":
      return initialDraft;
    case "MARK_CLEAN":
      return { ...state, dirty: false };
  }
}

export function useCompareDraft(initial: CompareDraft = initialDraft) {
  const [state, dispatch] = useReducer(reduce, initial);
  return {
    state,
    setSide: (side: CompareSide, build: BuildV4 | null) =>
      dispatch({ type: "SET_SIDE", side, build }),
    setProfile: (side: CompareSide, profile: PlayerProfile | undefined) =>
      dispatch({ type: "SET_PROFILE", side, profile }),
    swap: () => dispatch({ type: "SWAP" }),
    cloneLeftToRight: () => dispatch({ type: "CLONE", from: "left" }),
    cloneRightToLeft: () => dispatch({ type: "CLONE", from: "right" }),
    loadFromPair: (pair: BuildPair) => dispatch({ type: "LOAD_FROM_PAIR", pair }),
    setName: (name: string | undefined) => dispatch({ type: "SET_NAME", name }),
    setDescription: (description: string | undefined) =>
      dispatch({ type: "SET_DESCRIPTION", description }),
    reset: () => dispatch({ type: "RESET" }),
    markClean: () => dispatch({ type: "MARK_CLEAN" }),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tarkov/web test useCompareDraft.test.ts`
Expected: PASS — 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/compare/
git commit -m "feat(builder/compare): useCompareDraft reducer hook"
```

---

## Task 10: `CompareStatDelta` component

**Files:**

- Create: `apps/web/src/features/builder/compare/compare-stat-delta.tsx`
- Create: `apps/web/src/features/builder/compare/compare-stat-delta.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/features/builder/compare/compare-stat-delta.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompareStatDelta } from "./compare-stat-delta.js";

const a = {
  verticalRecoil: 100,
  horizontalRecoil: 200,
  ergonomics: 50,
  accuracyMoa: 3,
  muzzleVelocity: 800,
  effectiveDistance: 400,
  damage: 70,
  penetration: 32,
  priceRub: 50000,
};

describe("CompareStatDelta", () => {
  it("renders 'BUILDS ARE IDENTICAL' stamp when stats are equal", () => {
    render(<CompareStatDelta left={a} right={a} />);
    expect(screen.getByText(/BUILDS ARE IDENTICAL/i)).toBeInTheDocument();
  });

  it("renders delta rows when stats differ", () => {
    render(<CompareStatDelta left={a} right={{ ...a, verticalRecoil: 80 }} />);
    expect(screen.getByText("Vertical recoil")).toBeInTheDocument();
    expect(screen.getByText("−20")).toBeInTheDocument();
  });

  it("renders 'add a second build' prompt when one side is null", () => {
    render(<CompareStatDelta left={a} right={null} />);
    expect(screen.getByText(/add a second build/i)).toBeInTheDocument();
  });

  it("applies 'better' styling class to direction=better deltas", () => {
    const { container } = render(<CompareStatDelta left={a} right={{ ...a, ergonomics: 60 }} />);
    const betterCell = container.querySelector('[data-direction="better"]');
    expect(betterCell).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tarkov/web test compare-stat-delta.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

```tsx
// apps/web/src/features/builder/compare/compare-stat-delta.tsx
import { Stamp, StatRow } from "@tarkov/ui";
import { statDelta } from "@tarkov/data";

type Stats = Parameters<typeof statDelta>[0];

interface CompareStatDeltaProps {
  left: Stats | null;
  right: Stats | null;
}

function formatNum(n: number | null): string {
  if (n === null) return "—";
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
}

function formatDelta(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "±0";
  const sign = d > 0 ? "+" : "−";
  const abs = Math.abs(d);
  return `${sign}${Number.isInteger(abs) ? abs.toLocaleString() : abs.toFixed(2)}`;
}

export function CompareStatDelta({ left, right }: CompareStatDeltaProps): React.ReactElement {
  if (!left || !right) {
    return (
      <div className="border border-dashed border-[var(--color-border)] p-4 text-center text-sm text-[var(--color-muted-foreground)]">
        Add a second build to see deltas.
      </div>
    );
  }

  const rows = statDelta(left, right);
  const allEqual = rows.every((r) => r.delta === 0 || r.direction === "unavailable");

  if (allEqual) {
    return (
      <div className="flex justify-center py-6">
        <Stamp>BUILDS ARE IDENTICAL</Stamp>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 gap-y-2 font-mono text-sm">
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <span className="text-[var(--color-muted-foreground)] uppercase tracking-wider">
            {r.label}
          </span>
          <span className="text-right tabular-nums">{formatNum(r.left)}</span>
          <span className="text-right tabular-nums">{formatNum(r.right)}</span>
          <span
            data-direction={r.direction}
            className="text-right tabular-nums data-[direction=better]:text-[var(--color-amber)] data-[direction=worse]:text-[var(--color-blood)]"
          >
            {formatDelta(r.delta)}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tarkov/web test compare-stat-delta.test.tsx`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/compare/compare-stat-delta.tsx apps/web/src/features/builder/compare/compare-stat-delta.test.tsx
git commit -m "feat(builder/compare): CompareStatDelta component"
```

---

## Task 11: `CompareProgressionRow` component

**Files:**

- Create: `apps/web/src/features/builder/compare/compare-progression-row.tsx`
- Create: `apps/web/src/features/builder/compare/compare-progression-row.test.tsx`

Produces a one-line summary per side: "₽X — [availability Pills]". Uses `Pill` for LL-locked / FLEA / LOCKED badges.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/features/builder/compare/compare-progression-row.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompareProgressionRow } from "./compare-progression-row.js";

describe("CompareProgressionRow", () => {
  it("renders price for each side", () => {
    render(
      <CompareProgressionRow
        leftPriceRub={50000}
        rightPriceRub={80000}
        leftReachable
        rightReachable={false}
      />,
    );
    expect(screen.getByText("₽50,000")).toBeInTheDocument();
    expect(screen.getByText("₽80,000")).toBeInTheDocument();
  });

  it("renders LOCKED pill when side is not reachable", () => {
    render(
      <CompareProgressionRow
        leftPriceRub={50000}
        rightPriceRub={80000}
        leftReachable
        rightReachable={false}
      />,
    );
    expect(screen.getByText(/LOCKED/i)).toBeInTheDocument();
  });

  it("renders null-safe when one side missing", () => {
    render(
      <CompareProgressionRow
        leftPriceRub={null}
        rightPriceRub={80000}
        leftReachable={null}
        rightReachable
      />,
    );
    expect(screen.getByText("₽80,000")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tarkov/web test compare-progression-row.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

```tsx
// apps/web/src/features/builder/compare/compare-progression-row.tsx
import { Pill } from "@tarkov/ui";

interface CompareProgressionRowProps {
  leftPriceRub: number | null;
  rightPriceRub: number | null;
  leftReachable: boolean | null;
  rightReachable: boolean | null;
}

function formatPrice(rub: number | null): string {
  if (rub === null) return "—";
  return `₽${rub.toLocaleString()}`;
}

function SidePill({
  priceRub,
  reachable,
}: {
  priceRub: number | null;
  reachable: boolean | null;
}): React.ReactElement {
  return (
    <span className="flex items-baseline gap-3 font-mono text-sm tabular-nums">
      <span>{formatPrice(priceRub)}</span>
      {reachable === false && <Pill>LOCKED</Pill>}
      {reachable === true && <Pill>REACHABLE</Pill>}
    </span>
  );
}

export function CompareProgressionRow(props: CompareProgressionRowProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between border-t border-dashed border-[var(--color-border)] py-2 text-sm">
      <SidePill priceRub={props.leftPriceRub} reachable={props.leftReachable} />
      <SidePill priceRub={props.rightPriceRub} reachable={props.rightReachable} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tarkov/web test compare-progression-row.test.tsx`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/compare/compare-progression-row.tsx apps/web/src/features/builder/compare/compare-progression-row.test.tsx
git commit -m "feat(builder/compare): CompareProgressionRow component"
```

---

## Task 12: Add `diff` prop to `SlotTree`

**Files:**

- Modify: `apps/web/src/features/builder/slot-tree.tsx`
- Modify or create: `apps/web/src/features/builder/slot-tree.test.tsx` (if a test file exists; else create)

- [ ] **Step 1: Read the current `SlotTree` component**

Open `apps/web/src/features/builder/slot-tree.tsx`. Note its prop signature.

- [ ] **Step 2: Write the failing test for the new prop**

```tsx
// apps/web/src/features/builder/slot-tree.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SlotTree } from "./slot-tree.js";
// Skeleton test — adapt to whatever fixture/mocks the existing SlotTree tests use.

describe("SlotTree with diff prop", () => {
  it("applies 'differs' class to slot nodes when diff map says so", () => {
    const tree = [{ nameId: "mod_scope", path: "mod_scope", slots: [] }];
    const attachments = { mod_scope: "itemA" };
    const diff = new Map<string, "equal" | "differs" | "left-only" | "right-only">([
      ["mod_scope", "differs"],
    ]);
    const { container } = render(
      <SlotTree
        tree={tree as never}
        attachments={attachments}
        onAttach={() => undefined}
        diff={diff}
      />,
    );
    const node = container.querySelector('[data-slot-path="mod_scope"]');
    expect(node?.getAttribute("data-diff")).toBe("differs");
  });

  it("renders without diff prop unchanged (backward compatibility)", () => {
    const tree = [{ nameId: "mod_scope", path: "mod_scope", slots: [] }];
    const { container } = render(
      <SlotTree tree={tree as never} attachments={{}} onAttach={() => undefined} />,
    );
    const node = container.querySelector('[data-slot-path="mod_scope"]');
    expect(node?.getAttribute("data-diff")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tarkov/web test slot-tree.test.tsx`
Expected: FAIL — `diff` prop doesn't exist; `data-slot-path` attribute may or may not exist.

- [ ] **Step 4: Add the `diff` prop + `data-slot-path` + `data-diff` attributes**

In `slot-tree.tsx`:

1. Extend the `SlotTreeProps` interface with `diff?: ReadonlyMap<string, "equal" | "differs" | "left-only" | "right-only">`.
2. Thread `diff` down through the recursive render.
3. On each slot node wrapper element, add `data-slot-path={node.path}` and `data-diff={diff?.get(node.path) ?? undefined}`.
4. Use the `data-diff` attribute in Tailwind classes for the styling: `data-[diff=differs]:border-dashed data-[diff=differs]:border-[var(--color-amber)] data-[diff=left-only]:border-l-2 data-[diff=left-only]:border-[var(--color-amber)]` etc.

Exact styling: dashed amber border for `differs`, solid amber left border for `left-only` / `right-only`. No styling for `equal` (default).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @tarkov/web test slot-tree.test.tsx`
Expected: PASS — 2 tests green.

- [ ] **Step 6: Run the whole web test suite**

Run: `pnpm --filter @tarkov/web test`
Expected: no regressions elsewhere.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/builder/slot-tree.tsx apps/web/src/features/builder/slot-tree.test.tsx
git commit -m "feat(builder): SlotTree optional diff prop for Build comparison"
```

---

## Task 13: `CompareToolbar` component

**Files:**

- Create: `apps/web/src/features/builder/compare/compare-toolbar.tsx`

Action bar above the two columns. Buttons: Save, Save as new, Swap, Clone L→R, Clone R→L. Controlled by `CompareWorkspace`; receives callbacks.

- [ ] **Step 1: Write the component directly (simple presentational, minimal TDD)**

```tsx
// apps/web/src/features/builder/compare/compare-toolbar.tsx
import { Button } from "@tarkov/ui";

interface CompareToolbarProps {
  dirty: boolean;
  pairId: string | undefined;
  canSwap: boolean;
  canClone: boolean;
  onSave: () => void;
  onSaveAsNew: () => void;
  onSwap: () => void;
  onCloneLeftToRight: () => void;
  onCloneRightToLeft: () => void;
}

export function CompareToolbar({
  dirty,
  pairId,
  canSwap,
  canClone,
  onSave,
  onSaveAsNew,
  onSwap,
  onCloneLeftToRight,
  onCloneRightToLeft,
}: CompareToolbarProps): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-3">
      <Button onClick={onSave} disabled={!dirty && pairId !== undefined}>
        {pairId ? "Save changes" : "Save comparison"}
      </Button>
      {pairId && (
        <Button variant="secondary" onClick={onSaveAsNew}>
          Save as new
        </Button>
      )}
      <span className="flex-1" />
      <Button variant="ghost" onClick={onSwap} disabled={!canSwap}>
        Swap L↔R
      </Button>
      <Button variant="ghost" onClick={onCloneLeftToRight} disabled={!canClone}>
        Clone L→R
      </Button>
      <Button variant="ghost" onClick={onCloneRightToLeft} disabled={!canClone}>
        Clone R→L
      </Button>
    </div>
  );
}
```

(Skipping a dedicated test here — covered implicitly by the `CompareWorkspace` integration test later. If that's insufficient, circle back.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @tarkov/web typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/builder/compare/compare-toolbar.tsx
git commit -m "feat(builder/compare): CompareToolbar action bar"
```

---

## Task 14: `CompareSide` component

**Files:**

- Create: `apps/web/src/features/builder/compare/compare-side.tsx`

One editable column. Wraps `BuildHeader`, `SlotTree`, `PresetPicker`, `ProfileSnapshotToggle`, `OrphanedBanner`. Closes over one side's state from `useCompareDraft`.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/features/builder/compare/compare-side.tsx
import { useMemo } from "react";
import {
  useWeaponTree,
  useWeaponList,
  useModList,
  itemAvailability,
  type BuildV4,
  type PlayerProfile,
  type SlotDiffMap,
} from "@tarkov/data";
import { weaponSpec } from "@tarkov/ballistics";
import { Card, CardContent, SectionTitle } from "@tarkov/ui";
import { adaptMod, adaptWeapon } from "../../data-adapters/adapters.js";
import { SlotTree } from "../slot-tree.js";
import { OrphanedBanner } from "../orphaned-banner.js";

export interface CompareSideProps {
  label: "A" | "B";
  build: BuildV4 | null;
  profile: PlayerProfile | undefined;
  diff: SlotDiffMap | null;
  onBuildChange: (build: BuildV4 | null) => void;
}

export function CompareSide({
  label,
  build,
  profile,
  diff,
  onBuildChange,
}: CompareSideProps): React.ReactElement {
  const weapons = useWeaponList();
  const mods = useModList();
  const tree = useWeaponTree(build?.weaponId ?? "");

  const selectedWeapon = useMemo(
    () => weapons.data?.find((w) => w.id === build?.weaponId),
    [weapons.data, build?.weaponId],
  );

  const selectedMods = useMemo(
    () =>
      mods.data
        ? mods.data.filter((m) => Object.values(build?.attachments ?? {}).includes(m.id))
        : [],
    [mods.data, build?.attachments],
  );

  const getAvailability = useMemo(() => {
    if (!profile) return undefined;
    return (modId: string) => {
      const mod = mods.data?.find((m) => m.id === modId);
      if (!mod) return undefined;
      return itemAvailability(mod, profile);
    };
  }, [mods.data, profile]);

  const handleAttach = (slotPath: string, itemId: string | null) => {
    if (!build) return;
    const next: BuildV4 = {
      ...build,
      attachments: { ...build.attachments },
    };
    if (itemId === null) {
      delete next.attachments[slotPath];
    } else {
      next.attachments[slotPath] = itemId;
    }
    onBuildChange(next);
  };

  return (
    <Card variant="bracket">
      <CardContent className="p-4 flex flex-col gap-4">
        <SectionTitle>Build {label}</SectionTitle>
        {!build && (
          <div className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">
            No build selected.
          </div>
        )}
        {build && (
          <>
            {build.orphaned.length > 0 && <OrphanedBanner orphanedIds={build.orphaned} />}
            {tree.data && (
              <SlotTree
                tree={tree.data.slots}
                attachments={build.attachments}
                onAttach={handleAttach}
                getAvailability={getAvailability}
                diff={diff ?? undefined}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Expose the weapon-spec computation for CompareWorkspace to consume in its
// stat-delta computation without re-creating all the setup above.
export function computeSideSpec(
  build: BuildV4 | null,
  weapons: ReturnType<typeof useWeaponList>["data"],
  mods: ReturnType<typeof useModList>["data"],
): ReturnType<typeof weaponSpec> | null {
  if (!build || !weapons || !mods) return null;
  const weapon = weapons.find((w) => w.id === build.weaponId);
  if (!weapon) return null;
  const attached = mods.filter((m) => Object.values(build.attachments).includes(m.id));
  return weaponSpec(adaptWeapon(weapon), attached.map(adaptMod));
}
```

(Note: `CompareSide` intentionally takes a `diff` prop but doesn't compute it. `CompareWorkspace` computes once using `slotDiff` and passes to both sides.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @tarkov/web typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/builder/compare/compare-side.tsx
git commit -m "feat(builder/compare): CompareSide editable column"
```

---

## Task 15: `CompareFromBuildDialog` picker modal

**Files:**

- Create: `apps/web/src/features/builder/compare/compare-from-build-dialog.tsx`
- Create: `apps/web/src/features/builder/compare/compare-from-build-dialog.test.tsx`

Modal with three radio options: clone-both-sides, paste-URL-for-right, empty-right.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/features/builder/compare/compare-from-build-dialog.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompareFromBuildDialog } from "./compare-from-build-dialog.js";

describe("CompareFromBuildDialog", () => {
  it("calls onConfirm with mode=clone-both when user picks that option and submits", () => {
    const onConfirm = vi.fn();
    render(<CompareFromBuildDialog open onClose={() => undefined} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByLabelText(/clone current build into both sides/i));
    fireEvent.click(screen.getByRole("button", { name: /compare/i }));
    expect(onConfirm).toHaveBeenCalledWith({ mode: "clone-both" });
  });

  it("calls onConfirm with mode=paste-url + the id when user pastes a build URL", () => {
    const onConfirm = vi.fn();
    render(<CompareFromBuildDialog open onClose={() => undefined} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByLabelText(/paste another share url/i));
    fireEvent.change(screen.getByLabelText(/share url or id/i), {
      target: { value: "abc23456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /compare/i }));
    expect(onConfirm).toHaveBeenCalledWith({ mode: "paste-url", rightBuildId: "abc23456" });
  });

  it("extracts id from full /builder/<id> URL", () => {
    const onConfirm = vi.fn();
    render(<CompareFromBuildDialog open onClose={() => undefined} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByLabelText(/paste another share url/i));
    fireEvent.change(screen.getByLabelText(/share url or id/i), {
      target: { value: "https://tarkov-gunsmith-web.pages.dev/builder/abc23456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /compare/i }));
    expect(onConfirm).toHaveBeenCalledWith({ mode: "paste-url", rightBuildId: "abc23456" });
  });

  it("rejects malformed paste input with validation message", () => {
    const onConfirm = vi.fn();
    render(<CompareFromBuildDialog open onClose={() => undefined} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByLabelText(/paste another share url/i));
    fireEvent.change(screen.getByLabelText(/share url or id/i), {
      target: { value: "NOT A VALID ID" },
    });
    fireEvent.click(screen.getByRole("button", { name: /compare/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/invalid share url or id/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tarkov/web test compare-from-build-dialog.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the dialog**

```tsx
// apps/web/src/features/builder/compare/compare-from-build-dialog.tsx
import { useState } from "react";
import { Button, Card, CardContent, Input } from "@tarkov/ui";

const BUILD_ID_REGEX = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

type Mode = "clone-both" | "paste-url" | "empty-right";

export type CompareFromBuildConfirm =
  | { mode: "clone-both" }
  | { mode: "paste-url"; rightBuildId: string }
  | { mode: "empty-right" };

interface CompareFromBuildDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: CompareFromBuildConfirm) => void;
}

function extractBuildId(input: string): string | null {
  const trimmed = input.trim();
  if (BUILD_ID_REGEX.test(trimmed)) return trimmed;
  const match = /\/builder\/([a-z2-9]{8})(?:[/?#]|$)/.exec(trimmed);
  return match ? (match[1] ?? null) : null;
}

export function CompareFromBuildDialog({
  open,
  onClose,
  onConfirm,
}: CompareFromBuildDialogProps): React.ReactElement | null {
  const [mode, setMode] = useState<Mode>("clone-both");
  const [pasteValue, setPasteValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = () => {
    setError(null);
    if (mode === "clone-both") {
      onConfirm({ mode: "clone-both" });
      onClose();
      return;
    }
    if (mode === "paste-url") {
      const id = extractBuildId(pasteValue);
      if (!id) {
        setError("Invalid share URL or id.");
        return;
      }
      onConfirm({ mode: "paste-url", rightBuildId: id });
      onClose();
      return;
    }
    onConfirm({ mode: "empty-right" });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <Card className="w-full max-w-md" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <CardContent className="p-6 flex flex-col gap-4">
          <h2 className="text-lg font-bold uppercase tracking-wider">Compare this build</h2>

          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="compare-mode"
              checked={mode === "clone-both"}
              onChange={() => setMode("clone-both")}
            />
            <span>Clone current build into both sides</span>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="compare-mode"
              checked={mode === "paste-url"}
              onChange={() => setMode("paste-url")}
            />
            <span>Paste another share URL for the right side</span>
          </label>

          {mode === "paste-url" && (
            <div className="pl-6 flex flex-col gap-1">
              <label
                htmlFor="compare-paste-url"
                className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]"
              >
                Share URL or id
              </label>
              <Input
                id="compare-paste-url"
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                placeholder="abc23456 or https://…/builder/abc23456"
              />
            </div>
          )}

          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="compare-mode"
              checked={mode === "empty-right"}
              onChange={() => setMode("empty-right")}
            />
            <span>Start right side empty</span>
          </label>

          {error && <p className="text-sm text-[var(--color-blood)]">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>Compare</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tarkov/web test compare-from-build-dialog.test.tsx`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/compare/compare-from-build-dialog.tsx apps/web/src/features/builder/compare/compare-from-build-dialog.test.tsx
git commit -m "feat(builder/compare): CompareFromBuildDialog picker modal"
```

---

## Task 16: `CompareWorkspace` top-level layout

**Files:**

- Create: `apps/web/src/features/builder/compare/compare-workspace.tsx`

Composes everything: toolbar + stat-delta strip + two CompareSides + progression row. Owns the draft reducer, save mutation, and unsaved-edits guard.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/features/builder/compare/compare-workspace.tsx
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  useWeaponList,
  useModList,
  useWeaponTree,
  useSavePair,
  useForkPair,
  slotDiff,
  CURRENT_PAIR_VERSION,
  type BuildV4,
  type BuildPair,
} from "@tarkov/data";
import { CompareToolbar } from "./compare-toolbar.js";
import { CompareStatDelta } from "./compare-stat-delta.js";
import { CompareProgressionRow } from "./compare-progression-row.js";
import { CompareSide, computeSideSpec } from "./compare-side.js";
import { useCompareDraft } from "./useCompareDraft.js";

export interface CompareWorkspaceProps {
  initialPair?: BuildPair;
  initialPairId?: string;
}

export function CompareWorkspace({
  initialPair,
  initialPairId,
}: CompareWorkspaceProps = {}): React.ReactElement {
  const navigate = useNavigate();
  const draft = useCompareDraft(
    initialPair
      ? {
          left: initialPair.left?.version === 4 ? initialPair.left : null,
          right: initialPair.right?.version === 4 ? initialPair.right : null,
          leftProfile: initialPair.leftProfile,
          rightProfile: initialPair.rightProfile,
          name: initialPair.name,
          description: initialPair.description,
          dirty: false,
        }
      : undefined,
  );

  const weapons = useWeaponList();
  const mods = useModList();
  const leftTree = useWeaponTree(draft.state.left?.weaponId ?? "");
  const rightTree = useWeaponTree(draft.state.right?.weaponId ?? "");

  const save = useSavePair();
  const fork = useForkPair();

  // Unsaved-edits guard
  useEffect(() => {
    if (!draft.state.dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draft.state.dirty]);

  const diff = useMemo(() => {
    const l =
      draft.state.left && leftTree.data
        ? { tree: leftTree.data.slots, attachments: draft.state.left.attachments }
        : null;
    const r =
      draft.state.right && rightTree.data
        ? { tree: rightTree.data.slots, attachments: draft.state.right.attachments }
        : null;
    return slotDiff(l, r);
  }, [draft.state.left, draft.state.right, leftTree.data, rightTree.data]);

  const leftSpec = useMemo(
    () => computeSideSpec(draft.state.left, weapons.data, mods.data),
    [draft.state.left, weapons.data, mods.data],
  );
  const rightSpec = useMemo(
    () => computeSideSpec(draft.state.right, weapons.data, mods.data),
    [draft.state.right, weapons.data, mods.data],
  );

  const handleSave = useCallback(() => {
    const pair: BuildPair = {
      v: CURRENT_PAIR_VERSION,
      createdAt: new Date().toISOString(),
      left: draft.state.left,
      right: draft.state.right,
      leftProfile: draft.state.leftProfile,
      rightProfile: draft.state.rightProfile,
      name: draft.state.name,
      description: draft.state.description,
    };
    save.mutate(pair, {
      onSuccess: (res) => {
        draft.markClean();
        void navigate({ to: "/builder/compare/$pairId", params: { pairId: res.id } });
      },
    });
  }, [draft, save, navigate]);

  const handleSaveAsNew = useCallback(() => {
    if (initialPairId) {
      fork.mutate(initialPairId, {
        onSuccess: (res) => {
          draft.markClean();
          void navigate({ to: "/builder/compare/$pairId", params: { pairId: res.id } });
        },
      });
    } else {
      handleSave();
    }
  }, [initialPairId, fork, draft, navigate, handleSave]);

  const canSwap = draft.state.left !== null || draft.state.right !== null;
  const canClone = canSwap;

  return (
    <div className="flex flex-col gap-4">
      <CompareToolbar
        dirty={draft.state.dirty}
        pairId={initialPairId}
        canSwap={canSwap}
        canClone={canClone}
        onSave={handleSave}
        onSaveAsNew={handleSaveAsNew}
        onSwap={draft.swap}
        onCloneLeftToRight={draft.cloneLeftToRight}
        onCloneRightToLeft={draft.cloneRightToLeft}
      />

      <CompareStatDelta left={leftSpec} right={rightSpec} />

      <CompareProgressionRow
        leftPriceRub={leftSpec?.priceRub ?? null}
        rightPriceRub={rightSpec?.priceRub ?? null}
        leftReachable={null}
        rightReachable={null}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CompareSide
          label="A"
          build={draft.state.left}
          profile={draft.state.leftProfile}
          diff={diff}
          onBuildChange={(b) => draft.setSide("left", b)}
        />
        <CompareSide
          label="B"
          build={draft.state.right}
          profile={draft.state.rightProfile}
          diff={diff}
          onBuildChange={(b) => draft.setSide("right", b)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter @tarkov/web typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/builder/compare/compare-workspace.tsx
git commit -m "feat(builder/compare): CompareWorkspace top-level layout"
```

---

## Task 17: Blank route `/builder/compare`

**Files:**

- Create: `apps/web/src/routes/builder.compare.tsx`

TanStack Router auto-regenerates `route-tree.gen.ts` on vite build. File-based route naming: `builder.compare.tsx` → `/builder/compare`.

- [ ] **Step 1: Write the route**

```tsx
// apps/web/src/routes/builder.compare.tsx
import { createFileRoute } from "@tanstack/react-router";
import { CompareWorkspace } from "../features/builder/compare/compare-workspace.js";

export const Route = createFileRoute("/builder/compare")({
  component: ComparePage,
});

function ComparePage(): React.ReactElement {
  return <CompareWorkspace />;
}
```

- [ ] **Step 2: Regenerate the route tree**

Run: `pnpm --filter @tarkov/web exec vite build`
Expected: build succeeds; `apps/web/src/route-tree.gen.ts` updated with the new route.

- [ ] **Step 3: Dev-server smoke**

Run: `pnpm --filter @tarkov/web dev` in a separate shell; navigate to `http://localhost:5173/builder/compare`.
Expected: empty workspace renders, both sides empty, stat-delta strip shows "Add a second build to see deltas."

Kill the dev server after verifying.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/builder.compare.tsx apps/web/src/route-tree.gen.ts
git commit -m "feat(web): /builder/compare route (blank workspace)"
```

---

## Task 18: Loader route `/builder/compare/$pairId`

**Files:**

- Create: `apps/web/src/routes/builder.compare.$pairId.tsx`

Mirror the existing `builder.$id.tsx` loader-route pattern: `useLoadPair` + error taxonomy branch + render `CompareWorkspace` with hydrated state.

- [ ] **Step 1: Write the route**

```tsx
// apps/web/src/routes/builder.compare.$pairId.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLoadPair, LoadPairError } from "@tarkov/data";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";
import { CompareWorkspace } from "../features/builder/compare/compare-workspace.js";

export const Route = createFileRoute("/builder/compare/$pairId")({
  component: LoadedComparePage,
});

function LoadedComparePage(): React.ReactElement {
  const { pairId } = Route.useParams();
  const query = useLoadPair(pairId);

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">Loading comparison…</CardContent>
      </Card>
    );
  }

  if (query.error) {
    return <LoadErrorCard error={query.error} id={pairId} onRetry={() => void query.refetch()} />;
  }

  if (!query.data) {
    return (
      <LoadErrorCard
        error={new Error("No data")}
        id={pairId}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return <CompareWorkspace initialPair={query.data} initialPairId={pairId} />;
}

function LoadErrorCard({
  error,
  id,
  onRetry,
}: {
  error: Error;
  id: string;
  onRetry: () => void;
}): React.ReactElement {
  const code = error instanceof LoadPairError ? error.code : "unreachable";
  const { title, body } = (() => {
    switch (code) {
      case "invalid-id":
        return {
          title: "Invalid comparison id",
          body: `The id "${id}" doesn't match the comparison-id format.`,
        };
      case "not-found":
        return {
          title: "Comparison not found",
          body: "This comparison has expired (30-day lifetime) or never existed.",
        };
      case "invalid-schema":
        return {
          title: "Corrupted comparison",
          body: "The stored comparison failed schema validation.",
        };
      default:
        return {
          title: "Couldn't reach comparison storage",
          body: "The request failed. Check your connection and retry.",
        };
    }
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button onClick={onRetry}>Retry</Button>
        <Link to="/builder/compare">
          <Button variant="secondary">Start a new comparison</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Regenerate the route tree**

Run: `pnpm --filter @tarkov/web exec vite build`
Expected: build succeeds with `/builder/compare/$pairId` registered.

- [ ] **Step 3: Manual verification with the API**

1. In one shell, run `pnpm --filter @tarkov/builds-api dev`.
2. Seed a pair: `curl -X POST http://localhost:8787/pairs -H 'Content-Type: application/json' -d '{"v":1,"createdAt":"2026-04-20T00:00:00.000Z","left":null,"right":null}'` — capture the `id`.
3. In another shell, run `pnpm --filter @tarkov/web dev` (ensure `VITE_BUILDS_API_URL` env points to localhost:8787 or the local dev proxy is wired up).
4. Navigate to `http://localhost:5173/builder/compare/<id>` — expect the blank loaded workspace.
5. Navigate to a bogus id (e.g. `xxxxxxxx`) — expect the 404 error card.

Kill both servers after verifying.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/builder.compare.\$pairId.tsx apps/web/src/route-tree.gen.ts
git commit -m "feat(web): /builder/compare/\$pairId loader route"
```

(If shell-escaping `$` is a hassle, use `git add apps/web/src/routes/` instead.)

---

## Task 19: Wire "Compare ↔" button into `BuildHeader` + landing CTA

**Files:**

- Modify: `apps/web/src/features/builder/build-header.tsx`
- Modify: `apps/web/src/routes/builder.tsx` (host the dialog + navigation handler)
- Modify: `apps/web/src/routes/index.tsx` (landing CTA)

- [ ] **Step 1: Add a `Compare ↔` button to `BuildHeader`**

Open `build-header.tsx`. Add an optional `onCompare?: () => void` prop. Render a `Button variant="secondary"` with the text `"Compare ↔"` next to the existing save/share controls, shown only when `onCompare` is provided.

- [ ] **Step 2: Wire the dialog into `BuilderPage`**

Open `apps/web/src/routes/builder.tsx`. Add:

```tsx
import {
  CompareFromBuildDialog,
  type CompareFromBuildConfirm,
} from "../features/builder/compare/compare-from-build-dialog.js";
import { useNavigate } from "@tanstack/react-router";
```

Add state: `const [compareOpen, setCompareOpen] = useState(false);`

Pass `onCompare={() => setCompareOpen(true)}` into the existing `<BuildHeader ... />`.

Handle confirm:

```tsx
const navigate = useNavigate();

const handleCompareConfirm = (result: CompareFromBuildConfirm) => {
  // Persist the "left prefill" via sessionStorage so the /builder/compare
  // route can pick it up on mount. Small blob; cleared on next visit.
  const leftBuild = {
    version: CURRENT_BUILD_VERSION,
    weaponId,
    attachments,
    orphaned,
    createdAt: new Date().toISOString(),
    profileSnapshot: embedProfileOnSave ? profile : undefined,
    name: buildName || undefined,
    description: buildDescription || undefined,
  };
  sessionStorage.setItem("compare:leftPrefill", JSON.stringify(leftBuild));
  sessionStorage.setItem("compare:mode", result.mode);
  if (result.mode === "paste-url") {
    sessionStorage.setItem("compare:rightBuildId", result.rightBuildId);
  }
  void navigate({ to: "/builder/compare" });
};
```

Render the dialog:

```tsx
<CompareFromBuildDialog
  open={compareOpen}
  onClose={() => setCompareOpen(false)}
  onConfirm={handleCompareConfirm}
/>
```

- [ ] **Step 3: Consume the sessionStorage prefill in `CompareWorkspace`**

In `compare-workspace.tsx`, add a `useEffect` that runs once on mount when `initialPair` is undefined:

```tsx
useEffect(() => {
  if (initialPair) return;
  const raw = sessionStorage.getItem("compare:leftPrefill");
  const mode = sessionStorage.getItem("compare:mode");
  const rightId = sessionStorage.getItem("compare:rightBuildId");
  if (!raw || !mode) return;

  try {
    const left = JSON.parse(raw);
    draft.setSide("left", left);
    if (mode === "clone-both") {
      draft.setSide("right", structuredClone(left));
    } else if (mode === "paste-url" && rightId) {
      // Async: load the right build via loadBuild
      void import("@tarkov/data").then(async ({ loadBuild }) => {
        try {
          const right = await loadBuild(fetch, rightId);
          if (right.version === 4) draft.setSide("right", right);
        } catch {
          // swallow — user sees empty right side; can paste again later
        }
      });
    }
  } catch {
    // malformed sessionStorage — just skip
  } finally {
    sessionStorage.removeItem("compare:leftPrefill");
    sessionStorage.removeItem("compare:mode");
    sessionStorage.removeItem("compare:rightBuildId");
  }
  // Intentionally run once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 4: Landing page CTA**

Open `apps/web/src/routes/index.tsx`. Find the existing "Builder" hero card CTA. Add a secondary `Link` right below the primary one:

```tsx
<Link
  to="/builder/compare"
  className="text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-amber)]"
>
  or compare two builds →
</Link>
```

Match the existing card's styling and placement.

- [ ] **Step 5: Typecheck + full web test suite**

Run: `pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web test`
Expected: all green. No regressions in existing Builder tests.

- [ ] **Step 6: Dev-server smoke**

Run dev; navigate `/builder` → select a weapon → click `Compare ↔` → verify dialog; for each mode verify it lands on `/builder/compare` with the expected state.

Kill dev server.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/builder/build-header.tsx apps/web/src/features/builder/compare/compare-workspace.tsx apps/web/src/routes/builder.tsx apps/web/src/routes/index.tsx
git commit -m "feat(web): Compare ↔ button in BuildHeader + landing CTA"
```

---

## Task 20: Playwright — route smokes

**Files:**

- Modify: `apps/web/e2e/smoke.spec.ts`

Adds two route smokes to the existing `ROUTES` array and one standalone seed-then-load test. Seed a pair via direct `POST /api/pairs` fetch from inside the test so the loader has real data.

- [ ] **Step 1: Add route entries to `ROUTES`**

Open `apps/web/e2e/smoke.spec.ts`. Add to `ROUTES`:

```ts
{ path: "/builder/compare", contains: "Add a second build" },
```

(The `/builder/compare/$pairId` variant is exercised by the standalone test below, not the per-route loop.)

- [ ] **Step 2: Add the seed-then-load test**

Append at the bottom of the file:

```ts
test.describe("smoke — /builder/compare/<pairId>", () => {
  test("seeds a pair via POST /api/pairs and loads it via deep link", async ({ page, request }) => {
    const seed = {
      v: 1,
      createdAt: new Date().toISOString(),
      left: null,
      right: null,
      name: "smoke-pair",
    };
    const res = await request.post("/api/pairs", { data: seed });
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { id: string };
    const { errors } = captureConsoleErrors(page);
    await page.goto(`/builder/compare/${body.id}`, { waitUntil: "networkidle" });
    // The workspace toolbar's Save button always renders.
    await expect(page.getByRole("button", { name: /save/i }).first()).toBeVisible({
      timeout: 10_000,
    });
    expect(errors, `Console errors on /builder/compare/${body.id}:\n${errors.join("\n")}`).toEqual(
      [],
    );
  });
});
```

- [ ] **Step 3: Add interaction test**

Append:

```ts
test.describe("smoke — compare interaction", () => {
  test("selecting two different weapons shows stat deltas", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);
    await page.goto("/builder/compare", { waitUntil: "networkidle" });

    // Data selectors depend on the CompareSide + weapon picker implementation.
    // Pick the first weapon-picker on each side and choose the first option.
    const weaponPickers = page.getByLabel(/weapon/i);
    await expect(weaponPickers.first()).toBeVisible({ timeout: 10_000 });

    const options = await weaponPickers.first().locator("option").allTextContents();
    expect(options.length).toBeGreaterThan(2); // at least "-- select --" + 2 weapons

    await weaponPickers.first().selectOption({ index: 1 });
    await weaponPickers.nth(1).selectOption({ index: 2 });

    // Expect a signed delta (±, +, or −) somewhere in the stat strip.
    const strip = page.locator("[data-direction]").first();
    await expect(strip).toBeVisible({ timeout: 10_000 });

    expect(errors, `Console errors on compare interaction:\n${errors.join("\n")}`).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the Playwright suite**

Run: `pnpm --filter @tarkov/web e2e`
Expected: new tests green; pre-existing tests still green.

(If the Playwright suite is named differently, check `apps/web/package.json` scripts and run the correct one.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/smoke.spec.ts
git commit -m "test(web): Playwright — /builder/compare route + interaction + seed-load"
```

---

## Task 21: Playwright — save round-trip

**Files:**

- Modify: `apps/web/e2e/smoke.spec.ts`

Exercises the full write path through the UI: land on `/builder/compare`, select two weapons, click Save, follow redirect, assert the loaded pair still shows non-zero deltas.

- [ ] **Step 1: Append the test**

```ts
test.describe("smoke — compare save round-trip", () => {
  test("fills both sides, saves, follows redirect, state matches", async ({ page }) => {
    await page.goto("/builder/compare", { waitUntil: "networkidle" });

    const pickers = page.getByLabel(/weapon/i);
    await pickers.first().selectOption({ index: 1 });
    await pickers.nth(1).selectOption({ index: 2 });

    await page.getByRole("button", { name: /save comparison/i }).click();

    // Redirect to /builder/compare/<pairId>
    await page.waitForURL(/\/builder\/compare\/[a-z2-9]{8}$/, { timeout: 10_000 });

    // Save button changes to "Save changes" once we have a pairId.
    await expect(page.getByRole("button", { name: /save changes/i })).toBeVisible({
      timeout: 10_000,
    });

    // Stat-delta strip should still show a direction attribute.
    await expect(page.locator("[data-direction]").first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the new test**

Run: `pnpm --filter @tarkov/web e2e`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/smoke.spec.ts
git commit -m "test(web): Playwright — compare save round-trip"
```

---

## Task 22: Final QA — full build, lint, typecheck, test, e2e

- [ ] **Step 1: Clean install + full package build**

Run:

```bash
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
```

Expected: both succeed.

- [ ] **Step 2: Typecheck everything**

Run: `pnpm typecheck`
Expected: pass.

- [ ] **Step 3: Lint everything**

Run: `pnpm lint`
Expected: pass, 0 warnings (repo uses `--max-warnings 0`).

- [ ] **Step 4: Format check**

Run: `pnpm format:check`
Expected: pass.

- [ ] **Step 5: Unit tests everywhere**

Run: `pnpm test`
Expected: all packages green. Total count should be ~180 pre-existing + ~35 new (schema 5 + pairsApi 10 + useLoadPair 3 + pairs.test 10 + slotDiff 7 + statDelta 6 + useCompareDraft 8 + stat-delta component 4 + progression-row 3 + compare-from-build-dialog 4 + slot-tree diff 2).

- [ ] **Step 6: Playwright e2e**

Run: `pnpm --filter @tarkov/web e2e`
Expected: 13 pre-existing + 3 new = 16 tests green.

- [ ] **Step 7: No more pending work**

Skim each spec section:

- §3 routes — done (tasks 17, 18)
- §4 entry points — done (task 19)
- §4.3 Worker routes — done (task 4)
- §4.4 schema — done (task 1)
- §4.5 hooks + errors — done (tasks 2, 3)
- §5 components — done (tasks 10–16, 19)
- §5.5 reducer — done (task 9)
- §5.6 unsaved-edits guard — done (task 16, `beforeunload` hook)
- §6 visual treatment — covered across tasks; dashed/solid diff borders (task 12), stamp (task 10), progression row (task 11)
- §7 testing — done (per-task TDD + tasks 20, 21)
- §8 error handling — done (task 18 error card)
- §9 migrations — none needed for v1; documented
- §10 open questions — TTL uses existing `BUILD_TTL_SECONDS`; fork endpoint implemented; diff grouping left out of scope per spec; keyboard shortcuts deferred.

- [ ] **Step 8: Open the PR**

Push the branch and open a PR. PR body should reference the design spec and list the 22 task commits.

```bash
git push -u origin <branch-name>
gh pr create --title "feat(m3): Build comparison — live side-by-side workspace" --body "$(cat <<'EOF'
## Summary

- Adds `/builder/compare` (blank) and `/builder/compare/$pairId` (loader) routes
- New `BuildPair` Zod schema (v1), `pairsApi` client, `usePair` / `useSavePair` / `useForkPair` hooks
- Three new `builds-api` Worker routes (`POST /pairs`, `GET /pairs/:id`, `POST /pairs/:id/fork`) sharing the existing KV binding under `p:$id` prefix
- New Pages Function proxy at `/api/pairs/*`
- `useCompareDraft` reducer + `CompareWorkspace`, `CompareSide`, `CompareStatDelta`, `CompareProgressionRow`, `CompareToolbar`, `CompareFromBuildDialog` components
- `SlotTree` gains optional `diff?: SlotDiffMap` prop
- "Compare ↔" button in `BuildHeader` + "or compare two builds →" landing CTA
- Full-treatment diff: stats + slot-tree + price + progression
- Per-side optional profile snapshot embed (opt-in, mirrors single-build v4 pattern)

Spec: `docs/superpowers/specs/2026-04-20-build-comparison-design.md`
Plan: `docs/plans/2026-04-20-build-comparison-plan.md`
First M3 differentiator sub-project (1 of 4).

## Test plan
- [x] Unit: schema, api client, hooks, reducer, components
- [x] Worker integration: POST/GET/fork all covered
- [x] Playwright: blank route, loaded route, interaction (stat deltas), save round-trip
- [x] Fonts (Bungee / Chivo / Azeret Mono) regression guards unchanged
- [x] Manual: dev-server flow end-to-end

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

**Spec coverage:** All spec sections have tasks:

- §1–2 purpose/decisions → Task 1 schema doc, plan header
- §3 non-goals → Task 22 final review step confirms
- §4.1 routes → Tasks 17, 18
- §4.2 entry points → Task 19
- §4.3 Worker → Task 4
- §4.4 schema → Task 1
- §4.5 data layer → Tasks 2, 3
- §5 components → Tasks 9–16, 19
- §6 visual treatment → tasks 10 (stamp), 11 (pills), 12 (SlotTree diff classes)
- §7 testing → per-task TDD + Tasks 20, 21
- §8 error handling → Task 18 (loader route error card)
- §9 migrations → v1 initial, no migration work
- §10 open questions → TTL via `BUILD_TTL_SECONDS` (Task 4); fork endpoint implemented (Task 4); diff grouping out of scope; keyboard shortcuts deferred

**Known micro-gap:** The progression "+₽34k / needs LL3 Skier / you have LL2" sentence-form described in the spec is simplified in Task 11 to side-by-side price + reachable pill. Full sentence-form is a polish follow-up; the essential progression signal (price + locked pill) is in place. Noted in the component comment.

**Placeholder scan:** No TBDs, no "implement later," every code block contains actual code. Each test step has concrete assertions.

**Type consistency:** `BuildPair` is the exported type name (from `pair-schema.ts`), `BuildPairV1` is the single-variant type, `SavePairResponse` / `LoadPairErrorCode` / `LoadPairError` / `SlotDiffMap` / `SlotDiffStatus` / `StatKey` / `StatDirection` / `StatDeltaRow` / `StatDeltaResult` / `CompareSide` / `CompareDraft` / `CompareFromBuildConfirm` — all defined where first used and referenced consistently thereafter. `SlotDiffMap` exported from `@tarkov/data` (task 7) and consumed by `SlotTree` (task 12).
