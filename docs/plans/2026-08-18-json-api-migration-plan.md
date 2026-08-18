# JSON API Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore data to all 8 routes by moving the data layer from the dead `api.tarkov.dev` GraphQL API onto `json.tarkov.dev`, without changing a single domain type.

**Architecture:** `packages/tarkov-data` is the only package that knows the transport. Its `client.ts` becomes a JSON fetcher that pulls a resource plus its `_en` translation sibling and merges them via the JSONPath list upstream supplies. Each `queries/*.ts` keeps its exact Zod schemas and output types, replacing its GraphQL string with a selector over the fetched document. Hooks and routes are untouched, which makes the existing unit and e2e suites the regression test for the whole migration.

**Tech Stack:** TypeScript strict, Zod, TanStack Query, `jsonpath-plus`, Vitest, Playwright.

**Spec:** [`docs/superpowers/specs/2026-08-18-json-api-migration-design.md`](../superpowers/specs/2026-08-18-json-api-migration-design.md)

## Global Constraints

- **Base URL:** `https://json.tarkov.dev/regular/`. Game mode is `regular` only; `pve` and `pvp-season` are out of scope.
- **Language:** `en` only. Untranslated keys pass through unchanged — never throw, never blank.
- **Domain types are frozen.** Every exported type from `packages/tarkov-data` keeps its exact shape. If a task tempts you to change one, stop — that is a spec violation, not a judgement call.
- **`data.items` is an object keyed by id**, not an array. Selectors call `Object.values()` once.
- **`properties.propertiesType` replaces GraphQL's `properties.__typename`.** The _values_ are identical strings (`ItemPropertiesAmmo`, `ItemPropertiesWeapon`, `ItemPropertiesWeaponMod`, …) — only the key name changes.
- **Keep the `safeParse`-and-drop discipline.** The document mixes all 5312 items, so per-item validation failures must drop that item and never fail the call. Keep the existing `console.debug` filtered-count lines.
- **Toolchain:** run everything through mise shims. `pnpm -v` must report `10.34.5`, `node -v` must report `v22.x`. If `pnpm` is not found, prefix with `mise exec --`.
- **Commits:** Conventional Commits. Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`, `perf`, `style`, `revert`.
- **Per-package `tsconfig.json` is required**, and new test files need a glob in `eslint.config.js` under `parserOptions.projectService.allowDefaultProject`.
- **One arc, one branch, one PR.**

---

## Arc 1 — Transport and translation merge

**Branch:** `feat/json-api-transport`

### Task 1: Merge translations generically

**Files:**

- Create: `packages/tarkov-data/src/translations.ts`
- Create: `packages/tarkov-data/src/translations.test.ts`
- Modify: `packages/tarkov-data/package.json` (add `jsonpath-plus`)
- Modify: `eslint.config.js`

**Interfaces:**

- Consumes: nothing.
- Produces: `interface TranslatedDocument<T> { data: T; translations?: readonly string[] }` and `mergeTranslations<T>(doc: TranslatedDocument<T>, lang: Record<string, string>): T`.

- [ ] **Step 1: Add the dependency**

In `packages/tarkov-data/package.json` `dependencies`, add:

```json
    "jsonpath-plus": "^10.3.0",
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test `packages/tarkov-data/src/translations.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { mergeTranslations } from "./translations.js";

describe("mergeTranslations", () => {
  it("substitutes translation keys named by the upstream JSONPath list", () => {
    const doc = {
      data: { traders: { t1: { id: "t1", name: "t1 Nickname" } } },
      translations: ["$.data.traders.*.name"],
    };
    const merged = mergeTranslations(doc, { "t1 Nickname": "Prapor" });
    expect(merged.traders.t1.name).toBe("Prapor");
  });

  it("leaves a key in place when no translation exists", () => {
    const doc = {
      data: { traders: { t1: { id: "t1", name: "t1 Nickname" } } },
      translations: ["$.data.traders.*.name"],
    };
    const merged = mergeTranslations(doc, {});
    expect(merged.traders.t1.name).toBe("t1 Nickname");
  });

  it("returns data untouched when the document declares no translations", () => {
    const doc = { data: { a: 1 } };
    expect(mergeTranslations(doc, {})).toEqual({ a: 1 });
  });

  it("handles nested array paths", () => {
    const doc = {
      data: { tasks: { q1: { objectives: [{ description: "q1 Obj" }] } } },
      translations: ["$.data.tasks.*.objectives[*].description"],
    };
    const merged = mergeTranslations(doc, { "q1 Obj": "Find the thing" });
    expect(merged.tasks.q1.objectives[0].description).toBe("Find the thing");
  });

  it("ignores a malformed JSONPath instead of failing the whole merge", () => {
    const doc = {
      data: { traders: { t1: { name: "t1 Nickname" } } },
      translations: ["$$$[not-a-path", "$.data.traders.*.name"],
    };
    const merged = mergeTranslations(doc, { "t1 Nickname": "Prapor" });
    expect(merged.traders.t1.name).toBe("Prapor");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @tarkov/data test -- translations`
Expected: FAIL — `translations.js` does not exist.

- [ ] **Step 4: Implement `packages/tarkov-data/src/translations.ts`**

```ts
import { JSONPath } from "jsonpath-plus";

/** An upstream document: payload plus the JSONPaths whose values are translation keys. */
export interface TranslatedDocument<T> {
  data: T;
  translations?: readonly string[];
}

/**
 * Replace every translation key named by `doc.translations` with its translated text.
 *
 * The path list is supplied by upstream rather than hard-coded here on purpose: they add
 * paths without warning, and a hard-coded list would silently stop translating new fields
 * instead of failing visibly. A key with no translation passes through unchanged, which is
 * what the reference client (the-hideout/tarkov-dev src/modules/api-request.mjs) does.
 */
export function mergeTranslations<T>(doc: TranslatedDocument<T>, lang: Record<string, string>): T {
  for (const path of doc.translations ?? []) {
    try {
      JSONPath({
        path,
        json: doc as unknown as object,
        resultType: "all",
        callback: (result: unknown) => {
          const { value, parent, parentProperty } = result as {
            value: unknown;
            parent: Record<string, unknown>;
            parentProperty: string;
          };
          if (typeof value !== "string") return;
          parent[parentProperty] = lang[value] ?? value;
        },
      });
    } catch {
      // A malformed or unmatched path must not take the rest of the merge with it.
      continue;
    }
  }
  return doc.data;
}
```

- [ ] **Step 5: Register the test glob with ESLint**

In `eslint.config.js`, inside `parserOptions.projectService.allowDefaultProject`, next to the
other `packages/tarkov-data` entries, confirm `"packages/tarkov-data/src/*.test.ts"` is present.
It already is — no edit needed unless the array has changed.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @tarkov/data test -- translations`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/tarkov-data/src/translations.ts packages/tarkov-data/src/translations.test.ts \
        packages/tarkov-data/package.json pnpm-lock.yaml
git commit -m "feat(data): merge upstream translation keys via their JSONPath list

json.tarkov.dev returns text fields as translation keys and a sibling
_{lang} document. The path list is driven by upstream rather than
hard-coded, so new translated fields do not silently stop translating."
```

### Task 2: Replace the GraphQL client with a JSON client

**Files:**

- Modify: `packages/tarkov-data/src/client.ts`
- Create: `packages/tarkov-data/src/client.test.ts`

**Interfaces:**

- Consumes: `mergeTranslations`, `TranslatedDocument` from Task 1.
- Produces: `interface TarkovJsonClient { fetchResource<T>(resource: string): Promise<T> }`, `class TarkovApiError extends Error { resource: string; status: number }`, and `createTarkovClient(baseUrl: string, fetchImpl?: typeof fetch): TarkovJsonClient`.

- [ ] **Step 1: Write the failing test `packages/tarkov-data/src/client.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { createTarkovClient, TarkovApiError } from "./client.js";

function stubFetch(routes: Record<string, unknown>, status = 200): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    if (!key) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[key]), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("createTarkovClient", () => {
  it("fetches a resource and merges its _en translations", async () => {
    const client = createTarkovClient(
      "https://json.tarkov.dev/regular/",
      stubFetch({
        "/traders": {
          data: { t1: { id: "t1", name: "t1 Nickname" } },
          translations: ["$.data.*.name"],
        },
        "/traders_en": { data: { "t1 Nickname": "Prapor" } },
      }),
    );
    const result = await client.fetchResource<Record<string, { name: string }>>("traders");
    expect(result.t1.name).toBe("Prapor");
  });

  it("still returns data when the translation document is missing", async () => {
    const client = createTarkovClient(
      "https://json.tarkov.dev/regular/",
      stubFetch({
        "/traders": { data: { t1: { name: "t1 Nickname" } }, translations: ["$.data.*.name"] },
      }),
    );
    const result = await client.fetchResource<Record<string, { name: string }>>("traders");
    expect(result.t1.name).toBe("t1 Nickname");
  });

  it("throws TarkovApiError carrying the resource and status", async () => {
    const client = createTarkovClient("https://json.tarkov.dev/regular/", stubFetch({}, 500));
    await expect(client.fetchResource("items")).rejects.toMatchObject({
      name: "TarkovApiError",
      resource: "items",
      status: 404,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @tarkov/data test -- client`
Expected: FAIL — `createTarkovClient` still returns a `GraphQLClient` and `TarkovApiError` does not exist.

- [ ] **Step 3: Rewrite `packages/tarkov-data/src/client.ts`**

```ts
import { mergeTranslations } from "./translations.js";
import type { TranslatedDocument } from "./translations.js";

/** Thrown when an upstream resource cannot be fetched or parsed. */
export class TarkovApiError extends Error {
  override name = "TarkovApiError";
  constructor(
    message: string,
    readonly resource: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface TarkovJsonClient {
  /** Fetch one resource with its `_en` translations already merged in. */
  fetchResource<T>(resource: string): Promise<T>;
}

/**
 * Construct a client for the json.tarkov.dev API.
 *
 * @param baseUrl - Base including game mode and trailing slash, e.g.
 *                  `https://json.tarkov.dev/regular/`.
 * @param fetchImpl - Optional fetch implementation (defaults to global fetch).
 */
export function createTarkovClient(baseUrl: string, fetchImpl?: typeof fetch): TarkovJsonClient {
  const doFetch = fetchImpl ?? fetch;

  async function getJson(resource: string, required: boolean): Promise<unknown> {
    const response = await doFetch(`${baseUrl}${resource}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      if (!required) return undefined;
      throw new TarkovApiError(
        `Failed to fetch ${resource}: ${response.status} ${response.statusText}`,
        resource,
        response.status,
      );
    }
    return response.json();
  }

  return {
    async fetchResource<T>(resource: string): Promise<T> {
      // Data and translations are independent requests; issue them together. The
      // translation document is optional — a missing one leaves keys in place rather
      // than failing a request that has perfectly good data.
      const [raw, lang] = await Promise.all([
        getJson(resource, true),
        getJson(`${resource}_en`, false).catch(() => undefined),
      ]);

      const doc = raw as TranslatedDocument<T>;
      const langData = (lang as { data?: Record<string, string> } | undefined)?.data ?? {};
      return mergeTranslations(doc, langData);
    },
  };
}

export type { TranslatedDocument };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @tarkov/data test -- client`
Expected: PASS, 3 tests.

Other query tests will now fail to typecheck because they pass a `GraphQLClient`. That is
expected and Arc 2 fixes them; do not patch them here.

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-data/src/client.ts packages/tarkov-data/src/client.test.ts
git commit -m "feat(data): replace the GraphQL client with a json.tarkov.dev client

api.tarkov.dev/graphql has been down since ~2026-07-21. fetchResource
pulls a resource and its _en sibling in parallel and merges them; a
missing translation document degrades to raw keys rather than failing."
```

### Task 3: Point the app at the JSON API

**Files:**

- Modify: `apps/web/src/tarkov-client.ts`
- Modify: `apps/web/src/tarkov-client.test.ts`
- Modify: `packages/tarkov-data/src/provider.tsx`

**Interfaces:**

- Consumes: `createTarkovClient`, `TarkovJsonClient` from Task 2.
- Produces: `TARKOV_JSON_API_BASE = "https://json.tarkov.dev/regular/"`; `useTarkovClient(): TarkovJsonClient`.

- [ ] **Step 1: Update the endpoint test `apps/web/src/tarkov-client.test.ts`**

Replace the existing endpoint assertion with:

```ts
it("is configured for the json.tarkov.dev regular game mode", () => {
  expect(TARKOV_JSON_API_BASE).toBe("https://json.tarkov.dev/regular/");
});
```

Update the import at the top of the file from `TARKOV_GRAPHQL_ENDPOINT` to `TARKOV_JSON_API_BASE`.

- [ ] **Step 2: Rewrite `apps/web/src/tarkov-client.ts`**

```ts
import { createTarkovClient } from "@tarkov/data";
import type { TarkovJsonClient } from "@tarkov/data";

/**
 * Base URL for the tarkov.dev JSON API, including game mode.
 *
 * The GraphQL API this project originally used (api.tarkov.dev/graphql) has been
 * unavailable since ~2026-07-21; tarkov.dev itself runs on this JSON API.
 * See the-hideout/tarkov-api#474.
 */
export const TARKOV_JSON_API_BASE = "https://json.tarkov.dev/regular/";

export const tarkovClient: TarkovJsonClient = createTarkovClient(TARKOV_JSON_API_BASE);
```

- [ ] **Step 3: Update the provider's client type**

In `packages/tarkov-data/src/provider.tsx`, replace every `GraphQLClient` type reference with
`TarkovJsonClient`, importing it from `./client.js`. The context value, provider props, and
`useTarkovClient` return type all change type only — no behaviour changes.

- [ ] **Step 4: Export the new surface**

In `packages/tarkov-data/src/index.ts`, replace the `GraphQLClient` export with:

```ts
export { createTarkovClient, TarkovApiError } from "./client.js";
export type { TarkovJsonClient } from "./client.js";
export { mergeTranslations } from "./translations.js";
export type { TranslatedDocument } from "./translations.js";
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @tarkov/web test -- tarkov-client`
Expected: PASS.

`pnpm typecheck` still fails in `packages/tarkov-data/src/queries/*` — those are Arc 2's job.

- [ ] **Step 6: Commit and open the Arc 1 PR**

```bash
git add apps/web/src/tarkov-client.ts apps/web/src/tarkov-client.test.ts \
        packages/tarkov-data/src/provider.tsx packages/tarkov-data/src/index.ts
git commit -m "feat(web): point the app at json.tarkov.dev"
git push -u origin feat/json-api-transport
gh pr create --title "feat(data): JSON API transport layer" --body "$(cat <<'BODY'
Arc 1 of 4 from the JSON API migration spec.

Transport only — no query or route changes yet. `packages/tarkov-data` gains a JSON client that
fetches a resource plus its `_en` translation sibling and merges them using the JSONPath list
upstream supplies.

Query modules still reference the old client and do not typecheck; Arc 2 rewrites them. The
stack is `feat/json-api-transport` -> `feat/json-api-item-queries`.

Spec: `docs/superpowers/specs/2026-08-18-json-api-migration-design.md`
BODY
)"
```

---

## Arc 2 — Item queries as selectors

**Branch:** `feat/json-api-item-queries` (stacked on `feat/json-api-transport`)

### Task 4: Cache resources in the client so six queries cost one fetch

**Files:**

- Modify: `packages/tarkov-data/src/client.ts`
- Modify: `packages/tarkov-data/src/client.test.ts`

**Interfaces:**

- Consumes: Task 2's client.
- Produces: unchanged public signature. `createTarkovClient(baseUrl, fetchImpl?, ttlMs?)` gains an optional third parameter defaulting to `3_600_000`.

**Why this task exists:** six query modules each call `client.fetchResource("items")`, and that
document is 1.36 MB gzipped. Caching inside the client keeps every existing `fetchX(client)`
signature — and therefore every hook — completely unchanged, which is worth far more than
restructuring the hooks to share one TanStack entry.

- [ ] **Step 1: Add the failing tests to `packages/tarkov-data/src/client.test.ts`**

```ts
it("fetches a resource once and serves repeats from cache", async () => {
  const spy = stubFetch({ "/items": { data: { a: 1 } }, "/items_en": { data: {} } });
  const client = createTarkovClient("https://json.tarkov.dev/regular/", spy);
  await client.fetchResource("items");
  await client.fetchResource("items");
  // 2 calls for the first fetch (resource + _en), none for the second.
  expect((spy as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2);
});

it("dedupes concurrent requests for the same resource", async () => {
  const spy = stubFetch({ "/items": { data: { a: 1 } }, "/items_en": { data: {} } });
  const client = createTarkovClient("https://json.tarkov.dev/regular/", spy);
  await Promise.all([client.fetchResource("items"), client.fetchResource("items")]);
  expect((spy as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2);
});

it("does not cache a failure", async () => {
  let attempt = 0;
  const flaky = (async () => {
    attempt += 1;
    if (attempt === 1) return new Response("boom", { status: 500 });
    return new Response(JSON.stringify({ data: { a: 1 } }), { status: 200 });
  }) as unknown as typeof fetch;
  const client = createTarkovClient("https://json.tarkov.dev/regular/", flaky);
  await expect(client.fetchResource("items")).rejects.toBeInstanceOf(TarkovApiError);
  await expect(client.fetchResource("items")).resolves.toEqual({ a: 1 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @tarkov/data test -- client`
Expected: FAIL — the first test sees 4 fetch calls, not 2.

- [ ] **Step 3: Add the cache to `packages/tarkov-data/src/client.ts`**

Inside `createTarkovClient`, above the returned object:

```ts
interface CacheEntry {
  at: number;
  promise: Promise<unknown>;
}
const cache = new Map<string, CacheEntry>();
```

Then replace the returned `fetchResource` body with:

```ts
    async fetchResource<T>(resource: string): Promise<T> {
      const now = Date.now();
      const hit = cache.get(resource);
      if (hit && now - hit.at < ttlMs) return hit.promise as Promise<T>;

      const promise = (async () => {
        const [raw, lang] = await Promise.all([
          getJson(resource, true),
          getJson(`${resource}_en`, false).catch(() => undefined),
        ]);
        const doc = raw as TranslatedDocument<T>;
        const langData = (lang as { data?: Record<string, string> } | undefined)?.data ?? {};
        return mergeTranslations(doc, langData);
      })();

      // A rejected fetch must not be cached: an upstream blip would otherwise poison the
      // client for a full TTL, which is exactly how a transient outage becomes a lasting one.
      promise.catch(() => cache.delete(resource));
      cache.set(resource, { at: now, promise });
      return promise as Promise<T>;
    },
```

And change the signature to:

```ts
export function createTarkovClient(
  baseUrl: string,
  fetchImpl?: typeof fetch,
  ttlMs = 3_600_000,
): TarkovJsonClient {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @tarkov/data test -- client`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-data/src/client.ts packages/tarkov-data/src/client.test.ts
git commit -m "feat(data): cache resources in the client with a 1h TTL

Six query modules read the same 1.36MB items document. Caching in the
client keeps every fetchX(client) signature unchanged. Failures are
never cached, so an upstream blip cannot poison the client for an hour."
```

### Task 5: Capture live fixtures

**Files:**

- Create: `packages/tarkov-data/src/__fixtures__/items-sample.json`
- Create: `packages/tarkov-data/src/__fixtures__/tasks-sample.json`
- Create: `packages/tarkov-data/src/__fixtures__/traders-sample.json`
- Create: `packages/tarkov-data/src/__fixtures__/README.md`

**Interfaces:**

- Consumes: nothing.
- Produces: fixture JSON consumed by every selector test in Tasks 6-11.

**Why:** the suite must not depend on upstream being up — that is the failure this whole
migration answers. Fixtures are trimmed to a handful of representative items so they stay
reviewable in a diff.

- [ ] **Step 1: Capture and trim**

```bash
mkdir -p packages/tarkov-data/src/__fixtures__
node --input-type=module -e '
const base = "https://json.tarkov.dev/regular/";
const get = async (r) => (await fetch(base + r, { headers: { Accept: "application/json" } })).json();
const [items, itemsEn, tasks, tasksEn, traders, tradersEn] = await Promise.all(
  ["items", "items_en", "tasks", "tasks_en", "traders", "traders_en"].map(get),
);
const all = Object.values(items.data.items);
const pickBy = (pred, n) => all.filter(pred).slice(0, n);
const keep = [
  ...pickBy((i) => i.properties?.propertiesType === "ItemPropertiesAmmo", 3),
  ...pickBy((i) => i.properties?.propertiesType === "ItemPropertiesArmor", 2),
  ...pickBy((i) => i.properties?.propertiesType === "ItemPropertiesWeapon", 2),
  ...pickBy((i) => i.properties?.propertiesType === "ItemPropertiesWeaponMod", 3),
  ...pickBy((i) => i.properties?.propertiesType === "ItemPropertiesGrenade", 1),
];
const lang = {};
for (const it of keep) for (const k of [it.name, it.shortName, it.description])
  if (typeof k === "string" && itemsEn.data[k]) lang[k] = itemsEn.data[k];
const fs = await import("node:fs/promises");
await fs.writeFile("packages/tarkov-data/src/__fixtures__/items-sample.json", JSON.stringify({
  document: { data: { items: Object.fromEntries(keep.map((i) => [i.id, i])) }, translations: items.translations },
  lang,
}, null, 2));
const taskKeep = Object.values(tasks.data.tasks).filter((t) =>
  ["gunsmith-master-part-1", "gunsmith-m4a1", "setup", "eagle-eye"].includes(t.normalizedName));
const taskLang = {};
for (const t of taskKeep) if (tasksEn.data[t.name]) taskLang[t.name] = tasksEn.data[t.name];
await fs.writeFile("packages/tarkov-data/src/__fixtures__/tasks-sample.json", JSON.stringify({
  document: { data: { tasks: Object.fromEntries(taskKeep.map((t) => [t.id, t])) }, translations: tasks.translations },
  lang: taskLang,
}, null, 2));
const traderKeep = Object.values(traders.data).slice(0, 4);
const traderLang = {};
for (const t of traderKeep) if (tradersEn.data[t.name]) traderLang[t.name] = tradersEn.data[t.name];
await fs.writeFile("packages/tarkov-data/src/__fixtures__/traders-sample.json", JSON.stringify({
  document: { data: Object.fromEntries(traderKeep.map((t) => [t.id, t])), translations: traders.translations },
  lang: traderLang,
}, null, 2));
console.log("fixtures written");
'
```

- [ ] **Step 2: Write `packages/tarkov-data/src/__fixtures__/README.md`**

```markdown
# Upstream fixtures

Trimmed captures of `json.tarkov.dev/regular/{items,tasks,traders}` and their `_en` siblings,
taken 2026-08-18. Each file is `{ document, lang }` — `document` is the raw upstream envelope
(`{ data, translations }`), `lang` is the subset of the `_en` map those records need.

They exist so the suite does not depend on upstream being reachable. The GraphQL API this
project used to call went down for over a month; tests that need a live API stop being tests.

**Refresh** with the capture script in Task 5 of
`docs/plans/2026-08-18-json-api-migration-plan.md` when upstream shapes change.
```

- [ ] **Step 3: Sanity-check the fixture**

Run:

```bash
node -e 'const f=require("./packages/tarkov-data/src/__fixtures__/items-sample.json");
console.log("items:", Object.keys(f.document.data.items).length, "lang keys:", Object.keys(f.lang).length);'
```

Expected: `items: 11` and a non-zero lang key count.

- [ ] **Step 4: Commit**

```bash
git add packages/tarkov-data/src/__fixtures__
git commit -m "test(data): capture trimmed json.tarkov.dev fixtures

The suite must not need upstream to be up — that is the failure this
migration exists to answer."
```

### Task 6: `ammoList` as a selector

**Files:**

- Create: `packages/tarkov-data/src/queries/documents.ts`
- Modify: `packages/tarkov-data/src/queries/ammoList.ts`
- Modify: `packages/tarkov-data/src/queries/ammoList.test.ts`

**Interfaces:**

- Consumes: `TarkovJsonClient` (Task 2), fixtures (Task 5).
- Produces: `ItemsDocument` and `TasksDocument` from `queries/documents.js`, shared by every later selector; `fetchAmmoList(client: TarkovJsonClient): Promise<AmmoListItem[]>` — **`AmmoListItem` is unchanged**.

This task is the template for Tasks 7-9. Read it fully before those.

- [ ] **Step 1: Rewrite the test to drive from the fixture**

Replace `packages/tarkov-data/src/queries/ammoList.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { fetchAmmoList } from "./ammoList.js";
import type { TarkovJsonClient } from "../client.js";
import fixture from "../__fixtures__/items-sample.json" with { type: "json" };
import { mergeTranslations } from "../translations.js";

function fixtureClient(): TarkovJsonClient {
  return {
    fetchResource: <T>() =>
      Promise.resolve(
        mergeTranslations(fixture.document as never, fixture.lang as Record<string, string>) as T,
      ),
  };
}

describe("fetchAmmoList", () => {
  it("returns only ItemPropertiesAmmo items", async () => {
    const list = await fetchAmmoList(fixtureClient());
    expect(list.length).toBeGreaterThan(0);
    for (const ammo of list) {
      expect(typeof ammo.penetrationPower).toBe("number");
      expect(typeof ammo.caliber).toBe("string");
    }
  });

  it("drops grenades and anything else that fails the schema", async () => {
    const list = await fetchAmmoList(fixtureClient());
    const ids = new Set(list.map((a) => a.id));
    const grenade = Object.values(fixture.document.data.items).find(
      (i: { properties?: { propertiesType?: string } }) =>
        i.properties?.propertiesType === "ItemPropertiesGrenade",
    ) as { id: string } | undefined;
    if (grenade) expect(ids.has(grenade.id)).toBe(false);
  });

  it("resolves translated names rather than translation keys", async () => {
    const list = await fetchAmmoList(fixtureClient());
    for (const ammo of list) expect(ammo.name).not.toMatch(/ Name$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @tarkov/data test -- ammoList`
Expected: FAIL — `fetchAmmoList` still takes a `GraphQLClient` and issues a GraphQL request.

- [ ] **Step 3: Rewrite `packages/tarkov-data/src/queries/ammoList.ts`**

Delete `AMMO_LIST_QUERY` and `ammoListEnvelopeSchema`. Keep `ammoItemSchema` and
`AmmoListItem` **exactly as they are**, with one change — the discriminator key:

```ts
const ammoPropertiesSchema = z.object({
  propertiesType: z.literal("ItemPropertiesAmmo"),
  caliber: z.string(),
  penetrationPower: z.number(),
  damage: z.number(),
  armorDamage: z.number(),
  projectileCount: z.number(),
});
```

First create `packages/tarkov-data/src/queries/documents.ts`, which every selector shares:

```ts
/** The upstream items document, after translation merge. Keyed by item id. */
export interface ItemsDocument {
  items: Record<string, unknown>;
}

/** The upstream tasks document, after translation merge. Keyed by task id. */
export interface TasksDocument {
  tasks: Record<string, unknown>;
}
```

Then add the new fetch to `ammoList.ts`:

```ts
import type { TarkovJsonClient } from "../client.js";
import type { ItemsDocument } from "./documents.js";

/**
 * Fetch the full list of ammo items.
 *
 * The upstream document holds every item type in one map keyed by id, so this selects by
 * `propertiesType` and `safeParse`s each candidate, dropping the ones that do not match.
 * A single unrelated item shape never fails the whole call.
 */
export async function fetchAmmoList(client: TarkovJsonClient): Promise<AmmoListItem[]> {
  const doc = await client.fetchResource<ItemsDocument>("items");
  const all = Object.values(doc.items);
  const ammoItems: AmmoListItem[] = [];
  for (const item of all) {
    const result = ammoItemSchema.safeParse(item);
    if (result.success) ammoItems.push(result.data);
  }
  if (ammoItems.length < all.length && typeof console !== "undefined") {
    console.debug(
      `[fetchAmmoList] filtered ${all.length - ammoItems.length} non-ammo items (kept ${ammoItems.length}/${all.length})`,
    );
  }
  return ammoItems;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @tarkov/data test -- ammoList`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-data/src/queries/ammoList.ts packages/tarkov-data/src/queries/ammoList.test.ts
git commit -m "feat(data): select ammo from the items document

AmmoListItem is unchanged; only the discriminator key moves from
__typename to propertiesType. The values are identical strings."
```

### Task 7: `armorList` as a selector

**Files:**

- Modify: `packages/tarkov-data/src/queries/armorList.ts`
- Modify: `packages/tarkov-data/src/queries/armorList.test.ts`

**Interfaces:**

- Consumes: `TarkovJsonClient` (Task 2), `ItemsDocument` from `queries/documents.js` (Task 6).
- Produces: `fetchArmorList(client: TarkovJsonClient): Promise<ArmorListItem[]>` — `ArmorListItem` unchanged.

- [ ] **Step 1: Rewrite the test**

Use the same `fixtureClient()` helper shown in Task 6 Step 1, then:

```ts
describe("fetchArmorList", () => {
  it("returns only armor items with a class and durability", async () => {
    const list = await fetchArmorList(fixtureClient());
    expect(list.length).toBeGreaterThan(0);
    for (const armor of list) {
      expect(typeof armor.class).toBe("number");
      expect(typeof armor.durability).toBe("number");
    }
  });

  it("resolves translated names", async () => {
    const list = await fetchArmorList(fixtureClient());
    for (const armor of list) expect(armor.name).not.toMatch(/ Name$/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @tarkov/data test -- armorList`
Expected: FAIL.

- [ ] **Step 3: Rewrite the module**

Change the properties discriminator from `__typename: z.literal("ItemPropertiesArmor")` to
`propertiesType: z.literal("ItemPropertiesArmor")`, delete the GraphQL string and envelope
schema, and replace the fetch with the Task 6 shape:

```ts
export async function fetchArmorList(client: TarkovJsonClient): Promise<ArmorListItem[]> {
  const doc = await client.fetchResource<ItemsDocument>("items");
  const all = Object.values(doc.items);
  const armorItems: ArmorListItem[] = [];
  for (const item of all) {
    const result = armorItemSchema.safeParse(item);
    if (result.success) armorItems.push(result.data);
  }
  if (armorItems.length < all.length && typeof console !== "undefined") {
    console.debug(
      `[fetchArmorList] filtered ${all.length - armorItems.length} non-armor items (kept ${armorItems.length}/${all.length})`,
    );
  }
  return armorItems;
}
```

**Watch for:** upstream also has `ItemPropertiesArmorAttachment` and `ItemPropertiesHelmet`. If
`ArmorListItem` previously included helmets, the literal must become
`z.enum(["ItemPropertiesArmor", "ItemPropertiesHelmet"])` — check the pre-migration schema and
preserve whichever set it accepted. Do not silently narrow the list.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @tarkov/data test -- armorList`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-data/src/queries/armorList.ts packages/tarkov-data/src/queries/armorList.test.ts
git commit -m "feat(data): select armor from the items document"
```

### Task 8: `modList` as a selector

**Files:**

- Modify: `packages/tarkov-data/src/queries/modList.ts`
- Modify: `packages/tarkov-data/src/queries/modList.test.ts`

**Interfaces:**

- Consumes: `TarkovJsonClient` (Task 2), `ItemsDocument` from `queries/documents.js` (Task 6).
- Produces: `fetchModList(client: TarkovJsonClient): Promise<ModListItem[]>` — `ModListItem` unchanged.

- [ ] **Step 1: Rewrite the test using the Task 6 `fixtureClient()` helper**

```ts
describe("fetchModList", () => {
  it("returns weapon mods with their ergonomics and recoil modifiers", async () => {
    const list = await fetchModList(fixtureClient());
    expect(list.length).toBeGreaterThan(0);
    for (const mod of list) {
      expect(typeof mod.ergonomics === "number" || mod.ergonomics === null).toBe(true);
    }
  });

  it("does not return guns", async () => {
    const list = await fetchModList(fixtureClient());
    const guns = Object.values(fixture.document.data.items).filter(
      (i: { properties?: { propertiesType?: string } }) =>
        i.properties?.propertiesType === "ItemPropertiesWeapon",
    ) as { id: string }[];
    const ids = new Set(list.map((m) => m.id));
    for (const gun of guns) expect(ids.has(gun.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @tarkov/data test -- modList`

- [ ] **Step 3: Rewrite the module**

Discriminator becomes `propertiesType: z.literal("ItemPropertiesWeaponMod")`. Delete the GraphQL
string and envelope schema. Fetch body:

```ts
export async function fetchModList(client: TarkovJsonClient): Promise<ModListItem[]> {
  const doc = await client.fetchResource<ItemsDocument>("items");
  const all = Object.values(doc.items);
  const mods: ModListItem[] = [];
  for (const item of all) {
    const result = modItemSchema.safeParse(item);
    if (result.success) mods.push(result.data);
  }
  if (mods.length < all.length && typeof console !== "undefined") {
    console.debug(
      `[fetchModList] filtered ${all.length - mods.length} non-mod items (kept ${mods.length}/${all.length})`,
    );
  }
  return mods;
}
```

**Watch for:** upstream also carries `ItemPropertiesBarrel`, `ItemPropertiesMagazine`,
`ItemPropertiesScope` and `ItemPropertiesNightVision` — all of which are attachable mods. Check
which `__typename` values the pre-migration schema accepted and widen the literal to a
`z.enum([...])` covering the same set. Narrowing here silently removes mods from the Builder.

- [ ] **Step 4: Run to verify it passes** — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-data/src/queries/modList.ts packages/tarkov-data/src/queries/modList.test.ts
git commit -m "feat(data): select weapon mods from the items document"
```

### Task 9: `weaponList` and `weapon` as selectors

**Files:**

- Modify: `packages/tarkov-data/src/queries/weaponList.ts`
- Modify: `packages/tarkov-data/src/queries/weaponList.test.ts`
- Modify: `packages/tarkov-data/src/queries/weapon.ts`
- Modify: `packages/tarkov-data/src/queries/weapon.test.ts`

**Interfaces:**

- Consumes: `TarkovJsonClient` (Task 2), `ItemsDocument` from `queries/documents.js` (Task 6).
- Produces: `fetchWeaponList(client: TarkovJsonClient): Promise<WeaponListItem[]>` and `fetchWeapon(client: TarkovJsonClient, id: string): Promise<WeaponDetail | null>` — both output types unchanged.

- [ ] **Step 1: Rewrite both tests**

```ts
describe("fetchWeaponList", () => {
  it("returns guns with caliber, ergonomics and recoil", async () => {
    const list = await fetchWeaponList(fixtureClient());
    expect(list.length).toBeGreaterThan(0);
    for (const w of list) {
      expect(typeof w.caliber).toBe("string");
      expect(typeof w.ergonomics).toBe("number");
    }
  });
});

describe("fetchWeapon", () => {
  it("returns one weapon by id", async () => {
    const list = await fetchWeaponList(fixtureClient());
    const found = await fetchWeapon(fixtureClient(), list[0]!.id);
    expect(found?.id).toBe(list[0]!.id);
  });

  it("returns null for an unknown id", async () => {
    expect(await fetchWeapon(fixtureClient(), "no-such-id")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @tarkov/data test -- weapon`

- [ ] **Step 3: Rewrite both modules**

Discriminator becomes `propertiesType: z.literal("ItemPropertiesWeapon")`.

```ts
export async function fetchWeaponList(client: TarkovJsonClient): Promise<WeaponListItem[]> {
  const doc = await client.fetchResource<ItemsDocument>("items");
  const all = Object.values(doc.items);
  const weapons: WeaponListItem[] = [];
  for (const item of all) {
    const result = weaponItemSchema.safeParse(item);
    if (result.success) weapons.push(result.data);
  }
  if (weapons.length < all.length && typeof console !== "undefined") {
    console.debug(
      `[fetchWeaponList] filtered ${all.length - weapons.length} non-weapon items (kept ${weapons.length}/${all.length})`,
    );
  }
  return weapons;
}
```

`fetchWeapon` selects the single record rather than scanning, because the document is keyed by id:

```ts
export async function fetchWeapon(
  client: TarkovJsonClient,
  id: string,
): Promise<WeaponDetail | null> {
  const doc = await client.fetchResource<ItemsDocument>("items");
  const raw = doc.items[id];
  if (raw === undefined) return null;
  const result = weaponDetailSchema.safeParse(raw);
  return result.success ? result.data : null;
}
```

- [ ] **Step 4: Run to verify they pass** — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-data/src/queries/weapon.ts packages/tarkov-data/src/queries/weapon.test.ts \
        packages/tarkov-data/src/queries/weaponList.ts packages/tarkov-data/src/queries/weaponList.test.ts
git commit -m "feat(data): select weapons from the items document

fetchWeapon indexes the id-keyed map directly rather than scanning."
```

### Task 10: `weaponTree` as a selector

**Files:**

- Modify: `packages/tarkov-data/src/queries/weaponTree.ts`
- Modify: `packages/tarkov-data/src/queries/weaponTree.test.ts`

**Interfaces:**

- Consumes: `TarkovJsonClient` (Task 2), `ItemsDocument` from `queries/documents.js` (Task 6).
- Produces: `fetchWeaponTree(client: TarkovJsonClient, id: string): Promise<WeaponTree | null>` — `WeaponTree`, `SlotNode` unchanged.

This is the highest-risk selector: the Builder's whole slot UI depends on its shape.

- [ ] **Step 1: Rewrite the test**

```ts
describe("fetchWeaponTree", () => {
  it("builds a slot tree from the weapon's slots", async () => {
    const list = await fetchWeaponList(fixtureClient());
    const tree = await fetchWeaponTree(fixtureClient(), list[0]!.id);
    expect(tree).not.toBeNull();
    expect(Array.isArray(tree!.slots)).toBe(true);
    for (const slot of tree!.slots) {
      expect(typeof slot.id).toBe("string");
      expect(typeof slot.name).toBe("string");
      expect(Array.isArray(slot.allowedItems)).toBe(true);
    }
  });

  it("returns null for an unknown weapon id", async () => {
    expect(await fetchWeaponTree(fixtureClient(), "no-such-id")).toBeNull();
  });

  it("does not recurse past the existing depth limit", async () => {
    const list = await fetchWeaponList(fixtureClient());
    const tree = await fetchWeaponTree(fixtureClient(), list[0]!.id);
    const depth = (nodes: readonly { slots?: readonly unknown[] }[], d = 1): number =>
      nodes.reduce(
        (max, n) => Math.max(max, n.slots?.length ? depth(n.slots as never, d + 1) : d),
        d,
      );
    expect(depth(tree!.slots as never)).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @tarkov/data test -- weaponTree`

- [ ] **Step 3: Rewrite the module**

The upstream slot shape is:

```json
{ "id": "...", "nameId": "mod_muzzle", "name": "<key>", "required": false,
  "filters": { "allowedItems": ["<id>", ...], "allowedCategories": [...],
               "excludedItems": [...], "excludedCategories": [...] } }
```

Two differences from GraphQL to absorb here:

1. `filters.allowedItems` is an array of **id strings**, where GraphQL returned objects. The tree
   builder resolves each id against the same items document rather than reading nested objects.
2. `filters.allowedCategories` now exists. **Do not use it yet** — `allowedCategories` filtering is
   a deferred M1.5 item and belongs in its own change. Parse it into the schema so it is available,
   and leave the filtering logic alone.

Recursion depth stays exactly as it is today. Do not raise it in this task — depth 5 is a separate
deferred item and changing it here would confound a migration with a behaviour change.

- [ ] **Step 4: Run to verify it passes** — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-data/src/queries/weaponTree.ts packages/tarkov-data/src/queries/weaponTree.test.ts
git commit -m "feat(data): build the weapon slot tree from the items document

filters.allowedItems is now a list of ids resolved against the same
document. allowedCategories is parsed but deliberately unused — that
filtering is a separate deferred item."
```

### Task 11: `tasks` and `traders` resources

**Files:**

- Modify: `packages/tarkov-data/src/queries/tasks.ts`
- Modify: `packages/tarkov-data/src/queries/tasks.test.ts`
- Modify: `packages/tarkov-data/src/queries/traders.ts`
- Modify: `packages/tarkov-data/src/queries/traders.test.ts`

**Interfaces:**

- Consumes: `TarkovJsonClient`, fixtures from Task 5.
- Produces: `fetchTasks(client: TarkovJsonClient): Promise<TaskItem[]>`, `fetchTraders(client: TarkovJsonClient): Promise<TraderItem[]>` — both output types unchanged.

- [ ] **Step 1: Rewrite both tests to read the tasks/traders fixtures**

```ts
import tasksFixture from "../__fixtures__/tasks-sample.json" with { type: "json" };

function tasksClient(): TarkovJsonClient {
  return {
    fetchResource: <T>() =>
      Promise.resolve(
        mergeTranslations(
          tasksFixture.document as never,
          tasksFixture.lang as Record<string, string>,
        ) as T,
      ),
  };
}

describe("fetchTasks", () => {
  it("returns tasks with resolved names and normalizedName", async () => {
    const tasks = await fetchTasks(tasksClient());
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) {
      expect(typeof t.normalizedName).toBe("string");
      expect(t.name).not.toMatch(/ Name$/);
    }
  });
});
```

Mirror the same shape for `traders` against `traders-sample.json`.

- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @tarkov/data test -- tasks traders`

- [ ] **Step 3: Rewrite both modules**

```ts
import type { TasksDocument } from "./documents.js";

export async function fetchTasks(client: TarkovJsonClient): Promise<TaskItem[]> {
  const doc = await client.fetchResource<TasksDocument>("tasks");
  const all = Object.values(doc.tasks);
  const tasks: TaskItem[] = [];
  for (const raw of all) {
    const result = taskSchema.safeParse(raw);
    if (result.success) tasks.push(result.data);
  }
  return tasks;
}
```

The traders document's `data` is the trader map directly (no `traders` wrapper) — confirm against
`traders-sample.json` and select accordingly.

- [ ] **Step 4: Run to verify they pass** — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-data/src/queries/tasks.ts packages/tarkov-data/src/queries/tasks.test.ts \
        packages/tarkov-data/src/queries/traders.ts packages/tarkov-data/src/queries/traders.test.ts
git commit -m "feat(data): fetch tasks and traders from the JSON API"
```

### Task 12: Rebuild `buy-for` as a cross-resource join

**Files:**

- Modify: `packages/tarkov-data/src/queries/shared/buy-for.ts`
- Modify: `packages/tarkov-data/src/queries/shared/buy-for.test.ts`

**Interfaces:**

- Consumes: `fetchTasks`, `fetchTraders` (Task 11).
- Produces: `resolveBuyFor(item: unknown, traders: TraderItem[], tasks: TaskItem[]): BuyForEntry[]` — `BuyForEntry` keeps the pre-migration shape consumed by `itemAvailability`.

**Why this is the hardest task in the arc.** GraphQL embedded the resolved vendor:

```graphql
buyFor { priceRUB currency vendor { normalizedName minTraderLevel taskUnlock { normalizedName } } }
```

The JSON API returns bare ids and moves flea to a top-level field:

```json
{
  "trader": "5a7c2eca46aef81a7ca2145d",
  "priceRUB": 22997,
  "currency": "RUB",
  "minTraderLevel": 3,
  "taskUnlock": null,
  "buyLimit": 5
}
```

plus `"minLevelForFlea": 15` on the item itself.

- [ ] **Step 1: Write the failing test**

```ts
describe("resolveBuyFor", () => {
  const traders = [{ id: "tr1", normalizedName: "prapor", name: "Prapor" }] as never;
  const tasks = [{ id: "tk1", normalizedName: "gunsmith-master-part-1", name: "x" }] as never;

  it("resolves a trader id to its normalizedName", () => {
    const entries = resolveBuyFor(
      {
        buyFromTrader: [
          { trader: "tr1", priceRUB: 100, currency: "RUB", minTraderLevel: 2, taskUnlock: null },
        ],
      },
      traders,
      tasks,
    );
    expect(entries[0]).toMatchObject({
      priceRUB: 100,
      vendor: { normalizedName: "prapor", minTraderLevel: 2, taskUnlock: null },
    });
  });

  it("resolves a taskUnlock id to its normalizedName", () => {
    const entries = resolveBuyFor(
      {
        buyFromTrader: [
          { trader: "tr1", priceRUB: 100, currency: "RUB", minTraderLevel: 2, taskUnlock: "tk1" },
        ],
      },
      traders,
      tasks,
    );
    expect(entries[0]!.vendor.taskUnlock?.normalizedName).toBe("gunsmith-master-part-1");
  });

  it("emits a flea entry from the item's minLevelForFlea", () => {
    const entries = resolveBuyFor({ buyFromTrader: [], minLevelForFlea: 15 }, traders, tasks);
    expect(entries).toContainEqual(
      expect.objectContaining({
        vendor: expect.objectContaining({ normalizedName: "flea-market", minPlayerLevel: 15 }),
      }),
    );
  });

  it("drops an offer whose trader id is unknown rather than emitting a broken vendor", () => {
    const entries = resolveBuyFor(
      {
        buyFromTrader: [
          { trader: "ghost", priceRUB: 1, currency: "RUB", minTraderLevel: 1, taskUnlock: null },
        ],
      },
      traders,
      tasks,
    );
    expect(entries).toEqual([]);
  });

  it("returns no flea entry when the item cannot be sold on flea", () => {
    const entries = resolveBuyFor({ buyFromTrader: [] }, traders, tasks);
    expect(entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @tarkov/data test -- buy-for`

- [ ] **Step 3: Implement the join**

Delete `BUY_FOR_FRAGMENT`. Keep the output schemas. Build lookup maps once per call and resolve
each offer; emit a synthetic flea entry when `minLevelForFlea` is present. An offer whose trader id
resolves to nothing is dropped — a vendor with a missing `normalizedName` would silently fail every
availability comparison rather than erroring, which is worse than not offering it.

- [ ] **Step 4: Run to verify it passes** — expected PASS, 5 tests.

- [ ] **Step 5: Verify `itemAvailability` still behaves**

Run: `pnpm --filter @tarkov/data test -- item-availability`
Expected: PASS with no changes to `item-availability.ts`. If it fails, the join is producing a
different shape — fix the join, not the consumer.

- [ ] **Step 6: Commit**

```bash
git add packages/tarkov-data/src/queries/shared/buy-for.ts packages/tarkov-data/src/queries/shared/buy-for.test.ts
git commit -m "feat(data): resolve buyFor by joining traders and tasks

The JSON API returns bare trader and taskUnlock ids where GraphQL
embedded the resolved vendor, and moves flea availability to the item's
minLevelForFlea. itemAvailability is unchanged."
```

### Task 13: Wire the hooks up and prove the site works

**Files:**

- Modify: `packages/tarkov-data/src/hooks/*.ts` (type-only changes)

**Interfaces:**

- Consumes: everything in Arc 2.
- Produces: a working site.

- [ ] **Step 1: Update hook client types**

Each hook calls `useTarkovClient()` and passes the result to `fetchX`. The only change is the
inferred type; if any hook annotates `GraphQLClient` explicitly, change it to `TarkovJsonClient`.

- [ ] **Step 2: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all PASS. Zero references to `graphql-request` should remain outside `package.json`.

- [ ] **Step 3: Run the app and look at it**

```bash
pnpm dev
```

Open `http://localhost:5173/calc`, `/matrix`, `/data` and `/builder`. Confirm real item names
appear — not `<id> Name` strings. A page full of translation keys means Task 1's merge is not
being applied on that path.

- [ ] **Step 4: e2e**

Run: `pnpm --filter @tarkov/web test:e2e`
Expected: PASS, including the console-error gate.

This is the real acceptance test for the migration. If a route fails here, fix the selector rather
than relaxing the test.

- [ ] **Step 5: Commit and open the Arc 2 PR**

```bash
git add -A packages/tarkov-data/src/hooks
git commit -m "feat(data): point every hook at the JSON-backed queries"
git push -u origin feat/json-api-item-queries
gh pr create --title "feat(data): restore site data from json.tarkov.dev" --body "$(cat <<'BODY'
Arc 2 of 4. **This is the arc that restores production.**

Six item queries become selectors over the cached items document; tasks and traders are fetched
so `buyFor` can be rebuilt as a join (the JSON API returns bare trader/taskUnlock ids where
GraphQL embedded the resolved vendor).

Every domain type is unchanged, so the existing unit and e2e suites are the regression test.

Progression gating still uses the old `gunsmith-part-N` names and will under-report unlocks
until Arc 3 lands.

Spec: `docs/superpowers/specs/2026-08-18-json-api-migration-design.md`
BODY
)"
```

---

## Arc 3 — Quest restructure

**Branch:** `feat/json-api-quest-restructure` (stacked on `feat/json-api-item-queries`)

### Task 14: Adopt all 26 Gunsmith quests

**Files:**

- Modify: `packages/tarkov-data/src/marquee-quests.ts`
- Modify: `packages/tarkov-data/src/marquee-quests.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `MARQUEE_QUEST_NORMALIZED_NAMES: readonly string[]` (36 entries) and `MARQUEE_QUEST_GROUPS: readonly { label: string; quests: readonly string[] }[]`.

**Measured 2026-08-18:** `gunsmith-part-1` … `gunsmith-part-10` no longer exist upstream. There
are now 26 Gunsmith tasks. The other 10 curated quests are unchanged.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { MARQUEE_QUEST_NORMALIZED_NAMES, MARQUEE_QUEST_GROUPS } from "./marquee-quests.js";
import tasksFixture from "./__fixtures__/tasks-sample.json" with { type: "json" };

describe("marquee quests", () => {
  it("lists 36 quests", () => {
    expect(MARQUEE_QUEST_NORMALIZED_NAMES).toHaveLength(36);
  });

  it("no longer references the retired gunsmith-part-N names", () => {
    for (const name of MARQUEE_QUEST_NORMALIZED_NAMES) {
      expect(name).not.toMatch(/^gunsmith-part-\d+$/);
    }
  });

  it("groups cover every quest exactly once", () => {
    const grouped = MARQUEE_QUEST_GROUPS.flatMap((g) => g.quests);
    expect([...grouped].sort()).toEqual([...MARQUEE_QUEST_NORMALIZED_NAMES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("every listed quest exists upstream", () => {
    const known = new Set(
      Object.values(tasksFixture.document.data.tasks).map(
        (t: { normalizedName?: string }) => t.normalizedName,
      ),
    );
    const sampled = ["gunsmith-master-part-1", "gunsmith-m4a1", "setup", "eagle-eye"];
    for (const name of sampled) {
      expect(MARQUEE_QUEST_NORMALIZED_NAMES).toContain(name);
      expect(known.has(name)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @tarkov/data test -- marquee`

- [ ] **Step 3: Rewrite `packages/tarkov-data/src/marquee-quests.ts`**

```ts
/**
 * Quests that gate the most-impactful mod and ammo unlocks, curated by `normalizedName`
 * (stable across localizations).
 *
 * Upstream restructured the Gunsmith series: `gunsmith-part-1` … `-10` no longer exist.
 * There are now a 13-part "Gunsmith - Master" series plus 13 weapon-specific quests, and
 * all 26 are adopted because they gate exactly the mods a weapon builder cares about.
 * Builds saved before that change are handled by `migrateV4ToV5`.
 */
const GUNSMITH_MASTER = [
  "gunsmith-master-part-1",
  "gunsmith-master-part-2",
  "gunsmith-master-part-3",
  "gunsmith-master-part-4",
  "gunsmith-master-part-5",
  "gunsmith-master-part-6",
  "gunsmith-master-part-7",
  "gunsmith-master-part-8",
  "gunsmith-master-part-9",
  "gunsmith-master-part-10",
  "gunsmith-master-part-11",
  "gunsmith-master-part-12",
  "gunsmith-master-part-13",
] as const;

const GUNSMITH_WEAPON = [
  "gunsmith-ak-105",
  "gunsmith-akm",
  "gunsmith-aks-74n",
  "gunsmith-aks-74u",
  "gunsmith-as-val",
  "gunsmith-hk-mp5",
  "gunsmith-m4a1",
  "gunsmith-model-870",
  "gunsmith-mp-133",
  "gunsmith-mpx",
  "gunsmith-op-sks",
  "gunsmith-p226r",
  "gunsmith-vector-9x19",
] as const;

const OTHER = [
  "shooter-born-in-heaven",
  "psycho-sniper",
  "setup",
  "fishing-gear",
  "eagle-eye",
  "the-tarkov-shooter-part-1",
  "the-tarkov-shooter-part-2",
  "the-tarkov-shooter-part-3",
  "the-tarkov-shooter-part-4",
  "the-tarkov-shooter-part-5",
] as const;

export const MARQUEE_QUEST_GROUPS: readonly { label: string; quests: readonly string[] }[] = [
  { label: "GUNSMITH · MASTER", quests: GUNSMITH_MASTER },
  { label: "GUNSMITH · WEAPON", quests: GUNSMITH_WEAPON },
  { label: "OTHER", quests: OTHER },
];

export const MARQUEE_QUEST_NORMALIZED_NAMES: readonly string[] = [
  ...GUNSMITH_MASTER,
  ...GUNSMITH_WEAPON,
  ...OTHER,
];
```

- [ ] **Step 4: Run to verify it passes** — expected PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-data/src/marquee-quests.ts packages/tarkov-data/src/marquee-quests.test.ts
git commit -m "feat(data): adopt all 26 upstream Gunsmith quests

gunsmith-part-N was retired upstream. 13 master parts plus 13
weapon-specific quests replace it, taking the marquee list to 36."
```

### Task 15: `BuildV5` migrates saved quest names

**Files:**

- Modify: `packages/tarkov-data/src/build-schema.ts`
- Modify: `packages/tarkov-data/src/build-migrations.ts`
- Modify: `packages/tarkov-data/src/build-migrations.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `BuildV5`, `migrateV4ToV5(v4: BuildV4): BuildV5`, `CURRENT_BUILD_VERSION = 5`.

**Why:** `build-schema.ts:53` persists `completedQuests` as raw strings and builds live in KV
behind share URLs. Every build saved before Task 14 stores `gunsmith-part-N`, which now matches
no task — those unlocks would silently vanish rather than error.

- [ ] **Step 1: Write the failing test**

```ts
describe("migrateV4ToV5", () => {
  it("remaps retired gunsmith-part-N names", () => {
    const v5 = migrateV4ToV5({
      ...baseV4,
      profile: { ...baseV4.profile, completedQuests: ["gunsmith-part-3"] },
    });
    expect(v5.profile.completedQuests).toEqual(["gunsmith-master-part-3"]);
  });

  it("remaps part-10 without colliding with part-1", () => {
    const v5 = migrateV4ToV5({
      ...baseV4,
      profile: { ...baseV4.profile, completedQuests: ["gunsmith-part-10", "gunsmith-part-1"] },
    });
    expect(v5.profile.completedQuests).toEqual([
      "gunsmith-master-part-10",
      "gunsmith-master-part-1",
    ]);
  });

  it("leaves already-current names alone", () => {
    const v5 = migrateV4ToV5({
      ...baseV4,
      profile: { ...baseV4.profile, completedQuests: ["gunsmith-m4a1", "setup"] },
    });
    expect(v5.profile.completedQuests).toEqual(["gunsmith-m4a1", "setup"]);
  });

  it("preserves unrecognised names rather than dropping them", () => {
    const v5 = migrateV4ToV5({
      ...baseV4,
      profile: { ...baseV4.profile, completedQuests: ["some-future-quest"] },
    });
    expect(v5.profile.completedQuests).toEqual(["some-future-quest"]);
  });

  it("sets version 5", () => {
    expect(migrateV4ToV5(baseV4).version).toBe(5);
  });
});
```

Define `baseV4` from the existing test file's fixture builder.

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @tarkov/data test -- build-migrations`

- [ ] **Step 3: Implement**

In `build-schema.ts`, add `buildV5Schema` (identical to V4 but `version: z.literal(5)`), export
`BuildV5`, and set `CURRENT_BUILD_VERSION = 5 as const`.

In `build-migrations.ts`:

```ts
/**
 * Upstream retired `gunsmith-part-N` in favour of `gunsmith-master-part-N`. Saved builds
 * store completed quests as bare strings, so without this remap every build shared before
 * 2026-08-18 would silently lose its Gunsmith unlocks — no error, just fewer mods available.
 */
const RETIRED_QUEST_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [`gunsmith-part-${i + 1}`, `gunsmith-master-part-${i + 1}`]),
);

export function migrateV4ToV5(v4: BuildV4): BuildV5 {
  const completedQuests = v4.profile?.completedQuests?.map(
    // Unknown names pass through untouched. A future upstream rename must not be a second
    // silent data loss.
    (name) => RETIRED_QUEST_NAMES[name] ?? name,
  );
  return {
    ...v4,
    version: 5,
    profile: v4.profile ? { ...v4.profile, completedQuests } : v4.profile,
  };
}
```

Wire `migrateV4ToV5` into the existing migration chain wherever `migrateV3ToV4` is applied.

- [ ] **Step 4: Run to verify it passes** — expected PASS, 5 tests.

- [ ] **Step 5: Verify the chain end to end**

Run: `pnpm --filter @tarkov/data test`
Expected: PASS, including existing V1→V4 migration tests, which must now terminate at version 5.

- [ ] **Step 6: Commit**

```bash
git add packages/tarkov-data/src/build-schema.ts packages/tarkov-data/src/build-migrations.ts \
        packages/tarkov-data/src/build-migrations.test.ts
git commit -m "feat(data): BuildV5 remaps retired gunsmith quest names

Shared builds store completedQuests as bare strings. Without this remap
every build saved before the upstream rename would silently lose its
Gunsmith unlocks. Unknown names are preserved, never dropped."
```

### Task 16: Group 36 quests in the profile editor

**Files:**

- Modify: `apps/web/src/features/builder/profile-editor.tsx`
- Modify: `apps/web/e2e/smoke.spec.ts`

**Interfaces:**

- Consumes: `MARQUEE_QUEST_GROUPS` (Task 14).
- Produces: no new exports.

- [ ] **Step 1: Render the groups**

Replace the flat `MARQUEE_QUEST_NORMALIZED_NAMES.map(...)` list with a loop over
`MARQUEE_QUEST_GROUPS`, emitting the existing `SectionTitle` primitive per group label and the
existing checkbox row per quest. No new primitives, no new styling — 36 checkboxes under three
headings, in the current Field Ledger idiom.

- [ ] **Step 2: Extend the e2e spec**

Add to `apps/web/e2e/smoke.spec.ts`:

```ts
test("profile editor groups the marquee quests", async ({ page }) => {
  await page.goto("/builder");
  await page.getByRole("button", { name: /profile/i }).click();
  await expect(page.getByText("GUNSMITH · MASTER")).toBeVisible();
  await expect(page.getByText("GUNSMITH · WEAPON")).toBeVisible();
  await expect(page.getByText("OTHER")).toBeVisible();
});
```

Adjust the selector for opening the profile editor to match the current markup.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @tarkov/web test:e2e`
Expected: all PASS.

- [ ] **Step 4: Commit and open the Arc 3 PR**

```bash
git add apps/web/src/features/builder/profile-editor.tsx apps/web/e2e/smoke.spec.ts
git commit -m "feat(builder): group the 36 marquee quests in the profile editor"
git push -u origin feat/json-api-quest-restructure
gh pr create --title "feat(data): adopt the restructured Gunsmith quests" --body "$(cat <<'BODY'
Arc 3 of 4. Progression gating only — the site already has data after Arc 2.

Upstream retired `gunsmith-part-1…10` and replaced them with 13 master parts plus 13
weapon-specific quests. All 26 are adopted (marquee list 20 → 36), grouped under three headings
in the profile editor.

`BuildV5` remaps the retired names so builds shared before this do not silently lose their
Gunsmith unlocks. Unknown quest names are preserved rather than dropped.

Spec: `docs/superpowers/specs/2026-08-18-json-api-migration-design.md`
BODY
)"
```

---

## Arc 4 — Retire GraphQL

**Branch:** `chore/retire-graphql` (stacked on `feat/json-api-quest-restructure`)

### Task 17: Delete the dead GraphQL surface

**Files:**

- Modify: `packages/tarkov-data/package.json`
- Delete: `packages/tarkov-types/` (if it has no remaining consumers)
- Delete: `apps/data-proxy/`
- Modify: `pnpm-workspace.yaml` if a package is removed
- Modify: `.github/workflows/deploy.yml`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Confirm nothing still imports them**

```bash
grep -rn "graphql-request\|@tarkov/types\|data-proxy" apps packages --include='*.ts' --include='*.tsx' --include='*.json' | grep -v node_modules
```

Anything that still references `@tarkov/types` must be resolved before deleting it. If it has
live consumers, keep the package and delete only `codegen.ts` plus `src/generated/`.

- [ ] **Step 2: Drop the dependencies**

Remove `graphql` and `graphql-request` from `packages/tarkov-data/package.json`.

Run: `pnpm install`

- [ ] **Step 3: Delete `apps/data-proxy`**

It is a GraphQL cache Worker for an API that no longer exists, and `tarkov-client.ts` shows it was
never in the production request path. Remove its deploy job from `.github/workflows/deploy.yml` in
the same commit — a deploy step pointing at a deleted directory fails the whole workflow.

- [ ] **Step 4: Update `CLAUDE.md`**

Its "What this project is" section still describes "Two Cloudflare Workers (`data-proxy` for
GraphQL caching…)" and `api.tarkov.dev` as the data source. Correct both, and correct the repo
layout table.

- [ ] **Step 5: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm --filter @tarkov/web test:e2e`
Expected: all PASS.

- [ ] **Step 6: Commit and open the Arc 4 PR**

```bash
git add -A
git commit -m "chore(data): retire the GraphQL client, types, and data-proxy

api.tarkov.dev/graphql is gone and nothing calls it. data-proxy was a
cache layer for it that never made it into the production request path."
git push -u origin chore/retire-graphql
gh pr create --title "chore(data): retire the GraphQL surface" --body "Arc 4 of 4. Removes graphql-request, the generated GraphQL types, and the data-proxy Worker.

Spec: \`docs/superpowers/specs/2026-08-18-json-api-migration-design.md\`"
```

---

## Post-merge checklist

- [ ] Deployed site renders real item names on `/calc`, `/matrix`, `/data`, `/builder`.
- [ ] A build shared before this migration still shows its Gunsmith unlocks (verify one saved id).
- [ ] `docs/operations/dependency-residue.md` still accurate after `graphql-request` is dropped.
- [ ] Resume the parked repo-security arcs — T, 0, 1 are committed and green; 2 and 3 unstarted.
