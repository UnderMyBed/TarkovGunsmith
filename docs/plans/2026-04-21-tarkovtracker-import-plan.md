# TarkovTracker profile import — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-04-21-tarkovtracker-import-design.md`](../superpowers/specs/2026-04-21-tarkovtracker-import-design.md)

**Goal:** Ship a one-click "Connect TarkovTracker" flow on `/builder` Advanced mode that pulls live progression (completed quests + flea unlock) from [tarkovtracker.io](https://tarkovtracker.io) into the SPA's `PlayerProfile`, replacing the hand-toggled 20-quest marquee list with a synced banner + search/filter UX over the full quest dataset.

**Architecture:** New pure-TS module `packages/tarkov-data/src/tarkovtracker/` (client + zod-validated mapping, no React). Three UI pieces in `apps/web/src/features/builder/` (hook + popover + banner). `ProfileEditor` reworked to slot the new primitives in. One Playwright smoke with a mocked upstream. No schema changes. No new Pages Function — TarkovTracker's API allows CORS from all origins.

**Tech Stack:** TypeScript strict, zod (already a `@tarkov/data` dep), React 19, Vitest 4, Playwright 1.59. Browser-native `fetch` + `localStorage`.

**Rollout:** ONE PR — `feat/m3-tarkovtracker-import` — four commit groups mapped to the task clusters below.

---

## File map

All paths relative to repo root.

**New files in `packages/tarkov-data/src/tarkovtracker/`:**

| Path                                | Purpose                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `index.ts`                          | Public barrel — exports client, mapping, types, errors                           |
| `types.ts`                          | Zod schema for TarkovTracker `RawProgression` response + `MapResult` type        |
| `errors.ts`                         | `TokenInvalidError` / `RateLimitedError` / `NetworkError` / `ShapeMismatchError` |
| `quest-id-map.ts`                   | `buildIdMap(tasks) → Record<gameId, normalizedName>`                             |
| `mapping.ts`                        | `mapRawToProfile(raw, tasks) → MapResult` — pure                                 |
| `client.ts`                         | `fetchProgression(token) → RawProgression` — throws typed errors                 |
| `__fixtures__/raw-progression.json` | 3-task fixture consumed by unit + Playwright tests                               |
| `quest-id-map.test.ts`              | 2 tests                                                                          |
| `mapping.test.ts`                   | 5 tests                                                                          |
| `types.test.ts`                     | 2 tests                                                                          |
| `client.test.ts`                    | 4 tests                                                                          |

**New files in `apps/web/src/features/builder/`:**

| Path                                | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| `useTarkovTrackerSync.ts`           | State machine + localStorage token + fetch wiring |
| `useTarkovTrackerSync.test.tsx`     | 4 hook tests with mocked client                   |
| `tarkovtracker-connect-popover.tsx` | First-run token-entry popover                     |
| `tarkovtracker-sync-banner.tsx`     | Steady-state/syncing/error banner                 |

**Modified files:**

| Path                                                   | What changes                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `packages/tarkov-data/src/index.ts`                    | Re-export tarkovtracker barrel                                                                               |
| `apps/web/src/features/builder/profile-editor.tsx`     | Slot the banner + Connect popover; replace marquee `<ul>` with search + filter pills over the full task list |
| `apps/web/e2e/smoke.spec.ts`                           | Add one new test at the bottom                                                                               |
| `apps/web/e2e/fixtures/tarkovtracker-progression.json` | New — fixture the e2e route-mock returns                                                                     |
| `eslint.config.js`                                     | `allowDefaultProject` entry for the new test dirs, if needed (verify at lint time)                           |

---

## Phase A — Setup

### Task 1: Create worktree

**Files:** n/a (setup)

- [ ] **Step 1: Worktree off origin/main**

```bash
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git fetch origin main
git worktree add .worktrees/tt-import -b feat/m3-tarkovtracker-import origin/main
cd .worktrees/tt-import
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
```

- [ ] **Step 2: Baseline green**

```bash
pnpm test
```

Expected: every existing test passes. Note the counts so you can confirm later additions.

---

## Phase B — `@tarkov/data/tarkovtracker` module

Commit 1 of 4. All new files live under `packages/tarkov-data/src/tarkovtracker/`.

### Task 2: Scaffold subdirectory + errors + types

**Files:**

- Create: `packages/tarkov-data/src/tarkovtracker/errors.ts`
- Create: `packages/tarkov-data/src/tarkovtracker/types.ts`
- Create: `packages/tarkov-data/src/tarkovtracker/__fixtures__/raw-progression.json`

Typed errors + zod schema are the foundations the rest of the module builds on. No test runner hits this directly; they'll be exercised via `client.test.ts` and `mapping.test.ts` in later tasks.

- [ ] **Step 1: Create `errors.ts`**

```ts
export class TokenInvalidError extends Error {
  constructor() {
    super("TarkovTracker rejected the token (401)");
    this.name = "TokenInvalidError";
  }
}

export class RateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number | null = null) {
    super("TarkovTracker rate-limited the request (429)");
    this.name = "RateLimitedError";
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(`TarkovTracker network error: ${String(cause)}`);
    this.name = "NetworkError";
  }
}

export class ShapeMismatchError extends Error {
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super("TarkovTracker response shape did not match expected schema");
    this.name = "ShapeMismatchError";
  }
}
```

- [ ] **Step 2: Create `types.ts`**

```ts
import { z } from "zod";

const taskProgress = z.object({
  id: z.string().min(1),
  complete: z.boolean(),
  invalid: z.boolean().optional(),
  failed: z.boolean().optional(),
});

const hideoutProgress = z.object({
  id: z.string().min(1),
  complete: z.boolean(),
});

/**
 * Response from `GET https://tarkovtracker.io/api/v2/progress`. See spec §3 or
 * the `formatProgress()` source in TarkovTracker/functions/api/v2/index.js.
 */
export const RawProgressionSchema = z.object({
  tasksProgress: z.array(taskProgress),
  taskObjectivesProgress: z.array(taskProgress),
  hideoutModulesProgress: z.array(hideoutProgress),
  hideoutPartsProgress: z.array(hideoutProgress),
  displayName: z.string(),
  userId: z.string(),
  playerLevel: z.number().int().nonnegative(),
  gameEdition: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  pmcFaction: z.union([z.literal("USEC"), z.literal("BEAR")]),
});

export type RawProgression = z.infer<typeof RawProgressionSchema>;

export interface MapResult {
  profile: {
    completedQuests: string[];
    flea: boolean;
  };
  meta: {
    questCount: number;
    playerLevel: number;
    unmappedCount: number;
  };
}
```

- [ ] **Step 3: Create `__fixtures__/raw-progression.json`**

Three completed tasks plus context. The IDs MUST be real BSG gameIds that exist in `api.tarkov.dev` so the mapping produces non-zero output. Use these three canonical ones (stable for years — Gunsmith Part 1 / Setup / Debut, all present in `api.tarkov.dev`):

```json
{
  "tasksProgress": [
    { "id": "5ac23c6186f7741247042bad", "complete": true },
    { "id": "5936d90786f7742b1420ba5b", "complete": true },
    { "id": "59674eb386f774539f14813a", "complete": true },
    { "id": "5d25e2d386f77443e35162e5", "complete": false }
  ],
  "taskObjectivesProgress": [],
  "hideoutModulesProgress": [],
  "hideoutPartsProgress": [],
  "displayName": "TestUser",
  "userId": "abc123",
  "playerLevel": 25,
  "gameEdition": 1,
  "pmcFaction": "USEC"
}
```

Verify the three "complete: true" IDs actually resolve to `Task.normalizedName` values when `api.tarkov.dev` is queried. If any don't resolve, replace them with the response of:

```bash
curl -sS -X POST https://api.tarkov.dev/graphql -H 'content-type: application/json' \
  -d '{"query":"{ tasks { id normalizedName } }"}' \
  | head -500
```

Pick three entries where `id` is a 24-char hex string; update the JSON.

- [ ] **Step 4: Commit**

```bash
git add packages/tarkov-data/src/tarkovtracker/
git commit -m "feat(data): TarkovTracker module — errors + zod response schema + fixture"
```

---

### Task 3: `quest-id-map.ts` — TDD

**Files:**

- Create: `packages/tarkov-data/src/tarkovtracker/quest-id-map.test.ts`
- Create: `packages/tarkov-data/src/tarkovtracker/quest-id-map.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/tarkov-data/src/tarkovtracker/quest-id-map.test.ts
import { describe, expect, it } from "vitest";
import { buildIdMap } from "./quest-id-map.js";
import type { TaskListItem } from "../queries/tasks.js";

function task(id: string | null, normalizedName: string): TaskListItem {
  return {
    id,
    name: normalizedName,
    normalizedName,
    kappaRequired: null,
    trader: { normalizedName: "prapor" },
  };
}

describe("buildIdMap", () => {
  it("produces a gameId → normalizedName map of the same length as the input", () => {
    const tasks = [
      task("5ac23c6186f7741247042bad", "gunsmith-part-1"),
      task("5936d90786f7742b1420ba5b", "setup"),
      task("59674eb386f774539f14813a", "debut"),
    ];
    const map = buildIdMap(tasks);
    expect(Object.keys(map)).toHaveLength(3);
    expect(map["5ac23c6186f7741247042bad"]).toBe("gunsmith-part-1");
    expect(map["5936d90786f7742b1420ba5b"]).toBe("setup");
    expect(map["59674eb386f774539f14813a"]).toBe("debut");
  });

  it("drops tasks with null id and deduplicates by first-wins", () => {
    const tasks = [
      task(null, "orphan"),
      task("5ac23c6186f7741247042bad", "first"),
      task("5ac23c6186f7741247042bad", "second"),
    ];
    const map = buildIdMap(tasks);
    expect(Object.keys(map)).toHaveLength(1);
    expect(map["5ac23c6186f7741247042bad"]).toBe("first");
  });
});
```

- [ ] **Step 2: Run — expect fail (module not found)**

```bash
pnpm --filter @tarkov/data test -- quest-id-map
```

- [ ] **Step 3: Implement `quest-id-map.ts`**

```ts
import type { TaskListItem } from "../queries/tasks.js";

/**
 * Build a gameId → normalizedName map from the SPA's existing Task[] list.
 * First-wins on duplicate gameIds; silently drops tasks with a null id
 * (api.tarkov.dev returns null for pre-release / retired tasks).
 */
export function buildIdMap(tasks: readonly TaskListItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const task of tasks) {
    if (task.id === null) continue;
    if (out[task.id] !== undefined) continue;
    out[task.id] = task.normalizedName;
  }
  return out;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
pnpm --filter @tarkov/data test -- quest-id-map
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-data/src/tarkovtracker/quest-id-map.ts packages/tarkov-data/src/tarkovtracker/quest-id-map.test.ts
git commit -m "feat(data): TarkovTracker — gameId → normalizedName map builder"
```

---

### Task 4: `mapping.ts` — TDD

**Files:**

- Create: `packages/tarkov-data/src/tarkovtracker/mapping.test.ts`
- Create: `packages/tarkov-data/src/tarkovtracker/mapping.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/tarkov-data/src/tarkovtracker/mapping.test.ts
import { describe, expect, it } from "vitest";
import { mapRawToProfile } from "./mapping.js";
import type { RawProgression } from "./types.js";
import type { TaskListItem } from "../queries/tasks.js";
import rawFixture from "./__fixtures__/raw-progression.json" with { type: "json" };

function task(id: string | null, normalizedName: string): TaskListItem {
  return {
    id,
    name: normalizedName,
    normalizedName,
    kappaRequired: null,
    trader: { normalizedName: "prapor" },
  };
}

const TASKS: readonly TaskListItem[] = [
  task("5ac23c6186f7741247042bad", "gunsmith-part-1"),
  task("5936d90786f7742b1420ba5b", "setup"),
  task("59674eb386f774539f14813a", "debut"),
];

describe("mapRawToProfile", () => {
  it("maps three complete tasks to normalizedName slugs and sets flea=true at level 25", () => {
    const raw = rawFixture as RawProgression;
    const result = mapRawToProfile(raw, TASKS);
    expect(result.profile.completedQuests).toEqual(
      expect.arrayContaining(["gunsmith-part-1", "setup", "debut"]),
    );
    expect(result.profile.completedQuests).toHaveLength(3);
    expect(result.profile.flea).toBe(true);
    expect(result.meta.questCount).toBe(3);
    expect(result.meta.playerLevel).toBe(25);
    expect(result.meta.unmappedCount).toBe(0);
  });

  it("sets flea=false when playerLevel < 20", () => {
    const raw = { ...(rawFixture as RawProgression), playerLevel: 19 };
    const result = mapRawToProfile(raw, TASKS);
    expect(result.profile.flea).toBe(false);
  });

  it("filters out tasks marked invalid", () => {
    const raw: RawProgression = {
      ...(rawFixture as RawProgression),
      tasksProgress: [
        { id: "5ac23c6186f7741247042bad", complete: true, invalid: true },
        { id: "5936d90786f7742b1420ba5b", complete: true },
      ],
    };
    const result = mapRawToProfile(raw, TASKS);
    expect(result.profile.completedQuests).toEqual(["setup"]);
  });

  it("filters out tasks marked failed", () => {
    const raw: RawProgression = {
      ...(rawFixture as RawProgression),
      tasksProgress: [
        { id: "5ac23c6186f7741247042bad", complete: true, failed: true },
        { id: "5936d90786f7742b1420ba5b", complete: true },
      ],
    };
    const result = mapRawToProfile(raw, TASKS);
    expect(result.profile.completedQuests).toEqual(["setup"]);
  });

  it("reports unmappedCount when a TarkovTracker id has no tarkov.dev match", () => {
    const raw: RawProgression = {
      ...(rawFixture as RawProgression),
      tasksProgress: [
        { id: "5ac23c6186f7741247042bad", complete: true },
        { id: "000000000000000000000000", complete: true },
      ],
    };
    const result = mapRawToProfile(raw, TASKS);
    expect(result.profile.completedQuests).toEqual(["gunsmith-part-1"]);
    expect(result.meta.unmappedCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
pnpm --filter @tarkov/data test -- mapping
```

- [ ] **Step 3: Implement `mapping.ts`**

```ts
import type { TaskListItem } from "../queries/tasks.js";
import { buildIdMap } from "./quest-id-map.js";
import type { MapResult, RawProgression } from "./types.js";

/**
 * Pure mapper: TarkovTracker progression + tarkov.dev task list → the subset
 * of `PlayerProfile` we can derive (completedQuests + flea).
 *
 * - Skips tasks that are incomplete / invalid / failed (per spec §6.2).
 * - Skips tasks whose gameId has no normalizedName match and increments
 *   `unmappedCount` so callers can surface the count to users.
 */
export function mapRawToProfile(raw: RawProgression, tasks: readonly TaskListItem[]): MapResult {
  const idMap = buildIdMap(tasks);
  const normalized: string[] = [];
  let unmappedCount = 0;

  for (const entry of raw.tasksProgress) {
    if (!entry.complete || entry.invalid === true || entry.failed === true) continue;
    const slug = idMap[entry.id];
    if (slug !== undefined) {
      normalized.push(slug);
    } else {
      unmappedCount++;
    }
  }

  return {
    profile: {
      completedQuests: normalized,
      flea: raw.playerLevel >= 20,
    },
    meta: {
      questCount: normalized.length,
      playerLevel: raw.playerLevel,
      unmappedCount,
    },
  };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
pnpm --filter @tarkov/data test -- mapping
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-data/src/tarkovtracker/mapping.ts packages/tarkov-data/src/tarkovtracker/mapping.test.ts
git commit -m "feat(data): TarkovTracker — mapRawToProfile pure mapper"
```

---

### Task 5: `types.ts` zod schema tests (bookend)

**Files:**

- Create: `packages/tarkov-data/src/tarkovtracker/types.test.ts`

No implementation change — types.ts was shipped in Task 2. Just exercise the schema to catch regressions.

- [ ] **Step 1: Write + run tests**

```ts
// packages/tarkov-data/src/tarkovtracker/types.test.ts
import { describe, expect, it } from "vitest";
import { RawProgressionSchema } from "./types.js";
import rawFixture from "./__fixtures__/raw-progression.json" with { type: "json" };

describe("RawProgressionSchema", () => {
  it("accepts the fixture as valid", () => {
    expect(() => RawProgressionSchema.parse(rawFixture)).not.toThrow();
  });

  it("rejects a payload missing tasksProgress and points at the field path", () => {
    const bad = { ...(rawFixture as unknown as Record<string, unknown>) };
    delete bad.tasksProgress;
    const result = RawProgressionSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "tasksProgress")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run — expect pass**

```bash
pnpm --filter @tarkov/data test -- tarkovtracker
```

Expected: 9 tests pass (2 quest-id-map + 5 mapping + 2 types).

- [ ] **Step 3: Commit**

```bash
git add packages/tarkov-data/src/tarkovtracker/types.test.ts
git commit -m "test(data): TarkovTracker — zod schema happy + unhappy path"
```

---

### Task 6: `client.ts` — TDD with mocked fetch

**Files:**

- Create: `packages/tarkov-data/src/tarkovtracker/client.test.ts`
- Create: `packages/tarkov-data/src/tarkovtracker/client.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/tarkov-data/src/tarkovtracker/client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProgression } from "./client.js";
import { NetworkError, RateLimitedError, ShapeMismatchError, TokenInvalidError } from "./errors.js";
import rawFixture from "./__fixtures__/raw-progression.json" with { type: "json" };

describe("fetchProgression", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs tarkovtracker.io/api/v2/progress with Bearer auth and parses the response", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(rawFixture), { status: 200 }));
    const result = await fetchProgression("abc123");
    expect(result.playerLevel).toBe(25);
    expect(result.tasksProgress).toHaveLength(4);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://tarkovtracker.io/api/v2/progress",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer abc123",
        }),
      }),
    );
  });

  it("throws TokenInvalidError on 401", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(fetchProgression("bad")).rejects.toBeInstanceOf(TokenInvalidError);
  });

  it("throws RateLimitedError on 429", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("", { status: 429, headers: { "Retry-After": "60" } }),
    );
    await expect(fetchProgression("x")).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("throws NetworkError when fetch rejects", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("dns"));
    await expect(fetchProgression("x")).rejects.toBeInstanceOf(NetworkError);
  });

  it("throws ShapeMismatchError when the response body doesn't match the schema", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
    );
    await expect(fetchProgression("x")).rejects.toBeInstanceOf(ShapeMismatchError);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
pnpm --filter @tarkov/data test -- client
```

- [ ] **Step 3: Implement `client.ts`**

```ts
import { NetworkError, RateLimitedError, ShapeMismatchError, TokenInvalidError } from "./errors.js";
import { RawProgressionSchema, type RawProgression } from "./types.js";

const ENDPOINT = "https://tarkovtracker.io/api/v2/progress";

/**
 * Fetch the current user's progression from TarkovTracker. Bearer token is
 * required and must have the GP (Get Progression) scope. Throws typed errors
 * the consumer can match on.
 */
export async function fetchProgression(token: string): Promise<RawProgression> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }

  if (res.status === 401) throw new TokenInvalidError();
  if (res.status === 429) {
    const retryRaw = res.headers.get("Retry-After");
    const retryAfter = retryRaw !== null ? Number(retryRaw) : null;
    throw new RateLimitedError(Number.isFinite(retryAfter) ? retryAfter : null);
  }
  if (!res.ok) throw new NetworkError(`upstream ${res.status}`);

  const body: unknown = await res.json();
  const parsed = RawProgressionSchema.safeParse(body);
  if (!parsed.success) {
    throw new ShapeMismatchError(
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
pnpm --filter @tarkov/data test -- client
```

Expected: 5 tests pass (the plan budgeted 4, but we ended up with 5 after a cleaner split — totals updated in Task 7's verification).

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-data/src/tarkovtracker/client.ts packages/tarkov-data/src/tarkovtracker/client.test.ts
git commit -m "feat(data): TarkovTracker — fetchProgression client with typed errors"
```

---

### Task 7: Barrel + package-level re-export

**Files:**

- Create: `packages/tarkov-data/src/tarkovtracker/index.ts`
- Modify: `packages/tarkov-data/src/index.ts`

- [ ] **Step 1: Create subdir barrel**

```ts
// packages/tarkov-data/src/tarkovtracker/index.ts
export { fetchProgression } from "./client.js";
export { mapRawToProfile } from "./mapping.js";
export { buildIdMap } from "./quest-id-map.js";
export { RawProgressionSchema } from "./types.js";
export type { RawProgression, MapResult } from "./types.js";
export { TokenInvalidError, RateLimitedError, NetworkError, ShapeMismatchError } from "./errors.js";
```

- [ ] **Step 2: Re-export from package root**

Append to `packages/tarkov-data/src/index.ts` (after the `useTasks` export around line 40):

```ts
// TarkovTracker integration
export {
  fetchProgression,
  mapRawToProfile,
  buildIdMap,
  RawProgressionSchema,
  TokenInvalidError,
  RateLimitedError,
  NetworkError,
  ShapeMismatchError,
} from "./tarkovtracker/index.js";
export type { RawProgression, MapResult } from "./tarkovtracker/index.js";
```

- [ ] **Step 3: Build + typecheck**

```bash
pnpm --filter @tarkov/data build
pnpm --filter @tarkov/data test
```

Expected: package builds cleanly; all 9 new tarkovtracker tests pass (2 quest-id-map + 5 mapping + 2 types + 5 client = 14 if we include the client-test expansion, but baseline budget is 13 per spec §8.1; either way, green across the board).

- [ ] **Step 4: Commit**

```bash
git add packages/tarkov-data/src/tarkovtracker/index.ts packages/tarkov-data/src/index.ts
git commit -m "feat(data): TarkovTracker — public barrel + package-root exports"
```

- [ ] **Step 5: eslint allowDefaultProject entry (if needed)**

Attempt a lint:

```bash
pnpm --filter @tarkov/data exec eslint src/tarkovtracker/
```

If it fails with `was not found by the project service`, add these lines to `eslint.config.js`'s `allowDefaultProject` array (near the existing `packages/tarkov-data/src/queries/*.test.ts` entry):

```
"packages/tarkov-data/src/tarkovtracker/*.test.ts",
"packages/tarkov-data/src/tarkovtracker/*.test.tsx",
```

If lint passed first try, skip this step.

- [ ] **Step 6: Amend the eslint edit into the barrel commit (if made)**

```bash
git add eslint.config.js
git commit --amend --no-edit
```

---

## Phase C — `apps/web` primitives

Commit 2 of 4. Three new files in `apps/web/src/features/builder/`, no routes wired yet.

### Task 8: `useTarkovTrackerSync` hook — TDD

**Files:**

- Create: `apps/web/src/features/builder/useTarkovTrackerSync.test.tsx`
- Create: `apps/web/src/features/builder/useTarkovTrackerSync.ts`

The hook owns: token in localStorage, state machine, the `fetchProgression` pipeline, and the eventual `onChange` callback into `PlayerProfile`. It does NOT own quest data — it takes `tasks: TaskListItem[] | undefined` as a parameter and defers work if it's not ready.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/features/builder/useTarkovTrackerSync.test.tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerProfile } from "@tarkov/data";
import type { TaskListItem } from "@tarkov/data";

// Mock the client BEFORE importing the hook so the hook picks up the mock.
vi.mock("@tarkov/data", async () => {
  const actual = await vi.importActual<typeof import("@tarkov/data")>("@tarkov/data");
  return {
    ...actual,
    fetchProgression: vi.fn(),
  };
});

import { fetchProgression } from "@tarkov/data";
import { useTarkovTrackerSync } from "./useTarkovTrackerSync.js";

const fetchProgressionMock = vi.mocked(fetchProgression);

function task(id: string | null, normalizedName: string): TaskListItem {
  return {
    id,
    name: normalizedName,
    normalizedName,
    kappaRequired: null,
    trader: { normalizedName: "prapor" },
  };
}

const TASKS: TaskListItem[] = [
  task("5ac23c6186f7741247042bad", "gunsmith-part-1"),
  task("5936d90786f7742b1420ba5b", "setup"),
];

const INITIAL_PROFILE: PlayerProfile = {
  mode: "advanced",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: false,
};

beforeEach(() => {
  window.localStorage.clear();
  fetchProgressionMock.mockReset();
});
afterEach(() => {
  window.localStorage.clear();
});

describe("useTarkovTrackerSync", () => {
  it("starts in `disconnected` when no token is stored", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useTarkovTrackerSync({ profile: INITIAL_PROFILE, onChange, tasks: TASKS }),
    );
    expect(result.current.state).toBe("disconnected");
  });

  it("connect() transitions disconnected → syncing → synced and calls onChange with merged profile", async () => {
    fetchProgressionMock.mockResolvedValueOnce({
      tasksProgress: [
        { id: "5ac23c6186f7741247042bad", complete: true },
        { id: "5936d90786f7742b1420ba5b", complete: true },
      ],
      taskObjectivesProgress: [],
      hideoutModulesProgress: [],
      hideoutPartsProgress: [],
      displayName: "U",
      userId: "u",
      playerLevel: 30,
      gameEdition: 1,
      pmcFaction: "USEC",
    });

    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useTarkovTrackerSync({ profile: INITIAL_PROFILE, onChange, tasks: TASKS }),
    );

    await act(async () => {
      await result.current.connect("tok-1");
    });

    await waitFor(() => expect(result.current.state).toBe("synced"));
    expect(window.localStorage.getItem("tg:tarkovtracker-token")).toBe("tok-1");
    expect(onChange).toHaveBeenCalledWith({
      ...INITIAL_PROFILE,
      completedQuests: ["gunsmith-part-1", "setup"],
      flea: true,
    });
  });

  it("failed fetch → `error` state and token stays in localStorage", async () => {
    const { TokenInvalidError } = await import("@tarkov/data");
    fetchProgressionMock.mockRejectedValueOnce(new TokenInvalidError());

    const { result } = renderHook(() =>
      useTarkovTrackerSync({ profile: INITIAL_PROFILE, onChange: vi.fn(), tasks: TASKS }),
    );

    await act(async () => {
      await result.current.connect("bad-token");
    });

    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(window.localStorage.getItem("tg:tarkovtracker-token")).toBe("bad-token");
    if (result.current.state === "error") {
      expect(result.current.kind).toBe("token-invalid");
    }
  });

  it("disconnect() clears token and resets to disconnected without touching profile", async () => {
    window.localStorage.setItem("tg:tarkovtracker-token", "tok");
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useTarkovTrackerSync({ profile: INITIAL_PROFILE, onChange, tasks: TASKS }),
    );

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.state).toBe("disconnected");
    expect(window.localStorage.getItem("tg:tarkovtracker-token")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
pnpm --filter @tarkov/web test -- useTarkovTrackerSync
```

- [ ] **Step 3: Implement `useTarkovTrackerSync.ts`**

```ts
import { useCallback, useRef, useState } from "react";
import {
  fetchProgression,
  mapRawToProfile,
  NetworkError,
  RateLimitedError,
  ShapeMismatchError,
  TokenInvalidError,
  type PlayerProfile,
  type TaskListItem,
} from "@tarkov/data";

const STORAGE_KEY = "tg:tarkovtracker-token";

export type SyncErrorKind = "token-invalid" | "rate-limited" | "network" | "shape-mismatch";

export type SyncState =
  | { state: "disconnected" }
  | { state: "syncing" }
  | {
      state: "synced";
      lastSyncedAt: number;
      questCount: number;
      playerLevel: number;
      unmappedCount: number;
    }
  | { state: "error"; kind: SyncErrorKind; message: string };

export interface UseTarkovTrackerSyncArgs {
  profile: PlayerProfile;
  onChange: (next: PlayerProfile) => void;
  tasks: readonly TaskListItem[] | undefined;
}

export interface UseTarkovTrackerSyncResult {
  state: SyncState["state"];
  detail: SyncState;
  /** Popover calls this with a freshly-pasted token. */
  connect(token: string): Promise<void>;
  /** Re-run fetch against the already-stored token. */
  reSync(): Promise<void>;
  /** Wipe token + reset state. Profile stays untouched. */
  disconnect(): void;
}

function classifyError(err: unknown): { kind: SyncErrorKind; message: string } {
  if (err instanceof TokenInvalidError) return { kind: "token-invalid", message: err.message };
  if (err instanceof RateLimitedError) return { kind: "rate-limited", message: err.message };
  if (err instanceof ShapeMismatchError) return { kind: "shape-mismatch", message: err.message };
  if (err instanceof NetworkError) return { kind: "network", message: err.message };
  return { kind: "network", message: String(err) };
}

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useTarkovTrackerSync(args: UseTarkovTrackerSyncArgs): UseTarkovTrackerSyncResult {
  const [syncState, setSyncState] = useState<SyncState>(() =>
    readStoredToken() !== null ? { state: "disconnected" } : { state: "disconnected" },
  );

  // Keep the latest profile/onChange/tasks without invalidating connect/reSync's identity.
  const propsRef = useRef(args);
  propsRef.current = args;

  const doSync = useCallback(async (token: string) => {
    setSyncState({ state: "syncing" });
    try {
      const raw = await fetchProgression(token);
      const tasks = propsRef.current.tasks;
      if (tasks === undefined) {
        // Tasks not loaded yet — surface as syncing. The caller re-invokes
        // once useTasks.data resolves.
        setSyncState({ state: "syncing" });
        return;
      }
      const result = mapRawToProfile(raw, tasks);
      propsRef.current.onChange({
        ...propsRef.current.profile,
        completedQuests: result.profile.completedQuests,
        flea: result.profile.flea,
      });
      setSyncState({
        state: "synced",
        lastSyncedAt: Date.now(),
        questCount: result.meta.questCount,
        playerLevel: result.meta.playerLevel,
        unmappedCount: result.meta.unmappedCount,
      });
    } catch (err) {
      const classified = classifyError(err);
      setSyncState({ state: "error", ...classified });
    }
  }, []);

  const connect = useCallback(
    async (token: string) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, token);
      } catch {
        // quota / disabled — continue; token just won't persist.
      }
      await doSync(token);
    },
    [doSync],
  );

  const reSync = useCallback(async () => {
    const token = readStoredToken();
    if (token === null) {
      setSyncState({ state: "disconnected" });
      return;
    }
    await doSync(token);
  }, [doSync]);

  const disconnect = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setSyncState({ state: "disconnected" });
  }, []);

  return {
    state: syncState.state,
    detail: syncState,
    connect,
    reSync,
    disconnect,
  };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
pnpm --filter @tarkov/web test -- useTarkovTrackerSync
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/useTarkovTrackerSync.ts apps/web/src/features/builder/useTarkovTrackerSync.test.tsx
git commit -m "feat(web): useTarkovTrackerSync — token + state machine + fetch pipeline"
```

---

### Task 9: `TarkovTrackerSyncBanner` component

**Files:**

- Create: `apps/web/src/features/builder/tarkovtracker-sync-banner.tsx`

No snapshot tests for the banner — pure presentational JSX. The hook test above covers behavior. Playwright catches regressions.

- [ ] **Step 1: Implement**

```tsx
import type { ReactElement, ReactNode } from "react";
import { Button } from "@tarkov/ui";
import type { UseTarkovTrackerSyncResult } from "./useTarkovTrackerSync.js";

function relativeTime(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

function Shell({
  tone,
  children,
}: {
  tone: "amber" | "destructive";
  children: ReactNode;
}): ReactElement {
  const borderColor = tone === "amber" ? "var(--color-primary)" : "var(--color-destructive)";
  return (
    <div
      className="flex items-center justify-between gap-3 border bg-[var(--color-background)] p-3"
      style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
    >
      {children}
    </div>
  );
}

export interface TarkovTrackerSyncBannerProps {
  sync: UseTarkovTrackerSyncResult;
}

const ERROR_COPY: Record<string, string> = {
  "token-invalid":
    'Token rejected — check you copied it correctly and that it has "Get Progression" scope.',
  "rate-limited": "TarkovTracker is rate-limiting us. Try again shortly.",
  network: "Can't reach TarkovTracker. Your local profile is unchanged — try Re-sync in a minute.",
  "shape-mismatch":
    "TarkovTracker changed its API shape. This tool needs an update — please file an issue.",
};

export function TarkovTrackerSyncBanner({
  sync,
}: TarkovTrackerSyncBannerProps): ReactElement | null {
  const { detail, reSync, disconnect } = sync;

  if (detail.state === "disconnected") return null;

  if (detail.state === "syncing") {
    return (
      <Shell tone="amber">
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="font-mono uppercase tracking-wider text-[var(--color-primary)]">
            ▲ TARKOVTRACKER · SYNCING…
          </span>
          <span className="text-[var(--color-muted-foreground)]">
            Fetching progression from tarkovtracker.io
          </span>
        </div>
      </Shell>
    );
  }

  if (detail.state === "synced") {
    const unmapped = detail.unmappedCount > 0 ? ` · ${detail.unmappedCount} UNMAPPED` : "";
    return (
      <Shell tone="amber">
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="font-mono uppercase tracking-wider text-[var(--color-primary)]">
            ▲ TARKOVTRACKER · {detail.questCount} QUESTS · PMC LV {detail.playerLevel}
            {unmapped}
          </span>
          <span className="text-[var(--color-muted-foreground)]">
            Last sync {relativeTime(detail.lastSyncedAt)}. Trader LLs not synced — set manually.
          </span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => void reSync()}>
            Re-sync
          </Button>
          <Button size="sm" variant="ghost" onClick={disconnect}>
            Disconnect
          </Button>
        </div>
      </Shell>
    );
  }

  const copy = ERROR_COPY[detail.kind] ?? detail.message;
  return (
    <Shell tone="destructive">
      <div className="flex flex-col gap-0.5 text-xs">
        <span className="font-mono uppercase tracking-wider text-[var(--color-destructive)]">
          ▲ TARKOVTRACKER · ERROR
        </span>
        <span className="text-[var(--color-muted-foreground)]">{copy}</span>
      </div>
      <div className="flex gap-1">
        {detail.kind !== "token-invalid" && (
          <Button size="sm" variant="ghost" onClick={() => void reSync()}>
            Re-sync
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={disconnect}>
          Disconnect
        </Button>
      </div>
    </Shell>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @tarkov/web typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/builder/tarkovtracker-sync-banner.tsx
git commit -m "feat(web): TarkovTrackerSyncBanner — synced / syncing / error states"
```

---

### Task 10: `TarkovTrackerConnectPopover` component

**Files:**

- Create: `apps/web/src/features/builder/tarkovtracker-connect-popover.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState, type ReactElement } from "react";
import { Button, Input } from "@tarkov/ui";

export interface TarkovTrackerConnectPopoverProps {
  open: boolean;
  onClose: () => void;
  onConnect: (token: string) => void;
}

export function TarkovTrackerConnectPopover({
  open,
  onClose,
  onConnect,
}: TarkovTrackerConnectPopoverProps): ReactElement | null {
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);

  if (!open) return null;

  const submit = (): void => {
    const trimmed = token.trim();
    if (trimmed.length === 0) return;
    onConnect(trimmed);
    setToken("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm border bg-[var(--color-card)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display mb-2 text-base uppercase tracking-wider">
          Connect TarkovTracker
        </h3>
        <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
          TarkovTracker token
        </label>
        <div className="mb-3 flex gap-2">
          <Input
            type={show ? "text" : "password"}
            value={token}
            placeholder="Paste token"
            autoComplete="off"
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <Button type="button" size="sm" variant="ghost" onClick={() => setShow((s) => !s)}>
            {show ? "Hide" : "Show"}
          </Button>
        </div>
        <ol className="mb-3 list-decimal pl-5 text-xs text-[var(--color-muted-foreground)]">
          <li>
            Open{" "}
            <a
              href="https://tarkovtracker.io/settings"
              target="_blank"
              rel="noreferrer noopener"
              className="text-[var(--color-primary)] underline"
            >
              tarkovtracker.io/settings →
            </a>
          </li>
          <li>Create a token with &ldquo;Get Progression&rdquo; scope</li>
          <li>Paste it above</li>
        </ol>
        <p className="mb-4 text-xs text-[var(--color-muted-foreground)]">
          Stored in your browser only. We never send it to the TarkovGunsmith servers.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={token.trim().length === 0}>
            Connect
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @tarkov/web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/builder/tarkovtracker-connect-popover.tsx
git commit -m "feat(web): TarkovTrackerConnectPopover — first-run token entry"
```

---

## Phase D — `ProfileEditor` wire-up

Commit 3 of 4. This is the user-visible change.

### Task 11: Replace marquee list with imported-progression layout

**Files:**

- Modify: `apps/web/src/features/builder/profile-editor.tsx`

The new ProfileEditor replaces the 20-quest marquee `<ul>` with:

1. A `<TarkovTrackerSyncBanner>` at the top of the Advanced panel (or a "Connect TarkovTracker" trigger button if disconnected).
2. A full-quest list wrapped in search + filter pills (`ALL`, `MARQUEE`, `INCOMPLETE`).
3. The existing trader LL dropdowns and flea checkbox unchanged (trader LLs stay manual per spec §2).

- [ ] **Step 1: Rewrite `profile-editor.tsx`**

```tsx
import { useMemo, useState, type ReactElement } from "react";
import type { PlayerProfile } from "@tarkov/data";
import { useTasks, MARQUEE_QUEST_NORMALIZED_NAMES } from "@tarkov/data";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";
import { TarkovTrackerConnectPopover } from "./tarkovtracker-connect-popover.js";
import { TarkovTrackerSyncBanner } from "./tarkovtracker-sync-banner.js";
import { useTarkovTrackerSync } from "./useTarkovTrackerSync.js";

export interface ProfileEditorProps {
  profile: PlayerProfile;
  onChange: (next: PlayerProfile) => void;
}

const TRADER_KEYS = [
  "prapor",
  "therapist",
  "skier",
  "peacekeeper",
  "mechanic",
  "ragman",
  "jaeger",
] as const;

const TRADER_LABELS: Record<(typeof TRADER_KEYS)[number], string> = {
  prapor: "Prapor",
  therapist: "Therapist",
  skier: "Skier",
  peacekeeper: "Peacekeeper",
  mechanic: "Mechanic",
  ragman: "Ragman",
  jaeger: "Jaeger",
};

type QuestFilter = "all" | "marquee" | "incomplete";

export function ProfileEditor({ profile, onChange }: ProfileEditorProps): ReactElement {
  const tasks = useTasks();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [filter, setFilter] = useState<QuestFilter>("marquee");
  const [search, setSearch] = useState("");

  const sync = useTarkovTrackerSync({
    profile,
    onChange,
    tasks: tasks.data,
  });

  const marqueeSet = useMemo(() => new Set<string>(MARQUEE_QUEST_NORMALIZED_NAMES), []);
  const completedSet = new Set(profile.completedQuests ?? []);

  const allTasks = tasks.data ?? [];
  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTasks
      .filter((t) => {
        if (filter === "marquee" && !marqueeSet.has(t.normalizedName)) return false;
        if (filter === "incomplete" && completedSet.has(t.normalizedName)) return false;
        if (q.length > 0 && !t.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .slice(0, 200);
  }, [allTasks, filter, search, marqueeSet, completedSet]);

  const marqueeDoneCount = useMemo(
    () => Array.from(marqueeSet).filter((slug) => completedSet.has(slug)).length,
    [marqueeSet, completedSet],
  );
  const totalDoneCount = completedSet.size;

  function setMode(mode: "basic" | "advanced"): void {
    onChange({ ...profile, mode });
  }

  function setTraderLevel(key: (typeof TRADER_KEYS)[number], level: number): void {
    onChange({ ...profile, traders: { ...profile.traders, [key]: level } });
  }

  function setFlea(flea: boolean): void {
    onChange({ ...profile, flea });
  }

  function toggleQuest(slug: string): void {
    const next = new Set(completedSet);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange({ ...profile, completedQuests: [...next] });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Your progression</CardTitle>
            <CardDescription>
              Dims mods you can&apos;t acquire yet and shows the blocking requirement.
            </CardDescription>
          </div>
          <div className="flex gap-1 rounded-[var(--radius)] border p-1">
            <Button
              type="button"
              size="sm"
              variant={profile.mode === "basic" ? "default" : "ghost"}
              onClick={() => setMode("basic")}
            >
              Basic
            </Button>
            <Button
              type="button"
              size="sm"
              variant={profile.mode === "advanced" ? "default" : "ghost"}
              onClick={() => setMode("advanced")}
            >
              Advanced
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {profile.mode === "advanced" && (
          <div className="mb-3">
            {sync.state === "disconnected" ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setPopoverOpen(true)}>
                ▲ Connect TarkovTracker
              </Button>
            ) : (
              <TarkovTrackerSyncBanner sync={sync} />
            )}
          </div>
        )}

        <details className="group">
          <summary className="cursor-pointer text-sm text-[var(--color-muted-foreground)] hover:opacity-80">
            {sync.state === "synced" ? "Override manually" : "Edit profile"}{" "}
            <span className="ml-1 inline-block transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TRADER_KEYS.map((key) => (
                <label key={key} className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{TRADER_LABELS[key]}</span>
                  <select
                    className="h-8 rounded-[var(--radius)] border bg-[var(--color-input)] px-2 text-sm"
                    value={profile.traders[key]}
                    onChange={(e) => setTraderLevel(key, Number(e.target.value))}
                  >
                    {[1, 2, 3, 4].map((ll) => (
                      <option key={ll} value={ll}>
                        LL {ll}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={profile.flea}
                onChange={(e) => setFlea(e.target.checked)}
              />
              <span>Flea market access</span>
            </label>

            {profile.mode === "advanced" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Quests{" "}
                    <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
                      — {totalDoneCount} complete
                    </span>
                  </span>
                  {tasks.isLoading && (
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      Loading quest list…
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter quests…"
                  className="h-8 rounded-[var(--radius)] border bg-[var(--color-input)] px-2 text-sm"
                />
                <div className="flex gap-1 text-xs">
                  {(
                    [
                      ["all", "All"],
                      [
                        "marquee",
                        `Marquee (${marqueeDoneCount}/${MARQUEE_QUEST_NORMALIZED_NAMES.length})`,
                      ],
                      ["incomplete", "Incomplete"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      className={`border px-2 py-0.5 font-mono uppercase tracking-wider ${
                        filter === key
                          ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                          : "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {tasks.error && (
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    Couldn&apos;t load quest list — toggles still work against cached slugs.
                  </span>
                )}
                <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                  {visibleTasks.map((t) => (
                    <li key={t.normalizedName}>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={completedSet.has(t.normalizedName)}
                          onChange={() => toggleQuest(t.normalizedName)}
                        />
                        <span>{t.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                {sync.state === "synced" && (
                  <p className="text-xs italic text-[var(--color-muted-foreground)]">
                    Manual toggles override the TarkovTracker snapshot until the next Re-sync.
                  </p>
                )}
              </div>
            )}
          </div>
        </details>
      </CardContent>

      <TarkovTrackerConnectPopover
        open={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        onConnect={(token) => {
          setPopoverOpen(false);
          void sync.connect(token);
        }}
      />
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck + web tests**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web test
```

Expected: clean + all existing tests pass (including the 4 new useTarkovTrackerSync tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/builder/profile-editor.tsx
git commit -m "feat(web): ProfileEditor — imported-progression mode with search + filter pills"
```

---

## Phase E — Playwright smoke

Commit 4 of 4.

### Task 12: Mocked-route e2e + fixture

**Files:**

- Create: `apps/web/e2e/fixtures/tarkovtracker-progression.json`
- Modify: `apps/web/e2e/smoke.spec.ts`

- [ ] **Step 1: Create fixture**

Reuse the same shape as `packages/tarkov-data/src/tarkovtracker/__fixtures__/raw-progression.json` but keep it self-contained in the e2e fixtures dir:

```json
{
  "tasksProgress": [
    { "id": "5ac23c6186f7741247042bad", "complete": true },
    { "id": "5936d90786f7742b1420ba5b", "complete": true },
    { "id": "59674eb386f774539f14813a", "complete": true }
  ],
  "taskObjectivesProgress": [],
  "hideoutModulesProgress": [],
  "hideoutPartsProgress": [],
  "displayName": "SmokeUser",
  "userId": "smoke",
  "playerLevel": 25,
  "gameEdition": 1,
  "pmcFaction": "USEC"
}
```

- [ ] **Step 2: Append smoke test**

Add at the bottom of `apps/web/e2e/smoke.spec.ts`:

```ts
import fixtureProgression from "./fixtures/tarkovtracker-progression.json" with { type: "json" };

test.describe("smoke — TarkovTracker import", () => {
  test("pasting a fake token populates the sync banner with mapped quests", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);

    // Mock the upstream before any page interaction.
    await page.route("https://tarkovtracker.io/api/v2/progress", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fixtureProgression),
      }),
    );

    await page.goto("/builder", { waitUntil: "networkidle" });

    // Switch to Advanced mode.
    await page.getByRole("button", { name: /^Advanced$/ }).click();

    // Open the Connect popover.
    await page.getByRole("button", { name: /Connect TarkovTracker/i }).click();

    // Paste a fake token and submit.
    await page.getByPlaceholder("Paste token").fill("fake-token");
    await page.getByRole("button", { name: "Connect" }).last().click();

    // Banner should populate with the fixture's player level + a non-zero quest count.
    const banner = page.getByText(/TARKOVTRACKER · \d+ QUESTS · PMC LV 25/);
    await expect(banner).toBeVisible({ timeout: 10_000 });

    expect(errors, `Console errors on TarkovTracker connect:\n${errors.join("\n")}`).toEqual([]);
  });
});
```

- [ ] **Step 3: Build + run e2e**

```bash
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e
```

Expected: existing suite stays green + 1 new test passes. If the banner regex doesn't match, the three fixture gameIds probably don't resolve against the live `api.tarkov.dev` task list — rerun the `curl` from Task 2 Step 3 and pick fresh IDs. The banner format is `TARKOVTRACKER · N QUESTS · PMC LV 25`; N may be 1–3 depending on how many fixture IDs are valid.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/fixtures/tarkovtracker-progression.json apps/web/e2e/smoke.spec.ts
git commit -m "test(web): Playwright smoke — TarkovTracker Connect flow with mocked upstream"
```

---

## Phase F — Wrap-up

### Task 13: Full verification + PR

- [ ] **Step 1: Full local verification**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e
```

All must be green.

- [ ] **Step 2: Push + open PR**

```bash
git push -u origin feat/m3-tarkovtracker-import
gh pr create --title "feat(og): TarkovTracker profile import — M3 final differentiator" --body "$(cat <<'EOF'
## Summary

Final M3 differentiator. `/builder` Advanced mode grows a one-click "Connect TarkovTracker" flow that pulls live progression (completed quests + flea unlock) into the SPA's `PlayerProfile`. The 20-quest marquee list becomes one filter pill over the full task dataset, and the sync banner keeps everything visible at a glance.

- **`packages/tarkov-data/src/tarkovtracker/`** — pure client (`fetchProgression`), zod-validated response schema, pure `mapRawToProfile`, typed errors, 13 unit tests.
- **`apps/web/src/features/builder/useTarkovTrackerSync`** — hook that owns the state machine + localStorage token (`tg:tarkovtracker-token`), 4 tests.
- **`TarkovTrackerConnectPopover` + `TarkovTrackerSyncBanner`** — first-run entry + steady-state / error UI.
- **`ProfileEditor` rework** — banner slot at top of Advanced; full-task search + Marquee/All/Incomplete filter pills replace the hardcoded 20-quest `<ul>`.
- **Playwright smoke** with a mocked `https://tarkovtracker.io/api/v2/progress` response.

No schema changes. No new Pages Function (TarkovTracker's API allows CORS from all origins). Trader LL sync deferred (API doesn't expose per-trader LLs — follow-up).

Spec: `docs/superpowers/specs/2026-04-21-tarkovtracker-import-design.md`.
Plan: `docs/plans/2026-04-21-tarkovtracker-import-plan.md`.

## Test plan

- [x] 13 new `@tarkov/data` unit tests (tarkovtracker client + mapping + types + quest-id-map)
- [x] 4 new `@tarkov/web` hook tests (useTarkovTrackerSync)
- [x] 1 new Playwright smoke (mocked Connect flow)
- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` green
- [x] `pnpm --filter @tarkov/web test:e2e` green
- [ ] After release: paste a real TarkovTracker token into prod `/builder` Advanced mode, verify banner populates + availability dimming respects synced quests

## With this merged

M3 is complete — all 5 differentiators shipped (Frontend design pass, Build comparison, Build optimization, OG share cards, TarkovTracker import).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI green, merge**

```bash
gh pr checks --watch
gh pr merge --squash
```

- [ ] **Step 4: Post-merge verification**

Release-please will auto-open v1.10.0. Once that's promoted to prod:

1. Open `/builder` in prod, switch to Advanced.
2. Click "Connect TarkovTracker", paste a real token.
3. Verify the banner populates with your real quest count + PMC level.
4. Verify availability dimming on mods respects the synced `completedQuests` (i.e. quest-locked mods that your TarkovTracker says you've done are no longer dimmed).
5. `wrangler pages deployment tail --project-name tarkov-gunsmith-web` → no 500s on the Connect flow.

---

## Self-review notes

- **Spec §1 goal:** Tasks 7 + 11 wire `completedQuests` + `flea` into the profile via sync banner. Covered.
- **Spec §2 scope:**
  - Module: Tasks 2–7.
  - UI components: Tasks 9 + 10.
  - Hook: Task 8.
  - ProfileEditor rework: Task 11.
  - Playwright: Task 12.
  - Non-goals (trader LL, hideout, team, write-back) honored — no tasks touch them.
- **Spec §3 API reference:** Task 6 client.ts uses the exact endpoint, Bearer auth, and handles 401/429/shape-mismatch as described. Fixture in Task 2 Step 3 uses real BSG gameIds.
- **Spec §4 architecture:** file map in plan header matches §4.1 + §4.2 1:1.
- **Spec §5 UI:** Task 11's rewrite implements the synced + disconnected layouts; Task 9 covers steady-state + syncing + error banners; Task 10 covers the popover.
- **Spec §6 mapping:** Task 4's `mapRawToProfile` implements the §6.1 code block verbatim and the §6.2 filter rules (skip incomplete / invalid / failed).
- **Spec §7 token storage:** Task 8 uses `tg:tarkovtracker-token`, cleared on disconnect. No server-side transmission.
- **Spec §8 testing:** 13 data + 4 hook + 1 Playwright all accounted for. No pixel snapshots.
- **Spec §9 rollout:** 4 commit groups map to Tasks 2–7 (commit 1), 8–10 (commit 2), 11 (commit 3), 12 (commit 4).
- **Spec §10 risks:** Task 2's zod schema catches shape-mismatch; Task 6's tests cover 429/401/network paths.

No TBD / TODO / "similar to Task N" placeholders. Types are consistent (`MapResult`, `RawProgression`, `SyncState`, `UseTarkovTrackerSyncResult` all referenced correctly across tasks).

One known deviation from spec: §5.1 describes "Synced-complete quests render in olive / manually toggled in default paper." I did NOT include per-quest color highlighting in Task 11 — adding "which quests are synced vs manually toggled" would require tracking provenance separately (a second Set). The visible distinction from the spec is already carried by the sync banner itself ("Manual toggles override…"). Calling out so the reviewer knows — strictly an intentional simplification, not an oversight.
