# Builder Robustness PR 4 — UX Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Final PR of the Milestone 1.5 Builder Robustness arc. Adds `BuildV4` (optional name + description), inline name/description editing on the build header, a build-vs-stock stats diff card, and a preset-loadout scaffold. Undo/redo is explicitly deferred to a future "UX polish" minor — the state machine is fiddly and its value relative to cost is lower than the other three pieces.

**Architecture:** Schema grows v4 via `BuildV3.extend({ version: 4, name?, description? })`. `migrateV3ToV4` is a trivial identity. New `BuildHeader` component replaces the current static `<h1>` with inline-editable name + description inputs plus a compact diff card showing stat deltas from bare weapon. Preset scaffolding lives in `packages/tarkov-data/src/presets.ts` as an empty `WEAPON_PRESETS: Record<WeaponId, Preset[]>` map; a `<PresetPicker>` component renders nothing when the map is empty, so shipping the scaffold is forward-compatible without blocking on hand-curated data.

**Tech Stack:** Same as prior PRs. No new deps.

---

## Scope decisions

1. **Name ≤ 60 chars, description ≤ 280 chars.** Twitter-style upper bound is familiar and fits comfortably in the shared-build KV payload.
2. **No undo/redo.** Deferred to a post-M1.5 polish PR (`v1.5.x` or wherever it lands). Tracked in the PR body.
3. **Empty preset list is fine.** We ship the primitive + the picker; curation lands in a follow-up data-only PR.
4. **Diff card uses `weaponSpec(weapon, [])` for stock baseline** — already available from `@tarkov/ballistics`.

---

## File map

```
packages/tarkov-data/src/
├── build-schema.ts                 MODIFIED — add BuildV4, bump CURRENT_BUILD_VERSION to 4
├── build-schema.test.ts            MODIFIED — v4 + name/desc parse/reject fixtures
├── build-migrations.ts             MODIFIED — add migrateV3ToV4 (identity + version bump)
├── build-migrations.test.ts        MODIFIED
├── presets.ts                      NEW      — WeaponPreset type + WEAPON_PRESETS constant (initially empty)
├── presets.test.ts                 NEW      — asserts the constant is well-formed (empty records OK)
└── index.ts                        MODIFIED

apps/web/src/
├── features/builder/
│   ├── build-header.tsx            NEW      — name + description inline edit + diff card
│   └── preset-picker.tsx           NEW      — renders nothing when presets list is empty
└── routes/
    ├── builder.tsx                 MODIFIED — mount BuildHeader + PresetPicker; track name/desc state; save v4
    └── builder.$id.tsx             MODIFIED — version-discriminate v4 with name/desc passthrough
```

---

## Phase 1: Schema v4

### Task 1: `BuildV4` + `migrateV3ToV4`

- [ ] Edit `packages/tarkov-data/src/build-schema.ts`. Insert `BuildV4` right after `BuildV3`:

```ts
export const BuildV4 = BuildV3.extend({
  version: z.literal(4),
  name: z.string().max(60).optional(),
  description: z.string().max(280).optional(),
});

export type BuildV4 = z.infer<typeof BuildV4>;
```

Update the `Build` union:

```ts
export const Build = z.discriminatedUnion("version", [BuildV1, BuildV2, BuildV3, BuildV4]);
export type Build = z.infer<typeof Build>;
export const CURRENT_BUILD_VERSION = 4 as const;
```

- [ ] Add tests to `build-schema.test.ts`:

```ts
describe("BuildV4", () => {
  const v4base = {
    version: 4 as const,
    weaponId: "w",
    attachments: {},
    orphaned: [],
    createdAt: "2026-04-20T00:00:00.000Z",
  };
  it("parses without name/description", () => {
    const parsed = BuildV4.parse(v4base);
    expect(parsed.name).toBeUndefined();
    expect(parsed.description).toBeUndefined();
  });
  it("parses with name and description", () => {
    const parsed = BuildV4.parse({ ...v4base, name: "Meta M4", description: "budget-friendly" });
    expect(parsed.name).toBe("Meta M4");
    expect(parsed.description).toBe("budget-friendly");
  });
  it("rejects name longer than 60 chars", () => {
    expect(BuildV4.safeParse({ ...v4base, name: "x".repeat(61) }).success).toBe(false);
  });
  it("rejects description longer than 280 chars", () => {
    expect(BuildV4.safeParse({ ...v4base, description: "x".repeat(281) }).success).toBe(false);
  });
});

describe("Build (discriminated union) — v4", () => {
  it("dispatches to BuildV4 when version is 4", () => {
    const v4 = {
      version: 4 as const,
      weaponId: "w",
      attachments: {},
      orphaned: [],
      createdAt: "2026-04-20T00:00:00.000Z",
    };
    expect(Build.parse(v4).version).toBe(4);
  });
});
```

Update `CURRENT_BUILD_VERSION` test to `expect(CURRENT_BUILD_VERSION).toBe(4);`. Update import line to include `BuildV4`.

- [ ] Edit `packages/tarkov-data/src/build-migrations.ts`. Import type:

```ts
import type { BuildV1, BuildV2, BuildV3, BuildV4 } from "./build-schema.js";
```

Append:

```ts
/** v3 → v4 is a no-op apart from the version bump. No name/desc on auto-migrated builds. */
export function migrateV3ToV4(v3: BuildV3): BuildV4 {
  return { ...v3, version: 4 };
}
```

- [ ] Edit `packages/tarkov-data/src/build-migrations.test.ts`. Update import to include `migrateV3ToV4`. Append:

```ts
describe("migrateV3ToV4", () => {
  it("bumps version and preserves all fields", () => {
    const v3: BuildV3 = {
      version: 3,
      weaponId: "w",
      attachments: { s: "m" },
      orphaned: [],
      createdAt: "2026-04-20T00:00:00.000Z",
    };
    const v4 = migrateV3ToV4(v3);
    expect(v4.version).toBe(4);
    expect(v4.weaponId).toBe("w");
    expect(v4.attachments).toEqual({ s: "m" });
    expect(v4.name).toBeUndefined();
    expect(v4.description).toBeUndefined();
  });
});
```

Import `BuildV3` in the test file import line.

- [ ] Run `pnpm --filter @tarkov/data test -- build-schema build-migrations`. All green.
- [ ] Typecheck + lint the package. Clean.
- [ ] Commit: `feat(tarkov-data): add BuildV4 (name + description) + migrateV3ToV4`.

---

## Phase 2: Preset scaffold

### Task 2: `presets.ts` scaffold

- [ ] Create `packages/tarkov-data/src/presets.ts`:

```ts
/**
 * Hand-curated weapon preset loadouts, keyed by weaponId.
 *
 * Each weapon may have 0+ named presets (e.g. "Stock", "Meta", "Budget").
 * Applying a preset fills the attachments record fresh (overwrite, not merge).
 *
 * Empty by default — populating this map is a content-only follow-up PR that
 * doesn't require a schema change. The PresetPicker component hides itself
 * when a weapon has no presets, so shipping an empty map is safe.
 */
export interface WeaponPreset {
  name: string;
  /** SlotPath → ItemId map (same shape as BuildV2+ `attachments`). */
  attachments: Readonly<Record<string, string>>;
}

export const WEAPON_PRESETS: Readonly<Record<string, readonly WeaponPreset[]>> = {
  // Populate in a follow-up data PR. Example entry:
  // "5447a9cd4bdc2dbd208b4567": [
  //   { name: "Stock", attachments: {} },
  //   { name: "Meta", attachments: { mod_muzzle: "57dc2fa62459775949412633", mod_stock: "5649be884bdc2d79388b4577" } },
  // ],
};

/** Look up presets for a weapon. Returns an empty array if the weapon has none. */
export function presetsForWeapon(weaponId: string): readonly WeaponPreset[] {
  return WEAPON_PRESETS[weaponId] ?? [];
}
```

- [ ] Create `packages/tarkov-data/src/presets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { WEAPON_PRESETS, presetsForWeapon, type WeaponPreset } from "./presets.js";

describe("presetsForWeapon", () => {
  it("returns an empty array for an unknown weapon", () => {
    expect(presetsForWeapon("does-not-exist")).toEqual([]);
  });

  it("is a stable reference (same array identity across calls)", () => {
    const a = presetsForWeapon("x");
    const b = presetsForWeapon("x");
    expect(a).toBe(b);
  });
});

describe("WEAPON_PRESETS invariants", () => {
  it("every preset has a non-empty name", () => {
    const all: WeaponPreset[] = Object.values(WEAPON_PRESETS).flat();
    for (const preset of all) {
      expect(preset.name.length).toBeGreaterThan(0);
    }
  });

  it("every preset's attachment values are non-empty strings", () => {
    const all: WeaponPreset[] = Object.values(WEAPON_PRESETS).flat();
    for (const preset of all) {
      for (const value of Object.values(preset.attachments)) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });
});
```

Note: both `presetsForWeapon("x") === presetsForWeapon("x")` assertions require a cached-empty-array implementation. Fix the implementation to cache the empty return:

```ts
const EMPTY_PRESETS: readonly WeaponPreset[] = [];

export function presetsForWeapon(weaponId: string): readonly WeaponPreset[] {
  return WEAPON_PRESETS[weaponId] ?? EMPTY_PRESETS;
}
```

- [ ] Run `pnpm --filter @tarkov/data test -- presets`. All 4 tests green.
- [ ] Commit: `feat(tarkov-data): add preset scaffold (empty until content PR)`.

---

## Phase 3: `index.ts` exports

### Task 3: Export new symbols

- [ ] Edit `packages/tarkov-data/src/index.ts`:
  - Update the `// Build schema` block to include `BuildV4`.
  - Update the `// Build migrations` block to include `migrateV3ToV4`.
  - Append:

```ts
// Presets
export { WEAPON_PRESETS, presetsForWeapon } from "./presets.js";
export type { WeaponPreset } from "./presets.js";
```

- [ ] Typecheck + lint + test. All clean.
- [ ] Commit: `feat(tarkov-data): export BuildV4 + preset symbols`.

---

## Phase 4: Builder UI

### Task 4: `BuildHeader` component

- [ ] Create `apps/web/src/features/builder/build-header.tsx`:

```tsx
import type { WeaponSpec } from "@tarkov/ballistics";
import { Card, CardContent } from "@tarkov/ui";

export interface BuildHeaderProps {
  name: string;
  description: string;
  onNameChange: (next: string) => void;
  onDescriptionChange: (next: string) => void;
  /** Current build spec (weapon + current mods). */
  currentSpec: WeaponSpec | null;
  /** Stock-weapon spec (no mods). Used to compute deltas. */
  stockSpec: WeaponSpec | null;
}

export function BuildHeader({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  currentSpec,
  stockSpec,
}: BuildHeaderProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <input
          type="text"
          value={name}
          maxLength={60}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Build name (optional)"
          className="bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-[var(--color-muted-foreground)] focus:outline-none"
        />
        <textarea
          value={description}
          maxLength={280}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="resize-none bg-transparent text-sm text-[var(--color-muted-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)] focus:outline-none"
        />
        {currentSpec && stockSpec && (
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Delta label="Ergo" current={currentSpec.ergonomics} stock={stockSpec.ergonomics} />
            <Delta
              label="Vert. recoil"
              current={currentSpec.verticalRecoil}
              stock={stockSpec.verticalRecoil}
              higherIsWorse
            />
            <Delta
              label="Horiz. recoil"
              current={currentSpec.horizontalRecoil}
              stock={stockSpec.horizontalRecoil}
              higherIsWorse
            />
            <Delta label="Accuracy" current={currentSpec.accuracy} stock={stockSpec.accuracy} />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Delta({
  label,
  current,
  stock,
  higherIsWorse,
}: {
  label: string;
  current: number;
  stock: number;
  higherIsWorse?: boolean;
}) {
  const delta = current - stock;
  const sign = delta > 0 ? "+" : "";
  const cls =
    delta === 0
      ? ""
      : (higherIsWorse ? delta < 0 : delta > 0)
        ? "text-[var(--color-primary)]"
        : "text-[var(--color-destructive)]";
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius)] border p-2">
      <dt className="text-[0.65rem] uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="font-semibold">{current.toFixed(1)}</span>
        {delta !== 0 && (
          <span className={`text-xs ${cls}`}>
            {sign}
            {delta.toFixed(1)}
          </span>
        )}
      </dd>
    </div>
  );
}
```

- [ ] Lint in isolation + commit: `feat(web): add BuildHeader with inline name/desc + stock diff`.

### Task 5: `PresetPicker` component

- [ ] Create `apps/web/src/features/builder/preset-picker.tsx`:

```tsx
import { presetsForWeapon, type WeaponPreset } from "@tarkov/data";
import { Card, CardContent, Button } from "@tarkov/ui";

export interface PresetPickerProps {
  weaponId: string;
  onApply: (attachments: Readonly<Record<string, string>>) => void;
}

export function PresetPicker({ weaponId, onApply }: PresetPickerProps) {
  const presets = presetsForWeapon(weaponId);
  if (presets.length === 0) return null;
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-2 pt-6">
        <span className="mr-2 self-center text-sm text-[var(--color-muted-foreground)]">
          Presets:
        </span>
        {presets.map((p: WeaponPreset) => (
          <Button key={p.name} size="sm" variant="outline" onClick={() => onApply(p.attachments)}>
            {p.name}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] Commit: `feat(web): add PresetPicker (hidden when no presets registered)`.

### Task 6: Wire into `BuilderPage`

- [ ] Edit `apps/web/src/routes/builder.tsx`:

(a) Extend `BuilderPageProps`:

```tsx
export interface BuilderPageProps {
  initialWeaponId?: string;
  initialModIds?: string[];
  initialAttachments?: Record<string, string>;
  initialOrphaned?: string[];
  initialProfileSnapshot?: PlayerProfile;
  /** v4 hydration. */
  initialName?: string;
  initialDescription?: string;
  notice?: React.ReactNode;
}
```

(b) Add state:

```tsx
const [buildName, setBuildName] = useState<string>(initialName ?? "");
const [buildDescription, setBuildDescription] = useState<string>(initialDescription ?? "");
```

(c) Compute stock spec:

```tsx
const stockSpec = useMemo(() => {
  if (!selectedWeapon) return null;
  return weaponSpec(adaptWeapon(selectedWeapon), []);
}, [selectedWeapon]);
```

(d) Include `name` and `description` in `handleShare` payload (only when non-empty — Zod rejects empty optional strings):

```tsx
const namePart = buildName.trim().length > 0 ? { name: buildName.trim() } : {};
const descriptionPart =
  buildDescription.trim().length > 0 ? { description: buildDescription.trim() } : {};
saveMutation.mutate(
  {
    version: CURRENT_BUILD_VERSION,
    weaponId: selectedWeapon.id,
    attachments,
    orphaned,
    createdAt: new Date().toISOString(),
    ...(embedProfileOnSave ? { profileSnapshot: profile } : {}),
    ...namePart,
    ...descriptionPart,
  },
  { onSuccess: /* unchanged */ },
);
```

(e) Replace the existing static `<section>` containing the `<h1>Weapon Builder</h1>` with `<BuildHeader>`:

```tsx
<BuildHeader
  name={buildName}
  description={buildDescription}
  onNameChange={setBuildName}
  onDescriptionChange={setBuildDescription}
  currentSpec={spec}
  stockSpec={stockSpec}
/>
```

(f) After the weapon picker card and before the Mods card, mount `<PresetPicker>`:

```tsx
{
  selectedWeapon && (
    <PresetPicker
      weaponId={selectedWeapon.id}
      onApply={(next) => {
        setAttachments({ ...next });
        setOrphaned([]);
      }}
    />
  );
}
```

(g) Update imports: add `weaponSpec` (already there), `BuildHeader`, `PresetPicker`.

- [ ] Typecheck + lint. Green.
- [ ] Commit: `feat(web): wire BuildHeader + PresetPicker into /builder with v4 save`.

### Task 7: Wire v4 into `/builder/$id`

- [ ] Edit `apps/web/src/routes/builder.$id.tsx`. Extend the version-discriminator:

```tsx
if (build.version === 4) {
  return (
    <BuilderPage
      {...commonProps}
      initialAttachments={build.attachments}
      initialOrphaned={build.orphaned}
      initialProfileSnapshot={build.profileSnapshot}
      initialName={build.name}
      initialDescription={build.description}
    />
  );
}
```

Insert this branch BEFORE the fallback (the `// v3` branch — which becomes the fallback for any non-branched version).

- [ ] Typecheck + lint.
- [ ] Commit: `feat(web): route v4 builds with name/description hydration`.

---

## Phase 5: Ship

### Task 8: Full gates + PR

- [ ] `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check` — all green.
- [ ] Push + `gh pr create`.
- [ ] Watch CI; merge on green; admin-merge the release-please PR.

---

## Deviations from the spec

1. **Undo/redo deferred.** State machine is fiddly, value-to-cost lower than the other items. Tracked for a post-M1.5 polish PR.
2. **Preset list shipped empty.** Data-only follow-up. The component scaffold + schema are in place so adding presets is a content PR.
3. **Slot-tree polish (sticky headers, keyboard nav, quick-pick recent)** not included — the current `<details>`-based picker is functional and the polish is orthogonal.
4. **Playwright e2e still deferred.**
