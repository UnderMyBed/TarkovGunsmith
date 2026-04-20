# Ballistics Simulator (`/sim`)

**Status:** design approved 2026-04-19 · target version v1.5.0 (first M2 feature)
**Depends on:** `@tarkov/ballistics` ≥ 0.1.x (`simulateShot`, `simulateBurst`, types), `@tarkov/data` ammo + armor query layer, `apps/web` v1.4.0
**Part of:** [rebuild design](./2026-04-18-tarkov-gunsmith-rebuild-design.md) §13 — Milestone 2 "Parity"

## 1. Context

`/calc` answers "one round of ammo X vs one piece of armor Y — did it pen and what damage." That's a forward single-shot model. The original TarkovGunsmith's Simulator extended this to full engagements: a target loadout, a shot plan, and a shot-by-shot result with a kill decision.

This spec scopes the equivalent for the rebuild. It reuses the existing deterministic math primitives (`simulateShot`, `simulateBurst`), adds a scenario layer on top, and ships a `/sim` route that sits alongside `/calc` and `/matrix` using the same visual vocabulary.

Simulator is the first M2 feature because it has the shortest ramp: existing math covers it, no charting dependency, and it establishes the "multi-shot scenario" pattern that ADC/AEC will reuse.

## 2. Goals

- **Reusability.** Build on `simulateShot` directly; do not duplicate penetration or damage math.
- **Distinct from `/calc`.** Per-body-part HPs + armor loadout + a multi-shot plan. Not "calc in a loop."
- **Deterministic v1.** Same inputs → same outputs. Probabilistic / Monte Carlo is a future upgrade, not a v1 fork.
- **Iterative shipping.** Four PRs, each merges to `main` and auto-deploys, no long-lived feature branch.

## 3. Non-goals (explicit v1 out-of-scope)

- Bleeding ticks, movement penalties, recoil-based hit deviation.
- Thorax-overflow damage to other parts (Tarkov's "+50% overflow" rule). Kill = HP ≤ 0 on head or thorax; everything else can black but doesn't kill.
- Probabilistic (Monte Carlo) mode with per-shot RNG rolls.
- Save / share scenarios via `builds-api`. Builder proved the pattern; layer on if asked.
- Custom target HP presets in UI. v1 hardcodes PMC defaults.
- Charts / visualisations beyond simple HP bars. Effectiveness charts are their own M2 sub-project.
- Playwright e2e. Deferred per 2026-04-19 decision.

## 4. Scenario model

### 4.1 Target

```ts
type Zone = "head" | "thorax" | "stomach" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";

interface BodyPart {
  hp: number; // current
  max: number;
  blacked: boolean;
}

interface ScenarioTarget {
  parts: Record<Zone, BodyPart>;
  helmet?: BallisticArmor; // protects head
  bodyArmor?: BallisticArmor; // protects thorax ± stomach per armor.zones
}
```

**PMC defaults (v1 hardcoded):** head 35, thorax 85, stomach 70, leftArm 60, rightArm 60, leftLeg 65, rightLeg 65.

### 4.2 Shot plan

```ts
interface PlannedShot {
  zone: Zone;
  distance: number; // metres; passed through to simulateShot (currently unused by math)
}
type ShotPlan = readonly PlannedShot[];
```

### 4.3 Engine

Lives at `packages/ballistics/src/scenario/simulateScenario.ts`.

```ts
interface ScenarioShotResult extends ShotResult {
  zone: Zone;
  armorUsed: "helmet" | "bodyArmor" | null;
  bodyAfter: Record<Zone, BodyPart>;
  killed: boolean;
}

interface ScenarioResult {
  shots: ScenarioShotResult[];
  killed: boolean;
  killedAt: number | null; // index into shots[] of the fatal shot, or null
}

function simulateScenario(
  ammo: BallisticAmmo,
  target: ScenarioTarget,
  plan: ShotPlan,
): ScenarioResult;
```

### 4.4 Per-shot procedure

For each `PlannedShot` in order, until the target is dead:

1. **Resolve armor for zone.** If `zone === "head"` and `helmet` is present and `zone ∈ helmet.zones`, the helmet takes the hit. Else if `bodyArmor` is present and `zone ∈ bodyArmor.zones`, the body armor takes the hit. Else no armor — bare flesh.
2. **Compute shot result.** If armor resolved, call `simulateShot(ammo, armor, distance)` using the rolling durability and update that armor's durability in the scenario's own copy. If bare flesh, skip the call and synthesise the result per 4.5. Caller inputs are never mutated.
3. **Apply damage to the body part.** `hp = max(0, hp - shot.damage)`. If `hp === 0`, mark `blacked = true`.
4. **Kill check.** If `zone === "head"` or `zone === "thorax"` and that part's `hp === 0`, set `killed = true`, record `killedAt`, stop iterating.
5. **Record shot.** Push `ScenarioShotResult` with a deep-cloned `bodyAfter` snapshot.

### 4.5 Bare-flesh shots

`simulateShot` requires a `BallisticArmor`. For bare flesh we either:
(a) branch inside `simulateScenario` to a flesh-only damage path (skip `simulateShot`, apply `ammo.damage` directly), or
(b) pass a "nullArmor" sentinel (class 0, zero durability) through `simulateShot`.

**Decision: (a).** Skipping the call keeps `simulateShot`'s contract honest (it expects real armor) and avoids encoding a sentinel the rest of the codebase has to handle. Bare-flesh damage is just `ammo.damage` with `didPenetrate: true`, `armorDamage: 0`, `residualPenetration: ammo.penetrationPower`, `armorUsed: null`.

## 5. Route `/sim`

### 5.1 Layout

Three panels, matching `/calc`'s visual vocabulary (`@tarkov/ui` cards + existing Tailwind tokens).

- **Left — Inputs**
  - Ammo picker. Reuse the `AmmoPicker` component / hook from `/calc`.
  - Helmet picker (optional). Armor-category filter: `Headwear`.
  - Body-armor picker (optional). Armor-category filter: `Body armor` / `Chest rig (armored)`.
  - Distance (metres, numeric input). Default 15.

- **Center — Shot plan**
  - Body silhouette with 7 clickable zones (head / thorax / stomach / L-arm / R-arm / L-leg / R-leg). Clicking appends a `PlannedShot` to the queue.
  - Queue list below the silhouette: ordered rows with zone pill + "↑" + "↓" + "×". An empty queue shows helper copy.
  - "Clear" + "Run" buttons.

- **Right — Results**
  - Summary card: killed (✓/✗), shots to kill, total flesh damage, helmet durability remaining, body armor durability remaining.
  - Shot-by-shot timeline: one row per shot with zone, pen Y/N, damage, armor damage, HP bars for affected parts.

Mobile: panels stack vertically (inputs → plan → results).

### 5.2 State + hooks

- `useScenario` hook in `apps/web/src/routes/sim/useScenario.ts` wrapping a `useReducer` over `{ plan: ShotPlan, lastResult: ScenarioResult | null }`. Actions: `append`, `move`, `remove`, `clear`, `run`.
- Ammo + armor data fetched via existing `@tarkov/data` query hooks. No new queries.
- No URL state for the scenario in v1 — plan lives in memory only. Future: encode plan into share URL when save/share lands.

## 6. Testing

### 6.1 `@tarkov/ballistics`

TDD, per package conventions (100% line / 95% branch). Fixtures live under `packages/ballistics/src/scenario/__fixtures__/`. Required cases:

1. **Thorax-only plan — fresh class-4 + M855.** Expect N shots to kill (compute expected N from existing `simulateBurst` fixture + thorax HP).
2. **Head kill through helmet.** Altyn + M995 against head; verify fatal shot index and helmet durability drop.
3. **Bare leg shots never kill.** 100× leg plan; `killed === false`, `killedAt === null`, leg blacked.
4. **Empty plan.** `shots.length === 0`, `killed === false`, `killedAt === null`.
5. **Target already dead (thorax hp: 0).** Returns immediately, no shots recorded.
6. **Plan longer than needed.** Stops at `killedAt`, remaining shots ignored.
7. **Armor durability chains across shots.** Second shot sees reduced durability from the first.
8. **Input immutability.** Caller's `target.parts` and armor objects unchanged after call.
9. **Mixed-zone plan.** Verify correct armor (helmet vs bodyArmor vs none) resolved per zone.

### 6.2 `apps/web`

- Vitest unit tests for the shot-queue reducer (`append`, `move`, `remove`, `clear`).
- Vitest unit tests for the zone-to-armor resolver if extracted.
- Component smoke test for `/sim` rendering with empty state.
- No Playwright (per 2026-04-19 decision).

## 7. Build sequence (4 PRs)

Each PR: own worktree in `.worktrees/`, own plan via `superpowers:writing-plans`, TDD, subagent-driven execution, code review, squash merge, auto-deploy, release-please PR.

### PR 1 — Scenario math (`@tarkov/ballistics`)

- Add `src/scenario/simulateScenario.ts` + `.test.ts` + `__fixtures__/`.
- Export `simulateScenario`, `ScenarioTarget`, `PlannedShot`, `ShotPlan`, `Zone`, `ScenarioShotResult`, `ScenarioResult` from `src/index.ts`.
- PMC HP defaults as an exported const `PMC_BODY_DEFAULTS`.
- `feat:` → minor bump of `@tarkov/ballistics` (internal; not currently released publicly).

### PR 2 — State + hook (`apps/web`)

- `src/routes/sim/useScenario.ts` — reducer + hook.
- `src/routes/sim/useScenario.test.ts` — reducer tests.
- No UI yet; hook is callable from tests and the next PR.
- `feat:` — no user-visible change this PR (pure infra).

### PR 3 — UI skeleton (`/sim` route)

- `src/routes/sim/index.tsx` registered via TanStack Router.
- Three-panel layout with static styling, inputs wired but "Run" does nothing yet.
- Body silhouette as inline SVG with 7 clickable `<button>` regions + accessible labels.
- Navigation entry in the existing top-nav / landing page.
- `feat(sim): route skeleton` — non-functional but visible.

### PR 4 — Wire-up + polish

- Connect inputs → hook → `simulateScenario`.
- Results panel: summary card + shot-by-shot timeline with HP bars.
- Empty, dead, and kill states all render cleanly.
- Loading / error states for ammo/armor data.
- `feat(sim): ballistics simulator` — user-visible feature complete. Triggers release.

## 8. Known follow-ups (tracked, not blocking)

- Thorax-overflow damage rule (+50% to other parts when thorax goes to 0).
- Bleeding ticks + timers.
- Probabilistic / Monte Carlo mode with variance reporting.
- Custom target HP presets + Scav/Boss presets.
- Save/share scenarios via `builds-api`.
- Distance-based penetration falloff (needs a math-package change first).
- Hit distribution / weighted random allocation (alternative to user-defined plan).
- Effectiveness charts on results (own M2 sub-project).

## 9. Risks

- **Armor-zone string matching.** `tarkov-api` zone strings may differ from our `Zone` enum. Mitigation: a small adapter at the UI layer (`apps/web`) that maps api zones → our zones, not inside the math package. Test with real data in PR 3.
- **"Body armor + chest rig" stacking.** Some Tarkov armors are chest rigs that also have armor. v1 exposes one body-armor slot only; user chooses which one matters. Documented in the UI as a hint.
- **Plan length DoS.** User spams the silhouette and queues 10 000 shots. Cap plan length at 128 (any real scenario ends long before then). Reducer enforces.
