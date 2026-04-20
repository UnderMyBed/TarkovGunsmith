# Handoff — starting Milestone 2

> Temp doc. Delete (or move to `docs/operations/`) once M2 has its own spec/plan on disk. Written 2026-04-20 after shipping M1 + M1.5 in a single session.

## TL;DR

- **v1.4.0 is live** on Cloudflare. M1 (`/calc`, `/matrix`, `/builder`) + M1.5 Builder Robustness arc (save/load, slot compat, progression gating, UX depth) all shipped.
- **Double-deploy fix** landed in PR #51 (`a32ea64`). Release-please PRs no longer re-deploy.
- **Branch-protection name** is `Typecheck • Lint • Format • Test` — don't rename the CI job or feature PRs won't auto-merge.
- **Next work = Milestone 2 "Parity"** — Ballistics Simulator (multi-shot), ADC, AEC, DataSheets, effectiveness charts.
- **Two user actions before M2 feature work starts** (see §3). Neither blocks brainstorming; both block user-visible correctness.

## 1. Current repo state

- `main` at `a32ea64` (post-cleanup PR #51). Release tags through `v1.4.0`.
- 102+ tests passing across the monorepo. Full CI gates green: typecheck, lint, format:check, test, **build** (added in #51).
- No active feature worktrees. `.worktrees/` is gitignored.
- No open PRs.
- Recent commit log:
  ```
  a32ea64 chore(ops): stop double-deploying releases + catch build regressions in CI (#51)
  1648ac8 chore(main): release 1.4.0 (#50)
  bc90e34 feat(builder): UX depth — name/description + stock diff + preset scaffold (M1.5 PR 4) (#49)
  d9dd162 chore(main): release 1.3.0 (#48)
  2e26b00 feat(builder): player-progression gating + schema v3 (M1.5 PR 3) (#47)
  becee52 chore(main): release 1.2.0 (#46)
  4756524 feat(builder): slot-based mod compatibility + schema v2 (M1.5 PR 2) (#45)
  7c9e061 chore(main): release 1.1.0 (#44)
  a8e74ac feat(builder): schema v1 + save/load round-trip (M1.5 PR 1) (#43)
  ```

## 2. Key artifacts

- **Design (locked):** [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](./superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) — §13 is the milestone roadmap.
- **M1.5 umbrella spec:** [`docs/superpowers/specs/2026-04-19-builder-robustness-design.md`](./superpowers/specs/2026-04-19-builder-robustness-design.md) — for any backfill questions about the Builder.
- **M1.5 per-PR plans:** `docs/plans/2026-04-19-builder-schema-and-save-load-plan.md`, `2026-04-20-builder-slot-compat-plan.md`, `2026-04-20-builder-progression-gating-plan.md`, `2026-04-20-builder-ux-depth-plan.md`.
- **Deploy runbook:** [`docs/operations/cloudflare-deploys.md`](./operations/cloudflare-deploys.md).

## 3. User actions blocking production correctness

### 3a. Set `BUILDS_API_URL` on Cloudflare Pages (save/load is 500-ing in prod today)

```bash
wrangler login   # if not already
wrangler pages secret put BUILDS_API_URL --project-name tarkov-gunsmith-web
# paste: https://tarkov-gunsmith-builds-api.<your-subdomain>.workers.dev
```

The Pages Function `apps/web/functions/api/builds/[[path]].ts` returns HTTP 500 without this var. UI will show "Couldn't reach build storage" on every save/load attempt.

### 3b. Decide on Playwright before M2 starts

**Option A:** ship an infra PR that sets up Playwright + one smoke test per existing route (calc, matrix, builder save/load, /builder/$id hydration). ~1-2 hours. Then gate all M2 PRs on "new route = new smoke test."

**Option B:** continue deferring. M2 adds 4+ new routes (Simulator, ADC, AEC, DataSheets × N). Without Playwright, regressions will only surface in manual browser testing + prod. Tech debt will compound.

**My recommendation:** Option A. Cost is bounded; value grows linearly with each new route.

Either way, **tell the next Claude which option you picked** — it's a scope decision that changes M2's per-PR plans.

## 4. Milestone 2 scope (from the design doc §13)

Per the locked design, M2 "Parity" covers:

- **Ballistics Simulator** — multi-shot scenarios (already have `simulateBurst` primitive). Probably `/sim` route.
- **ADC (Armor Damage Calc)** — forward ballistics math in a dedicated form. Leans on `armorDamage` + `penetrationChance`.
- **AEC (Armor Effectiveness Calc)** — inverse of ADC. "What ammo do I need to break this armor in N shots?"
- **DataSheets** — large tabular views for weapons / ammo / armor / modules. Likely 4 routes.
- **Effectiveness charts** — visualization of `armorEffectiveness` matrix. New charting lib dep (Recharts probably).

Math layer (`@tarkov/ballistics`) is ready. Data layer (`@tarkov/data`) is sufficient. UI layer will want a charting library that doesn't exist yet — verify bundle-size impact early.

## 5. How we work here (condensed)

- **Every feature:** brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/plans/`) → TDD execution → PR → merge → auto-deploy → release-please PR → admin-merge.
- **Execution pattern:** subagent-driven-development, one worktree per PR in `.worktrees/`, one subagent per task, combined spec+quality review for mechanical tasks, separate reviewers for integration tasks.
- **Commits:** Conventional Commits enforced by commitlint. `feat:` = minor bump, `fix:` = patch bump, `chore:` / `docs:` / `ci:` = no version bump.
- **Release PRs need `--admin` merge** because `workflow_dispatch`-triggered CI doesn't satisfy branch-protection's required status check. Verify the workflow_dispatch run on the release branch passed, then `gh pr merge N --squash --admin`.
- **Per-package `tsconfig.json` is mandatory** or ESLint `projectService` can't find the files. Same story for test files outside `packages/*/src/queries/` — update `eslint.config.js` `allowDefaultProject` if a test lands at a new path.

## 6. Deferred M1.5 items — do NOT re-raise without user ask

These are all known, documented, and intentionally not in M1.5:

- **Undo/redo** — state machine is fiddly. Future polish minor.
- **`allowedCategories` slot filtering** — category-based slots ("any rail") render with empty pickers today. Cheap to add; not urgent.
- **`craftsFor` / `bartersFor`** in `itemAvailability` — only `buyFor` paths evaluated. Items that only exist via crafting/barter report "no sources."
- **Dialog primitive** in `@tarkov/ui` — everything uses `<details>` collapsibles. Only add when something actually demands a true modal.
- **Weapon preset content** — `WEAPON_PRESETS` map ships empty. Data-only follow-up PR.
- **Slot-tree polish** — sticky headers, keyboard nav beyond native `<details>`, quick-pick recent mods.
- **Playwright e2e** — see §3b. User decision pending.
- **`BUILD_ID_REGEX` extraction** — duplicated between `apps/builds-api/src/id.ts` and `packages/tarkov-data/src/buildsApi.ts`. Inline comment on both sides notes the sync requirement. Not worth the 5-file change for a nit.
- **Recursion depth 5** for the weapon slot tree (currently 3). Bump if any real weapon needs it.
- **`tarkov.dev` profile import** — deferred to M3 per the original spec.
- **Build comparison / optimization / OG share cards** — explicit M3.

## 7. Gotchas the last session hit

- **Fresh worktrees need `pnpm --filter @tarkov/data build`** (and sometimes `@tarkov/ui`, `@tarkov/ballistics`) before the web app will typecheck — workspace deps depend on `dist/` output, not source.
- **`@tarkov/data` dist must be rebuilt** after schema changes before `apps/web` can pick them up. Subagents often hit this when wiring UI integration tasks.
- **Don't skip the first `pnpm install --frozen-lockfile`** in a new worktree. A stale install will silently mis-link dev deps (caught `@cloudflare/workers-types` this session).
- **YAML tag directive trap:** `${{ ... !startsWith(...) ... }}` in a workflow `if:` must be double-quoted — Prettier treats bare `!` as a YAML tag indicator.
- **Don't rename the CI job** — branch protection matches the status check by display name. Adding steps is fine; renaming the job broke merge-via-PR until we reverted.
- **`useSaveBuild` / `saveBuild` accept the `Build` union** (not just `BuildV1`). Widened in PR 2 when v2 landed.

## 8. Memory notes

User memory at `/home/matt/.claude/projects/-mnt-c-Users-Matt-Source-TarkovGunsmith/memory/` has:

- `project_tarkov_gunsmith_state.md` — fully updated to reflect v1.4.0 state. Includes shipped items, remaining-scope, deferred items, and M2 prereqs.
- `feedback_execution_approach.md` — user prefers subagent-driven-development + worktree isolation.
- `feedback_brainstorming_style.md` — user responds well to "take the wheel" framing, MC questions with recommendation flagged, one question at a time.

Fresh session should read `MEMORY.md` and the project_tarkov_gunsmith_state.md first.

## 9. Suggested first moves for the next session

1. Greet + confirm Playwright decision (§3b).
2. Confirm `BUILDS_API_URL` has been set (§3a).
3. Invoke `superpowers:brainstorming` for the first M2 piece. My suggestion: start with **Ballistics Simulator** — it's the closest in spirit to existing `/calc` and reuses `simulateBurst` directly, so the ramp cost is low and success ships visible value quickly. ADC/AEC/DataSheets/charts then layer on with a shared pattern.
4. When the first M2 spec is on disk, delete this handoff doc.
