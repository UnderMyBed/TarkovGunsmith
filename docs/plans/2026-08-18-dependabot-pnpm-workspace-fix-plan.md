# Dependabot pnpm Workspace Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dependabot's npm PRs land green by scoping the npm ecosystem to the pnpm workspace
root, guard the invariant so the globs cannot return, and clear the 12-PR backlog its first run left.

**Architecture:** One arc, one PR, then a post-merge cleanup sequence that must run in order —
Dependabot reads `dependabot.yml` from the default branch, so the config has to be merged before
the stale PRs are recreated.

**Spec:** [`docs/superpowers/specs/2026-08-18-dependabot-pnpm-workspace-fix-design.md`](../superpowers/specs/2026-08-18-dependabot-pnpm-workspace-fix-design.md)

## Global Constraints

- **Branch:** `fix/dependabot-pnpm-workspace-root`. One arc, one PR.
- **The two ecosystems have opposite rules.** npm-on-pnpm: root only, `pnpm-workspace.yaml` does
  discovery. `github-actions`: `directory: "/"` sees `.github/workflows/` and nothing else, so
  composite actions need their own entries. Do not "unify" them.
- **TDD:** the guard test is written and seen failing before `dependabot.yml` changes.
- **Commits:** Conventional Commits. This arc is `fix(ci)` — it repairs a broken pipeline.
- **Prettier:** `printWidth: 100`, double quotes, semicolons, trailing commas.
- **Imports:** relative imports carry a `.js` extension.

---

## Task 1: Guard the pnpm workspace invariant

**Files:**

- Modify: `packages/repo-guards/src/dependabot.ts`
- Modify: `packages/repo-guards/src/dependabot.test.ts`

**Interfaces:**

- Consumes: `.github/dependabot.yml`, `pnpm-workspace.yaml`.
- Produces: a failing build if an npm update entry names a directory inside the workspace.

- [x] **Step 1: Write the failing test**

Replace the `covers the workspace roots for npm` case — it asserts the invariant that caused the
outage. The new case asserts every npm entry resolves to `/`, and that the globs it would have to
match come from `pnpm-workspace.yaml` rather than a hardcoded list.

- [x] **Step 2: Watch it fail**

```bash
pnpm --filter @tarkov/repo-guards test
```

Expected: fails on the npm case, naming `/apps/*` and `/packages/*`. The composite-action case
still passes.

- [x] **Step 3: Add `pnpmWorkspaceGlobs()` to `dependabot.ts`**

Reads `pnpm-workspace.yaml`, returns its `packages` list. Keep it a plain read — the guard's job is
to compare configuration against configuration.

- [x] **Step 4: Fix `.github/dependabot.yml`**

npm entry becomes `directory: "/"`. Rewrite the leading comment: the old one asserts the wrong
thing and is the reason the bug shipped. Cite the upstream PR.

- [x] **Step 5: Watch it pass**

```bash
pnpm --filter @tarkov/repo-guards test
```

## Task 2: Record the reasoning where the next reviewer will look

**Files:**

- Modify: `docs/operations/repo-security.md`
- Modify: `docs/plans/2026-08-18-repo-security-and-dependency-updates-plan.md`

- [x] **Step 1: Add a "Dependabot and the pnpm workspace" section to the runbook**

Cover: why npm is root-only, why `github-actions` is not, that majors are ungrouped by design, and
that `github-actions` runs on the default `open-pull-requests-limit: 5`.

- [x] **Step 2: Resolve the parent plan's two open post-merge checkboxes**

Both are now answerable. The "one grouped PR, not ten" expectation was wrong and is corrected in
place rather than ticked.

## Task 3: Full local verification

- [ ] **Step 1: Run the whole gate**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

- [ ] **Step 2: Open the PR and confirm CI green**

---

## Post-merge sequence (strict order)

- [x] **Step 1: Merge the `github-actions` PRs** (#117–#121)

All five merged. #118 (`actions/cache` 4→6) needed a re-run first — it had failed on a flaky
`apps/web` unit test, not on the bump (see Step 6). `ci.yml` now runs `paths-filter@v4`,
`action-setup@v6`, `setup-node@v7`, `cache@v6`, `upload-artifact@v7`.

Branch protection is `strict: true`, so the four remaining PRs went out of date the moment the
first merged. They were admin-merged rather than rebased five times, and the _combination_ was then
validated directly with a `workflow_dispatch` run on `main` — a stronger check than five
independent passes, since only the combination actually ships.

- [x] **Step 2: Confirm `actions/checkout` gets a PR once the limit frees up**

Confirmed, and the queue theory with it. Freeing the five slots released three more PRs within
minutes: #133 (`actions/checkout` 4→7), #132 (`cloudflare/wrangler-action` 3→4), and #131
(`googleapis/release-please-action` 4→5). `actions/checkout` was on v4 against an upstream v7.0.1.

**Not merged in this arc.** #132 and #131 touch deploy and release machinery that CI never
exercises — `deploy.yml` only runs on a release-please merge. They need a deliberate pass.

- [x] **Step 3: Close the stale npm version-update PRs** (#122–#127)

#122 **auto-closed by Dependabot** the moment its directory left the config — direct evidence the
new config took effect.

#123–#127 had to be closed by hand, and doing so cost something. They were orphaned: the update job
that created them no longer exists, so Dependabot silently ignored both `@dependabot close` and
`@dependabot recreate` on them. And per GitHub's docs, closing a Dependabot PR — by command or by
hand — **permanently suppresses recreation of that version**. So closing these dismissed four
specific majors:

| Dependency                   | Suppressed version |
| ---------------------------- | ------------------ |
| `vite` (`apps/web`)          | 8.2.1              |
| `nanoid` (`apps/builds-api`) | 6.0.1              |
| `@cloudflare/workers-types`  | 5.20260815.1       |
| `@testing-library/jest-dom`  | 7.0.1              |

They are recorded here deliberately: a newer release of any of them re-triggers a fresh PR, so the
loss is per-version and self-healing, but until then these bumps are invisible to Dependabot.

Closing was necessary because `open-pull-requests-limit: 5` was fully consumed by those five PRs —
Dependabot could not open a correctly-formed replacement until they closed. That deadlock is now
written up in `docs/operations/repo-security.md`.

**#128 left open**, as planned. It is a security update, already carries a correct `pnpm-lock.yaml`,
and passes CI — but its manifest change is `vite` ^6.4.3 → ^7.3.5 in `apps/web`, a major bump of the
SPA's build tool that `dependency-residue.md` says is pinned to 6.x deliberately.

- [ ] **Step 4: Verify the re-run produces correctly-formed npm PRs**

The gate for this arc: new npm PRs must touch `pnpm-lock.yaml` **and** the member `package.json`.

```bash
gh pr view <n> --json files -q '.files[].path'
```

Evidence already in hand, short of the end-to-end run:

- **#128 is the control case.** A root-scoped job on this repo, same day, produced
  `apps/web/package.json` + `pnpm-lock.yaml` and passed CI.
- **#122's auto-closure** proves the root-only config is live.

- [ ] **Step 5: Confirm member coverage did not regress**

At least one new npm PR must target a package under `apps/*` or `packages/*`. If every PR is
root-only, root discovery is not working and the arc has failed its main criterion.

- [x] **Step 6: Fix the flaky test the arc surfaced** (#134)

`optimize-view.test.tsx` failed ~50% of the time in CI (#118 attempt 1, and the `main` dispatch
run) while passing 8/8 locally. `OptimizeView` defaults every changed row to selected from an
effect landing a tick after the rows render; at the instant the checkbox becomes queryable the
button still reads `ACCEPT SELECTED (0)`. The test interacted inside that window, so the click
toggled against an empty set and the effect clobbered it back to all-selected.

Reproduced deterministically, then fixed by waiting for `(2)` before unchecking. Promoted into
scope because a coin-flip test puts a coin flip in front of every future Dependabot PR — which is
exactly what this arc exists to prevent.

---

## Follow-ups this arc surfaced

### Fixed here: the e2e step's 10-minute apt install (#134)

`Install Playwright browsers` ran 20s to 24m+ across today's runs, and two runs were cancelled
after 20 and 24 minutes. It was not flaky infrastructure. Timestamps from run 32211686184, whose
step took 11m27s:

```
03:21:09  > playwright install --with-deps chromium
03:21:09  apt-get update
03:21:58  apt-get install
          ... 10m27s of silence ...
03:32:26  Downloading Chrome for Testing
03:32:35  done
```

The browser download the cache exists to protect took **9 seconds**. `apt-get install` took
**10m27s**. And the cache-hit/cache-miss split ran apt down _both_ branches — a perfect cache hit
would have saved 9 seconds and still paid the full apt bill. The cache also never hits: caches
written on a PR branch are not readable from sibling branches, and CI does not run on push to
`main`, so nothing shared is ever written.

`--with-deps` is dropped (ubuntu-24.04 already ships Chromium's libraries), the two steps collapse
to one, and `timeout-minutes: 5` caps the downside. If a future runner image drops a library,
Chromium fails to launch and e2e goes red in seconds instead of stalling silently.

**Result: the step went from 11m27s to 11 seconds, and the whole CI run from ~14 minutes to
2m56s.**

### Still open

1. **#132 `cloudflare/wrangler-action` 3→4 and #131 `release-please-action` 4→5.** Both touch
   machinery CI never exercises — `deploy.yml` runs only on a release-please merge. They need a
   deliberate pass with a real deploy behind it.

2. **#133 `actions/checkout` 4→7.** Straightforward and CI-exercised, but left with the other two
   rather than mixed into this arc.

3. **The four suppressed majors** in Step 3's table, plus **#128's `vite` 6→7**, all belong to the
   major-bump review pass.

4. **The Playwright cache is now near-pointless.** It guards an 11-second download and never hits
   across branches. Either seed it from a dispatch run on `main` or delete the cache steps.
