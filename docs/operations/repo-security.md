# Repository security settings runbook

These are GitHub _settings_, not files. Nothing in this repository enforces them and nothing
notices if they are switched off — so this runbook is the record, and re-running the verify
block below is how you check.

Automated drift detection is deliberately not implemented: reading `security_and_analysis`
needs repo-admin scope, which `GITHUB_TOKEN` cannot grant. It needs a fine-grained PAT and is
tracked as follow-up work.

## Enable (one-time)

```bash
REPO=UnderMyBed/TarkovGunsmith

gh api -X PUT "repos/$REPO/vulnerability-alerts"                # -> 204 No Content
gh api -X PUT "repos/$REPO/automated-security-fixes"            # -> 204 No Content
gh api -X PUT "repos/$REPO/private-vulnerability-reporting"     # -> 204 No Content

gh api -X PATCH "repos/$REPO" \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

Enabling secret scanning triggers a **full history scan**. This repository was private until
PR #105, so the first scan is also the answer to "did anything leak before we went public".
Check the results at `https://github.com/$REPO/security/secret-scanning`.

## Verify

```bash
gh api "repos/UnderMyBed/TarkovGunsmith" \
  --jq '.security_and_analysis | {secret_scanning, secret_scanning_push_protection, dependabot_security_updates}'
```

Expected:

```json
{
  "secret_scanning": { "status": "enabled" },
  "secret_scanning_push_protection": { "status": "enabled" },
  "dependabot_security_updates": { "status": "enabled" }
}
```

And:

```bash
gh api "repos/UnderMyBed/TarkovGunsmith/vulnerability-alerts" -i | head -1
```

Expected: `HTTP/2.0 204`. A `404` means Dependabot alerts are **disabled**.

## Notification check (no API equivalent)

An alert that reaches nobody is not an alert. Confirm, in the GitHub UI:

- You are **watching** this repository (Watch → All Activity, or at minimum Custom → Issues).
- Security alert emails are enabled under your account notification settings.

This matters because the failure watcher in `.github/workflows/scheduled-failure.yml` files
issues authored by `github-actions[bot]`. It `@`-mentions and assigns you precisely because a
bot-authored issue in an unwatched repository notifies no one.

## Dependabot and the pnpm workspace

Dependabot's first run (2026-08-18) opened 12 PRs and all 7 npm ones failed CI. The cause and the
resulting rules are recorded here because the configuration looks wrong until you know why.

### npm is scoped to the root; `github-actions` is not

These two entries in `.github/dependabot.yml` follow opposite rules on purpose.

| Ecosystem        | Scope                                   | Why                                                                                                                     |
| ---------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm`            | `directory: "/"` — root only            | A pnpm workspace has one `pnpm-lock.yaml`, at the root. Dependabot discovers members via `pnpm-workspace.yaml`.         |
| `github-actions` | `directory: "/"` + one entry per action | No lockfile, no workspace file. `directory: /` sees `.github/workflows/` and nothing else; composite actions need more. |

Adding `/apps/*` or `/packages/*` back to the npm entry launches the update job _inside_ a member
directory, where no lockfile is in scope. Dependabot rewrites `package.json`, leaves
`pnpm-lock.yaml` untouched, and CI dies on `ERR_PNPM_OUTDATED_LOCKFILE`. This is the
misconfiguration described by dependabot-core's maintainers in
[PR #11487](https://github.com/dependabot/dependabot-core/pull/11487).

`packages/repo-guards/src/dependabot.test.ts` enforces both rules, deriving the member globs from
`pnpm-workspace.yaml` so a new workspace is covered the day it is added.

### Major bumps arrive ungrouped — by design

Both groups declare `update-types: [minor, patch]`. Majors are deliberately excluded, so each
arrives as its own PR. That is the desired behaviour: a breaking change should be reviewed and
merged on its own, not swept into a batch. A first run that opens ten PRs is not a grouping
failure — check the update types before treating it as one.

### `github-actions` runs on the default PR limit of 5

That entry sets no `open-pull-requests-limit`, so it takes GitHub's default of 5. When five Actions
PRs are open, further ones are queued rather than dropped — `actions/checkout` sat behind the queue
on the first run. If an action looks unwatched, count the open PRs before assuming missing coverage.
