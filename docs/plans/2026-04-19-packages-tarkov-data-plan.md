# `packages/tarkov-data` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `packages/tarkov-data` — a TanStack-Query-based data layer that fetches typed, Zod-validated data from `api.tarkov.dev`. Initial surface: three fetchers + hooks for the MVP features (`fetchAmmoList`/`useAmmoList`, `fetchArmorList`/`useArmorList`, `fetchWeapon`/`useWeapon`).

**Architecture:** A small GraphQL client wraps `graphql-request`. Each query has its own `.ts` file pairing a query string, a Zod response schema, a recorded JSON fixture, and a `fetchX` function that calls the client and runs the response through Zod. Thin `useX` hooks wrap each fetcher in TanStack Query. A React `<TarkovDataProvider>` plumbs the client down via Context. **Tests cover the fetchers** (mock the global `fetch`); the hooks themselves are 3-line type-only wrappers, exercised in `apps/web` integration tests later — no React-rendered tests in this package, no jsdom/happy-dom dependency.

**Tech Stack:** TypeScript 6, GraphQL 16, `graphql-request` v7, `@tanstack/react-query` v5, `zod` v3, `react` (peer), `@tarkov/types` (workspace, type-only). Vitest 4 in Node env. No MSW, no jsdom.

---

## File map (what exists at the end of this plan)

```
packages/tarkov-data/
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── tsconfig.test.json
├── vitest.config.ts
└── src/
    ├── index.ts                    Public barrel
    ├── client.ts                   createTarkovClient(endpoint, fetch?) → GraphQLClient
    ├── client.test.ts
    ├── provider.tsx                <TarkovDataProvider>, useTarkovClient hook
    ├── queries/
    │   ├── ammoList.ts             query string + Zod schema + fetchAmmoList
    │   ├── ammoList.test.ts
    │   ├── armorList.ts
    │   ├── armorList.test.ts
    │   ├── weapon.ts
    │   └── weapon.test.ts
    ├── hooks/
    │   ├── useAmmoList.ts          TanStack Query wrapper
    │   ├── useArmorList.ts
    │   └── useWeapon.ts
    └── __fixtures__/
        ├── ammoList.json           Recorded API responses for tests
        ├── armorList.json
        └── weapon.json
```

---

## Phase 1: Package skeleton

### Task 1: Scaffold `packages/tarkov-data/package.json`

**Files:**

- Create: `packages/tarkov-data/package.json`

- [ ] **Step 1: Create directory + package.json**

```bash
mkdir -p packages/tarkov-data/src/{queries,hooks,__fixtures__}
```

Create `packages/tarkov-data/package.json` with EXACTLY:

```json
{
  "name": "@tarkov/data",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Typed, Zod-validated TanStack Query data layer for the api.tarkov.dev GraphQL API.",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@tarkov/types": "workspace:*",
    "graphql": "^16.0.0",
    "graphql-request": "^7.0.0",
    "zod": "^3.23.0"
  },
  "peerDependencies": {
    "@tanstack/react-query": "^5.0.0",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@tanstack/react-query": "^5.0.0",
    "@types/react": "^19.0.0",
    "react": "^19.0.0"
  }
}
```

`@tanstack/react-query` and `react` are devDeps (so we can typecheck against them) AND peerDeps (so consumers provide their own copy — avoids duplicate React).

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: pnpm reports new package, installs deps, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/tarkov-data/package.json pnpm-lock.yaml
git commit -m "feat(data): scaffold @tarkov/data package"
```

---

### Task 2: TypeScript + Vitest configs

**Files:**

- Create: `packages/tarkov-data/tsconfig.json`
- Create: `packages/tarkov-data/tsconfig.test.json`
- Create: `packages/tarkov-data/vitest.config.ts`

- [ ] **Step 1: Create `packages/tarkov-data/tsconfig.json`** with EXACTLY:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": ".tsbuildinfo",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"],
    "types": ["node", "react"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts", "**/*.test.tsx"]
}
```

- [ ] **Step 2: Create `packages/tarkov-data/tsconfig.test.json`** with EXACTLY:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": ".",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"],
    "types": ["node", "react"]
  },
  "include": ["src/**/*", "vitest.config.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create `packages/tarkov-data/vitest.config.ts`** with EXACTLY:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/__fixtures__/**",
        "src/index.ts",
        "src/provider.tsx",
        "src/hooks/**",
      ],
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

`provider.tsx` and `hooks/` are excluded from coverage thresholds because they are type-only React glue with no testable logic in this package; they're exercised in `apps/web` integration tests.

- [ ] **Step 4: Update root `eslint.config.js`** to add this package's test files + vitest.config to `allowDefaultProject`

Read current `eslint.config.js`. Find the `allowDefaultProject` array and append:

- `"packages/tarkov-data/src/queries/*.test.ts"`
- `"packages/tarkov-data/src/client.test.ts"`

(The `packages/*/vitest.config.ts` glob already covers the vitest config. Don't duplicate.)

- [ ] **Step 5: Verify typecheck on the empty package fails clean**

```bash
pnpm --filter @tarkov/data typecheck
```

Expected: `error TS18003: No inputs were found in config file` because `src/` is empty until the next tasks.

- [ ] **Step 6: Commit**

```bash
git add packages/tarkov-data/tsconfig.json packages/tarkov-data/tsconfig.test.json packages/tarkov-data/vitest.config.ts eslint.config.js
git commit -m "feat(data): add tsconfig, vitest config, and eslint allowDefaultProject entries"
```

---

### Task 3: Per-package `CLAUDE.md` and `README.md`

**Files:**

- Create: `packages/tarkov-data/CLAUDE.md`
- Create: `packages/tarkov-data/README.md`

- [ ] **Step 1: Create `packages/tarkov-data/CLAUDE.md`** with EXACTLY:

```markdown
# `@tarkov/data`

Typed, Zod-validated data layer for the [api.tarkov.dev](https://api.tarkov.dev) GraphQL API. Wraps `graphql-request` with TanStack Query hooks for React consumers.

## What's in this package

- `client.ts` — `createTarkovClient(endpoint, fetch?)` returns a GraphQLClient.
- `provider.tsx` — `<TarkovDataProvider client={...}>` Context + `useTarkovClient()` hook for `apps/web` to plumb the client.
- `queries/<name>.ts` — one file per query: a query string, a Zod response schema, a recorded JSON fixture (`__fixtures__/<name>.json`), and a `fetch<Name>(client, args?)` function that calls the client and Zod-parses the response.
- `hooks/use<Name>.ts` — thin TanStack Query wrappers around the `fetch<Name>` functions. 3 lines each; consumers exercise them in `apps/web` integration tests.

## Conventions

- **One query per file.** Co-locate query string + Zod schema + fetcher.
- **Fetchers are tested; hooks are not (in this package).** Hook logic is too thin to unit-test usefully here. They're typed and lint-checked; behavioral tests live in `apps/web`.
- **Fixtures are recorded from the live API**, then committed. Re-record with `pnpm --filter @tarkov/data fixture:refresh <name>` (script TBD; until then, refresh manually with curl + jq).
- **Zod schemas mirror the GraphQL response shape.** Use them as the source of truth for runtime validation; they're cheaper to evolve than regenerating types.
- **Default endpoint:** `https://api.tarkov.dev/graphql`. Override via `<TarkovDataProvider client={...}>`.
- **No React in tests.** The vitest env is `node`. Tests stub `fetch` directly.

## How to add a new query

Use the `add-data-query` project skill (in `.claude/skills/`). It scaffolds the four file types (query, schema, fixture, test) and the hook.

## Out of scope

- The `data-proxy` Worker (caching layer between the SPA and `api.tarkov.dev`) — that's `apps/data-proxy`, plan 0b.
- React component tests — those live in `apps/web`.
- Mod compatibility / weapon-build queries — deferred to a follow-up plan once the MVP queries prove the pattern.
```

- [ ] **Step 2: Create `packages/tarkov-data/README.md`** with EXACTLY:

````markdown
# @tarkov/data

Typed, Zod-validated TanStack Query data layer for `api.tarkov.dev`.

## Use

```tsx
import { TarkovDataProvider, createTarkovClient, useAmmoList } from "@tarkov/data";

const client = createTarkovClient("https://api.tarkov.dev/graphql");

function App() {
  return (
    <TarkovDataProvider client={client}>
      <AmmoTable />
    </TarkovDataProvider>
  );
}

function AmmoTable() {
  const { data, isLoading } = useAmmoList();
  if (isLoading || !data) return <div>Loading…</div>;
  return (
    <ul>
      {data.map((a) => (
        <li key={a.id}>{a.name}</li>
      ))}
    </ul>
  );
}
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions.
````

- [ ] **Step 3: Commit**

```bash
git add packages/tarkov-data/CLAUDE.md packages/tarkov-data/README.md
git commit -m "docs(data): add per-package CLAUDE.md and README"
```

---

## Phase 2: GraphQL client + Provider

### Task 4: GraphQL client factory

**Files:**

- Create: `packages/tarkov-data/src/client.ts`
- Create: `packages/tarkov-data/src/client.test.ts`

- [ ] **Step 1: Write `packages/tarkov-data/src/client.test.ts`** with EXACTLY:

```ts
import { describe, expect, it, vi } from "vitest";
import { createTarkovClient } from "./client.js";

describe("createTarkovClient", () => {
  it("returns a client bound to the provided endpoint", () => {
    const client = createTarkovClient("https://example.test/graphql");
    expect(client.url).toBe("https://example.test/graphql");
  });

  it("uses the provided fetch implementation", async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { ping: "pong" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await client.request<{ ping: string }>("query { ping }");
    expect(result.ping).toBe("pong");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to global fetch when none is provided", () => {
    // We don't actually invoke fetch here — just verify the client constructs.
    const client = createTarkovClient("https://example.test/graphql");
    expect(typeof client.request).toBe("function");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
pnpm --filter @tarkov/data test src/client.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/tarkov-data/src/client.ts`** with EXACTLY:

```ts
import { GraphQLClient } from "graphql-request";

/**
 * Construct a GraphQL client pointed at a TarkovGunsmith data endpoint.
 *
 * @param endpoint - The GraphQL HTTP endpoint URL.
 * @param fetchImpl - Optional fetch implementation (defaults to global fetch).
 */
export function createTarkovClient(endpoint: string, fetchImpl?: typeof fetch): GraphQLClient {
  return new GraphQLClient(endpoint, fetchImpl ? { fetch: fetchImpl } : {});
}

export type { GraphQLClient };
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pnpm --filter @tarkov/data test src/client.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/tarkov-data/src/client.ts packages/tarkov-data/src/client.test.ts
git commit -m "feat(data): add GraphQL client factory"
```

---

### Task 5: React Provider + Context

**Files:**

- Create: `packages/tarkov-data/src/provider.tsx`

This file is React glue with no logic worth unit-testing in isolation. Behavioral verification happens in `apps/web` integration tests later.

- [ ] **Step 1: Create `packages/tarkov-data/src/provider.tsx`** with EXACTLY:

```tsx
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { GraphQLClient } from "./client.js";

const TarkovClientContext = createContext<GraphQLClient | null>(null);

export interface TarkovDataProviderProps {
  client: GraphQLClient;
  children: ReactNode;
}

/**
 * Plumb a GraphQL client down to all `useX` hooks in this package.
 * Wrap your app once near the root.
 */
export function TarkovDataProvider({ client, children }: TarkovDataProviderProps) {
  return <TarkovClientContext.Provider value={client}>{children}</TarkovClientContext.Provider>;
}

/**
 * Read the GraphQL client from context. Throws if no provider is mounted.
 */
export function useTarkovClient(): GraphQLClient {
  const client = useContext(TarkovClientContext);
  if (!client) {
    throw new Error(
      "useTarkovClient must be used inside a <TarkovDataProvider>. Wrap your app or test with one.",
    );
  }
  return client;
}
```

- [ ] **Step 2: Verify typecheck and lint pass**

```bash
pnpm --filter @tarkov/data typecheck && pnpm exec eslint packages/tarkov-data --max-warnings 0
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/tarkov-data/src/provider.tsx
git commit -m "feat(data): add TarkovDataProvider and useTarkovClient hook"
```

---

## Phase 3: Three queries (TDD-style: query + schema + fixture + fetcher + test, then thin hook)

### Task 6: `ammoList` — query, schema, fixture, fetcher

**Files:**

- Create: `packages/tarkov-data/src/__fixtures__/ammoList.json`
- Create: `packages/tarkov-data/src/queries/ammoList.ts`
- Create: `packages/tarkov-data/src/queries/ammoList.test.ts`

- [ ] **Step 1: Create the fixture** at `packages/tarkov-data/src/__fixtures__/ammoList.json` with EXACTLY:

```json
{
  "data": {
    "items": [
      {
        "id": "5656d7c34bdc2d9d198b4587",
        "name": "5.45x39mm PS gs",
        "shortName": "5.45 PS",
        "iconLink": "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-icon.webp",
        "properties": {
          "__typename": "ItemPropertiesAmmo",
          "caliber": "Caliber545x39",
          "penetrationPower": 21,
          "damage": 50,
          "armorDamage": 38,
          "projectileCount": 1
        }
      },
      {
        "id": "5c0d5e4486f77478390952fe",
        "name": "5.45x39mm BP gs",
        "shortName": "5.45 BP",
        "iconLink": "https://assets.tarkov.dev/5c0d5e4486f77478390952fe-icon.webp",
        "properties": {
          "__typename": "ItemPropertiesAmmo",
          "caliber": "Caliber545x39",
          "penetrationPower": 40,
          "damage": 50,
          "armorDamage": 50,
          "projectileCount": 1
        }
      }
    ]
  }
}
```

This is a hand-curated minimal fixture matching the real `api.tarkov.dev` response shape. Refresh from live with the future `fixture:refresh` script.

- [ ] **Step 2: Write `packages/tarkov-data/src/queries/ammoList.test.ts`** with EXACTLY:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchAmmoList, ammoListSchema } from "./ammoList.js";
import { createTarkovClient } from "../client.js";
import fixture from "../__fixtures__/ammoList.json" with { type: "json" };

describe("ammoListSchema", () => {
  it("parses the recorded fixture without error", () => {
    const result = ammoListSchema.safeParse(fixture.data);
    expect(result.success).toBe(true);
  });

  it("rejects responses missing the items array", () => {
    const result = ammoListSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects items with non-numeric penetrationPower", () => {
    const bad = {
      items: [
        {
          ...fixture.data.items[0],
          properties: { ...fixture.data.items[0]!.properties, penetrationPower: "not a number" },
        },
      ],
    };
    const result = ammoListSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("fetchAmmoList", () => {
  it("returns parsed ammo entries from the GraphQL response", async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchAmmoList(client);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("5656d7c34bdc2d9d198b4587");
    expect(result[0]?.properties.penetrationPower).toBe(21);
  });

  it("throws when the response shape is invalid", async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { items: [{ id: 123 }] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    await expect(fetchAmmoList(client)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

```bash
pnpm --filter @tarkov/data test src/queries/ammoList.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write `packages/tarkov-data/src/queries/ammoList.ts`** with EXACTLY:

```ts
import { z } from "zod";
import type { GraphQLClient } from "../client.js";

export const AMMO_LIST_QUERY = /* GraphQL */ `
  query AmmoList {
    items(type: ammo) {
      id
      name
      shortName
      iconLink
      properties {
        __typename
        ... on ItemPropertiesAmmo {
          caliber
          penetrationPower
          damage
          armorDamage
          projectileCount
        }
      }
    }
  }
`;

const ammoPropertiesSchema = z.object({
  __typename: z.literal("ItemPropertiesAmmo"),
  caliber: z.string(),
  penetrationPower: z.number(),
  damage: z.number(),
  armorDamage: z.number(),
  projectileCount: z.number(),
});

const ammoItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  properties: ammoPropertiesSchema,
});

export const ammoListSchema = z.object({
  items: z.array(ammoItemSchema),
});

export type AmmoListItem = z.infer<typeof ammoItemSchema>;

/**
 * Fetch the full list of ammo items, validated against {@link ammoListSchema}.
 */
export async function fetchAmmoList(client: GraphQLClient): Promise<AmmoListItem[]> {
  const raw = await client.request<unknown>(AMMO_LIST_QUERY);
  return ammoListSchema.parse(raw).items;
}
```

- [ ] **Step 5: Run the test, verify it passes**

```bash
pnpm --filter @tarkov/data test src/queries/ammoList.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 6: Commit**

```bash
git add packages/tarkov-data/src/__fixtures__/ammoList.json packages/tarkov-data/src/queries/ammoList.ts packages/tarkov-data/src/queries/ammoList.test.ts
git commit -m "feat(data): add fetchAmmoList query, schema, and fetcher"
```

---

### Task 7: `useAmmoList` hook

**Files:**

- Create: `packages/tarkov-data/src/hooks/useAmmoList.ts`

- [ ] **Step 1: Create `packages/tarkov-data/src/hooks/useAmmoList.ts`** with EXACTLY:

```ts
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { fetchAmmoList } from "../queries/ammoList.js";
import type { AmmoListItem } from "../queries/ammoList.js";
import { useTarkovClient } from "../provider.js";

/**
 * Reactive ammo list. Cached by TanStack Query under the key `["ammoList"]`.
 */
export function useAmmoList(): UseQueryResult<AmmoListItem[], Error> {
  const client = useTarkovClient();
  return useQuery({
    queryKey: ["ammoList"],
    queryFn: () => fetchAmmoList(client),
  });
}
```

- [ ] **Step 2: Verify typecheck and lint**

```bash
pnpm --filter @tarkov/data typecheck && pnpm exec eslint packages/tarkov-data --max-warnings 0
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/tarkov-data/src/hooks/useAmmoList.ts
git commit -m "feat(data): add useAmmoList hook"
```

Note the import path `../provider.js` — `.tsx` files compile to `.js` in dist; the source uses `.js` extension under `verbatimModuleSyntax` rules.

---

### Task 8: `armorList` — query, schema, fixture, fetcher

**Files:**

- Create: `packages/tarkov-data/src/__fixtures__/armorList.json`
- Create: `packages/tarkov-data/src/queries/armorList.ts`
- Create: `packages/tarkov-data/src/queries/armorList.test.ts`

- [ ] **Step 1: Create the fixture** at `packages/tarkov-data/src/__fixtures__/armorList.json` with EXACTLY:

```json
{
  "data": {
    "items": [
      {
        "id": "5648a7494bdc2d9d488b4583",
        "name": "PACA Soft Armor",
        "shortName": "PACA",
        "iconLink": "https://assets.tarkov.dev/5648a7494bdc2d9d488b4583-icon.webp",
        "properties": {
          "__typename": "ItemPropertiesArmor",
          "class": 3,
          "durability": 40,
          "material": { "name": "Aramid", "destructibility": 0.55 },
          "zones": ["Chest", "Stomach"]
        }
      },
      {
        "id": "5c0e655586f774045612eeb2",
        "name": "Hexgrid Plate Carrier",
        "shortName": "Hexgrid",
        "iconLink": "https://assets.tarkov.dev/5c0e655586f774045612eeb2-icon.webp",
        "properties": {
          "__typename": "ItemPropertiesArmor",
          "class": 5,
          "durability": 80,
          "material": { "name": "Ceramic", "destructibility": 0.45 },
          "zones": ["Chest", "Stomach"]
        }
      }
    ]
  }
}
```

- [ ] **Step 2: Write `packages/tarkov-data/src/queries/armorList.test.ts`** with EXACTLY:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchArmorList, armorListSchema } from "./armorList.js";
import { createTarkovClient } from "../client.js";
import fixture from "../__fixtures__/armorList.json" with { type: "json" };

describe("armorListSchema", () => {
  it("parses the recorded fixture without error", () => {
    const result = armorListSchema.safeParse(fixture.data);
    expect(result.success).toBe(true);
  });

  it("rejects responses missing items", () => {
    const result = armorListSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects items with non-numeric armor class", () => {
    const bad = {
      items: [
        {
          ...fixture.data.items[0],
          properties: { ...fixture.data.items[0]!.properties, class: "five" },
        },
      ],
    };
    const result = armorListSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("fetchArmorList", () => {
  it("returns parsed armor entries", async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchArmorList(client);
    expect(result).toHaveLength(2);
    expect(result[0]?.properties.class).toBe(3);
    expect(result[1]?.properties.material.destructibility).toBe(0.45);
  });

  it("throws on invalid response shape", async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { items: [{}] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    await expect(fetchArmorList(client)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run, verify failure (module not found)**

```bash
pnpm --filter @tarkov/data test src/queries/armorList.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Write `packages/tarkov-data/src/queries/armorList.ts`** with EXACTLY:

```ts
import { z } from "zod";
import type { GraphQLClient } from "../client.js";

export const ARMOR_LIST_QUERY = /* GraphQL */ `
  query ArmorList {
    items(type: armor) {
      id
      name
      shortName
      iconLink
      properties {
        __typename
        ... on ItemPropertiesArmor {
          class
          durability
          material {
            name
            destructibility
          }
          zones
        }
      }
    }
  }
`;

const armorMaterialSchema = z.object({
  name: z.string(),
  destructibility: z.number(),
});

const armorPropertiesSchema = z.object({
  __typename: z.literal("ItemPropertiesArmor"),
  class: z.number(),
  durability: z.number(),
  material: armorMaterialSchema,
  zones: z.array(z.string()),
});

const armorItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  properties: armorPropertiesSchema,
});

export const armorListSchema = z.object({
  items: z.array(armorItemSchema),
});

export type ArmorListItem = z.infer<typeof armorItemSchema>;

/**
 * Fetch the full list of armor items, validated against {@link armorListSchema}.
 */
export async function fetchArmorList(client: GraphQLClient): Promise<ArmorListItem[]> {
  const raw = await client.request<unknown>(ARMOR_LIST_QUERY);
  return armorListSchema.parse(raw).items;
}
```

- [ ] **Step 5: Run, verify pass**

```bash
pnpm --filter @tarkov/data test src/queries/armorList.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 6: Commit**

```bash
git add packages/tarkov-data/src/__fixtures__/armorList.json packages/tarkov-data/src/queries/armorList.ts packages/tarkov-data/src/queries/armorList.test.ts
git commit -m "feat(data): add fetchArmorList query, schema, and fetcher"
```

---

### Task 9: `useArmorList` hook

**Files:**

- Create: `packages/tarkov-data/src/hooks/useArmorList.ts`

- [ ] **Step 1: Create `packages/tarkov-data/src/hooks/useArmorList.ts`** with EXACTLY:

```ts
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { fetchArmorList } from "../queries/armorList.js";
import type { ArmorListItem } from "../queries/armorList.js";
import { useTarkovClient } from "../provider.js";

/**
 * Reactive armor list. Cached by TanStack Query under the key `["armorList"]`.
 */
export function useArmorList(): UseQueryResult<ArmorListItem[], Error> {
  const client = useTarkovClient();
  return useQuery({
    queryKey: ["armorList"],
    queryFn: () => fetchArmorList(client),
  });
}
```

- [ ] **Step 2: Verify typecheck + lint**

```bash
pnpm --filter @tarkov/data typecheck && pnpm exec eslint packages/tarkov-data --max-warnings 0
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/tarkov-data/src/hooks/useArmorList.ts
git commit -m "feat(data): add useArmorList hook"
```

---

### Task 10: `weapon` — single-weapon-by-id query, schema, fixture, fetcher

**Files:**

- Create: `packages/tarkov-data/src/__fixtures__/weapon.json`
- Create: `packages/tarkov-data/src/queries/weapon.ts`
- Create: `packages/tarkov-data/src/queries/weapon.test.ts`

- [ ] **Step 1: Create the fixture** at `packages/tarkov-data/src/__fixtures__/weapon.json` with EXACTLY:

```json
{
  "data": {
    "item": {
      "id": "5447a9cd4bdc2dbd208b4567",
      "name": "Colt M4A1 5.56x45 assault rifle",
      "shortName": "M4A1",
      "iconLink": "https://assets.tarkov.dev/5447a9cd4bdc2dbd208b4567-icon.webp",
      "properties": {
        "__typename": "ItemPropertiesWeapon",
        "ergonomics": 50,
        "recoilVertical": 56,
        "recoilHorizontal": 220,
        "caliber": "Caliber556x45NATO",
        "fireRate": 800
      },
      "weight": 2.7
    }
  }
}
```

- [ ] **Step 2: Write `packages/tarkov-data/src/queries/weapon.test.ts`** with EXACTLY:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchWeapon, weaponSchema } from "./weapon.js";
import { createTarkovClient } from "../client.js";
import fixture from "../__fixtures__/weapon.json" with { type: "json" };

describe("weaponSchema", () => {
  it("parses the recorded fixture without error", () => {
    const result = weaponSchema.safeParse(fixture.data);
    expect(result.success).toBe(true);
  });

  it("rejects responses where item is null", () => {
    const result = weaponSchema.safeParse({ item: null });
    expect(result.success).toBe(false);
  });

  it("rejects items with non-numeric ergonomics", () => {
    const bad = {
      item: {
        ...fixture.data.item,
        properties: { ...fixture.data.item.properties, ergonomics: "high" },
      },
    };
    const result = weaponSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("fetchWeapon", () => {
  it("sends the id as a variable", async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    await fetchWeapon(client, "5447a9cd4bdc2dbd208b4567");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callBody = JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body ?? "{}")) as {
      variables?: { id?: string };
    };
    expect(callBody.variables?.id).toBe("5447a9cd4bdc2dbd208b4567");
  });

  it("returns the parsed weapon", async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchWeapon(client, "5447a9cd4bdc2dbd208b4567");
    expect(result.shortName).toBe("M4A1");
    expect(result.weight).toBe(2.7);
  });

  it("throws when the api returns no item for the id", async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { item: null } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    await expect(fetchWeapon(client, "missing")).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run, verify failure (module not found)**

```bash
pnpm --filter @tarkov/data test src/queries/weapon.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Write `packages/tarkov-data/src/queries/weapon.ts`** with EXACTLY:

```ts
import { z } from "zod";
import type { GraphQLClient } from "../client.js";

export const WEAPON_QUERY = /* GraphQL */ `
  query Weapon($id: ID!) {
    item(id: $id) {
      id
      name
      shortName
      iconLink
      weight
      properties {
        __typename
        ... on ItemPropertiesWeapon {
          ergonomics
          recoilVertical
          recoilHorizontal
          caliber
          fireRate
        }
      }
    }
  }
`;

const weaponPropertiesSchema = z.object({
  __typename: z.literal("ItemPropertiesWeapon"),
  ergonomics: z.number(),
  recoilVertical: z.number(),
  recoilHorizontal: z.number(),
  caliber: z.string(),
  fireRate: z.number(),
});

const weaponItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  weight: z.number(),
  properties: weaponPropertiesSchema,
});

export const weaponSchema = z.object({
  item: weaponItemSchema,
});

export type Weapon = z.infer<typeof weaponItemSchema>;

/**
 * Fetch a single weapon by its tarkov-api id, validated against {@link weaponSchema}.
 */
export async function fetchWeapon(client: GraphQLClient, id: string): Promise<Weapon> {
  const raw = await client.request<unknown>(WEAPON_QUERY, { id });
  return weaponSchema.parse(raw).item;
}
```

- [ ] **Step 5: Run, verify pass**

```bash
pnpm --filter @tarkov/data test src/queries/weapon.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 6: Commit**

```bash
git add packages/tarkov-data/src/__fixtures__/weapon.json packages/tarkov-data/src/queries/weapon.ts packages/tarkov-data/src/queries/weapon.test.ts
git commit -m "feat(data): add fetchWeapon query, schema, and fetcher"
```

---

### Task 11: `useWeapon` hook

**Files:**

- Create: `packages/tarkov-data/src/hooks/useWeapon.ts`

- [ ] **Step 1: Create `packages/tarkov-data/src/hooks/useWeapon.ts`** with EXACTLY:

```ts
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { fetchWeapon } from "../queries/weapon.js";
import type { Weapon } from "../queries/weapon.js";
import { useTarkovClient } from "../provider.js";

/**
 * Reactive single-weapon fetch by id. Cached by TanStack Query under the key
 * `["weapon", id]`. Disabled when `id` is empty.
 */
export function useWeapon(id: string): UseQueryResult<Weapon, Error> {
  const client = useTarkovClient();
  return useQuery({
    queryKey: ["weapon", id],
    queryFn: () => fetchWeapon(client, id),
    enabled: id.length > 0,
  });
}
```

- [ ] **Step 2: Verify typecheck + lint**

```bash
pnpm --filter @tarkov/data typecheck && pnpm exec eslint packages/tarkov-data --max-warnings 0
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/tarkov-data/src/hooks/useWeapon.ts
git commit -m "feat(data): add useWeapon hook"
```

---

## Phase 4: Public barrel + ship

### Task 12: Public barrel

**Files:**

- Create: `packages/tarkov-data/src/index.ts`

- [ ] **Step 1: Create `packages/tarkov-data/src/index.ts`** with EXACTLY:

```ts
// Client
export { createTarkovClient } from "./client.js";
export type { GraphQLClient } from "./client.js";

// Provider
export { TarkovDataProvider, useTarkovClient } from "./provider.js";
export type { TarkovDataProviderProps } from "./provider.js";

// Queries (fetchers + schemas + types)
export { AMMO_LIST_QUERY, ammoListSchema, fetchAmmoList } from "./queries/ammoList.js";
export type { AmmoListItem } from "./queries/ammoList.js";
export { ARMOR_LIST_QUERY, armorListSchema, fetchArmorList } from "./queries/armorList.js";
export type { ArmorListItem } from "./queries/armorList.js";
export { WEAPON_QUERY, weaponSchema, fetchWeapon } from "./queries/weapon.js";
export type { Weapon } from "./queries/weapon.js";

// Hooks
export { useAmmoList } from "./hooks/useAmmoList.js";
export { useArmorList } from "./hooks/useArmorList.js";
export { useWeapon } from "./hooks/useWeapon.js";
```

- [ ] **Step 2: Verify the full package gates**

```bash
pnpm --filter @tarkov/data typecheck
pnpm --filter @tarkov/data test
pnpm --filter @tarkov/data build
pnpm exec eslint packages/tarkov-data --max-warnings 0
```

Expected: all exit 0. Test count: 16 (3 + 5 + 5 + 6 — well, actually 3 client + 5 ammo + 5 armor + 6 weapon = 19; verify by counting yourself).

- [ ] **Step 3: Commit**

```bash
git add packages/tarkov-data/src/index.ts
git commit -m "feat(data): add public barrel"
```

---

### Task 13: Update root `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Status callout**

Find:

```markdown
> **Status:** Foundation + `packages/ballistics` + `packages/tarkov-types` shipped. ...
```

Replace with:

```markdown
> **Status:** Foundation + `packages/ballistics` + `packages/tarkov-types` + `packages/tarkov-data` shipped. Math, generated types, and the data layer (3 fetchers/hooks: ammo, armor, weapon) are live. Still pending: `packages/ui`, `apps/data-proxy`, `apps/builds-api`, `apps/web`. See [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) for the full design.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note packages/tarkov-data shipped in CLAUDE.md status"
```

---

### Task 14: Final verification + PR + merge + release

**Files:** none (operational)

- [ ] **Step 1: Final clean-install + all gates**

```bash
rm -rf node_modules packages/*/node_modules packages/*/dist packages/*/.tsbuildinfo
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: all exit 0.

- [ ] **Step 2: Push branch + open PR**

```bash
git push -u origin feat/packages-tarkov-data
gh pr create --base main --head feat/packages-tarkov-data --title "feat(data): add @tarkov/data package" --body "Implements 0d.3 (data half). TanStack Query data layer with 3 fetchers/hooks (ammo, armor, weapon), per-query Zod validation, and a configurable GraphQL client + Provider. Hook unit tests deferred to apps/web integration tests.

@tarkov/ui ships separately (next plan)."
```

Capture the PR number.

- [ ] **Step 3: Wait for CI green explicitly**

```bash
sleep 8
RUN_ID=$(gh run list --repo UnderMyBed/TarkovGunsmith --branch feat/packages-tarkov-data --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --repo UnderMyBed/TarkovGunsmith
gh run view $RUN_ID --repo UnderMyBed/TarkovGunsmith --json conclusion --jq '.conclusion'
```

Expected: `success`.

- [ ] **Step 4: Squash-merge**

```bash
gh pr merge <pr-number> --repo UnderMyBed/TarkovGunsmith --squash --delete-branch
```

- [ ] **Step 5: Wait for release-please to open the v0.4.0 PR + the auto-triggered CI**

```bash
sleep 15
gh pr list --repo UnderMyBed/TarkovGunsmith --state open
RUN_ID=$(gh run list --repo UnderMyBed/TarkovGunsmith --workflow ci.yml --branch release-please--branches--main--components--tarkov-gunsmith --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --repo UnderMyBed/TarkovGunsmith
gh run view $RUN_ID --repo UnderMyBed/TarkovGunsmith --json conclusion --jq '.conclusion'
```

Expected: `success`.

- [ ] **Step 6: Admin-merge release PR**

```bash
gh pr merge <release-pr-number> --repo UnderMyBed/TarkovGunsmith --squash --delete-branch --admin
```

Expected: `v0.4.0` tag and GitHub Release.

- [ ] **Step 7: Cleanup**

```bash
git switch main && git pull --ff-only
git worktree remove ~/.config/superpowers/worktrees/TarkovGunsmith/feat-packages-tarkov-data --force
git branch -D feat/packages-tarkov-data
git remote prune origin
```

---

## Done — what's true after this plan

- `packages/tarkov-data` exists at workspace `0.0.0`; repo released as `v0.4.0`.
- 3 fetchers + 3 hooks for the MVP feature surface (ammo, armor, weapon).
- Per-query Zod validation guards against silent upstream schema drift.
- 19 fetcher tests passing; the React hooks are type-only wrappers exercised by `apps/web` integration tests later.
- A configurable `<TarkovDataProvider>` lets `apps/web` swap the endpoint (default `api.tarkov.dev/graphql`; eventually `/api/data/graphql` once `apps/data-proxy` is live).

## What's NOT true yet (intentionally deferred)

- No mod compatibility / weapon-build queries — these are recursive and complex; deferred to a follow-up plan once the MVP queries prove the pattern in `apps/web`.
- No fixture-refresh script — fixtures are hand-edited for now; the Tier C cron will automate refresh.
- No MSW — `vi.mock`-style global-fetch stubbing is sufficient for fetchers; MSW can be revisited if integration tests in `apps/web` benefit.
- Hook unit tests — see above.
- The data-proxy Worker — separate plan (0b).
