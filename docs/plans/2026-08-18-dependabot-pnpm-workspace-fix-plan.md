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

- [ ] **Step 1: Merge the 5 green `github-actions` PRs** (#117–#121)

Each merge makes the others out-of-date; rebase via `@dependabot rebase` as needed.

- [ ] **Step 2: Confirm `actions/checkout` gets a PR once the limit frees up**

It is queued behind `open-pull-requests-limit: 5` and is the last Node 20 deprecation warning.

- [ ] **Step 3: Close the 7 stale npm PRs** (#122–#128)

`@dependabot close` on each, so Dependabot records them as handled rather than re-opening.

- [ ] **Step 4: Verify the re-run produces correctly-formed npm PRs**

The gate for this whole arc: the new PRs must touch `pnpm-lock.yaml` **and** the member
`package.json`, and CI must be green. Verify with:

```bash
gh pr view <n> --json files -q '.files[].path'
```

- [ ] **Step 5: Confirm member coverage did not regress**

At least one new PR must target a package under `apps/*` or `packages/*`. If every PR is
root-only, root discovery is not working and the arc has failed its main criterion.
