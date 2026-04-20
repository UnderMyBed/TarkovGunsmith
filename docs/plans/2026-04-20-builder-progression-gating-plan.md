# Builder Robustness PR 3 — Player-Progression Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Third PR of the Milestone 1.5 Builder Robustness arc. Introduces `PlayerProfile` (basic: trader LLs + flea toggle; advanced: + ~20 marquee quests), wires `BuildV3` (adds optional `profileSnapshot`), enriches items with availability data from `api.tarkov.dev`, and dims unavailable items in the slot-tree picker with their blocking requirement shown.

**Architecture:** Profile lives in `localStorage["tg:player-profile"]` via a new `useProfile()` hook. A new `itemAvailability(item, profile)` pure function (in `@tarkov/data`) walks the item's `buyFor` paths and returns the cheapest satisfying RUB price or the least-demanding unmet requirement. The existing `MOD_LIST_QUERY` is extended with `buyFor { priceRUB currency vendor { __typename normalizedName ... on TraderOffer { minTraderLevel taskUnlock { id normalizedName name } trader { normalizedName } } ... on FleaMarket { minPlayerLevel } } }` plus `types` and `minLevelForFlea`. Two new queries: `useTraders()` and `useTasks()` for the profile editor. A curated `marquee-quests.ts` list (~20 task ids) drives the advanced-mode toggles.

**Tech Stack:** Same as prior PRs. No new runtime deps.

---

## Design decisions locked

1. **Profile embed is opt-in.** `BuildV3.profileSnapshot` is optional. Save dialog has a checkbox, default off. Loaded builds with embedded profile show "built with: …" banner + "use mine instead" toggle.

2. **Only `buyFor` paths are evaluated.** `craftsFor` + `bartersFor` are out of scope for PR 3 — they'd ~triple the availability logic for a marginal signal gain. Item is "available via trader" or "available via flea" only. Crafting / barter availability is a PR 4 polish item.

3. **Dimming, not hiding.** Unavailable items render at `opacity-40` with a compact requirement badge. A "show all" toggle on the slot-tree card re-enables full opacity.

4. **No drawer primitive.** Profile editor is a collapsible section inside the `/builder` page header, not a separate drawer. Cheaper; matches the existing `<details>` aesthetic. A real drawer can land in PR 4.

5. **Marquee quest list is code-curated in `packages/tarkov-data/src/marquee-quests.ts`.** Exactly 20 ids selected from `tasks(kappaRequired: true)` filtered for gunsmith-impact quests. Test enforces the list stays exactly 20.

---

## File map

```
packages/tarkov-data/src/
├── build-schema.ts                 MODIFIED — add PlayerProfile + BuildV3, bump CURRENT_BUILD_VERSION to 3
├── build-schema.test.ts            MODIFIED — v3 + profile parse/reject fixtures
├── build-migrations.ts             MODIFIED — add migrateV2ToV3 (trivial: pass-through + version bump)
├── build-migrations.test.ts        MODIFIED — v2→v3 test
├── marquee-quests.ts               NEW      — exports MARQUEE_QUEST_IDS: readonly string[] (20 ids)
├── marquee-quests.test.ts          NEW      — asserts count == 20, no dupes
├── item-availability.ts            NEW      — itemAvailability(item, profile) pure function
├── item-availability.test.ts       NEW      — happy / flea-locked / quest-locked / LL-too-low / unavailable tests
├── queries/
│   ├── modList.ts                  MODIFIED — extend with buyFor, types, minLevelForFlea
│   ├── modList.test.ts             MODIFIED — fixture mirrors new fields
│   ├── traders.ts                  NEW      — TRADERS_QUERY + fetcher + types
│   ├── traders.test.ts             NEW
│   ├── tasks.ts                    NEW      — TASKS_QUERY + fetcher + types (marquee subset)
│   └── tasks.test.ts               NEW
├── hooks/
│   ├── useTraders.ts               NEW
│   ├── useTasks.ts                 NEW
│   └── useProfile.ts               NEW      — localStorage-backed profile state
└── index.ts                        MODIFIED — export new symbols

apps/web/src/
├── features/builder/
│   ├── profile-editor.tsx          NEW      — collapsible profile form (basic + advanced tabs)
│   └── slot-tree.tsx               MODIFIED — dim unavailable items + requirement badges + show-all toggle
└── routes/
    ├── builder.tsx                 MODIFIED — mount profile editor, pass availability to SlotTree, opt-in profile embed on save, load v3 w/ snapshot banner
    └── builder.$id.tsx             MODIFIED — version-discriminate to pass v3 snapshot through
```

---

## Phase 1: Schema v3 + profile

### Task 1: `PlayerProfile` + `BuildV3`

- [ ] Read current `packages/tarkov-data/src/build-schema.ts`. Add `PlayerProfile` + `BuildV3` before the `Build` union:

```ts
export const PlayerProfile = z.object({
  mode: z.enum(["basic", "advanced"]),
  traders: z.object({
    prapor: z.number().int().min(1).max(4),
    therapist: z.number().int().min(1).max(4),
    skier: z.number().int().min(1).max(4),
    peacekeeper: z.number().int().min(1).max(4),
    mechanic: z.number().int().min(1).max(4),
    ragman: z.number().int().min(1).max(4),
    jaeger: z.number().int().min(1).max(4),
  }),
  flea: z.boolean(),
  completedQuests: z.array(z.string().min(1)).max(256).optional(),
});

export type PlayerProfile = z.infer<typeof PlayerProfile>;

export const DEFAULT_PROFILE: PlayerProfile = {
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

export const BuildV3 = BuildV2.extend({
  version: z.literal(3),
  profileSnapshot: PlayerProfile.optional(),
});

export type BuildV3 = z.infer<typeof BuildV3>;
```

Update the `Build` union + version constant:

```ts
export const Build = z.discriminatedUnion("version", [BuildV1, BuildV2, BuildV3]);
export type Build = z.infer<typeof Build>;
export const CURRENT_BUILD_VERSION = 3 as const;
```

- [ ] Add tests to `build-schema.test.ts`:

```ts
describe("PlayerProfile", () => {
  const validProfile = {
    mode: "basic" as const,
    traders: {
      prapor: 2,
      therapist: 1,
      skier: 1,
      peacekeeper: 1,
      mechanic: 1,
      ragman: 1,
      jaeger: 1,
    },
    flea: false,
  };
  it("parses a valid basic profile", () => {
    expect(PlayerProfile.parse(validProfile)).toEqual(validProfile);
  });
  it("parses advanced mode with quests", () => {
    expect(
      PlayerProfile.parse({ ...validProfile, mode: "advanced", completedQuests: ["q1"] })
        .completedQuests,
    ).toEqual(["q1"]);
  });
  it("rejects trader LL above 4", () => {
    expect(
      PlayerProfile.safeParse({ ...validProfile, traders: { ...validProfile.traders, prapor: 5 } })
        .success,
    ).toBe(false);
  });
  it("rejects trader LL below 1", () => {
    expect(
      PlayerProfile.safeParse({ ...validProfile, traders: { ...validProfile.traders, prapor: 0 } })
        .success,
    ).toBe(false);
  });
});

describe("BuildV3", () => {
  const v3 = {
    version: 3 as const,
    weaponId: "w",
    attachments: {},
    orphaned: [],
    createdAt: "2026-04-20T00:00:00.000Z",
  };
  it("parses without profileSnapshot", () => {
    expect(BuildV3.parse(v3).profileSnapshot).toBeUndefined();
  });
  it("parses with profileSnapshot", () => {
    const profile = {
      mode: "basic" as const,
      traders: {
        prapor: 1,
        therapist: 1,
        skier: 1,
        peacekeeper: 1,
        mechanic: 1,
        ragman: 1,
        jaeger: 1,
      },
      flea: true,
    };
    expect(BuildV3.parse({ ...v3, profileSnapshot: profile }).profileSnapshot).toEqual(profile);
  });
});

describe("Build (discriminated union) — v3", () => {
  it("dispatches to BuildV3 when version is 3", () => {
    const v3 = {
      version: 3 as const,
      weaponId: "w",
      attachments: {},
      orphaned: [],
      createdAt: "2026-04-20T00:00:00.000Z",
    };
    expect(Build.parse(v3).version).toBe(3);
  });
});
```

Update the `CURRENT_BUILD_VERSION` test: `expect(CURRENT_BUILD_VERSION).toBe(3);`. Update top-of-file import to include `BuildV3, PlayerProfile`.

- [ ] Commit: `feat(tarkov-data): add BuildV3 + PlayerProfile schema`.

### Task 2: `migrateV2ToV3` (trivial)

- [ ] Edit `packages/tarkov-data/src/build-migrations.ts`. Import `BuildV3` and add:

```ts
/** v2 → v3 is a no-op apart from the version bump. Profile snapshot is always absent on auto-migration. */
export function migrateV2ToV3(v2: BuildV2): BuildV3 {
  return { ...v2, version: 3 };
}
```

- [ ] Edit `packages/tarkov-data/src/build-migrations.test.ts`. Add:

```ts
import { migrateV2ToV3 } from "./build-migrations.js";

describe("migrateV2ToV3", () => {
  it("bumps version and preserves all fields", () => {
    const v2: BuildV2 = {
      version: 2,
      weaponId: "w",
      attachments: { s: "m" },
      orphaned: [],
      createdAt: "2026-04-20T00:00:00.000Z",
    };
    const v3 = migrateV2ToV3(v2);
    expect(v3.version).toBe(3);
    expect(v3.weaponId).toBe("w");
    expect(v3.attachments).toEqual({ s: "m" });
    expect(v3.profileSnapshot).toBeUndefined();
  });
});
```

- [ ] Commit: `feat(tarkov-data): add migrateV2ToV3 (identity + version bump)`.

---

## Phase 2: Progression data layer

### Task 3: Extend `MOD_LIST_QUERY` with progression fields

- [ ] Edit `packages/tarkov-data/src/queries/modList.ts`. Extend the query + schema:

```graphql
query ModList {
  items(type: mods) {
    id
    name
    shortName
    iconLink
    weight
    types
    minLevelForFlea
    properties {
      __typename
      ... on ItemPropertiesWeaponMod {
        ergonomics
        recoilModifier
        accuracyModifier
      }
    }
    buyFor {
      priceRUB
      currency
      vendor {
        __typename
        normalizedName
        ... on TraderOffer {
          minTraderLevel
          taskUnlock {
            id
            normalizedName
          }
          trader {
            normalizedName
          }
        }
        ... on FleaMarket {
          minPlayerLevel
        }
      }
    }
  }
}
```

- [ ] Update the Zod schema to mirror the new fields. The `vendor` discriminated union uses `__typename`. Safe-parse still drops non-ItemPropertiesWeaponMod entries as before.

- [ ] Update `modList.test.ts` fixture to include realistic `buyFor`, `types`, and `minLevelForFlea` entries. Add 2 new assertions: one for a trader-only mod, one for a flea-only mod with minLevelForFlea.

- [ ] Commit: `feat(tarkov-data): extend mod list with buyFor progression fields`.

### Task 4: `traders.ts` + `useTraders` hook

- [ ] Create `packages/tarkov-data/src/queries/traders.ts`:

```ts
export const TRADERS_QUERY = /* GraphQL */ `
  query Traders {
    traders {
      id
      name
      normalizedName
    }
  }
`;
// Zod mirrors { traders: [{ id, name, normalizedName }] }. Export TraderListItem.
// fetchTraders filters to the 7 canonical (excludes fence/ref by normalizedName).
```

- [ ] Create `packages/tarkov-data/src/queries/traders.test.ts`: one fetcher test + one filter test.

- [ ] Create `packages/tarkov-data/src/hooks/useTraders.ts`: thin useQuery wrapper.

- [ ] Commit: `feat(tarkov-data): add traders query + hook`.

### Task 5: `tasks.ts` + `useTasks` hook + `marquee-quests.ts`

- [ ] Create `packages/tarkov-data/src/queries/tasks.ts`:

```ts
export const TASKS_QUERY = /* GraphQL */ `
  query Tasks {
    tasks {
      id
      name
      normalizedName
      trader {
        normalizedName
      }
      kappaRequired
    }
  }
`;
// fetchTasks returns all tasks; consumers filter.
```

- [ ] Create `packages/tarkov-data/src/queries/tasks.test.ts`: one fetcher test.

- [ ] Create `packages/tarkov-data/src/hooks/useTasks.ts`: thin useQuery wrapper.

- [ ] Create `packages/tarkov-data/src/marquee-quests.ts`:

```ts
/**
 * 20 marquee quests that gate the most-impactful mod/ammo unlocks.
 * Curated by `normalizedName` (stable across name localizations).
 * Tests assert count == 20 and no duplicates; updating this list does not
 * require a schema change — it's a data constant.
 */
export const MARQUEE_QUEST_NORMALIZED_NAMES: readonly string[] = [
  "gunsmith-part-1",
  "gunsmith-part-2",
  "gunsmith-part-3",
  "gunsmith-part-4",
  "gunsmith-part-5",
  "gunsmith-part-6",
  "gunsmith-part-7",
  "gunsmith-part-8",
  "gunsmith-part-9",
  "gunsmith-part-10",
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
```

- [ ] Create `packages/tarkov-data/src/marquee-quests.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MARQUEE_QUEST_NORMALIZED_NAMES } from "./marquee-quests.js";

describe("MARQUEE_QUEST_NORMALIZED_NAMES", () => {
  it("contains exactly 20 entries", () => {
    expect(MARQUEE_QUEST_NORMALIZED_NAMES.length).toBe(20);
  });
  it("has no duplicates", () => {
    expect(new Set(MARQUEE_QUEST_NORMALIZED_NAMES).size).toBe(20);
  });
  it("uses kebab-case (normalizedName) slugs", () => {
    for (const name of MARQUEE_QUEST_NORMALIZED_NAMES) {
      expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});
```

- [ ] Commit: `feat(tarkov-data): add tasks query + marquee quest list`.

### Task 6: `itemAvailability` pure function

- [ ] Create `packages/tarkov-data/src/item-availability.ts`:

```ts
import type { PlayerProfile } from "./build-schema.js";
import type { ModListItem } from "./queries/modList.js";

export type ItemAvailability =
  | {
      available: true;
      kind: "trader";
      traderNormalizedName: string;
      minLevel: number;
      priceRUB: number | null;
    }
  | { available: true; kind: "flea"; priceRUB: number | null }
  | {
      available: false;
      reason: "trader-ll-required";
      traderNormalizedName: string;
      minLevel: number;
    }
  | {
      available: false;
      reason: "quest-required";
      questNormalizedName: string;
      traderNormalizedName: string;
    }
  | { available: false; reason: "flea-locked" }
  | { available: false; reason: "no-sources" };

/**
 * Evaluate a mod's availability under a player profile.
 *
 * Walks every `buyFor` entry:
 * - TraderOffer: satisfied if profile.traders[name] >= minTraderLevel
 *   AND (no taskUnlock OR advanced profile has the quest completed).
 * - FleaMarket: satisfied if profile.flea === true AND the item isn't flea-blocked.
 *
 * Returns the CHEAPEST satisfying path (by priceRUB; nulls sort last).
 * If none satisfy, returns the MOST-ACCESSIBLE unmet requirement — the
 * single lowest trader LL across failing trader paths, or a quest, or flea.
 */
export function itemAvailability(item: ModListItem, profile: PlayerProfile): ItemAvailability;
```

- [ ] Tests (`item-availability.test.ts`):
  1.  Trader path satisfied (LL match) → `available: true, kind: "trader"`.
  2.  Trader path blocked (LL too low) → `available: false, reason: "trader-ll-required", minLevel`.
  3.  Quest-gated trader path, basic mode (no quests tracked) → `available: false, reason: "quest-required"`.
  4.  Quest-gated trader path, advanced mode with quest completed → `available: true`.
  5.  Flea-locked item (types includes "noFlea"), flea: true → path skipped.
  6.  Flea path satisfied → `available: true, kind: "flea"`.
  7.  Flea path blocked (profile.flea false) → `available: false, reason: "flea-locked"` if ONLY flea path.
  8.  Multiple satisfying paths → picks cheapest priceRUB.
  9.  No buyFor entries → `available: false, reason: "no-sources"`.

- [ ] Commit: `feat(tarkov-data): add itemAvailability pure function`.

### Task 7: Profile hook + index exports

- [ ] Create `packages/tarkov-data/src/hooks/useProfile.ts`:

```ts
import { useEffect, useState, useCallback } from "react";
import { PlayerProfile, DEFAULT_PROFILE } from "../build-schema.js";

const STORAGE_KEY = "tg:player-profile";

export function useProfile(): [PlayerProfile, (next: PlayerProfile) => void] {
  const [profile, setProfileState] = useState<PlayerProfile>(() => {
    if (typeof window === "undefined") return DEFAULT_PROFILE;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_PROFILE;
      return PlayerProfile.parse(JSON.parse(raw));
    } catch {
      return DEFAULT_PROFILE;
    }
  });

  const setProfile = useCallback((next: PlayerProfile) => {
    setProfileState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage quota or disabled — profile persists only for the session.
    }
  }, []);

  return [profile, setProfile];
}
```

- [ ] Update `packages/tarkov-data/src/index.ts` — add all new exports:

```ts
export { PlayerProfile, BuildV3, DEFAULT_PROFILE } from "./build-schema.js";

export { migrateV2ToV3 } from "./build-migrations.js";
export { MARQUEE_QUEST_NORMALIZED_NAMES } from "./marquee-quests.js";
export { itemAvailability, type ItemAvailability } from "./item-availability.js";
export { TRADERS_QUERY, fetchTraders } from "./queries/traders.js";
export type { TraderListItem } from "./queries/traders.js";
export { useTraders } from "./hooks/useTraders.js";
export { TASKS_QUERY, fetchTasks } from "./queries/tasks.js";
export type { TaskListItem } from "./queries/tasks.js";
export { useTasks } from "./hooks/useTasks.js";
export { useProfile } from "./hooks/useProfile.js";
```

Make sure existing `Build`, `BuildV1`, `BuildV2`, `CURRENT_BUILD_VERSION` export line adds `BuildV3` + `PlayerProfile`.

- [ ] Commit: `feat(tarkov-data): add useProfile hook + export progression symbols`.

---

## Phase 3: Profile editor UI

### Task 8: `ProfileEditor` component

- [ ] Create `apps/web/src/features/builder/profile-editor.tsx` — a `<details>`-based collapsible with 2 tabs (Basic / Advanced). Basic shows 7 trader `<select>` (1-4) + flea toggle. Advanced shows the same + checkbox list of marquee quests (mapped from `MARQUEE_QUEST_NORMALIZED_NAMES` using `useTasks()` data to resolve display names).

Signature:

```tsx
export interface ProfileEditorProps {
  profile: PlayerProfile;
  onChange: (next: PlayerProfile) => void;
}
```

Implementation keeps the scope tight — inline form controls, no new UI primitives. Use `<Card>` + `<CardHeader>` + `<CardContent>` wrapping. Toggle between basic/advanced with two buttons styled like tabs (active class if `profile.mode === "basic"`).

- [ ] Commit: `feat(web): add ProfileEditor for basic/advanced progression`.

---

## Phase 4: Builder integration

### Task 9: Wire profile + availability into `SlotTree` + `BuilderPage`

- [ ] Edit `apps/web/src/features/builder/slot-tree.tsx`. Accept a new prop `getAvailability?: (itemId: string) => ItemAvailability | null`. If provided, render each item's button with `opacity-40` when `available: false` and show a small badge with the blocking requirement text next to the item name. Add a `showAll` prop that, when `true`, ignores the dimming.

- [ ] Edit `apps/web/src/routes/builder.tsx`:
  - Import `useProfile`, `itemAvailability`, `useModList` already imported.
  - Read `const [profile, setProfile] = useProfile();`
  - Mount `<ProfileEditor profile={profile} onChange={setProfile} />` above the weapon card (wrapped in a Card).
  - Add `const [showAll, setShowAll] = useState(false);` and a small toggle button above the SlotTree.
  - Compute `const availabilityById = useMemo(() => Object.fromEntries((mods.data ?? []).map(m => [m.id, itemAvailability(m, profile)])), [mods.data, profile]);`
  - Pass `getAvailability={(id) => availabilityById[id] ?? null}` and `showAll` to `<SlotTree>`.
  - Save dialog gains a checkbox "Include my progression snapshot in the shared URL" (default unchecked). When checked, `handleShare` sends `{ ...v3, profileSnapshot: profile }`.

- [ ] Edit `apps/web/src/routes/builder.$id.tsx` — version-discriminate v3 and pass `initialProfileSnapshot` (new optional prop). `BuilderPage` receives it and, if present, renders a dismissable "Built with: Prapor LL2, flea off, 3 marquee quests" banner with a "Use my profile instead" button that calls `setProfile(snapshot)` once.

- [ ] Commit: `feat(web): wire progression gating into slot tree + profile editor`.

---

## Phase 5: Ship

### Task 10: Full repo gates + final review + PR

- [ ] `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check` — all green.
- [ ] Dispatch `superpowers:code-reviewer` agent over the full branch diff for a cross-cutting review.
- [ ] Push + `gh pr create`.
- [ ] Watch CI; merge on green; admin-merge the release-please PR.

---

## Deviations from the spec

1. **`craftsFor` / `bartersFor` ignored.** PR 3 evaluates only `buyFor` paths. Noted in PR body.
2. **No Dialog / Drawer primitive.** Inline collapsible profile editor.
3. **Only 20 marquee quests** — exact list curated in `marquee-quests.ts`; list is updatable without schema change.
4. **Playwright e2e still deferred.**
