# AI Workflow — Tier B (Active)

This is the workflow tier this project operates at today. It is "AI-collaborative": Claude is a first-class partner in every change, but humans drive direction and approve every PR.

**Status note (active as of Milestone 0a, 2026-04-18):** the `.claude/` directory, project skills, subagents, settings, and post-edit hook are wired and live. Per-package `CLAUDE.md` files land with each package in 0b/0c/0d. The post-edit `tsc --noEmit` hook in `.claude/settings.json` is currently scoped to the root `tsconfig.json`; it will need an upgrade in 0b to dispatch per-package typechecks once `apps/*` and `packages/*` files exist. Tracked as a known follow-up.

## The loop

```
idea  →  brainstorm  →  spec  →  plan  →  execute (TDD)  →  review  →  PR  →  merge  →  deploy
        (skill)         (file)   (file)   (skill+tests)    (skill)
```

Every step has a tool or artifact. Skipping a step is the most common way to drift.

## Each step

### 1. Idea → brainstorm

Use the `superpowers:brainstorming` skill. It walks you through clarifying questions, proposes 2–3 approaches, and finalizes a design. Output is a spec file.

### 2. Brainstorm → spec

Spec lives in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`. The brainstorming skill writes this for you. Commit it before moving on.

### 3. Spec → plan

Use the `superpowers:writing-plans` skill. Reads the spec, produces a step-by-step implementation plan in `docs/plans/YYYY-MM-DD-<topic>-plan.md`. Each step is independently verifiable.

### 4. Plan → execute

Use `superpowers:executing-plans`. TDD enforced: write failing test → make it pass → refactor. The plan is the contract — don't deviate without updating the plan.

### 5. Execute → code review

Use `superpowers:requesting-code-review` once a logical chunk (or the whole branch) is done. The reviewer agent reads the spec + plan + diff, surfaces real issues, ignores nits.

### 6. Review → PR

`gh pr create`. PR description references the spec and plan files.

### 7. PR → merge → deploy

CI must be green. CF Pages auto-deploys on `main`. Workers deploy via `wrangler deploy` in the workflow.

## Tooling

### `.claude/settings.json`

- Permissions allowlist: `pnpm *`, `vitest *`, `wrangler *`, `gh *`, `graphql-codegen`, `git status/diff/log`
- Hooks:
  - Post-edit on `*.ts`/`*.tsx`: run `pnpm typecheck` for the affected package.
  - Post-commit on `packages/ballistics/**`: run that package's test suite.
- MCP servers: `context7` (lib docs), Cloudflare MCP (deploys, when available), GitHub MCP (issues/PRs).

### Project skills (`.claude/skills/`)

| Skill                  | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `add-data-query`       | Scaffold a new GraphQL query + TanStack Query hook + types |
| `add-calc-function`    | Scaffold a new ballistics function with TDD pre-baked      |
| `add-feature-route`    | Scaffold a new route + page + tests                        |
| `verify-data-shape`    | Zod-check tarkov-api responses for a given query           |
| `update-tarkov-schema` | Re-run codegen, reconcile breaking changes                 |

### Project subagents (`.claude/agents/`)

| Agent                 | Purpose                                                            | Tools                     |
| --------------------- | ------------------------------------------------------------------ | ------------------------- |
| `tarkov-api-explorer` | Read-only research; "what fields exist for X?"                     | Read, Grep, WebFetch      |
| `ballistics-verifier` | Given a calc change, runs ballistics tests + cross-checks fixtures | Read, Bash (vitest), Grep |

Global subagents (`feature-dev`, `code-reviewer`, `Explore`, `Plan`) are reused as-is for general tasks.

## CLAUDE.md hierarchy

Each `apps/*` and `packages/*` ships its own `CLAUDE.md`. Each is ≤200 lines and answers:

1. What is this package?
2. What conventions does it follow?
3. How do I add an X here? (where X = the most common change)
4. What are the gotchas?

Per-package CLAUDE.md trumps the root for its own scope.

## What "good" looks like

A change ships through this loop in **3 PRs at most**:

1. spec PR (brainstorming output, just docs)
2. plan PR (implementation plan, just docs)
3. implementation PR (code + tests, references spec & plan)

Trivial changes can collapse to 1 PR but the spec/plan should still exist as comments or commit-message context.

## When to escalate to Tier C

When any of these become true regularly:

- We have ≥10 open issues we can't process serially.
- The schema-drift PR is being created manually and it's annoying.
- We're touching `web` + `data-proxy` + `tarkov-data` for the same change frequently.
- We want a "deploy verifier" that smoke-tests the live URL after each deploy.

When ready, follow [`tier-c-upgrade.md`](tier-c-upgrade.md).
