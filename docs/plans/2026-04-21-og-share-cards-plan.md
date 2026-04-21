# OG share cards — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-04-21-og-share-cards-design.md`](../superpowers/specs/2026-04-21-og-share-cards-design.md)

**Goal:** Ship 1200×630 PNG preview cards for `/builder/:id` and `/builder/compare/:pairId` URLs so they unfurl as rich link previews on Discord / Twitter / Slack, with per-build OG + Twitter meta tags injected into the SPA HTML.

**Architecture:** New pure-TS workspace `packages/og` owning card JSX (satori) and the render pipeline (resvg-wasm). Two Pages Functions in `apps/web` consume it. A Pages middleware rewrites `index.html` on the two builder routes to add OG meta. Builds-api grows a tiny fixture-seed hook so Playwright can exercise both paths against known IDs. Field Ledger aesthetic reused from `packages/ui`.

**Tech Stack:** TypeScript strict, React JSX (for satori), `satori@^0.10`, `@resvg/resvg-wasm@^2`, Cloudflare Pages Functions + `HTMLRewriter`, Vitest 4, Playwright 1.59.

**Rollout:** Two independent PRs on two branches off `origin/main`:

- **PR 1 — `feat/og-package`** ships `packages/og` + unit tests + fonts + fallback PNG. Deployable no-op (nothing imports it yet).
- **PR 2 — `feat/og-functions`** (branched off merged PR 1) ships the two Pages Functions, the middleware, the builds-api fixture hook, and Playwright smokes. Activates the endpoints.

Per-PR task breakdown below. Each PR gets its own worktree under `.worktrees/`.

---

## Phase 1 — `packages/og` (PR 1)

### File map (PR 1)

All new, all under `packages/og/`:

| Path                              | Purpose                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| `package.json`                    | Workspace manifest.                                         |
| `tsconfig.json`                   | Extends `tsconfig.base.json`; adds `jsx: "react-jsx"`.      |
| `vitest.config.ts`                | Vitest config + coverage thresholds.                        |
| `CLAUDE.md`                       | Package-local instructions.                                 |
| `src/index.ts`                    | Public exports barrel.                                      |
| `src/colors.ts`                   | Field Ledger hex constants.                                 |
| `src/truncate.ts`                 | Single-line name truncation helper (pure).                  |
| `src/hydrate.ts`                  | `BuildV4` + GraphQL raw → `BuildCardViewModel`. Pure.       |
| `src/view-model.ts`               | Shared TS types: `BuildCardViewModel`, `PairCardViewModel`. |
| `src/build-card.tsx`              | Satori JSX for layout C.                                    |
| `src/pair-card.tsx`               | Satori JSX for layout A.                                    |
| `src/fonts.ts`                    | `loadFonts()` returns `FontLoad[]` for satori.              |
| `src/render.ts`                   | `renderPng(jsx, fonts)` — satori → resvg → PNG.             |
| `src/__fixtures__/m4a1-build.ts`  | Frozen `BuildCardViewModel` fixture.                        |
| `src/__fixtures__/pair-sample.ts` | Frozen `PairCardViewModel` fixture.                         |
| `src/truncate.test.ts`            | Unit tests.                                                 |
| `src/hydrate.test.ts`             | Unit tests.                                                 |
| `src/build-card.test.ts`          | Snapshot on SVG string.                                     |
| `src/pair-card.test.ts`           | Snapshot on SVG string.                                     |
| `src/render.test.ts`              | End-to-end Node wasm render → PNG-magic-bytes assertion.    |
| `assets/fallback-card.png`        | Pre-rendered fallback (committed binary).                   |
| `scripts/build-fallback-png.ts`   | Node script to regenerate the fallback.                     |
| `fonts/Bungee-Regular.ttf`        | Font (committed binary).                                    |
| `fonts/Chivo-700.ttf`             | Font.                                                       |
| `fonts/AzeretMono-500.ttf`        | Font.                                                       |
| `fonts/AzeretMono-700.ttf`        | Font.                                                       |
| `fonts/README.md`                 | Font source URLs + download date.                           |

### Task 1: Scaffold worktree + branch

**Files:** n/a (setup)

- [ ] **Step 1: Create worktree**

```bash
git worktree add .worktrees/og-pkg -b feat/og-package origin/main
cd .worktrees/og-pkg
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
```

- [ ] **Step 2: Verify baseline green**

Run: `pnpm test`
Expected: all existing tests pass (same count as origin/main — currently 395+46=441 unit + 100 web = ~541 total; optimizer ships later).

---

### Task 2: Package scaffold

**Files:**

- Create: `packages/og/package.json`
- Create: `packages/og/tsconfig.json`
- Create: `packages/og/vitest.config.ts`
- Create: `packages/og/src/index.ts`

- [ ] **Step 1: Write `packages/og/package.json`**

```json
{
  "name": "@tarkov/og",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Pure-TS Open Graph card rendering for TarkovGunsmith. Satori JSX + resvg-wasm.",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./assets/fallback-card.png": "./assets/fallback-card.png",
    "./fonts/*": "./fonts/*"
  },
  "files": ["dist", "assets", "fonts"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "build:fallback": "tsx scripts/build-fallback-png.ts"
  },
  "dependencies": {
    "@resvg/resvg-wasm": "^2.6.2",
    "@tarkov/ballistics": "workspace:*",
    "@tarkov/data": "workspace:*",
    "react": "^19.0.0",
    "satori": "^0.10.13"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 2: Write `packages/og/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "tsBuildInfoFile": ".tsbuildinfo",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"],
    "types": ["react"]
  },
  "include": ["src/**/*", "scripts/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts", "**/*.test.tsx"]
}
```

- [ ] **Step 3: Write `packages/og/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/__fixtures__/**",
        "src/index.ts",
        "src/view-model.ts",
      ],
      thresholds: { lines: 95, functions: 95, branches: 85, statements: 95 },
    },
  },
});
```

- [ ] **Step 4: Write `packages/og/src/index.ts`**

```ts
export { buildCard } from "./build-card.js";
export { pairCard } from "./pair-card.js";
export { renderPng } from "./render.js";
export { loadFonts } from "./fonts.js";
export { hydrateBuildCard, hydratePairCard } from "./hydrate.js";
export { truncate } from "./truncate.js";
export { COLORS } from "./colors.js";
export type { BuildCardViewModel, PairCardViewModel, SideViewModel } from "./view-model.js";
```

- [ ] **Step 5: Install + commit**

```bash
pnpm install
git add packages/og/package.json packages/og/tsconfig.json packages/og/vitest.config.ts packages/og/src/index.ts pnpm-lock.yaml
git commit -m "feat(og): scaffold @tarkov/og workspace"
```

Note: `pnpm-workspace.yaml` uses `packages/*` glob so no root change is needed.

---

### Task 3: Color constants + view-model types

**Files:**

- Create: `packages/og/src/colors.ts`
- Create: `packages/og/src/view-model.ts`

- [ ] **Step 1: Write `packages/og/src/colors.ts`**

```ts
/**
 * Field Ledger palette — must stay in sync with `packages/ui/src/styles/index.css`.
 * Satori only understands inline styles, so hex literals are embedded directly
 * in the card JSX instead of CSS custom properties.
 */
export const COLORS = {
  background: "#0e0f0c",
  foreground: "#e6e4db",
  paperDim: "#9a988d",
  border: "#3a3d33",
  lineMuted: "#26291f",
  card: "#16170f",
  amber: "#f59e0b",
  amberDeep: "#b45309",
  olive: "#7a8b3f",
  rust: "#9c3f1e",
  blood: "#b91c1c",
} as const;
```

- [ ] **Step 2: Write `packages/og/src/view-model.ts`**

```ts
/**
 * View-models consumed by the card JSX. `hydrate.ts` produces these; the cards
 * render purely from these objects — no network, no GraphQL, no `@tarkov/data`
 * imports inside the JSX files.
 */
export interface BuildCardViewModel {
  /** Headline text. `BuildV4.name` if set, else weapon short-name. */
  title: string;
  /** Weapon short-name. Shown under `title` if `BuildV4.name` was used there. */
  subtitle: string | null;
  /** Number of attached mods (sum of `attachments` values). */
  modCount: number;
  /** `FLEA` | `LL2` | `LL3` | `LL4` — lowest trader level that covers every mod. */
  availability: "FLEA" | "LL2" | "LL3" | "LL4";
  /** Total price in RUB. `null` if any mod is missing price data. */
  priceRub: number | null;
  stats: {
    ergo: number | null;
    recoilV: number | null;
    recoilH: number | null;
    weight: number | null;
    accuracy: number | null;
  };
}

export interface SideViewModel {
  /** Weapon short-name, e.g. "M4A1". */
  weapon: string;
  modCount: number;
  availability: "FLEA" | "LL2" | "LL3" | "LL4";
  stats: {
    ergo: number | null;
    recoilV: number | null;
    recoilH: number | null;
    weight: number | null;
  };
}

export interface PairCardViewModel {
  /** Left side — `null` if the user saved the pair with only a right build. */
  left: SideViewModel | null;
  /** Right side — `null` if the user saved the pair with only a left build. */
  right: SideViewModel | null;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/og/src/colors.ts packages/og/src/view-model.ts
git commit -m "feat(og): Field Ledger color constants + card view-model types"
```

---

### Task 4: `truncate()` helper (TDD)

**Files:**

- Create: `packages/og/src/truncate.test.ts`
- Create: `packages/og/src/truncate.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/og/src/truncate.test.ts
import { describe, expect, it } from "vitest";
import { truncate } from "./truncate.js";

describe("truncate", () => {
  it("returns the input when under the limit", () => {
    expect(truncate("M4A1", 22)).toBe("M4A1");
  });

  it("returns the input when exactly at the limit", () => {
    expect(truncate("A".repeat(22), 22)).toBe("A".repeat(22));
  });

  it("truncates longer input and appends an ellipsis", () => {
    expect(truncate("A".repeat(30), 22)).toBe(`${"A".repeat(21)}…`);
  });

  it("is safe on empty input", () => {
    expect(truncate("", 22)).toBe("");
  });

  it("throws when max < 2 (can't fit 1 char + ellipsis)", () => {
    expect(() => truncate("abc", 1)).toThrow(/max/);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @tarkov/og test`
Expected: 5 failures, `truncate is not a function` / `Cannot find module`.

- [ ] **Step 3: Implement `packages/og/src/truncate.ts`**

```ts
/**
 * Single-line truncate with trailing `…`. `max` is the total length including
 * the ellipsis character (counts as 1). Used to clip headline overflow so the
 * card layout never wraps.
 */
export function truncate(input: string, max: number): string {
  if (max < 2) throw new Error(`truncate: max must be ≥ 2 (got ${max})`);
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1)}…`;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @tarkov/og test`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/og/src/truncate.ts packages/og/src/truncate.test.ts
git commit -m "feat(og): truncate helper + tests"
```

---

### Task 5: Add font files + `fonts.ts` loader

**Files:**

- Create: `packages/og/fonts/Bungee-Regular.ttf`
- Create: `packages/og/fonts/Chivo-700.ttf`
- Create: `packages/og/fonts/AzeretMono-500.ttf`
- Create: `packages/og/fonts/AzeretMono-700.ttf`
- Create: `packages/og/fonts/README.md`
- Create: `packages/og/src/fonts.ts`

- [ ] **Step 1: Download fonts**

Resolve the `.ttf` URLs from the Google Fonts CSS the SPA already loads. On a POSIX shell:

```bash
cd packages/og/fonts

curl -sS -A "Mozilla/5.0" "https://fonts.googleapis.com/css2?family=Bungee&family=Chivo:wght@700&family=Azeret+Mono:wght@500;700&display=swap" > /tmp/og-fonts.css
cat /tmp/og-fonts.css | grep -oE "https://[^)]+\.ttf" | sort -u
# => 4 URLs — one per face. If Google returns .woff2, add "&text=..." or fetch with curl's user-agent set as above (the user-agent above already selects .ttf).

# Download each:
curl -sSL -o Bungee-Regular.ttf       "<bungee-regular-url>"
curl -sSL -o Chivo-700.ttf            "<chivo-700-url>"
curl -sSL -o AzeretMono-500.ttf       "<azeret-mono-500-url>"
curl -sSL -o AzeretMono-700.ttf       "<azeret-mono-700-url>"

# Sanity:
file *.ttf   # each should report: "TrueType Font data"
```

If Google returns `.woff2` despite the user-agent, use `https://gwfh.mranftl.com/fonts` (Google Fonts helper) to fetch `.ttf` variants instead, picking the matching weights.

- [ ] **Step 2: Write `packages/og/fonts/README.md`**

```markdown
# Fonts

Font files for the Open Graph card renderer. Satori needs `ArrayBuffer`s at
render time; fetching at runtime inside a Cloudflare Worker is unreliable, so
these files are bundled alongside the Pages Function.

Must stay in sync with the Google Fonts `<link>` in
`apps/web/index.html`. If that link changes, re-run the download below and
regenerate `assets/fallback-card.png`.

| File                 | Family      | Weight | Source               |
| -------------------- | ----------- | ------ | -------------------- |
| `Bungee-Regular.ttf` | Bungee      | 400    | Google Fonts CSS API |
| `Chivo-700.ttf`      | Chivo       | 700    | Google Fonts CSS API |
| `AzeretMono-500.ttf` | Azeret Mono | 500    | Google Fonts CSS API |
| `AzeretMono-700.ttf` | Azeret Mono | 700    | Google Fonts CSS API |

Downloaded: 2026-04-21. Licensed under the SIL Open Font License 1.1.

## Regeneration

See `scripts/build-fallback-png.ts` — the fallback PNG is re-rendered from
these font files plus the card JSX whenever the design changes.
```

- [ ] **Step 3: Write `packages/og/src/fonts.ts`**

```ts
import type { SatoriOptions } from "satori";

type SatoriFont = NonNullable<SatoriOptions["fonts"]>[number];

const FONT_FILES: readonly { path: string; name: string; weight: 400 | 500 | 700 }[] = [
  { path: "../fonts/Bungee-Regular.ttf", name: "Bungee", weight: 400 },
  { path: "../fonts/Chivo-700.ttf", name: "Chivo", weight: 700 },
  { path: "../fonts/AzeretMono-500.ttf", name: "Azeret Mono", weight: 500 },
  { path: "../fonts/AzeretMono-700.ttf", name: "Azeret Mono", weight: 700 },
];

let cached: SatoriFont[] | null = null;

/**
 * Load the four `.ttf` files this package ships and return them in satori's
 * `fonts` option shape. The result is memoized per isolate — subsequent calls
 * return the same `ArrayBuffer`s.
 *
 * Works in both Node (vitest, scripts) and Cloudflare Pages Functions: the
 * `new URL("../fonts/...", import.meta.url)` pattern resolves to a real URL
 * in both environments, and `fetch()` handles `file://` in Node and the
 * co-located static asset in CF Pages.
 */
export async function loadFonts(): Promise<SatoriFont[]> {
  if (cached) return cached;
  const fonts = await Promise.all(
    FONT_FILES.map(async ({ path, name, weight }) => {
      const url = new URL(path, import.meta.url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`loadFonts: ${url} → ${res.status}`);
      const data = await res.arrayBuffer();
      return { name, weight, style: "normal", data } satisfies SatoriFont;
    }),
  );
  cached = fonts;
  return fonts;
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/og/fonts packages/og/src/fonts.ts
git commit -m "feat(og): bundle Bungee/Chivo/Azeret Mono fonts + loader"
```

---

### Task 6: `renderPng()` pipeline (TDD — one smoke)

**Files:**

- Create: `packages/og/src/render.test.ts`
- Create: `packages/og/src/render.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/og/src/render.test.ts
import { describe, expect, it } from "vitest";
import { renderPng } from "./render.js";
import { loadFonts } from "./fonts.js";

describe("renderPng", () => {
  it("produces a PNG from a trivial JSX tree", async () => {
    const fonts = await loadFonts();
    const jsx = {
      type: "div",
      props: {
        style: {
          width: 100,
          height: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000",
          color: "#fff",
          fontFamily: "Chivo",
          fontSize: 16,
        },
        children: "hi",
      },
    };
    const png = await renderPng(jsx, fonts, { width: 100, height: 50 });
    expect(png.byteLength).toBeGreaterThan(100);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  }, 20_000);
});
```

- [ ] **Step 2: Run — expect fail (module not found)**

Run: `pnpm --filter @tarkov/og test`
Expected: test errors with `Cannot find module 'render.js'`.

- [ ] **Step 3: Implement `packages/og/src/render.ts`**

```ts
import satori, { type SatoriOptions } from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

type SatoriFont = NonNullable<SatoriOptions["fonts"]>[number];

let resvgReady: Promise<void> | null = null;

/**
 * Lazy-initialize the resvg wasm binary. In Node the import resolves to the
 * .wasm file via package exports; in CF Pages Functions the bundler ships the
 * wasm alongside. Calling `initWasm()` more than once throws, so memoize.
 */
async function ensureResvgReady(): Promise<void> {
  if (resvgReady) return resvgReady;
  resvgReady = (async () => {
    const mod = await import("@resvg/resvg-wasm/index_bg.wasm");
    await initWasm(mod.default as unknown as WebAssembly.Module);
  })();
  return resvgReady;
}

export interface RenderOptions {
  width: number;
  height: number;
}

/**
 * Render satori JSX → SVG → PNG. Synchronous once wasm is initialized; cold
 * start pays one wasm init per isolate.
 */
export async function renderPng(
  jsx: Parameters<typeof satori>[0],
  fonts: SatoriFont[],
  opts: RenderOptions,
): Promise<Uint8Array> {
  await ensureResvgReady();
  const svg = await satori(jsx, { width: opts.width, height: opts.height, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: opts.width } });
  return resvg.render().asPng();
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @tarkov/og test -- render`
Expected: 1 pass (may take 5–10 s on cold-start).

If the `import("@resvg/resvg-wasm/index_bg.wasm")` path resolution fails: check the resvg-wasm package's exports map for the wasm asset name and adjust. On resvg-wasm 2.6.x it is `@resvg/resvg-wasm/index_bg.wasm`. If a future version renames the asset, update the import specifier and this step's instructions.

- [ ] **Step 5: Commit**

```bash
git add packages/og/src/render.ts packages/og/src/render.test.ts
git commit -m "feat(og): satori + resvg-wasm render pipeline"
```

---

### Task 7: `hydrate.ts` — pure view-model builder (TDD)

**Files:**

- Create: `packages/og/src/__fixtures__/m4a1-build.ts`
- Create: `packages/og/src/hydrate.test.ts`
- Create: `packages/og/src/hydrate.ts`

This task intentionally treats the hydrator as **pure** — it accepts already-fetched weapon / mod data as parameters, not a GraphQL client. The Pages Function in Phase 2 does the GraphQL fetch and then calls `hydrateBuildCard()`.

- [ ] **Step 1: Write the fixture**

```ts
// packages/og/src/__fixtures__/m4a1-build.ts
import type { BuildV4 } from "@tarkov/data";

/**
 * Hand-constructed BuildV4 + weapon/mod lookups. IDs are real Tarkov item IDs
 * from api.tarkov.dev; numeric values are representative but not guaranteed
 * to match live data (fixtures are frozen inputs, not data snapshots).
 */
export const m4a1Build: BuildV4 = {
  version: 4,
  weaponId: "5447a9cd4bdc2dbd208b4567", // M4A1
  attachments: {
    mod_pistol_grip: "55d4af3a4bdc2d972f8b456f",
    mod_stock: "5c793fc42e221600114ca25d",
    mod_barrel: "5b7be4895acfc400170e2dd5",
    mod_handguard: "5c9a1c3a2e221602b21d3533",
  },
  orphaned: [],
  createdAt: "2026-04-21T00:00:00.000Z",
  name: "RECOIL KING",
  description: "",
};

export interface FixtureWeapon {
  id: string;
  shortName: string;
  properties: { ergonomics: number; recoilVertical: number; recoilHorizontal: number } | null;
}

export interface FixtureMod {
  id: string;
  shortName: string;
  weight: number;
  buyFor: { priceRUB: number }[];
  properties: {
    ergonomics?: number;
    recoilModifier?: number;
    accuracyModifier?: number;
  } | null;
}

export const m4a1Weapon: FixtureWeapon = {
  id: "5447a9cd4bdc2dbd208b4567",
  shortName: "M4A1",
  properties: { ergonomics: 48, recoilVertical: 120, recoilHorizontal: 344 },
};

export const m4a1Mods: FixtureMod[] = [
  {
    id: "55d4af3a4bdc2d972f8b456f",
    shortName: "ERGO",
    weight: 0.07,
    buyFor: [{ priceRUB: 12_000 }],
    properties: { ergonomics: 6, recoilModifier: -3 },
  },
  {
    id: "5c793fc42e221600114ca25d",
    shortName: "STOCK",
    weight: 0.32,
    buyFor: [{ priceRUB: 42_000 }],
    properties: { ergonomics: -4, recoilModifier: -22 },
  },
  {
    id: "5b7be4895acfc400170e2dd5",
    shortName: "BARREL",
    weight: 0.61,
    buyFor: [{ priceRUB: 36_000 }],
    properties: { recoilModifier: -9, accuracyModifier: 0.5 },
  },
  {
    id: "5c9a1c3a2e221602b21d3533",
    shortName: "HG",
    weight: 0.4,
    buyFor: [{ priceRUB: 28_000 }],
    properties: { ergonomics: 10, recoilModifier: -7 },
  },
];
```

- [ ] **Step 2: Write failing test**

```ts
// packages/og/src/hydrate.test.ts
import { describe, expect, it } from "vitest";
import { hydrateBuildCard } from "./hydrate.js";
import { m4a1Build, m4a1Weapon, m4a1Mods } from "./__fixtures__/m4a1-build.js";

describe("hydrateBuildCard", () => {
  it("uses BuildV4.name as title and weapon shortName as subtitle", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    expect(vm.title).toBe("RECOIL KING");
    expect(vm.subtitle).toBe("M4A1");
  });

  it("falls back to weapon shortName when BuildV4.name is empty", () => {
    const vm = hydrateBuildCard({
      build: { ...m4a1Build, name: "" },
      weapon: m4a1Weapon,
      mods: m4a1Mods,
    });
    expect(vm.title).toBe("M4A1");
    expect(vm.subtitle).toBeNull();
  });

  it("counts attachments", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    expect(vm.modCount).toBe(4);
  });

  it("sums buyFor prices to priceRub", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    expect(vm.priceRub).toBe(12_000 + 42_000 + 36_000 + 28_000);
  });

  it("returns null priceRub when any mod is missing buyFor", () => {
    const mods = m4a1Mods.map((m, i) => (i === 0 ? { ...m, buyFor: [] } : m));
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods });
    expect(vm.priceRub).toBeNull();
  });

  it("computes stats via weaponSpec aggregation", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    // Base ergo 48 + (6 - 4 + 0 + 10) = 60; recoilV 120 * (1 - 0.03 - 0.22 - 0.09 - 0.07) ≈ 120*0.59.
    // Exact values come from ballistics.weaponSpec; assert plausibility + finiteness.
    expect(vm.stats.ergo).toBeGreaterThan(40);
    expect(vm.stats.ergo).toBeLessThan(100);
    expect(vm.stats.recoilV).toBeGreaterThan(0);
    expect(vm.stats.recoilV).toBeLessThan(120);
    expect(vm.stats.weight).toBeCloseTo(0.07 + 0.32 + 0.61 + 0.4, 2);
  });

  it("sets availability to FLEA by default (no profileSnapshot)", () => {
    const vm = hydrateBuildCard({ build: m4a1Build, weapon: m4a1Weapon, mods: m4a1Mods });
    expect(vm.availability).toBe("FLEA");
  });
});
```

- [ ] **Step 3: Run — expect fail**

Run: `pnpm --filter @tarkov/og test -- hydrate`
Expected: tests error with module-not-found.

- [ ] **Step 4: Implement `packages/og/src/hydrate.ts`**

```ts
import type { BuildV4 } from "@tarkov/data";
import { weaponSpec } from "@tarkov/ballistics";
import type { BuildCardViewModel, PairCardViewModel, SideViewModel } from "./view-model.js";

export interface HydrateWeapon {
  id: string;
  shortName: string;
  properties: { ergonomics: number; recoilVertical: number; recoilHorizontal: number } | null;
}

export interface HydrateMod {
  id: string;
  shortName: string;
  weight: number;
  buyFor: { priceRUB: number }[];
  properties: {
    ergonomics?: number;
    recoilModifier?: number;
    accuracyModifier?: number;
  } | null;
}

export interface HydrateBuildArgs {
  build: BuildV4;
  weapon: HydrateWeapon;
  mods: readonly HydrateMod[];
}

/**
 * Convert a `BuildV4` + its GraphQL lookups into a `BuildCardViewModel`.
 *
 * Pure: no fetches, no side effects. The Pages Function does the GraphQL
 * roundtrip, passes the rows in, and feeds the result into `buildCard()`.
 */
export function hydrateBuildCard(args: HydrateBuildArgs): BuildCardViewModel {
  const { build, weapon, mods } = args;
  const attachedIds = Object.values(build.attachments);
  const attachedMods = attachedIds
    .map((id) => mods.find((m) => m.id === id))
    .filter((m): m is HydrateMod => m !== undefined);

  const modCount = attachedMods.length;

  const title = build.name && build.name.length > 0 ? build.name : weapon.shortName;
  const subtitle = build.name && build.name.length > 0 ? weapon.shortName : null;

  const priceRub =
    attachedMods.length === modCount && attachedMods.every((m) => m.buyFor.length > 0)
      ? attachedMods.reduce((sum, m) => sum + Math.min(...m.buyFor.map((b) => b.priceRUB)), 0)
      : null;

  const spec = weapon.properties
    ? weaponSpec(
        {
          id: weapon.id,
          ergonomics: weapon.properties.ergonomics,
          recoilVertical: weapon.properties.recoilVertical,
          recoilHorizontal: weapon.properties.recoilHorizontal,
          weight: 0,
        },
        attachedMods.map((m) => ({
          id: m.id,
          weight: m.weight,
          ergonomics: m.properties?.ergonomics ?? 0,
          recoilModifier: m.properties?.recoilModifier ?? 0,
          accuracyModifier: m.properties?.accuracyModifier ?? 0,
        })),
      )
    : null;

  const stats = {
    ergo: spec?.ergonomics ?? null,
    recoilV: spec?.recoilVertical ?? null,
    recoilH: spec?.recoilHorizontal ?? null,
    weight: attachedMods.reduce((s, m) => s + m.weight, 0),
    accuracy: spec?.accuracy ?? null,
  };

  return {
    title,
    subtitle,
    modCount,
    availability: "FLEA",
    priceRub,
    stats,
  };
}

export interface HydratePairArgs {
  left: HydrateBuildArgs | null;
  right: HydrateBuildArgs | null;
}

export function hydratePairCard(args: HydratePairArgs): PairCardViewModel {
  const makeSide = (a: HydrateBuildArgs): SideViewModel => {
    const vm = hydrateBuildCard(a);
    return {
      weapon: a.weapon.shortName,
      modCount: vm.modCount,
      availability: vm.availability,
      stats: {
        ergo: vm.stats.ergo,
        recoilV: vm.stats.recoilV,
        recoilH: vm.stats.recoilH,
        weight: vm.stats.weight,
      },
    };
  };
  return {
    left: args.left ? makeSide(args.left) : null,
    right: args.right ? makeSide(args.right) : null,
  };
}
```

Adapt the ballistics import to the real exports: `weaponSpec` takes `BallisticWeapon` + `BallisticMod[]` and returns `WeaponSpec`. If the real shape differs, update the call-site and tests together — the assertions above only check ranges, not exact numbers.

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @tarkov/og test -- hydrate`
Expected: 7 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/og/src/hydrate.ts packages/og/src/hydrate.test.ts packages/og/src/__fixtures__/m4a1-build.ts
git commit -m "feat(og): hydrateBuildCard + hydratePairCard pure functions"
```

Note: availability defaults to `FLEA` here because the hydrator has no profile / trader-availability data in-hand. Phase 2's Pages Function will overwrite `availability` post-hydration once it runs `itemAvailability` against `BuildV4.profileSnapshot`.

---

### Task 8: `build-card.tsx` (layout C)

**Files:**

- Create: `packages/og/src/build-card.test.ts`
- Create: `packages/og/src/build-card.tsx`

Satori supports `display: flex` (not `grid`) reliably. The stat row uses flex with `flex: 1` per cell.

- [ ] **Step 1: Write failing test**

```ts
// packages/og/src/build-card.test.ts
import { describe, expect, it } from "vitest";
import satori from "satori";
import { buildCard } from "./build-card.js";
import { loadFonts } from "./fonts.js";
import type { BuildCardViewModel } from "./view-model.js";

const vm: BuildCardViewModel = {
  title: "RECOIL KING",
  subtitle: "M4A1",
  modCount: 11,
  availability: "LL3",
  priceRub: 187_240,
  stats: { ergo: 52, recoilV: 88, recoilH: 215, weight: 3.4, accuracy: 3.2 },
};

describe("buildCard", () => {
  it("renders all view-model text into the SVG", async () => {
    const fonts = await loadFonts();
    const svg = await satori(buildCard(vm), { width: 1200, height: 630, fonts });
    expect(svg).toMatch(/RECOIL KING/);
    expect(svg).toMatch(/M4A1/);
    expect(svg).toMatch(/11 MODS/);
    expect(svg).toMatch(/LL3/);
    expect(svg).toMatch(/SHAREABLE/);
    expect(svg).toMatch(/ERGO/);
    expect(svg).toMatch(/RECOIL V/);
    expect(svg).toMatch(/RECOIL H/);
    expect(svg).toMatch(/WEIGHT/);
    expect(svg).toMatch(/ACCURACY/);
    expect(svg).toMatch(/SHARED BUILD/);
    expect(svg).toMatch(/TARKOVGUNSMITH/);
    expect(svg).toMatch(/187 240|187,240/);
  });

  it("omits the price pill when priceRub is null", async () => {
    const fonts = await loadFonts();
    const svg = await satori(buildCard({ ...vm, priceRub: null }), {
      width: 1200,
      height: 630,
      fonts,
    });
    expect(svg).not.toMatch(/₽/);
  });

  it("omits the subtitle when build has no name (title already carries weapon)", async () => {
    const fonts = await loadFonts();
    const svg = await satori(buildCard({ ...vm, title: "M4A1", subtitle: null }), {
      width: 1200,
      height: 630,
      fonts,
    });
    // Weapon appears only as the Bungee headline; no Chivo sub-header echo.
    const occurrences = (svg.match(/M4A1/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("renders — for missing stats", async () => {
    const fonts = await loadFonts();
    const svg = await satori(
      buildCard({
        ...vm,
        stats: { ergo: null, recoilV: null, recoilH: null, weight: null, accuracy: null },
      }),
      { width: 1200, height: 630, fonts },
    );
    expect(svg).toMatch(/—/);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @tarkov/og test -- build-card`
Expected: 4 errors, module not found.

- [ ] **Step 3: Implement `packages/og/src/build-card.tsx`**

```tsx
import type { ReactNode } from "react";
import { COLORS } from "./colors.js";
import { truncate } from "./truncate.js";
import type { BuildCardViewModel } from "./view-model.js";

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 72;
const BRACKET = 40;
const BRACKET_STROKE = 4;

const fontDisplay = "Bungee";
const fontSans = "Chivo";
const fontMono = "Azeret Mono";

function Bracket({ corner }: { corner: "tl" | "tr" | "bl" | "br" }): ReactNode {
  const base = {
    position: "absolute" as const,
    width: BRACKET,
    height: BRACKET,
    border: `${BRACKET_STROKE}px solid ${COLORS.amber}`,
  };
  const pos =
    corner === "tl"
      ? { top: 28, left: 28, borderRight: "none", borderBottom: "none" }
      : corner === "tr"
        ? { top: 28, right: 28, borderLeft: "none", borderBottom: "none" }
        : corner === "bl"
          ? { bottom: 28, left: 28, borderRight: "none", borderTop: "none" }
          : { bottom: 28, right: 28, borderLeft: "none", borderTop: "none" };
  return <div style={{ ...base, ...pos }} />;
}

function Pill({ children, tone }: { children: ReactNode; tone: "amber" | "paper" }): ReactNode {
  const color = tone === "amber" ? COLORS.amber : COLORS.paperDim;
  return (
    <div
      style={{
        display: "flex",
        fontFamily: fontMono,
        fontSize: 22,
        fontWeight: 500,
        color,
        border: `1.5px solid ${color}`,
        padding: "6px 16px",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 8 }}>
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 20,
          color: COLORS.paperDim,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 44,
          fontWeight: 700,
          color: COLORS.foreground,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function fmt(n: number | null, digits = 0): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function buildCard(vm: BuildCardViewModel): ReactNode {
  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        background: COLORS.background,
        color: COLORS.foreground,
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Bracket corner="tl" />
      <Bracket corner="tr" />
      <Bracket corner="bl" />
      <Bracket corner="br" />

      {/* SHAREABLE stamp */}
      <div
        style={{
          position: "absolute",
          top: 44,
          right: 72,
          fontFamily: fontMono,
          fontSize: 22,
          color: COLORS.amber,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
        }}
      >
        SHAREABLE
      </div>

      {/* Headline + optional subtitle */}
      <div
        style={{
          position: "absolute",
          top: 108,
          left: PAD,
          right: PAD,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: fontDisplay,
            fontSize: 72,
            color: COLORS.foreground,
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          {truncate(vm.title, 22)}
        </div>
        {vm.subtitle && (
          <div style={{ fontFamily: fontSans, fontSize: 24, color: COLORS.paperDim }}>
            {vm.subtitle}
          </div>
        )}
      </div>

      {/* Pill row */}
      <div
        style={{
          position: "absolute",
          top: 260,
          left: PAD,
          right: PAD,
          display: "flex",
          gap: 12,
        }}
      >
        <Pill tone="amber">{vm.availability}</Pill>
        <Pill tone="paper">{vm.modCount} MODS</Pill>
        {vm.priceRub !== null && <Pill tone="paper">₽ {vm.priceRub.toLocaleString("en-US")}</Pill>}
      </div>

      {/* Stat row */}
      <div
        style={{
          position: "absolute",
          bottom: 104,
          left: PAD,
          right: PAD,
          display: "flex",
          gap: 32,
          paddingTop: 24,
          borderTop: `1px dashed ${COLORS.border}`,
        }}
      >
        <StatCell label="ERGO" value={fmt(vm.stats.ergo)} />
        <StatCell label="RECOIL V" value={fmt(vm.stats.recoilV)} />
        <StatCell label="RECOIL H" value={fmt(vm.stats.recoilH)} />
        <StatCell label="WEIGHT" value={fmt(vm.stats.weight, 2)} />
        <StatCell label="ACCURACY" value={fmt(vm.stats.accuracy, 1)} />
      </div>

      {/* Brand */}
      <div
        style={{
          position: "absolute",
          bottom: 44,
          left: PAD,
          display: "flex",
          fontFamily: fontMono,
          fontSize: 24,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          gap: 8,
        }}
      >
        <span style={{ color: COLORS.amber }}>▲ TARKOVGUNSMITH</span>
        <span style={{ color: COLORS.paperDim }}>· SHARED BUILD</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @tarkov/og test -- build-card`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/og/src/build-card.tsx packages/og/src/build-card.test.ts
git commit -m "feat(og): build card JSX (layout C) + snapshot tests"
```

---

### Task 9: `pair-card.tsx` (layout A)

**Files:**

- Create: `packages/og/src/__fixtures__/pair-sample.ts`
- Create: `packages/og/src/pair-card.test.ts`
- Create: `packages/og/src/pair-card.tsx`

- [ ] **Step 1: Write fixture**

```ts
// packages/og/src/__fixtures__/pair-sample.ts
import type { PairCardViewModel } from "../view-model.js";

export const pairSample: PairCardViewModel = {
  left: {
    weapon: "M4A1",
    modCount: 11,
    availability: "LL3",
    stats: { ergo: 52, recoilV: 88, recoilH: 215, weight: 3.4 },
  },
  right: {
    weapon: "HK 416A5",
    modCount: 9,
    availability: "LL4",
    stats: { ergo: 49, recoilV: 94, recoilH: 248, weight: 3.8 },
  },
};

export const pairOneSided: PairCardViewModel = {
  left: pairSample.left,
  right: null,
};
```

- [ ] **Step 2: Write failing test**

```ts
// packages/og/src/pair-card.test.ts
import { describe, expect, it } from "vitest";
import satori from "satori";
import { pairCard } from "./pair-card.js";
import { loadFonts } from "./fonts.js";
import { pairSample, pairOneSided } from "./__fixtures__/pair-sample.js";

describe("pairCard", () => {
  it("renders both sides + VS + weapon names", async () => {
    const fonts = await loadFonts();
    const svg = await satori(pairCard(pairSample), { width: 1200, height: 630, fonts });
    expect(svg).toMatch(/BUILD A/);
    expect(svg).toMatch(/BUILD B/);
    expect(svg).toMatch(/M4A1/);
    expect(svg).toMatch(/HK 416A5/);
    expect(svg).toMatch(/VS/);
    expect(svg).toMatch(/BUILD COMPARISON/);
    expect(svg).toMatch(/ERGO/);
    expect(svg).toMatch(/RECOIL V/);
    expect(svg).toMatch(/RECOIL H/);
    expect(svg).toMatch(/WEIGHT/);
  });

  it("renders EMPTY SLOT for a missing side", async () => {
    const fonts = await loadFonts();
    const svg = await satori(pairCard(pairOneSided), { width: 1200, height: 630, fonts });
    expect(svg).toMatch(/EMPTY SLOT/);
    expect(svg).toMatch(/M4A1/); // left still renders
  });
});
```

- [ ] **Step 3: Run — expect fail**

Run: `pnpm --filter @tarkov/og test -- pair-card`
Expected: 2 errors, module not found.

- [ ] **Step 4: Implement `packages/og/src/pair-card.tsx`**

```tsx
import type { ReactNode } from "react";
import { COLORS } from "./colors.js";
import { truncate } from "./truncate.js";
import type { PairCardViewModel, SideViewModel } from "./view-model.js";

const WIDTH = 1200;
const HEIGHT = 630;
const BRACKET = 40;
const BRACKET_STROKE = 4;

const fontDisplay = "Bungee";
const fontMono = "Azeret Mono";

function Bracket({ corner }: { corner: "tl" | "tr" | "bl" | "br" }): ReactNode {
  const base = {
    position: "absolute" as const,
    width: BRACKET,
    height: BRACKET,
    border: `${BRACKET_STROKE}px solid ${COLORS.amber}`,
  };
  const pos =
    corner === "tl"
      ? { top: 28, left: 28, borderRight: "none", borderBottom: "none" }
      : corner === "tr"
        ? { top: 28, right: 28, borderLeft: "none", borderBottom: "none" }
        : corner === "bl"
          ? { bottom: 28, left: 28, borderRight: "none", borderTop: "none" }
          : { bottom: 28, right: 28, borderLeft: "none", borderTop: "none" };
  return <div style={{ ...base, ...pos }} />;
}

function fmt(n: number | null, digits = 0): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function Side({
  side,
  label,
  tone,
}: {
  side: SideViewModel | null;
  label: "BUILD A" | "BUILD B";
  tone: "paper" | "amber";
}): ReactNode {
  const nameColor = tone === "amber" ? COLORS.amber : COLORS.foreground;
  if (!side) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "100px 72px",
          gap: 24,
        }}
      >
        <div
          style={{
            fontFamily: fontMono,
            fontSize: 20,
            color: COLORS.paperDim,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: fontDisplay,
            fontSize: 48,
            color: COLORS.paperDim,
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          EMPTY SLOT
        </div>
      </div>
    );
  }
  const rows: [string, string][] = [
    ["ERGO", fmt(side.stats.ergo)],
    ["RECOIL V", fmt(side.stats.recoilV)],
    ["RECOIL H", fmt(side.stats.recoilH)],
    ["WEIGHT", fmt(side.stats.weight, 2)],
  ];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "100px 72px",
        gap: 18,
      }}
    >
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 20,
          color: COLORS.paperDim,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 48,
          color: nameColor,
          textTransform: "uppercase",
          lineHeight: 1,
        }}
      >
        {truncate(side.weapon, 14)}
      </div>
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 22,
          color: COLORS.paperDim,
          letterSpacing: "0.05em",
        }}
      >
        {side.modCount} MODS · {side.availability}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 12,
          gap: 10,
        }}
      >
        {rows.map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: fontMono,
              borderBottom: `1px dashed ${COLORS.lineMuted}`,
              paddingBottom: 6,
            }}
          >
            <span style={{ color: COLORS.paperDim, fontSize: 22, letterSpacing: "0.1em" }}>
              {k}
            </span>
            <span style={{ color: COLORS.foreground, fontSize: 26, fontWeight: 700 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function pairCard(vm: PairCardViewModel): ReactNode {
  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        background: COLORS.background,
        color: COLORS.foreground,
        position: "relative",
        display: "flex",
      }}
    >
      <Bracket corner="tl" />
      <Bracket corner="tr" />
      <Bracket corner="bl" />
      <Bracket corner="br" />

      {/* Divider */}
      <div
        style={{
          position: "absolute",
          top: 100,
          bottom: 100,
          left: WIDTH / 2 - 0.5,
          width: 1,
          background: COLORS.border,
        }}
      />

      {/* VS circle */}
      <div
        style={{
          position: "absolute",
          top: HEIGHT / 2 - 42,
          left: WIDTH / 2 - 42,
          width: 84,
          height: 84,
          border: `4px solid ${COLORS.amber}`,
          background: COLORS.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fontDisplay,
          fontSize: 32,
          color: COLORS.amber,
        }}
      >
        VS
      </div>

      <Side side={vm.left} label="BUILD A" tone="paper" />
      <Side side={vm.right} label="BUILD B" tone="amber" />

      {/* Brand */}
      <div
        style={{
          position: "absolute",
          bottom: 44,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          fontFamily: fontMono,
          fontSize: 22,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          gap: 8,
        }}
      >
        <span style={{ color: COLORS.amber }}>▲ TARKOVGUNSMITH</span>
        <span style={{ color: COLORS.paperDim }}>· BUILD COMPARISON</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @tarkov/og test -- pair-card`
Expected: 2 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/og/src/pair-card.tsx packages/og/src/pair-card.test.ts packages/og/src/__fixtures__/pair-sample.ts
git commit -m "feat(og): pair card JSX (layout A — mirror split) + snapshot tests"
```

---

### Task 10: Fallback card — script + committed PNG

**Files:**

- Create: `packages/og/scripts/build-fallback-png.ts`
- Create: `packages/og/assets/fallback-card.png`

- [ ] **Step 1: Write `packages/og/scripts/build-fallback-png.ts`**

```ts
/* eslint-disable no-console */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { COLORS } from "../src/colors.js";
import { loadFonts } from "../src/fonts.js";
import { renderPng } from "../src/render.js";

const WIDTH = 1200;
const HEIGHT = 630;

function fallbackCard(): ReactNode {
  const bracket = (pos: Record<string, number | string>): ReactNode => (
    <div
      style={{
        position: "absolute",
        width: 40,
        height: 40,
        border: `4px solid ${COLORS.amber}`,
        ...pos,
      }}
    />
  );
  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        background: COLORS.background,
        color: COLORS.foreground,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      {bracket({ top: 28, left: 28, borderRight: "none", borderBottom: "none" })}
      {bracket({ top: 28, right: 28, borderLeft: "none", borderBottom: "none" })}
      {bracket({ bottom: 28, left: 28, borderRight: "none", borderTop: "none" })}
      {bracket({ bottom: 28, right: 28, borderLeft: "none", borderTop: "none" })}
      <div
        style={{
          fontFamily: "Bungee",
          fontSize: 84,
          textTransform: "uppercase",
          color: COLORS.foreground,
          lineHeight: 1,
        }}
      >
        BUILD NOT FOUND
      </div>
      <div style={{ fontFamily: "Chivo", fontSize: 28, color: COLORS.paperDim }}>
        link expired or never existed
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 44,
          display: "flex",
          fontFamily: "Azeret Mono",
          fontSize: 22,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          gap: 8,
        }}
      >
        <span style={{ color: COLORS.amber }}>▲ TARKOVGUNSMITH</span>
      </div>
    </div>
  );
}

async function main(): Promise<void> {
  const fonts = await loadFonts();
  const png = await renderPng(fallbackCard(), fonts, { width: WIDTH, height: HEIGHT });
  const out = resolve(import.meta.dirname, "../assets/fallback-card.png");
  writeFileSync(out, png);
  console.log(`wrote ${out} (${png.byteLength} bytes)`);
}

void main();
```

- [ ] **Step 2: Generate the PNG**

```bash
mkdir -p packages/og/assets
pnpm --filter @tarkov/og run build:fallback
file packages/og/assets/fallback-card.png   # => PNG image data, 1200 x 630
```

- [ ] **Step 3: Commit**

```bash
git add packages/og/scripts/build-fallback-png.ts packages/og/assets/fallback-card.png
git commit -m "feat(og): fallback card — build script + pre-rendered PNG"
```

---

### Task 11: Package CLAUDE.md + PR 1 wrap-up

**Files:**

- Create: `packages/og/CLAUDE.md`

- [ ] **Step 1: Write `packages/og/CLAUDE.md`**

````markdown
# `@tarkov/og`

Server-side rendering of 1200×630 Open Graph card PNGs for TarkovGunsmith
share URLs. Pure-TS, runs in both Node and Cloudflare Workers — satori for
JSX → SVG, `@resvg/resvg-wasm` for SVG → PNG.

## What's in this package

- `src/build-card.tsx` — JSX for the build card (layout C).
- `src/pair-card.tsx` — JSX for the pair card (layout A — mirror split).
- `src/hydrate.ts` — `hydrateBuildCard` / `hydratePairCard` — pure view-model
  builders. Consumers fetch the GraphQL data and pass it in.
- `src/render.ts` — `renderPng(jsx, fonts, { width, height })`.
- `src/fonts.ts` — `loadFonts()` reads the bundled `.ttf` files.
- `src/colors.ts` — Field Ledger hex constants mirroring the SPA tokens.
- `src/truncate.ts` — single-line headline truncate with `…`.
- `assets/fallback-card.png` — pre-rendered `BUILD NOT FOUND` card, served by
  the Pages Function on KV-miss / render failure.
- `fonts/` — the four `.ttf` files satori loads at render time.

## Conventions

- **Satori supports inline styles only.** No className, no CSS. All layout is
  flex with absolute positioning.
- **Pure functions.** `hydrate.ts` takes rows, not GraphQL clients. The Pages
  Function does the fetch; this package never touches the network (except
  satori's font loads, which resolve locally).
- **Field Ledger fidelity.** Colors and font names MUST match
  `packages/ui/src/styles/index.css`. If the SPA palette or `<link>` font stack
  changes, regenerate `assets/fallback-card.png` via
  `pnpm --filter @tarkov/og run build:fallback`.
- **No DOM.** This package runs in Workers; no `window`, no `document`.

## Local dev

```bash
pnpm --filter @tarkov/og test           # vitest
pnpm --filter @tarkov/og build          # tsc
pnpm --filter @tarkov/og run build:fallback  # regenerate the fallback PNG
```
````

## Runtime notes

- First `renderPng()` call per Node / isolate pays a wasm init cost (~200 ms
  in Node, variable in CF Workers). Subsequent calls in the same isolate skip
  it.
- `loadFonts()` memoizes per-isolate; safe to call in a tight loop.
- Satori snapshot tests assert text nodes appear in the SVG. No pixel-diff
  testing — resvg output shifts with wasm versions.

````

- [ ] **Step 2: Full local verification**

```bash
pnpm --filter @tarkov/og build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
````

Expected: all pass. New test count: ~18 tests in `@tarkov/og`.

- [ ] **Step 3: Commit CLAUDE.md**

```bash
git add packages/og/CLAUDE.md
git commit -m "docs(og): package README / conventions"
```

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin feat/og-package
gh pr create --title "feat(og): @tarkov/og package — Satori card renderer" --body "$(cat <<'EOF'
## Summary

First of two PRs for M3 differentiator #4 (OG share cards). Ships the pure
rendering layer; no routes are wired up yet (deployable no-op).

- New `packages/og` workspace with satori-based JSX cards (layout C build,
  layout A pair), `@resvg/resvg-wasm` pipeline, and Field Ledger hex
  constants mirrored from `packages/ui`.
- Bundled fonts (Bungee / Chivo 700 / Azeret Mono 500 + 700) downloaded from
  Google Fonts — ~355 KB total.
- Pre-rendered fallback card committed as `assets/fallback-card.png` for the
  Pages Function to serve on KV-miss in PR 2.
- Pure `hydrateBuildCard` / `hydratePairCard` take already-fetched GraphQL
  rows and produce view-models. No network in this package.

Spec: `docs/superpowers/specs/2026-04-21-og-share-cards-design.md` (§3, §4, §6).

## Test counts

| Package | Before | After |
| --- | ---:| ---:|
| `@tarkov/og` | — | 18 |

Follow-up PR (`feat/og-functions`) wires the endpoints + middleware + Playwright smoke.

## Test plan

- [x] `packages/og` unit + snapshot tests (18 tests)
- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` green
- [x] `pnpm --filter @tarkov/og run build:fallback` regenerates a valid PNG
- [ ] Visual verification deferred to PR 2 (smoke tests there open real endpoints)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Wait for CI green, merge**

```bash
gh pr checks --watch
gh pr merge --squash
```

**Then return to the default worktree and prune.**

---

## Phase 2 — Pages Functions + middleware + fixtures (PR 2)

Phase 2 branches off `origin/main` after Phase 1 is merged. New worktree.

### File map (PR 2)

| Path                                        | Purpose                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/web/functions/_middleware.ts`         | Inject OG meta into `/builder/:id` + `/builder/compare/:pairId` HTML responses.  |
| `apps/web/functions/og/build/[id].ts`       | `/og/build/:id` PNG endpoint.                                                    |
| `apps/web/functions/og/pair/[pairId].ts`    | `/og/pair/:pairId` PNG endpoint.                                                 |
| `apps/web/functions/lib/og-graphql.ts`      | Small GraphQL client: fetch weapon + mods by IDs from `api.tarkov.dev`.          |
| `apps/web/functions/lib/og-availability.ts` | Map `BuildV4` + `HydrateMod[]` → `FLEA \| LL2..LL4` pill.                        |
| `apps/web/package.json`                     | Add `@tarkov/og` workspace dep.                                                  |
| `apps/builds-api/src/og-fixtures.ts`        | Seed logic + known fixture data.                                                 |
| `apps/builds-api/src/index.ts`              | Call into `seedOgFixturesIfConfigured()` on first request.                       |
| `apps/builds-api/wrangler.jsonc`            | Add optional vars (`OG_FIXTURE_BUILD_ID`, `OG_FIXTURE_PAIR_ID`) to dev-only env. |
| `apps/builds-api/worker-configuration.d.ts` | Regenerated via `wrangler types`.                                                |
| `apps/builds-api/src/og-fixtures.test.ts`   | Unit test for seed logic.                                                        |
| `apps/web/e2e/smoke.spec.ts`                | 4 new assertions.                                                                |

### Task 12: New worktree

- [ ] **Step 1: Create worktree**

```bash
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git fetch origin main
git worktree add .worktrees/og-fn -b feat/og-functions origin/main
cd .worktrees/og-fn
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
```

- [ ] **Step 2: Baseline green**

```bash
pnpm test
pnpm --filter @tarkov/web build
```

Expected: all pass. `@tarkov/og` should appear in the workspace graph now that PR 1 is on `main`.

---

### Task 13: Add `@tarkov/og` dep + copy fonts/assets to apps/web

**Files:**

- Modify: `apps/web/package.json`

- [ ] **Step 1: Add dep**

```bash
pnpm --filter @tarkov/web add @tarkov/og@workspace:\*
```

The resulting `apps/web/package.json` now has:

```jsonc
  "dependencies": {
    // ...
    "@tarkov/og": "workspace:*",
    // ...
  },
```

- [ ] **Step 2: Verify import resolves**

Run: `pnpm --filter @tarkov/web exec tsx -e "import('@tarkov/og').then(m => console.log(Object.keys(m)))"`
Expected: prints `[ 'buildCard', 'pairCard', 'renderPng', 'loadFonts', 'hydrateBuildCard', 'hydratePairCard', 'truncate', 'COLORS' ]`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): depend on @tarkov/og workspace"
```

---

### Task 14: Availability helper — TDD

**Files:**

- Create: `apps/web/functions/lib/og-availability.test.ts` (vitest, node env)
- Create: `apps/web/functions/lib/og-availability.ts`

Note: Pages Functions `functions/**` are normally excluded from the vitest `include` pattern. Add them to `apps/web/vitest.config.ts` under `include` before writing this test (one-line change).

- [ ] **Step 1: Add functions/lib to vitest include**

Modify `apps/web/vitest.config.ts` — add `"functions/lib/**/*.test.ts"` to the `test.include` array.

- [ ] **Step 2: Write failing test**

```ts
// apps/web/functions/lib/og-availability.test.ts
import { describe, expect, it } from "vitest";
import { availabilityPillText, type AvailabilityMod } from "./og-availability.js";
import type { PlayerProfile } from "@tarkov/data";

const defaultProfile: PlayerProfile = {
  mode: "basic",
  traders: {
    prapor: 4,
    therapist: 4,
    skier: 4,
    peacekeeper: 4,
    mechanic: 4,
    ragman: 4,
    jaeger: 4,
  },
  flea: true,
};

describe("availabilityPillText", () => {
  it("clamps LL1-accessible mods to the LL2 pill (no LL1 pill in the spec)", () => {
    const mods: AvailabilityMod[] = [
      { id: "a", buyFor: [{ vendor: { normalizedName: "prapor" }, priceRUB: 100 }] },
      { id: "b", buyFor: [{ vendor: { normalizedName: "skier" }, priceRUB: 100 }] },
    ];
    expect(
      availabilityPillText(mods, {
        ...defaultProfile,
        traders: { ...defaultProfile.traders, prapor: 1, skier: 1 },
      }),
    ).toBe("LL2");
  });

  it("returns FLEA when any mod is flea-only", () => {
    const mods: AvailabilityMod[] = [
      { id: "a", buyFor: [{ vendor: { normalizedName: "flea-market" }, priceRUB: 100 }] },
    ];
    expect(availabilityPillText(mods, defaultProfile)).toBe("FLEA");
  });

  it("returns LL4 when a trader-only mod needs LL4", () => {
    const mods: AvailabilityMod[] = [
      {
        id: "a",
        buyFor: [{ vendor: { normalizedName: "peacekeeper" }, priceRUB: 100, minTraderLevel: 4 }],
      },
    ];
    expect(availabilityPillText(mods, defaultProfile)).toBe("LL4");
  });

  it("empty mods → LL2 (no constraints)", () => {
    expect(availabilityPillText([], defaultProfile)).toBe("LL2");
  });
});
```

- [ ] **Step 3: Run — expect fail**

Run: `pnpm --filter @tarkov/web test -- og-availability`
Expected: module not found.

- [ ] **Step 4: Implement `apps/web/functions/lib/og-availability.ts`**

```ts
import type { PlayerProfile } from "@tarkov/data";

export interface AvailabilityOffer {
  vendor: { normalizedName: string };
  priceRUB: number;
  minTraderLevel?: number;
}

export interface AvailabilityMod {
  id: string;
  buyFor: AvailabilityOffer[];
}

export type AvailabilityPill = "FLEA" | "LL2" | "LL3" | "LL4";

/**
 * Summarize the lowest trader level that covers every mod in the build.
 * If any mod is only purchasable on flea, returns "FLEA". Otherwise returns
 * the minimum "LL{n}" that still covers the highest minTraderLevel seen.
 * LL1 is not a distinct pill — clamp to "LL2" (spec §4.1).
 */
export function availabilityPillText(
  mods: readonly AvailabilityMod[],
  _profile: PlayerProfile,
): AvailabilityPill {
  let needsFlea = false;
  let maxLevel = 1;

  for (const mod of mods) {
    if (mod.buyFor.length === 0) {
      needsFlea = true;
      continue;
    }
    const traderOffers = mod.buyFor.filter((o) => o.vendor.normalizedName !== "flea-market");
    if (traderOffers.length === 0) {
      needsFlea = true;
      continue;
    }
    const modMin = Math.min(...traderOffers.map((o) => o.minTraderLevel ?? 1));
    if (modMin > maxLevel) maxLevel = modMin;
  }

  if (needsFlea) return "FLEA";
  if (maxLevel >= 4) return "LL4";
  if (maxLevel >= 3) return "LL3";
  return "LL2";
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @tarkov/web test -- og-availability`
Expected: 4 pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/functions/lib/og-availability.ts apps/web/functions/lib/og-availability.test.ts apps/web/vitest.config.ts
git commit -m "feat(web): availability pill helper for OG cards"
```

---

### Task 15: GraphQL client helper

**Files:**

- Create: `apps/web/functions/lib/og-graphql.ts`
- Create: `apps/web/functions/lib/og-graphql.test.ts`

This is a pure function from `{ weaponId, modIds }` → `Promise<{ weapon, mods }>` via `fetch("https://api.tarkov.dev/graphql")`. Tests mock `fetch`.

- [ ] **Step 1: Write failing test**

```ts
// apps/web/functions/lib/og-graphql.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchOgRowsForBuild } from "./og-graphql.js";

describe("fetchOgRowsForBuild", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs a single GraphQL query and returns weapon + mods", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            weapon: {
              id: "w1",
              shortName: "M4A1",
              properties: { ergonomics: 48, recoilVertical: 120, recoilHorizontal: 344 },
            },
            mods: [
              {
                id: "m1",
                shortName: "ERGO",
                weight: 0.07,
                buyFor: [{ vendor: { normalizedName: "peacekeeper" }, priceRUB: 12000 }],
                properties: { ergonomics: 6, recoilModifier: -3 },
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const out = await fetchOgRowsForBuild({ weaponId: "w1", modIds: ["m1"] });
    expect(out.weapon.shortName).toBe("M4A1");
    expect(out.mods).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.tarkov.dev/graphql",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on HTTP error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response("no", { status: 500 }));
    await expect(fetchOgRowsForBuild({ weaponId: "w1", modIds: [] })).rejects.toThrow(/500/);
  });

  it("throws when GraphQL returns errors", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: "bad id" }] }), { status: 200 }),
    );
    await expect(fetchOgRowsForBuild({ weaponId: "bad", modIds: [] })).rejects.toThrow(/bad id/);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @tarkov/web test -- og-graphql`
Expected: module not found.

- [ ] **Step 3: Implement `apps/web/functions/lib/og-graphql.ts`**

```ts
import type { HydrateMod, HydrateWeapon } from "@tarkov/og";

const ENDPOINT = "https://api.tarkov.dev/graphql";

const QUERY = /* GraphQL */ `
  query OgCardBuild($weaponId: ID!, $modIds: [ID!]!) {
    weapon: item(id: $weaponId) {
      id
      shortName
      properties {
        ... on ItemPropertiesWeapon {
          ergonomics
          recoilVertical
          recoilHorizontal
        }
      }
    }
    mods: items(ids: $modIds) {
      id
      shortName
      weight
      buyFor {
        vendor {
          normalizedName
        }
        priceRUB
        minTraderLevel
      }
      properties {
        ... on ItemPropertiesWeaponMod {
          ergonomics
          recoilModifier
          accuracyModifier
        }
      }
    }
  }
`;

interface Args {
  weaponId: string;
  modIds: readonly string[];
}

interface ApiResp {
  data?: {
    weapon: HydrateWeapon | null;
    mods: HydrateMod[];
  };
  errors?: { message: string }[];
}

export async function fetchOgRowsForBuild(
  args: Args,
): Promise<{ weapon: HydrateWeapon; mods: HydrateMod[] }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables: { weaponId: args.weaponId, modIds: args.modIds },
    }),
  });
  if (!res.ok) throw new Error(`og-graphql: upstream ${res.status}`);
  const json = (await res.json()) as ApiResp;
  if (json.errors && json.errors.length > 0) {
    throw new Error(`og-graphql: ${json.errors.map((e) => e.message).join(", ")}`);
  }
  if (!json.data?.weapon) throw new Error(`og-graphql: weapon ${args.weaponId} not found`);
  return { weapon: json.data.weapon, mods: json.data.mods };
}
```

Expose the hydrate-related types from `@tarkov/og`'s public surface — add to `packages/og/src/index.ts` on this branch (needed here + by the Pair function in Task 17):

```ts
export type { HydrateMod, HydrateWeapon, HydrateBuildArgs } from "./hydrate.js";
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @tarkov/web test -- og-graphql`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/functions/lib/og-graphql.ts apps/web/functions/lib/og-graphql.test.ts packages/og/src/index.ts
git commit -m "feat(web): GraphQL client for OG card row fetch"
```

---

### Task 16: `/og/build/:id` Pages Function

**Files:**

- Create: `apps/web/functions/og/build/[id].ts`

No unit test for the function directly — smoke-tested via Playwright in Task 20.

- [ ] **Step 1: Implement `apps/web/functions/og/build/[id].ts`**

```ts
import { buildCard, loadFonts, renderPng, hydrateBuildCard } from "@tarkov/og";
import fallbackPng from "@tarkov/og/assets/fallback-card.png";
import type { BuildV4 } from "@tarkov/data";
import { fetchOgRowsForBuild } from "../../lib/og-graphql.js";
import { availabilityPillText } from "../../lib/og-availability.js";

export interface Env {
  BUILDS_API_URL: string;
}

const HEADERS_PNG = {
  "content-type": "image/png",
  "cache-control": "public, max-age=2592000, immutable",
} as const;

const HEADERS_FALLBACK = {
  "content-type": "image/png",
  "cache-control": "public, max-age=3600",
} as const;

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const id = String(params.id ?? "");
  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const startedAt = Date.now();
  try {
    const upstream = await fetch(`${env.BUILDS_API_URL}/builds/${id}`);
    if (upstream.status === 404) {
      return fallback("miss", id, startedAt);
    }
    if (!upstream.ok) {
      return fallback("upstream", id, startedAt, { "cache-control": "no-store" });
    }
    const build = (await upstream.json()) as BuildV4;
    const rows = await fetchOgRowsForBuild({
      weaponId: build.weaponId,
      modIds: Object.values(build.attachments),
    });
    const vm = hydrateBuildCard({ build, weapon: rows.weapon, mods: rows.mods });
    vm.availability = availabilityPillText(
      rows.mods,
      build.profileSnapshot ?? {
        mode: "basic",
        traders: {
          prapor: 4,
          therapist: 4,
          skier: 4,
          peacekeeper: 4,
          mechanic: 4,
          ragman: 4,
          jaeger: 4,
        },
        flea: true,
      },
    );
    const fonts = await loadFonts();
    const png = await renderPng(buildCard(vm), fonts, { width: 1200, height: 630 });
    const body = new Uint8Array(png);
    const res = new Response(body, { status: 200, headers: HEADERS_PNG });
    console.log(JSON.stringify({ route: "og/build", id, status: 200, ms: Date.now() - startedAt }));
    await cache.put(cacheKey, res.clone());
    return res;
  } catch (err) {
    console.error(
      JSON.stringify({
        route: "og/build",
        id,
        status: 500,
        ms: Date.now() - startedAt,
        err: String(err),
      }),
    );
    return fallback("error", id, startedAt, { "cache-control": "no-store" });
  }
};

function fallback(
  kind: "miss" | "upstream" | "error",
  id: string,
  startedAt: number,
  extra: Record<string, string> = {},
): Response {
  console.log(
    JSON.stringify({ route: "og/build", id, status: "fallback", kind, ms: Date.now() - startedAt }),
  );
  return new Response(new Uint8Array(fallbackPng as unknown as ArrayBuffer), {
    status: 200,
    headers: { ...HEADERS_FALLBACK, ...extra },
  });
}
```

Notes on bundler behavior:

- `@tarkov/og/assets/fallback-card.png` — Pages Functions' esbuild bundler treats the import as a raw ArrayBuffer when the path resolves to a binary file via the package exports map. If the bundle complains, an alternative is reading the file via `new URL("...", import.meta.url)` + `fetch()` inside the function.
- `caches.default` and `PagesFunction` are provided by `@cloudflare/workers-types`, already a devDep in `apps/web`.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @tarkov/web typecheck
```

Expected: green. Any complaint about `fallbackPng`'s type → import it via `?arraybuffer` query or declare `*.png` as `ArrayBuffer` in `apps/web/src/env.d.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/functions/og/build/[id].ts
git commit -m "feat(web): /og/build/:id Pages Function"
```

---

### Task 17: `/og/pair/:pairId` Pages Function

**Files:**

- Create: `apps/web/functions/og/pair/[pairId].ts`

- [ ] **Step 1: Implement**

```ts
import { pairCard, loadFonts, renderPng, hydratePairCard, type HydrateBuildArgs } from "@tarkov/og";
import fallbackPng from "@tarkov/og/assets/fallback-card.png";
import type { BuildV4 } from "@tarkov/data";
import { fetchOgRowsForBuild } from "../../lib/og-graphql.js";
import { availabilityPillText } from "../../lib/og-availability.js";

export interface Env {
  BUILDS_API_URL: string;
}

interface PairRecord {
  v: 1;
  left: BuildV4 | null;
  right: BuildV4 | null;
  createdAt: string;
}

const HEADERS_PNG = {
  "content-type": "image/png",
  "cache-control": "public, max-age=2592000, immutable",
} as const;

const HEADERS_FALLBACK = {
  "content-type": "image/png",
  "cache-control": "public, max-age=3600",
} as const;

async function hydrateSide(build: BuildV4 | null): Promise<HydrateBuildArgs | null> {
  if (!build) return null;
  const rows = await fetchOgRowsForBuild({
    weaponId: build.weaponId,
    modIds: Object.values(build.attachments),
  });
  return { build, weapon: rows.weapon, mods: rows.mods };
}

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const id = String(params.pairId ?? "");
  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const startedAt = Date.now();
  try {
    const upstream = await fetch(`${env.BUILDS_API_URL}/pairs/${id}`);
    if (upstream.status === 404) return fallback("miss", id, startedAt);
    if (!upstream.ok) return fallback("upstream", id, startedAt, { "cache-control": "no-store" });

    const pair = (await upstream.json()) as PairRecord;
    const [leftArgs, rightArgs] = await Promise.all([
      hydrateSide(pair.left),
      hydrateSide(pair.right),
    ]);
    const vm = hydratePairCard({ left: leftArgs, right: rightArgs });

    // Override availability per side with real pill text.
    const defaultProfile = {
      mode: "basic" as const,
      traders: {
        prapor: 4,
        therapist: 4,
        skier: 4,
        peacekeeper: 4,
        mechanic: 4,
        ragman: 4,
        jaeger: 4,
      },
      flea: true,
    };
    if (vm.left && leftArgs) {
      vm.left.availability = availabilityPillText(
        leftArgs.mods,
        pair.left?.profileSnapshot ?? defaultProfile,
      );
    }
    if (vm.right && rightArgs) {
      vm.right.availability = availabilityPillText(
        rightArgs.mods,
        pair.right?.profileSnapshot ?? defaultProfile,
      );
    }

    const fonts = await loadFonts();
    const png = await renderPng(pairCard(vm), fonts, { width: 1200, height: 630 });
    const body = new Uint8Array(png);
    const res = new Response(body, { status: 200, headers: HEADERS_PNG });
    console.log(JSON.stringify({ route: "og/pair", id, status: 200, ms: Date.now() - startedAt }));
    await cache.put(cacheKey, res.clone());
    return res;
  } catch (err) {
    console.error(
      JSON.stringify({
        route: "og/pair",
        id,
        status: 500,
        ms: Date.now() - startedAt,
        err: String(err),
      }),
    );
    return fallback("error", id, startedAt, { "cache-control": "no-store" });
  }
};

function fallback(
  kind: "miss" | "upstream" | "error",
  id: string,
  startedAt: number,
  extra: Record<string, string> = {},
): Response {
  console.log(
    JSON.stringify({ route: "og/pair", id, status: "fallback", kind, ms: Date.now() - startedAt }),
  );
  return new Response(new Uint8Array(fallbackPng as unknown as ArrayBuffer), {
    status: 200,
    headers: { ...HEADERS_FALLBACK, ...extra },
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @tarkov/web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/functions/og/pair/[pairId].ts
git commit -m "feat(web): /og/pair/:pairId Pages Function"
```

---

### Task 18: Meta-injection middleware

**Files:**

- Create: `apps/web/functions/_middleware.ts`

- [ ] **Step 1: Implement**

```ts
interface Env {
  BUILDS_API_URL: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname;

  const buildMatch = /^\/builder\/([a-zA-Z0-9_-]{4,16})$/.exec(path);
  const pairMatch = /^\/builder\/compare\/([a-zA-Z0-9_-]{4,16})$/.exec(path);

  if (!buildMatch && !pairMatch) return context.next();

  const isPair = !!pairMatch;
  const id = (buildMatch ?? pairMatch!)[1];
  const origin = url.origin;

  const [htmlRes, entityRes] = await Promise.all([
    context.next(),
    fetch(`${context.env.BUILDS_API_URL}/${isPair ? "pairs" : "builds"}/${id}`),
  ]);

  if (!entityRes.ok) return htmlRes;

  const entity = (await entityRes.json()) as {
    name?: string;
    description?: string;
    weaponId?: string;
    left?: { name?: string; weaponId?: string };
    right?: { name?: string; weaponId?: string };
  };

  const title = isPair
    ? `${entity.left?.name ?? entity.left?.weaponId ?? "BUILD A"} vs ${entity.right?.name ?? entity.right?.weaponId ?? "BUILD B"} — TarkovGunsmith`
    : `${entity.name ?? entity.weaponId ?? "Build"} — TarkovGunsmith`;

  const description = isPair
    ? "Side-by-side weapon build comparison."
    : entity.description && entity.description.length > 0
      ? entity.description
      : "Shared weapon build. Ergonomics / recoil / weight at a glance.";

  const imageUrl = `${origin}/og/${isPair ? "pair" : "build"}/${id}`;

  const injection = `
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${imageUrl}" />
  `;

  return new HTMLRewriter()
    .on("head", {
      element(el) {
        el.append(injection, { html: true });
      },
    })
    .transform(htmlRes);
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/functions/_middleware.ts
git commit -m "feat(web): OG meta-tag injection middleware"
```

---

### Task 19: builds-api OG fixture-seed hook — TDD

**Files:**

- Modify: `apps/builds-api/wrangler.jsonc`
- Modify: `apps/builds-api/worker-configuration.d.ts`
- Create: `apps/builds-api/src/og-fixtures.ts`
- Create: `apps/builds-api/src/og-fixtures.test.ts`
- Modify: `apps/builds-api/src/index.ts`

- [ ] **Step 1: Add env vars to `wrangler.jsonc`**

Modify the `vars` block in `apps/builds-api/wrangler.jsonc` to add two new optional vars:

```jsonc
  "vars": {
    "BUILD_TTL_SECONDS": "2592000",
    "OG_FIXTURE_BUILD_ID": "",
    "OG_FIXTURE_PAIR_ID": "",
  },
```

Empty strings are no-ops (disable seeding). CI sets real values via `.dev.vars` or `wrangler secret put`.

- [ ] **Step 2: Regenerate types**

```bash
cd apps/builds-api && pnpm exec wrangler types
cd -
```

This rewrites `worker-configuration.d.ts`. Diff should show two new `string` fields on `Cloudflare.Env`.

- [ ] **Step 3: Write failing test**

```ts
// apps/builds-api/src/og-fixtures.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { maybeSeedOgFixtures } from "./og-fixtures.js";

describe("maybeSeedOgFixtures", () => {
  beforeEach(async () => {
    // Clear KV between tests.
    const list = await env.BUILDS.list({ prefix: "" });
    await Promise.all(list.keys.map((k) => env.BUILDS.delete(k.name)));
  });

  it("is a no-op when env vars are unset", async () => {
    await maybeSeedOgFixtures({ ...env, OG_FIXTURE_BUILD_ID: "", OG_FIXTURE_PAIR_ID: "" });
    const list = await env.BUILDS.list({ prefix: "" });
    expect(list.keys).toHaveLength(0);
  });

  it("seeds a build when OG_FIXTURE_BUILD_ID is set and key is absent", async () => {
    await maybeSeedOgFixtures({ ...env, OG_FIXTURE_BUILD_ID: "ogfix001", OG_FIXTURE_PAIR_ID: "" });
    const value = await env.BUILDS.get("b:ogfix001");
    expect(value).not.toBeNull();
    const parsed = JSON.parse(value!) as { version: number; weaponId: string };
    expect(parsed.version).toBe(4);
    expect(parsed.weaponId).toHaveLength(24); // MongoDB-style
  });

  it("does not overwrite an existing fixture key", async () => {
    await env.BUILDS.put("b:ogfix001", '{"sentinel":true}');
    await maybeSeedOgFixtures({ ...env, OG_FIXTURE_BUILD_ID: "ogfix001", OG_FIXTURE_PAIR_ID: "" });
    const value = await env.BUILDS.get("b:ogfix001");
    expect(value).toBe('{"sentinel":true}');
  });

  it("seeds a pair when OG_FIXTURE_PAIR_ID is set", async () => {
    await maybeSeedOgFixtures({ ...env, OG_FIXTURE_BUILD_ID: "", OG_FIXTURE_PAIR_ID: "ogfix002" });
    const value = await env.BUILDS.get("p:ogfix002");
    expect(value).not.toBeNull();
    const parsed = JSON.parse(value!) as { v: number; left: unknown; right: unknown };
    expect(parsed.v).toBe(1);
    expect(parsed.left).not.toBeNull();
    expect(parsed.right).not.toBeNull();
  });
});
```

- [ ] **Step 4: Run — expect fail**

Run: `pnpm --filter @tarkov/builds-api test`
Expected: module not found.

- [ ] **Step 5: Implement `apps/builds-api/src/og-fixtures.ts`**

```ts
const SAMPLE_BUILD = {
  version: 4 as const,
  weaponId: "5447a9cd4bdc2dbd208b4567", // M4A1
  attachments: {
    mod_pistol_grip: "55d4af3a4bdc2d972f8b456f",
    mod_stock: "5c793fc42e221600114ca25d",
    mod_barrel: "5b7be4895acfc400170e2dd5",
  },
  orphaned: [] as string[],
  createdAt: "2026-04-21T00:00:00.000Z",
  name: "RECOIL KING",
  description: "Fixture build for OG smoke tests.",
};

const SAMPLE_PAIR_RIGHT = {
  ...SAMPLE_BUILD,
  weaponId: "5bb2475ed4351e00853264e3", // HK 416A5
  name: "BASELINE",
  description: "",
};

/**
 * If `OG_FIXTURE_BUILD_ID` / `OG_FIXTURE_PAIR_ID` env vars are set, seed a
 * known BuildV4 + pair under those KV keys. Idempotent — never overwrites.
 *
 * Called on first request in dev/test; unused in prod (vars are empty strings).
 */
export async function maybeSeedOgFixtures(env: Env): Promise<void> {
  if (env.OG_FIXTURE_BUILD_ID) {
    const key = `b:${env.OG_FIXTURE_BUILD_ID}`;
    const existing = await env.BUILDS.get(key);
    if (!existing) {
      await env.BUILDS.put(key, JSON.stringify(SAMPLE_BUILD));
    }
  }
  if (env.OG_FIXTURE_PAIR_ID) {
    const key = `p:${env.OG_FIXTURE_PAIR_ID}`;
    const existing = await env.BUILDS.get(key);
    if (!existing) {
      await env.BUILDS.put(
        key,
        JSON.stringify({
          v: 1,
          createdAt: "2026-04-21T00:00:00.000Z",
          left: SAMPLE_BUILD,
          right: SAMPLE_PAIR_RIGHT,
        }),
      );
    }
  }
}
```

- [ ] **Step 6: Wire into `apps/builds-api/src/index.ts`**

Add the seed call once per isolate — put it inside `fetch` behind a guard flag, because Workers don't have a startup hook:

```ts
// top of file
import { maybeSeedOgFixtures } from "./og-fixtures.js";
let ogSeeded = false;

// inside `fetch`, after `const url = new URL(request.url);`:
if (!ogSeeded) {
  ogSeeded = true;
  context.waitUntil?.(maybeSeedOgFixtures(env));
}
```

If `ExportedHandler.fetch` does not receive a `context` parameter in this Worker's current shape (it currently signatures as `(request, env)`), bump the signature to `(request, env, ctx)` and use `ctx.waitUntil`. Update the existing type to match.

- [ ] **Step 7: Run — expect pass**

Run: `pnpm --filter @tarkov/builds-api test`
Expected: all 4 og-fixture tests pass + previous 25 still pass (29 total).

- [ ] **Step 8: Commit**

```bash
git add apps/builds-api/src/og-fixtures.ts apps/builds-api/src/og-fixtures.test.ts apps/builds-api/src/index.ts apps/builds-api/wrangler.jsonc apps/builds-api/worker-configuration.d.ts
git commit -m "feat(builds-api): OG fixture-seed hook (test/dev only)"
```

---

### Task 20: Playwright smoke tests

**Files:**

- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/e2e/smoke.spec.ts`

The OG endpoints require the builds-api to be reachable. The preview server used by Playwright only serves static SPA + Pages Functions — it needs an extra backing Worker. Simplest setup: run the builds-api via `wrangler dev` alongside the preview server.

Actually the OG endpoints already proxy through `BUILDS_API_URL`. For local smoke we can set `BUILDS_API_URL=http://127.0.0.1:8787` and start both servers.

- [ ] **Step 1: Update `apps/web/playwright.config.ts`**

Replace the single `webServer` with an array that spawns both the preview server and the builds-api worker, plus seeding env vars:

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const API_PORT = 8787;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `pnpm --filter @tarkov/builds-api exec wrangler dev --port ${API_PORT} --var OG_FIXTURE_BUILD_ID:ogfix001 --var OG_FIXTURE_PAIR_ID:ogfix002`,
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm exec wrangler pages dev dist --port ${PORT} --binding BUILDS_API_URL=http://127.0.0.1:${API_PORT}`,
      cwd: "./",
      url: `http://127.0.0.1:${PORT}`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
```

Adjust the exact `wrangler pages dev` invocation to match the project convention (`pnpm --filter @tarkov/web pages:dev` may already wrap this — adapt the script if so).

- [ ] **Step 2: Trigger first fetch to seed fixtures**

Since the seed runs on first request, the OG tests must fetch `GET /healthz` once before hitting the OG endpoints. Add to the OG smoke:

```ts
// at the top of the OG block in e2e/smoke.spec.ts
await request.get(`${apiUrl}/healthz`);
```

- [ ] **Step 3: Append OG smoke tests to `apps/web/e2e/smoke.spec.ts`**

```ts
test.describe("smoke — OG cards", () => {
  test("/og/build/<seeded> returns a PNG", async ({ request }) => {
    // Trigger fixture seeding.
    await request.get("/api/builds/warmup-poke").catch(() => {});
    const res = await request.get("/og/build/ogfix001");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    const body = await res.body();
    expect(body.byteLength).toBeGreaterThan(5_000);
    expect(body[0]).toBe(0x89); // PNG magic
  });

  test("/og/pair/<seeded> returns a PNG", async ({ request }) => {
    const res = await request.get("/og/pair/ogfix002");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    const body = await res.body();
    expect(body.byteLength).toBeGreaterThan(5_000);
    expect(body[0]).toBe(0x89);
  });

  test("/og/build/<invalid> returns the fallback PNG", async ({ request }) => {
    const res = await request.get("/og/build/doesnotexist");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    const body = await res.body();
    expect(body.byteLength).toBeGreaterThan(5_000);
  });

  test("/builder/<seeded> HTML has OG meta", async ({ request }) => {
    const res = await request.get("/builder/ogfix001");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<meta property="og:image"[^>]*\/og\/build\/ogfix001/);
    expect(html).toMatch(/<meta property="og:type" content="article"/);
    expect(html).toMatch(/<meta name="twitter:card" content="summary_large_image"/);
  });

  test("/builder/compare/<seeded> HTML has OG meta pointing at /og/pair", async ({ request }) => {
    const res = await request.get("/builder/compare/ogfix002");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<meta property="og:image"[^>]*\/og\/pair\/ogfix002/);
  });
});
```

- [ ] **Step 4: Build + run locally**

```bash
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e
```

Expected: all previous smoke tests green + 5 new ones green. Adjust server-startup commands if they fail to bind.

- [ ] **Step 5: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e/smoke.spec.ts
git commit -m "test(web): Playwright smoke for OG endpoints + meta injection"
```

---

### Task 21: PR 2 wrap-up

- [ ] **Step 1: Local full verification**

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
git push -u origin feat/og-functions
gh pr create --title "feat(og): Pages Functions + meta middleware + smoke" --body "$(cat <<'EOF'
## Summary

Second PR for M3 differentiator #4. Activates the OG card endpoints and
injects per-build / per-pair meta tags into the SPA HTML.

- `/og/build/:id` → 1200×630 PNG (build card, layout C).
- `/og/pair/:pairId` → 1200×630 PNG (pair card, layout A).
- `functions/_middleware.ts` rewrites `index.html` on `/builder/:id` and
  `/builder/compare/:pairId` to add `og:image`, `twitter:card`, title, and
  description tags. All other routes pass through untouched.
- `apps/builds-api` grows a dev/test-only fixture-seed hook gated by
  `OG_FIXTURE_BUILD_ID` / `OG_FIXTURE_PAIR_ID` env vars so Playwright can
  exercise known IDs.

Edge-cached PNGs (30 d immutable). Fallback PNG on KV-miss / render error.

Spec: `docs/superpowers/specs/2026-04-21-og-share-cards-design.md`.

## Test plan

- [x] Unit: availability pill, GraphQL client (7 new tests)
- [x] Unit: builds-api fixture seed (4 new tests)
- [x] Playwright smoke: 5 new assertions (build/pair PNG, fallback, build meta, pair meta)
- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` all green
- [x] `pnpm --filter @tarkov/web test:e2e` green
- [ ] Post-merge: paste a test `/builder/:id` URL into Discord — confirm the rich unfurl

## Risk

`@resvg/resvg-wasm` in the CF Pages Functions runtime. Smoke test validates
it end-to-end. If the wasm path silently fails in prod CF (passes local but
fails on edge), fallback is `satori-html` + a rasterization-only Worker run
through Playwright's browser — documented in spec §10.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: CI green + merge**

```bash
gh pr checks --watch
gh pr merge --squash
```

- [ ] **Step 4: Prod verification**

After release PR ships:

1. Open a freshly shared build URL.
2. Paste `<prod-url>/builder/<real-id>` into Discord — verify the 1200×630 amber-bracketed card unfurls.
3. Paste `<prod-url>/builder/compare/<real-pair-id>` — verify the mirror-split card unfurls.
4. `wrangler pages deployment tail --project-name tarkov-gunsmith-web` — confirm the `{route, id, ms}` lines appear and `ms` is reasonable (<500 ms p99 after first hit).

---

## Self-review notes

- Spec §2 scope items (two Pages Functions, one middleware, `packages/og`, builds-api fixture hook) → Tasks 2–21 cover all four.
- Spec §4.1 build-card pill row: availability / mod count / optional price — Task 8 + hydrateBuildCard + availabilityPillText implement all three rules.
- Spec §4.3 missing-data rules: `—` for missing stats (build-card.test.ts case 4), `EMPTY SLOT` for missing pair side (pair-card.test.ts case 2).
- Spec §4.4 fallback card: static committed PNG generated by Task 10's script, served by Tasks 16 / 17.
- Spec §5 data flow: hydration is pure in `packages/og`; Pages Function does fetch + GraphQL + cache (Tasks 16 / 17). Middleware in Task 18.
- Spec §6 fonts: Task 5 downloads + Task 5 `fonts.ts` loader.
- Spec §7 testing: all unit paths + 5 Playwright assertions covered.
- Spec §8 deployment: no new env vars (existing `BUILDS_API_URL`). Two new optional vars on builds-api for fixture-only use.
- Spec §9 rollout: two PRs mapped 1:1 to Phase 1 / Phase 2.

No placeholders remain. No "TBD". Every step shows the exact code / commands.
