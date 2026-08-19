# Pre-Refactor Hardening Plan

**Status:** executed 2026-08-19 — see Outcomes at the foot of this file
**Original status:** approved 2026-08-19 · **Baseline:** `dc7fa11` (v1.15.0)

Clears measured technical debt ahead of a major refactor and UI/UX redesign. Every figure
below was measured against `dc7fa11`, not estimated.

This document is the single source of truth for the work. Implementers get no conversation
history — read this file in full, plus the unit brief you were given.

---

## Why this exists

A refactor is a behaviour-preserving change. You can only do one safely if you can _detect_
that behaviour changed. On the two surfaces this redesign touches hardest — the design
system and the route layer — we currently cannot.

The audit that produced this plan found that **no coverage threshold has ever been enforced
in CI**. `pnpm test` resolves to `vitest run` with no `--coverage` flag. Five packages
declare thresholds; nothing invokes them. Three of those packages fail their own gate — `web` worst, at 35.96%
statements against a declared 100% — one measures 6% of itself and reports 100%, and one
names a coverage provider that was never installed.

Everything in Stage 1 exists to fix that. Nothing else starts until it is done.

---

## Decisions (locked — do not relitigate)

| #   | Decision         | Chosen                            | Consequence                                                                                                                                       |
| --- | ---------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Coverage scope   | **Routes in, ratchet thresholds** | `apps/web/src/routes/**` enters measurement. Per-package thresholds start at today's honest number and only ever rise.                            |
| D2  | `BuilderPage`    | **Decompose now, as prep**        | Behaviour-preserving split lands before any visual work, in its own PR.                                                                           |
| D3  | Ship cadence     | **Release after each stage**      | Cut a release where a stage produced a user-facing change. Stages that are purely internal produce no version bump — that is correct, not a miss. |
| D4  | Scope escalation | **Timebox, skip, keep going**     | An item that materially exceeds its estimate is abandoned with a clean tree, flagged, and the run continues.                                      |

Two calls made by the conductor rather than escalated:

- **Type scale (Stage 3) is a mechanical extraction.** Tokenize the _existing_ values so
  rendered output is byte-identical. Consolidate exact duplicates only. Inventing a new
  scale is the redesign's job, not prep work.
- **`og`'s two 0%-covered files** (`embedded-fonts.ts`, `embedded.ts`) are generated build
  artifacts. Exclude them deliberately, with a comment saying why. Do not write tests
  against generated output.

---

## Measured baseline

Coverage as of `dc7fa11`. These are the numbers the ratchet starts from.

| Package                 | Stmts | Branch | Funcs | Lines | Current state                           |
| ----------------------- | ----: | -----: | ----: | ----: | --------------------------------------- |
| `ballistics`            |   100 |    100 |   100 |   100 | passes its 100/95 gate                  |
| `optimizer`             |   100 |  96.51 |   100 |   100 | passes its 100/95 gate                  |
| `tarkov-data`           | 93.57 |  81.06 | 92.30 | 96.00 | **fails** 100/95; excludes `hooks/**`   |
| `repo-guards`           | 91.48 |  75.75 | 87.50 | 93.02 | no coverage config at all               |
| `og`                    | 69.92 |  69.87 | 76.31 | 73.50 | **fails** 95/85                         |
| `web` (routes excluded) | 35.96 |  34.92 | 29.76 | 36.61 | **fails** its declared 100/95           |
| `web` (incl. routes)    | 22.11 |  21.04 | 15.85 | 22.64 | what 1.4 opts into                      |
| `ui` (widened)          | 15.85 |   5.26 | 10.00 |     — | reports 100% over 5 statements today    |
| `builds-api`            |     — |      — |     — |     — | **provider `istanbul` never installed** |

Other measured facts referenced by the stages below:

- Bundle: `933.29 kB` raw / `269.20 kB` gzip, one chunk. Vite emits
  `INEFFECTIVE_DYNAMIC_IMPORT` and a >500 kB chunk warning.
- Lint fallout from adding `react-hooks` + `jsx-a11y`: **31 violations across 15 files**
  (26 errors, 5 warnings), measured via a temporary install, since reverted.
- Arbitrary Tailwind values: **859 total**, of which **426** are `var(--color-*)` token
  references (healthy) and **433** are hardcoded, overwhelmingly typography.
- `BuilderPage`: `apps/web/src/routes/builder.tsx` is 601 lines; the function spans
  78–590 = **512 lines**, with **12 `useState`** and **45 hook calls**.
- Error boundaries in `apps/web`: **zero**.

---

## Stages

Stages are gated. Do not start a stage until the prior gate is met.

### Stage 1 — Restore the safety net

**Gate to clear:** CI fails on a coverage drop, and a `packages/ui` component can be
render-tested.

#### 1.1 — Enforce coverage in CI _(conductor-owned; base for everything else)_

- Add a `test:coverage` task to `turbo.json`.
- Give every package a `test:coverage` script. `web`, `builds-api` and `repo-guards`
  currently have none.
- ~~Install `@vitest/coverage-istanbul` for `builds-api`.~~ **Attempted and abandoned.**
  Installing the provider does not help: `@cloudflare/vitest-pool-workers@0.22.0` dies at
  test-file import under coverage instrumentation with `TypeError: Cannot read properties
of undefined (reading 'config')` across all four test files, and workerd cannot use the
  v8 provider. Upstream limitation, not a gap in our tests. Deferred per D4 with the full
  reasoning recorded in `apps/builds-api/vitest.config.ts`. Its 29 tests still run in CI.
- Add a `repo-guards` coverage config; it has none.
- CI runs `pnpm test:coverage` in place of, or in addition to, `pnpm test`.
- Set every package's thresholds to its **measured baseline above**, not to an aspiration.
  The point of this PR is that CI starts failing on regressions immediately; raising the
  bars is later work.

#### 1.2 — Make `packages/ui` render-testable

The design system cannot render-test a single component today:

- `vitest.config.ts` has `include: ["src/**/*.test.ts"]` — `.tsx` test files are never
  collected.
- devDependencies are `@types/react`, `@types/react-dom`, `react`, `react-dom`,
  `tailwindcss`. No `@testing-library/react`, no `jsdom`.
- `environment: "node"`.
- Coverage `include` is `src/lib/**/*.ts` plus one icon file — 5 statements of a 649-line,
  11-component package.

Port the setup that already works in `apps/web`, which has `@testing-library/react`,
`@testing-library/jest-dom`, `@testing-library/user-event` and `jsdom`, and uses a
`// @vitest-environment jsdom` docblock per test file (5 such files exist).

Then write real render tests for the 11 components. The four existing tests assert `cva`
class strings; keep them, they are useful, but they are not render coverage.

#### 1.3 — Close the two failing packages

- `tarkov-data`: reach its 100/95 gate. Also remove the `src/hooks/**` coverage exclusion —
  the hooks layer is currently unmeasured.
- `og`: reach its 95/85 gate. Worst files are `embedded-fonts.ts` (0%), `embedded.ts` (0%),
  `fonts.ts` (66.7%), `render.ts` (68.2%), `hydrate.ts` (82.6%). Per the decision above,
  exclude the two generated files deliberately and cover the rest.
- Must land before the `satori` upgrade in Stage 4.

#### 1.4 — Bring `apps/web/src/routes/**` into measurement

3,058 lines — 40% of the app — are excluded today, including `BuilderPage`. Un-exclude,
set thresholds to the measured 22.11/21.04/15.85/22.64 baseline, and write route tests to
start the ratchet moving. Prioritise `builder.tsx`, since Stage 5.1 refactors it and needs
the safety net.

---

### Stage 2 — Guardrails on before new code is written

**Gate to clear:** new UI code is written against hook and a11y rules from line one.

#### 2.1 — Add `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`

Measured fallout — 31 violations, 15 of 55 files linted:

| Count | Rule                                              |
| ----: | ------------------------------------------------- |
|    13 | `jsx-a11y/label-has-associated-control`           |
|     5 | `react-hooks/exhaustive-deps`                     |
|     4 | `jsx-a11y/click-events-have-key-events`           |
|     3 | `jsx-a11y/no-static-element-interactions`         |
|     2 | `react-hooks/set-state-in-effect`                 |
|     2 | `jsx-a11y/no-noninteractive-element-interactions` |
|     2 | `jsx-a11y/heading-has-content`                    |

The seven `react-hooks` findings are real defects and must be fixed as behaviour changes,
with tests, not silenced:

- `features/builder/profile-editor.tsx:52,54` — three findings, one cause. `completedSet`
  and `allTasks` are reconstructed every render, so **the `useMemo`s at lines 65 and 69 are
  no-ops**.
- `routes/builder.tsx:126` — `setState` called synchronously in an effect (the v1→v2 build
  migration), causing cascading renders.
- `features/builder/optimize/optimize-view.tsx:96` — same rule, same problem.
- `features/builder/optimize/optimize-view.tsx:85` — `useEffect` missing
  `currentAttachments`.
- `features/builder/compare/compare-workspace.tsx:103` — `useEffect` missing `draft` and
  `initialPair`; a stale closure.

Worst files: `tarkovtracker-connect-popover.tsx` (5), `profile-editor.tsx` (4),
`routes/adc.tsx` (3), `packages/ui/src/components/dialog.tsx` (3).

#### 2.2 — De-brittle the ESLint project list

`allowDefaultProject` enumerates test paths one directory depth at a time across ~25 globs.
A refactor that moves a test file one level deeper fails lint with a message that does not
point here. Replace with a per-package `tsconfig.test.json` so depth stops mattering.

---

### Stage 3 — Tokenize the type scale

**Gate to clear:** a visual redesign is a token edit, not a file-by-file sweep.

Colour is already fully tokenized — 0 raw Tailwind palette classes and 0 hardcoded hex in
`apps/web` and `packages/ui`; all 426 colour references go through `var(--color-*)`. Nothing
to do there.

Typography is not. 433 hardcoded arbitrary values, dominated by:

`[10px]`×43 · `[0.18em]`×34 · `[11px]`×31 · `[0.2em]`×19 · `[0.15em]`×11 · `[0.22em]`×8

Add a type scale to `@theme` in `packages/ui/src/styles/index.css` alongside the existing
colour tokens, then sweep the hardcoded values onto it. **Rendered output must be
byte-identical** — this is extraction, not redesign. Verify with the e2e suite and by
diffing computed styles if needed.

`packages/og` keeps its 11 hardcoded hex values: satori cannot resolve CSS custom
properties. Note this in the package's `CLAUDE.md` so the redesign knows OG cards need a
manual pass.

---

### Stage 4 — Take the dependency majors

**Gate to clear:** dependency tree settled; nothing upgrades again until the refactor ships.

`pnpm audit` is clean at every severity. This is about timing, not security — these must not
be in flight during the refactor, or "did my change break this?" becomes unanswerable.

| Package          | Current | Latest | Note                                                            |
| ---------------- | ------- | ------ | --------------------------------------------------------------- |
| `tailwind-merge` | 2.6.1   | 3.6.0  | core to every `ui` component                                    |
| `zod`            | 3.25.76 | 4.4.3  | every schema in `data` and `web`                                |
| `typescript`     | 6.0.3   | 7.0.2  | whole repo                                                      |
| `satori`         | 0.10.14 | 0.29.1 | **gated on 1.3** — 19 minors stale in the worst-covered package |
| `@types/node`    | 22.20.1 | 26.2.0 | pinned by a root `pnpm.overrides` entry                         |
| `jsdom`          | 29.1.1  | 30.0.1 | pairs with 1.2                                                  |
| `lint-staged`    | 16.4.0  | 17.3.0 | tooling only                                                    |
| `@commitlint/*`  | 20.5.3  | 21.2.2 | tooling only                                                    |

D4 applies here in particular: if one upgrade turns into a large migration, abandon it
cleanly, flag it, and continue.

---

### Stage 5 — Prepare the surfaces the refactor lands on

#### 5.1 — Decompose `BuilderPage` _(gated on 1.4)_

512 lines in one function body, 12 `useState`, 45 hook calls, holding weapon selection,
attachments, orphan tracking, profile, TarkovTracker sync, compare state, save metadata and
three disclosure flags.

Split state into hooks or a reducer and extract the panels. Behaviour-preserving; no visual
change. `routes/data.tsx` is a comparable size and already decomposes into ten named
components — that is the target shape.

#### 5.2 — Route-level error boundaries

Zero exist. Any render throw white-screens the whole site — in an app whose data layer
consumes a third-party document that has already changed shape once (see ADR-0002). Add
TanStack Router `errorComponent`s so a failure degrades to a broken panel.

#### 5.3 — Split the bundle

Lazy-load routes, then fix the failed code-split already in the tree: the dynamic import of
`@tarkov/data` in `features/builder/compare/compare-workspace.tsx` is defeated by static
imports in `app.tsx` and four other modules.

---

## Parallel track — unblocked, any time

**Harden the share endpoint.** `POST /builds` accepts any JSON under 32 kB straight into KV
— no auth, no rate limit, no schema validation. Free-tier KV allows 1,000 writes/day, so a
trivial script breaks build sharing for everyone until midnight UTC. The `BuildV6` Zod
schema already exists; `apps/builds-api` declares no workspace dependencies and never calls
it. Add validation, rate-limit on `CF-Connecting-IP`, and add a `_headers` file with a CSP.

The OG meta injection in `apps/web/functions/_middleware.ts` was audited and **is correctly
escaped** — `escapeHtml` handles `&` first, then the other four entities. No action needed.

---

## Deliberately deferred

Not oversights. Doing these now would be wasted or premature effort.

| Item                            | Why not now                                                                                                                                                                                                                               | When                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Visual regression baselines     | Zero exist today. Baselining a design about to be replaced means re-baselining later.                                                                                                                                                     | After the redesign  |
| a11y work beyond the lint rules | Don't hand-audit components about to be rewritten. Fix the 24 lint hits; do the real pass per component as it is built.                                                                                                                   | During the redesign |
| The 16 MB data-path rework      | `items` is 15.9 MB raw / 1.86 MB gzip over 5,312 items, fetched client-side. Highest-leverage perf work available, but it is a data-layer project with its own spec and does not interrupt UI work. Stage 5.3 covers the part that would. | Own milestone       |
| ADR-0003 armour plates          | Largest known correctness gap (4–17× on shots-to-break). Tractable — 33 refs, 13 files, only 4 in `apps/web`, behind a fully-covered package. But it is a maths change, orthogonal to a UI refactor.                                      | Own milestone       |

---

## Conventions for this work

- One PR per numbered unit. Conventional Commits.
- `test:` / `ci:` / `chore:` / `refactor:` produce no version bump — expected for Stages 1–3.
- The seven `react-hooks` fixes in 2.1 are `fix:` — they are real behaviour bugs.
- Merge on green. Do not wait for review sign-off on units that pass CI.
- Never lower a coverage threshold to make CI pass. If a change drops coverage, add tests.

---

## Outcomes

Recorded after execution. Where reality differed from the plan, reality is written down.

### Shipped

| PR   | Unit                     | Result                                                               |
| ---- | ------------------------ | -------------------------------------------------------------------- |
| #149 | 1.1 coverage enforcement | Thresholds enforced in CI for the first time; ratchet proven to bite |
| #150 | 2.1 + 2.2 React lint     | 32 violations fixed; `allowDefaultProject` replaced                  |
| #151 | 1.3 data + og            | `tarkov-data` → 100%, `og` 69.92% → 99.1%                            |
| #152 | 1.2 ui render tests      | 5 measured statements → 88; 100 tests                                |
| #153 | 1.4 route coverage       | 22.11% → 71.69%                                                      |
| #154 | —                        | Optimizer timeout flake                                              |
| #155 | —                        | Dead `/builder/compare/$pairId` route                                |
| #156 | 5.1 BuilderPage          | 625 → 262 lines, 12 `useState` → 0                                   |
| #157 | 4 dependency majors      | 6 taken, 2 skipped                                                   |
| #158 | parallel track           | Validation, rate limiting, CSP                                       |
| #159 | 5.2 + 5.3                | Error boundaries; `/calc` −50%, `/builder` −44%                      |

### Deviations from the plan

- **Stage 2.2 was reclassified from tidy-up to blocker.** Three units hit the old ESLint
  config independently, and one was forced to consolidate 13 test files into one to stay
  under `maximumDefaultProjectFileMatchCount: 30`. Merge order was reordered to put Stage 2
  first. Lint config was dictating code structure.
- **Stage 3 ran last, not third.** Sweeping ~150 call sites before Stages 4 and 5 rewrote
  the surrounding files would have meant sweeping twice.
- **`web` was a third failing package**, not merely unmeasured: 35.96% statements against a
  declared 100% gate.

### Skipped, with reasons

- **`satori` 0.10 → 0.29** — WASM instantiation is refused by workerd. Independently
  reproduces the failure already recorded in `docs/operations/dependency-residue.md`.
  Needs its own PR that solves WASM loading under Workers.
- **`typescript` 6 → 7** — `typescript-eslint@8.67.0` is the latest published and caps at
  `<6.1.0`; on TS 7 it refuses to run. Upstream: `typescript-eslint/typescript-eslint#10940`.
- **`apps/builds-api` coverage measurement** — `@cloudflare/vitest-pool-workers@0.22.0`
  fails under instrumentation and workerd cannot use v8. Its 48 tests still run.

### Defects found that nobody was looking for

1. **`/builder/compare/$pairId` was unreachable** — parent never rendered `<Outlet />`.
   Saving or opening a shared comparison landed on a blank draft. Fixed in #155.
2. **A CI test that documented its own flakiness** — _"failed roughly half the time in CI
   while passing every local run."_ The cause was a missing effect dependency; the symptom
   had been worked around rather than diagnosed. Fixed in #150.
3. **A second flake, caused by this work** — coverage instrumentation doubled a fixture's
   runtime and pushed it past vitest's 30s limit. Fixed in #154 by removing the wall-clock
   dependency.
4. **`.test.ts` silently shadowed `.test.tsx`** — TypeScript keeps the higher-priority
   extension, so three render-test files were excluded from typechecking while passing
   under vitest.
5. **Two caches that could replay a stale pass** — the repo-guards task guard was pinned to
   a task CI no longer ran, and `eslint.config.js` was not hashed at all.
6. **`builds-api` tests stopped running in CI**, introduced by #149 — turbo skips a package
   that does not define the task, and CI had switched to `test:coverage`. Fixed in #158.
7. **Two zod majors in one worker bundle** — `builds-api` pinned zod 3 after the workspace
   moved to 4, breaking the test pool with an error naming neither. Fixed in #158.

### Still open

- `apps/web/e2e/smoke.spec.ts` has one `test.skip` covering compare save-then-redirect. #155
  fixed the redirect itself, but the toolbar's "Save changes" label still does not appear
  afterwards — a separate, narrower defect, not yet diagnosed.
- Route navigation has no `pendingComponent`, so there is a brief blank frame on first visit
  to a route. `defaultPreload: "intent"` would close it.
- The deferred list above stands unchanged: visual regression baselines, a11y beyond lint,
  the 16 MB data-path rework, and ADR-0003.
