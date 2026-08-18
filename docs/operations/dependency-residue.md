# Dependency advisory residue

Every `pnpm audit` advisory that survives the Arc 1 catch-up, with the reason it survives and
the command that proves it resolvable. Reviewed whenever Dependabot's weekly PR lands.

**Last reviewed:** 2026-08-18 — **20 advisories** outstanding (0 critical, 8 high, 9 moderate,
3 low), down from a **48-advisory** baseline (2 critical).

Both criticals are cleared. The one that reached browsers — `seroval`, via
`@tanstack/react-router` → `@tanstack/router-core`, a `fromJSON()` type confusion in a codebase
that deserializes builds from share URLs — resolved from 1.5.2 to **1.6.2**.

## The shape of what is left

Every remaining advisory is a **duplicate old copy** of a package whose patched version is
_already installed elsewhere in the tree_. Nothing here is "no fix exists"; it is "a transitive
dependency pins an old copy alongside the new one".

| Package   | Vulnerable copy | Patched copy present | Advisory wants      |
| --------- | --------------- | -------------------- | ------------------- |
| `undici`  | 7.24.8          | 7.29.0               | >=7.28.0 / >=7.29.0 |
| `ws`      | 8.18.0          | 8.21.0, 8.21.3       | >=8.20.1 / >=8.21.0 |
| `lodash`  | 4.17.23         | 4.18.1               | >=4.18.0            |
| `sharp`   | 0.34.5          | 0.35.2               | >=0.35.0            |
| `esbuild` | 0.25.12         | 0.28.1, 0.28.2       | >=0.28.1            |
| `vite`    | 8.0.8           | —                    | >=8.0.16            |

`vite` is the one genuine exception: `apps/web` deliberately runs the 6.x line (`"vite": "^6.4.3"`,
which already satisfies that advisory's `>=6.4.3`), while the 8.0.8 copy arrives under Vitest. No
8.0.16 exists to upgrade into at time of writing.

**Unblock test for every row above:** `pnpm why <package>` — if only one version is listed, the
advisory is gone.

## Why they are not fixed in Arc 1

The remedy is a `pnpm.overrides` entry per package, collapsing each to its single patched version.
That is the same technique Arc 1 used for `@types/node`, and it works — but each override changes
resolution for the whole tree, and an override is exactly how this arc broke `wrangler dev`:
pinning `miniflare` to `^4` fixed nothing and produced
`miniflare.convertV4MiniflareOptions is not a function`, because wrangler 4.124 requires
miniflare 5. It was reverted.

So overrides are only added with a **green e2e run** proving them safe. On 2026-08-18 the e2e
suite could not be run at all, because `https://api.tarkov.dev/graphql` returned
`{"errors":["GraphQL server unavailable. Try again later."]}` to every POST.

**That blocker is now cleared.** The JSON API migration retired GraphQL entirely and the suite
runs green (28 passed, 2 skipped). The gate these overrides were waiting on exists again.

**Next step:** add overrides one package at a time, re-running `pnpm --filter @tarkov/web test:e2e`
between each. Record here whichever ones stick.

## Overrides currently in force

| Override      | Version    | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@types/node` | `^22.19.1` | **Load-bearing.** Two `@types/node` versions in the tree give pnpm two resolution identities for `vite`/`vitest`, which produces two `vitest` instances. `@cloudflare/vitest-pool-workers` then bridges to the wrong one and every Worker test fails at `describe` with `TypeError: Cannot read properties of undefined (reading 'config')` before a single test runs. Pinning one version fixes it **and** lets `@types/node` track `mise.toml`'s node 22 pin, which is what the spec wanted. Do not remove without running the `@tarkov/builds-api` suite. |
