---
name: verify-data-shape
description: Use when a tarkov-api response is suspected to differ from the Zod schema in packages/tarkov-types. Fetches the live response, runs it through the Zod schema, and reports any drift — extra fields (warnings), missing fields (errors), type mismatches (errors).
---

# verify-data-shape

## When to use

- A query is returning unexpected data in dev.
- The schema-watcher cron (Tier C) opened a "schema may have drifted" issue.
- Before relying on a new field that isn't yet in a fixture.

## What it does

1. Asks: "Which query? (or paste the GraphQL operation)"
2. Calls the dev `data-proxy` (or `api.tarkov.dev` directly if no proxy is running) and gets the raw JSON response.
3. Imports the Zod schema for that query from `@tarkov/types`.
4. Runs `Schema.safeParse(response)`.
5. Reports:
   - If success: "Shape matches. <N> bytes."
   - If failure: prints the Zod error tree, plus a diff between the response keys and the schema keys.
6. If drift detected, suggests next action: regenerate types (`update-tarkov-schema`) or open an issue if the drift looks intentional from upstream.

## Out of scope

- Modifying schemas. The skill is read-only verification; any fix goes through `update-tarkov-schema` or a regular code change.
