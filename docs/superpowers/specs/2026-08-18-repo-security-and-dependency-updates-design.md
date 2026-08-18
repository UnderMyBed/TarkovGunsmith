# Repo Security & Dependency Updates

**Status:** design approved (drafted 2026-08-18). Writing-plans is next.

**Context:** The repo went public in PR #105 (2026-04-22) and has had no dependency or security
work since v1.13.0 shipped on 2026-04-23 — roughly four months. Measured 2026-08-18, it has
**no security tooling of any kind**: Dependabot alerts return 404 (disabled), Dependabot security
updates disabled, secret scanning disabled, push protection disabled, no `dependabot.yml`, no
CodeQL, no `SECURITY.md`. A `pnpm audit` on the checked-in lockfile reports **50 advisories —
2 critical, 28 high, 15 moderate, 5 low**.

The reference implementation is `UnderMyBed/upguage`, which solves the same problem in four
layers: repo settings, a heavily-reasoned `dependabot.yml`, CodeQL, and a `workflow_run` watcher
that exists because _"an alert that shares a fate with the thing it watches is not an alert"_ and
_"filing an issue is not alerting a human."_ This spec ports all four, adapting each where this
repo differs.

## Goal

Bring TarkovGunsmith to upguage's security-and-updates posture, clear the existing 50-advisory
backlog first so the tooling starts from a clean baseline, and close the one live vulnerability
found while surveying the repo.

### Success criteria

1. `.github/workflows/release-please.yml` no longer interpolates `${{ }}` inside a `run:` block,
   and a test prevents the pattern returning anywhere in `.github/workflows/`.
2. `pnpm audit` advisory count is driven down from 50, with every survivor named and justified —
   either an accepted risk or a documented `dependabot.yml` `ignore` carrying a bounded version
   range and a literal command that proves it unblocked.
3. Dependabot files **one grouped PR** per week for minor+patch across all 10 workspace packages;
   majors and security updates arrive per the grouping rules in §4.
4. Dependabot alerts, Dependabot security updates, secret scanning, push protection, and private
   vulnerability reporting are all enabled, with the exact commands and expected output recorded
   in `docs/operations/repo-security.md`.
5. `SECURITY.md` exists, routes reports through GitHub private vulnerability reporting, and states
   scope honestly.
6. CodeQL runs on `pull_request` + weekly cron over `javascript-typescript` **and** `actions`.
7. A `workflow_run` watcher files a deduped, labelled, `@`-mentioned, assigned issue when CodeQL,
   Deploy, or Release Please fails — and cannot be defeated by a missing label.
8. `packages/repo-guards` holds tests that fail when any of the above coverage rules lapse.
9. Ships as four implementation PRs on four branches (§1), preceded by this spec and its
   plan as a `docs:` PR. No unrelated changes in any of them.

## Framing decisions (locked during brainstorming)

| Decision                  | Choice                                                                                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                     | All four upguage layers, not a subset.                                                                                                                                                                   |
| Slicing                   | Four arcs, one PR each (§1). Matches the repo's existing M3.5 arc convention and keeps a red CI run attributable to one cause.                                                                           |
| Backlog vs. tooling order | Catch-up **first**. Dependabot's first run should be a trickle, not a wall of PRs against a repo whose CI has not run in four months.                                                                    |
| Dependabot PR volume      | One grouped `minor-and-patch` PR per week across every package. Majors always arrive alone. Security updates grouped (they are ungrouped by default).                                                    |
| Workspace coverage        | Explicit `directories: ["/", "/apps/*", "/packages/*"]`. GitHub's docs never promise that a workspace root covers its members; `directories` (plural) globs, `directory` (singular) does not.            |
| Commit prefixes           | `fix(deps)` for production deps, `chore(deps-dev)` for dev deps. See §4.1 — this is load-bearing, not cosmetic.                                                                                          |
| Repo settings durability  | Enabled via `gh api`, recorded in a runbook. No automated drift check — that needs repo-admin scope, which `GITHUB_TOKEN` cannot grant, and a fine-grained PAT is out of scope for this pass.            |
| CodeQL triggers           | `pull_request` + weekly cron + `workflow_dispatch`. **No `push: main`**, per CLAUDE.md's budget rule.                                                                                                    |
| Watcher scope             | `CodeQL`, `Deploy`, `Release Please`. Broader than upguage's scheduled-only rule because this repo has two non-scheduled dark guards. CI is excluded — its failures are already visible in the PR.       |
| Missing-label handling    | Watcher self-heals via `gh label create --force`. This repo's `labels.yml` has no automated sync, so requiring a manual step to keep the alarm working reproduces the problem the alarm exists to solve. |
| Decision-logic language   | Plain ESM JavaScript (`.mjs`), zero deps, no build step — sidesteps the per-package `tsconfig.json` gotcha while staying testable from Vitest.                                                           |

## Non-goals

- No automated drift detection on GitHub repo settings (needs a PAT; deferred).
- No `pnpm audit` gate in `ci.yml`. Dependabot's weekly pass plus CodeQL is the agreed coverage;
  an audit gate that fails on an unfixable transitive advisory blocks unrelated PRs.
- No `pnpm update --latest`. Majors across 10 packages is a different change wearing the same hat.
- No branch-protection changes. CodeQL is deliberately **not** added as a required status check —
  a required check that is skipped on docs-only PRs blocks them forever.
- No application-level security work (KV authz, rate limiting on `builds-api`, CSP headers). This
  pass is supply-chain and repo hygiene. Application hardening is its own spec.
- No secret rotation. Enabling secret scanning may surface history findings; acting on them is
  follow-up work, not a precondition.
- No changes to `ci.yml`'s existing job structure.

## Design

### 1. Arc sequencing

| Arc | Branch                                    | Commit type | Contents                                                                                            |
| --- | ----------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| 0   | `fix/release-please-expression-injection` | `fix(ci)`   | The injection fix. One file.                                                                        |
| 1   | `fix/dependency-catch-up`                 | `fix(deps)` | Lockfile refresh, fallout fixes, residue documented.                                                |
| 2   | `ci/dependabot-and-repo-security`         | `ci`        | `dependabot.yml`, repo settings, `SECURITY.md`, runbook, `packages/repo-guards` + first two guards. |
| 3   | `ci/codeql-and-failure-alerting`          | `ci`        | CodeQL, the watcher, its script, labels, remaining guards.                                          |

Arc 3 keeps the first cron workflow and its watcher in the **same** PR. Splitting them recreates
upguage's "red at nobody" gap for however long the split lasts.

This spec and its implementation plan land as their own `docs:` PR ahead of Arc 0, following the
precedent of PRs #88, #94, and #98.

### 2. Arc 0 — release-please expression injection

`.github/workflows/release-please.yml:32` currently reads:

```yaml
PR_BRANCH=$(echo '${{ steps.release.outputs.pr }}' | jq -r '.headBranchName')
```

Actions substitutes `${{ }}` into the `run:` scalar **before bash parses it**, so that JSON blob
is source code, not data. Its `title` and `body` fields derive from Conventional Commit messages;
a `'` in a commit message closes the quote and everything after it executes. The job holds
`contents: write`, `pull-requests: write`, `actions: write`, and a `GH_TOKEN`.

Exploitation requires a crafted commit message reaching `main`, which the maintainer controls at
squash time — so this is a latent hole rather than an open door. It is still the exact pattern
CodeQL's `actions` pack and upguage's workflow comments both exist to prevent, and the fix is
mechanical.

Replacement:

```yaml
- name: Trigger CI on release PR
  if: steps.release.outputs.pr
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    RELEASE_PR: ${{ steps.release.outputs.pr }}
    REPO: ${{ github.repository }}
  run: |
    set -euo pipefail
    PR_BRANCH=$(printf '%s' "$RELEASE_PR" | jq -r '.headBranchName')
    [ -n "$PR_BRANCH" ] && [ "$PR_BRANCH" != "null" ] || {
      echo "::error::could not read headBranchName from the release-please output"
      exit 1
    }
    gh workflow run ci.yml --repo "$REPO" --ref "$PR_BRANCH" --field ref="$PR_BRANCH"
```

Three changes, not one: the expression moves to `env:` so it arrives as data; `set -euo pipefail`
is added (absent today, so a failed `jq` currently sails on and fires `gh workflow run --ref ""`);
and an empty or `null` branch now fails loudly.

Verification is `actionlint` locally (already in the maintainer's mise toolchain) plus the
guard test added in Arc 2, which retroactively locks the fix in.

### 3. Arc 1 — dependency catch-up

Baseline measured 2026-08-18 on the v1.13.0 lockfile: **50 advisories (2 critical, 28 high,
15 moderate, 5 low)**. The two criticals:

- **`shell-quote`** — build-only, via `@graphql-codegen/cli` in `packages/tarkov-types`. Never ships.
- **`seroval`** — via `@tanstack/react-router` → `@tanstack/router-core`, so it **is bundled into
  the SPA**. A `fromJSON()` type confusion that invokes attacker-controlled methods during
  deserialization. Given this app deserializes builds from share URLs and a KV-backed API, its
  reachability gets an explicit check during Arc 1 rather than an assumption either way.
  Patched at `>=1.5.3`; the lockfile pins `1.5.2`.

Most of the remaining 48 are transitive dev tooling: `vite`, `esbuild`, `turbo`, `@babel/core`,
`postcss`, `js-yaml`, `brace-expansion`, `fast-uri`, `nanoid`, and `undici` via
`wrangler`/`miniflare`.

Sequence:

1. `pnpm update -r` — respects existing semver ranges, which is enough for most transitives.
2. `pnpm dedupe`.
3. Full gate: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`,
   then `pnpm --filter @tarkov/web test:e2e`.
4. Re-audit. Every survivor gets an explicit decision: bump the manifest range, accept with a
   stated reason, or record a `dependabot.yml` `ignore` per §4.2. **No silent residue.**
5. The PR body records before/after counts and names every survivor with its reason.

Known friction: the two `vite` advisories want `>=6.4.3` and `>=8.0.16`, which spans a major.
`pnpm update -r` will not lift a manifest range, so this becomes an Arc 1 decision rather than a
surprise. If a major is required it lands as its own commit inside this PR so it stays bisectable.

### 4. Arc 2 — Dependabot, repo settings, SECURITY.md

#### 4.1 Commit prefixes are load-bearing

Deploys fire **only on release-please PR merges** (CLAUDE.md, "Deploys"). Release-please hides
`chore` and bumps nothing for it. So a security patch to a production dependency committed as
`chore(deps)` lands on `main` and never reaches Cloudflare — it sits there looking fixed.
Dependabot's default prefix is exactly that.

```yaml
commit-message:
  prefix: "fix(deps)" # production deps -> patch bump -> release PR -> deploy
  prefix-development: "chore(deps-dev)" # devDependencies -> no release; nothing ships anyway
```

`fix(deps)` only opens or updates the release PR. Nothing deploys until the maintainer merges it,
so the promotion gate is preserved — it can now simply _see_ security fixes.

`commitlint` runs only in husky's `commit-msg` hook, not in CI, so Dependabot's commits are not
rejected regardless. The prefix choice is about release-please, not about linting.

#### 4.2 `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directories: ["/", "/apps/*", "/packages/*"]
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
    commit-message:
      prefix: "fix(deps)"
      prefix-development: "chore(deps-dev)"
    groups:
      minor-and-patch:
        update-types: [minor, patch]
      security:
        applies-to: security-updates
        patterns: ["*"]
    ignore: []

  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: weekly }
    commit-message: { prefix: "ci(deps)" }
    groups:
      actions:
        update-types: [minor, patch]
```

Notes carried into the file as comments:

- `directories` (plural) globs; `directory` (singular) does not. Root alone is not assumed to
  cover workspace members.
- Security updates are **ungrouped by default** — one PR per advisory. Against today's backlog
  that is roughly twenty PRs in a morning. The `security` group collapses them.
- Majors sit outside every group deliberately: one major, one PR, everywhere. The repo's actions
  are pinned at `v4` while `v7` is current, so that catch-up arrives as its own reviewable PR.
- `directory: "/"` for github-actions scans `.github/workflows/` and **nothing else**. Composite
  actions under `.github/actions/*/action.yml` need their own entry, one per directory. None exist
  today; §6 makes that a test rather than a comment.

Each `ignore` added from Arc 1's residue must name the blocker, bound the version range so the
next major still arrives, and give the literal command that proves it unblocked.

#### 4.3 Repo settings + runbook

Recorded in `docs/operations/repo-security.md` with expected output and a re-verify one-liner:

```bash
gh api -X PUT  repos/UnderMyBed/TarkovGunsmith/vulnerability-alerts         # -> 204
gh api -X PUT  repos/UnderMyBed/TarkovGunsmith/automated-security-fixes     # -> 204
gh api -X PUT  repos/UnderMyBed/TarkovGunsmith/private-vulnerability-reporting
gh api -X PATCH repos/UnderMyBed/TarkovGunsmith \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

Enabling secret scanning triggers a **full history scan**, which retroactively answers whether
anything leaked before #105 made the repo public. Findings are triaged as follow-up work.

The runbook also carries one manual check with no API equivalent: confirm the maintainer is
actually watching this repository, since upguage's measured failure was an alert that fired
perfectly and notified nobody.

#### 4.4 `SECURITY.md`

- Reports go through GitHub private vulnerability reporting. No email address published.
- In scope: this repo, `data-proxy`, `builds-api`, and the deployed site.
- Out of scope: `api.tarkov.dev` (report upstream to the-hideout), Cloudflare infrastructure,
  and game-data accuracy.
- Stated plainly: no accounts, no auth, no PII; the KV store holds anonymous build JSON.
- No bounty. Best-effort response, described as a hobby project.

### 5. Arc 3 — CodeQL and the failure watcher

#### 5.1 `codeql.yml`

```yaml
on:
  pull_request:
    paths-ignore: ["docs/**", "**.md", "LICENSE", ".gitignore"]
  schedule:
    - cron: "23 5 * * 1"
  workflow_dispatch:

permissions:
  contents: read
  security-events: write

strategy:
  fail-fast: false
  matrix:
    language: [javascript-typescript, actions]
```

Deviations from upguage, each deliberate:

- **No `push: main`.** CLAUDE.md's budget rule: branch protection already requires up-to-date and
  green PRs, so push-to-main CI duplicates the check that just passed.
- **`actions` in the matrix.** CodeQL's `actions` pack finds expression injection — the Arc 0 bug.
  It is the regression net, with §6's grep test as the cheap fast-fail underneath it.
- **`paths-ignore`, and not a required check.** Mirrors `ci.yml`'s docs-only skip. Adding it to
  branch protection while it skips docs PRs would block them permanently.

The `actions` CodeQL language is confirmed available during implementation before the workflow is
relied upon; if it is unavailable, the matrix drops to `javascript-typescript` and §6's test
carries workflow coverage alone.

#### 5.2 `scheduled-failure.yml`

Watch list: `["CodeQL", "Deploy", "Release Please"]`.

`workflow_run` watches any workflow, not only scheduled ones, and this repo has two non-scheduled
dark guards. If **Deploy** fails after a release PR merge, the site silently does not ship. If
**Release Please** fails, releases silently stop. Both are the failure class the watcher exists
for. **CI is excluded** — its failures are already visible in the PR that caused them, and
watching it would file an issue for every ordinary red PR.

The enforced rule remains upguage's: every workflow with `on.schedule` must appear in the watch
list, verified by test. Entries beyond that are permitted.

Ported from upguage without change:

- Separate workflow, never a notify step inside the watched workflow.
- `if:` as an allow-list of `failure` and `timed_out` — never `!= 'success'`, which would page on
  deliberate cancellation.
- `concurrency` keyed per watched workflow, never cancelled, because the dedupe is a
  read-then-write.
- A retry loop around every `gh` call (upguage measured five 503s inside one hour on 2026-08-17),
  and a failed listing must never be passed on as an empty one.
- `@`-mention in the body **and** assignment, with assignment as a separate step after creation so
  a permissions hiccup cannot lose the alert.
- Every `workflow_run` field reaches the script through `env:`, never spliced into `run:`.

#### 5.3 The missing-label trap

`gh issue create` fails outright on an unknown label, turning the alert into a failed run whose
only symptom is a red tick nobody watches. upguage requires the label to pre-exist. This repo
cannot safely make that assumption: `.github/labels.yml` is source-of-truth but has **no automated
sync** — its own header says labels are applied by hand via `gh label create`.

The watcher therefore self-heals before filing:

```bash
gh label create scheduled-red --color a02c2c \
  --description "An automated workflow failed and filed this alert." --force || true
gh label create critical --color d93f0b \
  --description "Requires immediate attention." --force || true
```

`issues: write` already covers label creation. Both labels are still declared in `labels.yml` as
source of truth, and §6 asserts that every label referenced by a workflow is declared there — but
the alarm no longer depends on anyone having run a manual command.

#### 5.4 Decision logic

`.github/scripts/scheduled-failure.mjs` — plain ESM, zero dependencies, no build step, which
sidesteps the per-package `tsconfig.json` gotcha while remaining importable by Vitest. The YAML
stays thin; the dedupe, the conclusion filter, and the issue body are unit-tested.

ESLint's `projectService` covers `.ts`/`.tsx` only, so a `.mjs` file needs no package-local
tsconfig — but the root ESLint config is checked during implementation to confirm
`.github/scripts/**` is either linted or explicitly ignored, not silently unmatched.

### 6. `packages/repo-guards`

A private, unpublished workspace package (`"private": true`) with its own `tsconfig.json`
extending `tsconfig.base.json`, per the CLAUDE.md gotcha. Vitest only; no build output.

Guards, with the arc that introduces each:

| #   | Guard                                                                                | Arc |
| --- | ------------------------------------------------------------------------------------ | --- |
| 1   | No `${{ }}` interpolation inside any `run:` block in `.github/workflows/`            | 2   |
| 2   | Every `.github/actions/*/action.yml` directory has a matching `dependabot.yml` entry | 2   |
| 3   | Every workflow with `on.schedule` appears in the watcher's `workflows:` list         | 3   |
| 4   | The watcher's YAML `if:` prefilter and the script's conclusion set agree             | 3   |
| 5   | Every label referenced by a workflow is declared in `.github/labels.yml`             | 3   |
| 6   | Dedupe: an open `scheduled-red` issue suppresses a second file                       | 3   |

Guards 1–5 are static analysis over repo files and need no network. Guard 6 unit-tests the script
against fixture inputs.

### 7. Verification

| Arc | Pre-merge                                                            | Post-merge                                                                                                                                                               |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | `actionlint .github/workflows/release-please.yml`; existing CI       | Next release PR triggers CI on its branch as before                                                                                                                      |
| 1   | Full gate incl. `test:e2e`; re-run `pnpm audit` and record the delta | —                                                                                                                                                                        |
| 2   | `pnpm test` (guards 1–2); `dependabot.yml` parses                    | Run the four `gh api` calls; confirm the first Dependabot run opens **one** grouped PR, not ten; confirm it covers `apps/*` and `packages/*` via the Dependabot job logs |
| 3   | `pnpm test` (guards 3–6); `actionlint` on both new workflows         | Dispatch the watcher's `simulate` input and confirm an issue is filed, labelled, mentioned, assigned — **and that it reaches a human**                                   |

`workflow_run` always executes the default-branch copy of a workflow, so Arc 3's end-to-end proof
is only possible after merge. That is a post-merge step in the plan, not a pre-merge one, and the
`simulate` dispatch input exists so it does not require waiting for a genuine failure.

### 8. Follow-up items (explicitly deferred)

- Automated drift detection on repo security settings, once a fine-grained PAT exists (the same
  one CLAUDE.md already wants for release-please).
- Triage of whatever the secret-scanning history scan surfaces.
- `pnpm audit` or OSV scanning as a CI gate, if Dependabot's weekly cadence proves too slow.
- OpenSSF Scorecard.
- Application-level hardening for `builds-api` (authz, rate limiting, payload caps) and CSP
  headers on the Pages deployment — its own spec.
- Adding CodeQL to branch protection as a required check, once the docs-only skip interaction is
  settled.
- Refreshing `CLAUDE.md`'s stale roadmap block, which still claims "4 of 5 M3 differentiators
  remaining" when all five shipped. Unrelated to security; noted so it is not lost.
