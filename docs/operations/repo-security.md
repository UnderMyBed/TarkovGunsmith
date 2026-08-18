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
