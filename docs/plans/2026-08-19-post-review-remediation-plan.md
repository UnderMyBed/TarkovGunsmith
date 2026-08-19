# Post-review remediation plan

**Date:** 2026-08-19
**Baseline:** `c4c2402` / v1.16.1
**Source:** independent architecture review (fresh agent, no prior audit context), re-verified on 12 claims.

## Why this exists

An independent review answered the question "can this codebase absorb a major refactor and UI
redesign?" with a qualified yes: the package graph is acyclic and correctly directed, the math core
is pure, and route tests are behavioural. But it found one shipped rendering bug that would corrupt
every redesign decision, two dead local verification gates, and a set of defects nobody was looking
for. This plan groups all of it into independently-mergeable units and lands them before the
refactor starts.

Nothing in this plan is refactor work. It is the ground the refactor stands on.

## Locked decisions

| #   | Decision                                                                                       | Rationale                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| R1  | Fix the Tailwind scan and rework `packages/ui`'s tests in the **same** PR                      | The test rework is the guard for the fix. Landing the fix alone leaves the same blind spot.                 |
| R2  | `packages/ui` tests assert **behaviour + one computed style** per primitive, not class strings | Class-string assertions passed straight through the bug and would break on every redesign rename.           |
| R3  | Worker reachability becomes **config-as-code** in `wrangler.jsonc`                             | It is currently declared nowhere, which is why it could vanish silently.                                    |
| R4  | Deploy gets a **post-deploy smoke gate**                                                       | A deploy that 500s on its own API should fail loudly, not report success.                                   |
| R5  | e2e serves **fixtures**, not live `json.tarkov.dev`                                            | The repo's own stated policy: the pre-merge gate must fail on our code, never a third party's availability. |
| R6  | Docs are truthed-up **last**                                                                   | So they describe the end state, not an intermediate one.                                                    |

## Units

Each unit is one branch, one PR, conventional-commit titled. Waves avoid file-level conflicts.

### Wave 1 — independent, dispatched together

**U1 · `fix(ui)`: make Tailwind scan `packages/ui`, and prove it stays scanned**

- Add `@source` for `packages/ui/src` so the 58 purged design-system classes are emitted.
- Re-check the focus ring specifically: `focus-visible:outline-none` is purged _too_, so the UA
  default outline is currently the only focus indication. Restoring the custom ring without
  checking would briefly remove focus indication entirely.
- Rework the ~35 class-string assertions across 11 component test files into behavioural
  assertions plus **one real computed-style check per primitive**.
- Closes #162. Blockers 01 + 04.

**U2 · `fix(builder)`: three live defects in the builder and compare flows**

- `queries/modList.ts` hardcodes `craftsFor`/`bartersFor` to `null`; `useBuilderState` derives
  `hasCraft`/`hasBarter` from them and `slot-tree` gates CRAFT/BARTER pills on the result. Dead UI
  path shipping in the bundle — remove the path or restore the data, and say which in the PR body.
- `useTarkovTrackerSync.ts:64` — a ternary whose branches are identical, so a user with a saved
  token is shown "disconnected" on load.
- `compare-workspace.tsx` saves with no `onError` and `compare-toolbar` has no error prop, so a
  failed save is completely silent. Also fixes the label not flipping after the save redirect.
- Closes #163.

**U3 · `fix(security)`: validate identifiers before they reach a server-side fetch**

- `functions/og/build/[id].ts` and `functions/og/pair/[pairId].ts` interpolate an unvalidated route
  param into a fetch URL. `functions/_middleware.ts` already regex-validates the same identifier as
  `[a-zA-Z0-9_-]{4,16}` — apply that shared rule in all three places.

**U4 · `chore(repo)`: hygiene that is currently masking real signal**

- `pnpm test` is red locally and green in CI. Suspect stale caches in `apps/*/node_modules/.vite*`
  and `.mf`. Diagnose properly: if caches, add cleanup + a note; if a genuine
  vitest 4 / pool-workers 0.22 incompatibility, say so and rewrite the stale comment in
  `apps/builds-api/vitest.config.ts` that blames coverage instrumentation.
- Delete on-disk `apps/data-proxy/` and `packages/tarkov-types/` — zero tracked files, but they
  retain `dist/`, `node_modules/`, `.turbo/`, and a still-resolvable `tarkov-types/dist/index.d.ts`.
- `@types/node` is pinned `^26.2.0` via `pnpm.overrides` while the runtime is node 22, which
  `.github/dependabot.yml:53-55` explicitly forbids. Align it and add a `repo-guards` test.
- `lint` has no `dependsOn: ["^build"]`, so on a fresh clone it runs before workspace `dist/` exists.

### Wave 2 — after Wave 1 merges

**U5 · `fix(a11y)`: keyboard and screen-reader correctness**

- `Dialog` sets `aria-modal="true"` but never intercepts Tab — keyboard users tab out into the page
  behind (WCAG 2.4.3). Make it a real focus trap or drop the claim.
- `nav-dropdown` declares `role="menu"`/`role="menuitem"` with zero arrow-key handling, and
  `role="menuitem"` on a `Link` overrides the native link role. Either implement the pattern or use
  plain links. Escape must return focus to the trigger.
- Add a skip-to-content link and an `id` on `<main>`; give the 11 raw `<button>` elements real
  focus styling. Depends on U1 — until Tailwind scans `packages/ui`, focus utilities do not exist.

**U6 · `test(e2e)`: stop depending on live upstream**

- Route `json.tarkov.dev` to the fixtures already in `packages/tarkov-data/src/__fixtures__/`, or
  make the base URL a build-time env var. `recoil-units.spec.ts:37` asserts `rows.count() > 50`,
  which currently only passes against real upstream data.
- Also document the Playwright system-dependency requirement (`libasound2t64`) and fail with a
  clear message rather than a wall of 404s.

**U7 · `test(web)`: cover what the refactor will cut through**

- `slot-tree.tsx` (42%, 325 LOC, the most complex interactive component) and `profile-editor.tsx`
  (41%). Behavioural tests only — roles, user events, real router — matching the existing
  `src/test/render-route.tsx` harness. Depends on U2.

**U8 · `ci(deploy)`: make the worker reachable and keep it that way**

- Declare worker reachability in `apps/builds-api/wrangler.jsonc` (currently no `routes`, no
  `workers_dev`), so it can never silently vanish again.
- `deploy.yml` advertises `environment.url: https://tarkov-gunsmith-builds-api.workers.dev`, which
  has no account subdomain and has never resolved. Correct it.
- Add a post-deploy smoke step that POSTs `/api/builds` and fails the deploy on a 500. Deploy
  currently runs install → build → deploy with no typecheck, no tests, no smoke.
- Closes #164, #167 (code half; the account half needs Cloudflare credentials).

**U9 · `docs`: truth-up the 11 documented drifts**

- `CLAUDE.md` says 8 routes; there are 28. Five items listed as deferred have shipped
  (skeleton, favicon, OG cards, shortcut overlay, weapon silhouettes) — only light theme has not.
  `craftsFor`/`bartersFor` is not deferred, it is structurally blocked upstream. The repo-layout
  table lists 5 workspace dirs; 9 exist. `README` and `/smoke` still cite `api.tarkov.dev`, down
  since July 2026. `deploy.yml:77` references `@tarkov/types`, which no longer exists. The
  `builds-api/vitest.config.ts` comment claims 29 tests; CI reports 48.
- Also move `features/sim/zoneMetadata.ts`'s 7 raw Tailwind palette colours onto the Field Ledger
  palette, or record why they stay off-palette.

## Explicitly deferred

| Item                                                     | Why                                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `useProfile` duplication landmine                        | Real, but it is refactor work — it only bites when a second caller appears.        |
| `@tarkov/data` junk-drawer split                         | Architectural; belongs in the refactor, not the prep.                              |
| Missing `DataTable` / `PageHeader` / `Select` primitives | These are the redesign's actual content.                                           |
| `tailwind-merge` token-conflict trap                     | Documented in U9; the fix is adopting generated utilities, which is redesign work. |
| Worker security deep sweep, `packages/og` palette audit  | Named as unverified in the review; separate scoped pass.                           |

## Gate

Every unit: `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage`, and — for anything touching the UI —
Playwright. Merge on green. No unit merges on a red or skipped gate; if a gate is bypassed, the PR
body says so.
