# Dependabot pnpm Workspace Fix

**Status:** Accepted
**Date:** 2026-08-18
**Follows:** [`2026-08-18-repo-security-and-dependency-updates-design.md`](./2026-08-18-repo-security-and-dependency-updates-design.md)

## Context

Arc 2 of the security work shipped `.github/dependabot.yml` with the npm ecosystem scoped to three
directories:

```yaml
directories:
  - "/"
  - "/apps/*"
  - "/packages/*"
```

The reasoning recorded in the file's own comment was that "the workspace root is NOT assumed to
cover its members — GitHub's docs never promise that, and the composite-action entry below exists
because implicit coverage failed once already."

Dependabot's first run (2026-08-18, overnight) opened 12 PRs and proved that reasoning wrong for
the npm ecosystem. **All 6 npm _version_ update PRs fail CI.** Each one edits only `package.json`
and never `pnpm-lock.yaml`, so `pnpm install --frozen-lockfile` refuses:

```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml
is not up to date with <ROOT>/apps/web/package.json
* 1 dependencies are mismatched:
  - vite (lockfile: ^6.4.3, manifest: ^8.2.1)
```

The 7th npm PR — #128, a **security** update — passed, and it is the control case that confirms
the diagnosis rather than an exception to it. See "The control case" below.

Of the 5 `github-actions` PRs, 4 are green; that ecosystem touches only workflow YAML and has no
lockfile, so it is unaffected. The 5th (#118, `actions/cache` 4→6) failed on an unrelated flaky
unit test, not on the bump — see "Unrelated findings".

## Root cause

This is not a bug in this repo's CI; `main` itself is internally consistent. It is the documented
pnpm-workspace misconfiguration in Dependabot.

From dependabot-core [PR #11487](https://github.com/dependabot/dependabot-core/pull/11487)
("Handle Misconfigured Dependabot for PNPM Workspaces", merged 2025-02-05), written by the
Dependabot maintainers:

> In **PNPM workspaces**, all dependencies should be updated from the **root directory**, where
> `pnpm-workspace.yaml` and `pnpm-lock.yaml` exist.
>
> Customers sometimes **misconfigure Dependabot** by adding **both root and subdirectory
> updates**, which causes **no change errors** since the lockfile update is already handled at
> the root.

That is exactly this repo's configuration. A pnpm workspace keeps a single `pnpm-lock.yaml` at the
root; an update job launched inside `/apps/web` has no lockfile in scope to regenerate, so it
rewrites the manifest and stops.

The correct configuration is the root entry **alone**. Dependabot reads `pnpm-workspace.yaml`,
discovers `apps/*` and `packages/*` itself, and updates the member manifest _and_ the root lockfile
in one PR. This was confirmed on the upstream thread by a reporter who had hit the identical
failure ([dependabot-core #10758](https://github.com/dependabot/dependabot-core/issues/10758)):

> After further testing, it is working! Turns out for a pnpm monorepo, you only want to tell
> dependabot about the root, not the packages within.

The original comment in `dependabot.yml` conflated two different ecosystems. It is true for
`github-actions` — `directory: "/"` scans `.github/workflows/` and nothing else, so each composite
action genuinely needs its own entry. It is false for npm-on-pnpm, where the workspace file is the
discovery mechanism. **That distinction is the whole fix**, and the guard test has to encode it so
the globs cannot come back.

### The control case: why #128 passed

PR #128 is titled "bump esbuild from 0.25.12 to 0.27.3 in the security group **across 0
directory**", and it is the only npm PR that updated `pnpm-lock.yaml`. That is not luck. Security
updates are driven by the repo-wide advisory scanner rather than by a configured `directories:`
entry, so the job runs from the repository root — where `pnpm-lock.yaml` is — and regenerates it
correctly.

So the same Dependabot, on the same repo, on the same day: root-scoped job → lockfile updated;
member-scoped job → lockfile untouched. The variable is _where the job runs_, which is exactly what
this fix changes. #128 is the strongest single piece of evidence that root-only works.

### Evidence that root-only really does cover members

Dependabot's first run is itself the proof, read the other way round. PR #122 grouped
`@cloudflare/vitest-pool-workers` in `/apps/builds-api` with `satori` in `/packages/og` — so
member discovery is not in question, only lockfile regeneration is. The failure is exclusively
about _where the job runs_, not _what it can see_.

## Goal

Dependabot's npm PRs land green and mergeable, with `pnpm-lock.yaml` updated alongside every
manifest change, while keeping coverage of `apps/*` and `packages/*`.

### Success criteria

1. `.github/dependabot.yml`'s npm entry targets the workspace root only.
2. A guard in `packages/repo-guards` fails the build if an npm entry ever names a directory inside
   a pnpm workspace again — with the reasoning inline, not just a link.
3. The guard is derived from `pnpm-workspace.yaml`, not a hardcoded list, so adding a workspace
   glob cannot silently escape it.
4. The `github-actions` composite-action guard still passes unchanged — the two ecosystems keep
   their different rules.
5. All 5 `github-actions` PRs are merged (4 are green; #118 needs a re-run past the flaky
   test described under "Unrelated findings").
6. The 6 broken npm version-update PRs are closed, and Dependabot's re-run after the config change
   produces npm PRs that include `pnpm-lock.yaml` and pass CI.
7. The parent plan's two open post-merge checkboxes are resolved with what actually happened.

## Non-goals

- **Merging the npm major bumps** (vite 6→8, nanoid 5→6, `@cloudflare/workers-types` 4→5,
  `@testing-library/jest-dom` 6→7). Those are behaviour changes needing their own review pass;
  this arc only makes them _land correctly formed_. vite 6→8 in particular crosses two majors on
  the build tool the SPA depends on.
- **Changing the grouping strategy.** Grouping worked as configured. See the note below.
- **Retiring `directories:` for `github-actions`.** That entry is correct as written.

## Design

### 1. The config change

The npm entry becomes:

```yaml
- package-ecosystem: npm
  directory: "/"
```

Singular `directory`, since globbing is no longer needed. Everything else on the entry — schedule,
`open-pull-requests-limit`, `commit-message` prefixes, groups, the `@types/node` ignore — is
untouched and still correct.

### 2. The guard

`packages/repo-guards/src/dependabot.ts` gains `pnpmWorkspaceGlobs()`, reading
`pnpm-workspace.yaml`. The new test asserts that every npm `directory` / `directories` value is
exactly `/` — i.e. no entry names a path that a workspace glob would match. Deriving the globs
from `pnpm-workspace.yaml` rather than hardcoding `apps/*` means a future `tools/*` workspace is
covered on day one.

The existing "covers the workspace roots for npm" test asserted the _opposite_ invariant and is
replaced, not amended. Leaving it would just encode the bug.

### 3. Why the ungrouped major PRs are not a defect

The parent plan's post-merge checklist expected "**one** grouped PR, not ten". Ten more arrived.
This is the configuration behaving correctly, and the checklist's expectation was wrong:

- Both groups declare `update-types: [minor, patch]`, so **majors are ungrouped by design** — one
  PR each, which is what you want for a breaking change you have to review individually.
- Two grouped PRs did land: #122 (`minor-and-patch`, spanning 2 directories) and #128 (`security`).
- The remaining 10 are 5 npm majors and 5 Actions majors.

The checklist item is corrected rather than "fixed", and the reasoning is recorded in the runbook so
the next reviewer does not re-litigate it.

### 4. `open-pull-requests-limit` is now load-bearing

The `github-actions` entry has no explicit limit, so it takes the default of 5 — and exactly 5
Actions PRs opened. `actions/checkout@v4` is still on v4 and generating a Node 20 deprecation
warning in every run, but no PR exists for it: it is queued behind the limit. Merging the 5 open
ones releases the queue. This is expected behaviour, worth documenting so it does not read as
missing coverage later.

### 5. Order of operations

The config change must be on `main` before the npm PRs are recreated — Dependabot reads
`dependabot.yml` from the default branch. So: merge the fix, then close the stale npm PRs, then let
Dependabot's re-run (triggered by the config change itself) rebuild them from the root.

## Unrelated findings (recorded, not fixed here)

Two things surfaced while diagnosing this. Neither is caused by the Dependabot config and neither
is fixed in this arc.

1. **A flaky test in `apps/web`.** #118 (`actions/cache` 4→6) failed with
   `TestingLibraryElementError: Unable to find an accessible element with the role "button" and
name /ACCEPT SELECTED \(1\)/` in `src/features/builder/optimize/optimize-view.test.tsx`. The PR
   changes only `ci.yml`, and the same suite passes on other branches, so this is flake in the
   optimizer diff-view test, not a regression. It needs a re-run to merge and a proper fix
   afterwards.

2. **#128 bumps vite 6→7 under a security-patch title.** Its headline is an `esbuild` advisory, but
   the manifest change it actually makes is `"vite": "^6.4.3"` → `"^7.3.5"` in `apps/web` — a major
   bump of the SPA's build tool. `docs/operations/dependency-residue.md` records that `apps/web`
   runs the 6.x line deliberately. Merging #128 is therefore a bigger decision than its title
   suggests and belongs with the other major bumps, not with this arc.

## Risks

- **Root-only coverage regresses silently.** If Dependabot stops seeing members, the failure mode
  is _nothing happens_ rather than a red build. Mitigated by verifying the re-run actually produces
  member-scoped PRs before closing the arc out — criterion 6 is a verification step, not a hope.
- **Recreating vs. closing.** `@dependabot recreate` on a PR whose directory no longer exists in
  the config is undefined behaviour. Closing and letting the scheduled re-run rebuild is the
  predictable path.
