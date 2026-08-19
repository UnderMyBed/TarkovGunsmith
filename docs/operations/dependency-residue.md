# Dependency advisory residue

Every `pnpm audit` advisory that survives, with the reason it survives and the command that
proves it resolvable. Reviewed whenever Dependabot's weekly PR lands.

**Last reviewed:** 2026-08-19 — **0 advisories.** `pnpm audit` reports
`No known vulnerabilities found`, down from a **48-advisory** baseline (2 critical) and from the
20 that survived the Arc 1 catch-up.

## There is no residue left

The 20 remaining advisories were all the same shape: a **duplicate old copy** of a package whose
patched version was already installed elsewhere in the tree, held there by a transitive dependency
pinning the older one. The plan was to collapse each with a `pnpm.overrides` entry, one at a time,
gated on a green e2e run.

None of that was needed. Taking the major bumps Dependabot had been offering moved the transitive
pins forward on their own, and every duplicate collapsed:

| Package   | Was                    | Now               | Advisory wanted     |
| --------- | ---------------------- | ----------------- | ------------------- |
| `undici`  | 7.24.8 + 7.29.0        | 7.29.0            | >=7.28.0 / >=7.29.0 |
| `ws`      | 8.18.0 + 8.21.0/8.21.3 | 8.21.0            | >=8.20.1 / >=8.21.0 |
| `lodash`  | 4.17.23 + 4.18.1       | _not in the tree_ | >=4.18.0            |
| `sharp`   | 0.34.5 + 0.35.2        | 0.35.2            | >=0.35.0            |
| `esbuild` | 0.25.12 + 0.28.x       | 0.28.1, 0.28.2    | >=0.28.1            |
| `vite`    | 6.4.3 + 8.0.8          | 8.2.1             | >=8.0.16            |

The bumps that did it: `vite` 6→8 (via 7), `@vitejs/plugin-react` 4→6,
`@cloudflare/vitest-pool-workers` 0.14→0.22, `@cloudflare/workers-types` 4→5, `nanoid` 5→6, and
`@testing-library/jest-dom` 6→7.

`satori` was tried at 0.29.0 and **reverted to 0.10.14**. It breaks the OG card routes at runtime:
0.29 instantiates WebAssembly asynchronously, and the Workers runtime refuses with
`CompileError: WebAssembly.instantiate(): Wasm code generation disallowed by embedder`, so
`/og/build/:id` and `/og/pair/:id` both return 500. Typecheck passes — the API surface is
compatible — so only the e2e suite catches it. Reverting costs nothing on the advisory front:
`pnpm audit` is clean either way. Upgrading satori means solving WASM loading under Workers and
belongs in its own PR.

**The lesson worth keeping:** the residue was never "no fix exists". It was a deferred major-bump
backlog wearing an advisory costume. Overrides would have papered over it; upgrading dissolved it.
Reach for `pnpm.overrides` only when a genuine upstream fix is missing — not when the real answer
is a major you have been putting off.

**Unblock test for any future row:** `pnpm why <package>` — if only one version is listed, the
advisory is gone.

## A note on `vite` and the 6.x line

Earlier revisions of this file recorded that `apps/web` ran the 6.x line deliberately. That is no
longer true, and it was never a hard constraint — it was where the pin happened to sit. `apps/web`
now runs `vite` ^8.2.1.

Vite 8 routes CSS minification through lightningcss by default, whose target parser rejects the
ES-year value in `build.target` with `Unsupported target "ES2022"` and fails the build. The fix in
`apps/web/vite.config.ts` is `cssMinify: "esbuild"`, which keeps the emitted CSS identical to
vite 7. Moving to lightningcss is a deliberate decision about browser support, and should be made
on its own, not inherited from a bump.

## Overrides currently in force

| Override      | Version    | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@types/node` | `^22.19.1` | **Load-bearing.** Two `@types/node` versions in the tree give pnpm two resolution identities for `vite`/`vitest`, which produces two `vitest` instances. `@cloudflare/vitest-pool-workers` then bridges to the wrong one and every Worker test fails at `describe` with `TypeError: Cannot read properties of undefined (reading 'config')` before a single test runs. Pinning one version fixes it **and** lets `@types/node` track `mise.toml`'s node 22 pin, which is what the spec wanted. Do not remove without running the `@tarkov/builds-api` suite. |
