---
name: update-tarkov-schema
description: Use when api.tarkov.dev's GraphQL schema has changed and packages/tarkov-types needs to be regenerated. Re-runs codegen, surfaces breaking diffs, and walks through reconciling each broken query.
---

# update-tarkov-schema

## When to use

- The nightly schema-watcher (Tier C) opened a regen PR.
- A query started failing with "Cannot query field X on type Y".
- You want to adopt a newly-added upstream field.

## What it does

1. Runs `pnpm --filter @tarkov/types codegen`.
2. Diffs the generated types vs. the previous version (`git diff packages/tarkov-types/generated`).
3. For each `.graphql` file in `packages/tarkov-data/src/queries/`, runs the GraphQL validator against the new schema.
4. Reports:
   - Newly available fields (informational)
   - Removed fields used by our queries (errors — must fix)
   - Type changes affecting our queries (errors — must fix)
5. For each error, asks: "Drop this field, replace with <suggestion>, or rename to <suggestion>?"
6. Updates the affected `.graphql` files and re-runs codegen.
7. Updates fixtures by re-recording (calling `record-fixture` per query — separate skill, future).
8. Commits as `chore(types): regen tarkov-api schema` + `fix(data): adapt to schema changes`.

## Hard rules

- Never silently accept removed fields by deleting the affected hook. Surface them and decide together.
- Always update fixtures after type changes — stale fixtures hide regressions.
