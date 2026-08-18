# Security Policy

## Reporting a vulnerability

Please report security issues through
[GitHub private vulnerability reporting](https://github.com/UnderMyBed/TarkovGunsmith/security/advisories/new).
That keeps the report private until a fix ships. Please do not open a public issue for a
security problem.

This is a hobby project with no bounty programme. Reports are handled on a best-effort basis —
expect an acknowledgement within about a week.

## Scope

**In scope**

- This repository's code.
- The `builds-api` Cloudflare Worker.
- The deployed site.

**Out of scope**

- [`json.tarkov.dev`](https://json.tarkov.dev/endpoints) — an upstream community API. Report
  issues to [the-hideout](https://github.com/the-hideout).
- Cloudflare's own infrastructure. Report to Cloudflare.
- Game-data accuracy. That is a data bug, not a security issue — open a normal issue.

## What this application handles

Calibration for anyone assessing impact: there are no user accounts, no authentication, and no
personal data. The KV-backed build store holds anonymous weapon-build JSON submitted by
visitors, keyed by a generated id. There is nothing to escalate to and no session to steal.

The realistic risk surface is supply-chain (a compromised dependency reaching the browser
bundle or a Worker), the share-URL deserialization path, and the GitHub Actions workflows.
