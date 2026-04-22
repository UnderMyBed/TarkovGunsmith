# M3.5 Arc 0 — Ops & Local Dev-Tooling Sweep

**Status:** design approved 2026-04-21. Writing-plans is next.

**Context:** M3.5 "Depth & Polish" is a 4-arc roadmap (Arc 0 → 1 → 2 → 4). Arc 0 lands the local-dev foundation that downstream arcs will iterate against. It also closes the one outstanding production ops gap (`BUILDS_API_URL` Pages secret) by documenting the runbook so nothing else about the project is "missing tooling we forgot to write down."

## Goal

Make the full stack runnable locally with a single `pnpm dev`, with save/load working end-to-end, and with a documented story for each piece of local-dev friction the team has hit so far.

**Success criteria — fresh clone to working demo:**

```bash
git clone …
pnpm install
cp apps/builds-api/.dev.vars.example apps/builds-api/.dev.vars
cp apps/data-proxy/.dev.vars.example apps/data-proxy/.dev.vars
cp apps/web/.dev.vars.example apps/web/.dev.vars
pnpm dev       # brings up web (5173) + data-proxy (8787) + builds-api (8788)
# in another terminal:
pnpm seed:build
# → prints http://localhost:5173/builder/<id>
# opening that URL renders the seeded build with no 500s
```

## Non-goals

- Switching the SPA to route GraphQL through `data-proxy` in production (it currently hits `api.tarkov.dev` directly; CORS makes this fine today — separate follow-up plan when we want edge caching).
- GraphQL upstream mock / offline dev mode (scope option C during brainstorming — deferred; we'll add it if `api.tarkov.dev` outages actually bite).
- `wrangler dev --remote` as a first-class workflow (stays a power-user escape hatch).
- Additional operations runbooks (rollback, custom-domain, multi-env) — separate plans when each is needed.
- An `add-worker-secret` Claude skill (user-excluded from scope).

## Design

### 1. Port pinning

Both `wrangler dev` invocations default to `:8787` — running the two Workers at once silently fails. The Vite proxy config already assumes `8787` (data-proxy) + `8788` (builds-api), so the fix is to codify that convention in each `wrangler.jsonc`.

| Service                          | Port   | Where pinned                                                     |
| -------------------------------- | ------ | ---------------------------------------------------------------- |
| `apps/web` (Vite)                | `5173` | `apps/web/vite.config.ts` (already set)                          |
| `apps/data-proxy` (wrangler dev) | `8787` | `apps/data-proxy/wrangler.jsonc` — add `"dev": { "port": 8787 }` |
| `apps/builds-api` (wrangler dev) | `8788` | `apps/builds-api/wrangler.jsonc` — add `"dev": { "port": 8788 }` |

Note: `apps/web` has a separate `pages:dev` script for the Pages Functions emulator. That stays a manual power-user tool; we don't wire it into the main `pnpm dev`. When invoked it uses `wrangler pages dev` defaults; if we find we're using it often we can pin `:8789`, but not in this arc.

### 2. `.dev.vars` convention

Wrangler reads `.dev.vars` automatically during `wrangler dev` (for Workers) and `wrangler pages dev` (for Pages Functions). Values in `.dev.vars` override `wrangler.jsonc`'s `vars` block for the local dev session.

**What gets committed (templates):**

| File                                | Contents                                              |
| ----------------------------------- | ----------------------------------------------------- |
| `apps/builds-api/.dev.vars.example` | `OG_FIXTURE_BUILD_ID=`<br>`OG_FIXTURE_PAIR_ID=`       |
| `apps/data-proxy/.dev.vars.example` | `UPSTREAM_GRAPHQL_URL=https://api.tarkov.dev/graphql` |
| `apps/web/.dev.vars.example`        | `BUILDS_API_URL=http://localhost:8788`                |

**What gets gitignored:** `.dev.vars` (at every level — enforce via root `.gitignore` glob).

**`wrangler.jsonc` cleanup:** The `OG_FIXTURE_*` entries currently live in `apps/builds-api/wrangler.jsonc` `vars` with empty-string defaults. These are dev-only fixture hooks and shouldn't be committed to the prod config. Move them out — they're now template-only, and production deploys never set them. The `BUILD_TTL_SECONDS` entry stays in `wrangler.jsonc` (it's a real prod config value).

`UPSTREAM_GRAPHQL_URL` stays in both places: `wrangler.jsonc` (prod default) + `.dev.vars.example` (developer-overridable for staging-swap experiments).

### 3. `pnpm dev` — single-command full stack

No new tooling needed. Turbo's `dev` task is already `persistent: true` with `ui: "stream"` — running `pnpm dev` at the root concurrently starts all three workspace `dev` scripts and streams their output.

The only thing to verify: that startup order is tolerant (data-proxy and builds-api don't have to be up when Vite starts — the proxy just returns 502 until they are, and the SPA hits `api.tarkov.dev` directly anyway so data-proxy's boot-time isn't load-bearing).

### 4. Seed-build helper

**Script:** `scripts/seed-local-build.ts`, invoked via `pnpm seed:build`.

**Behavior:**

1. Read a fixture build JSON from `scripts/fixtures/build-m4a1.json` (a realistic M4A1 loadout mirroring the landing-page sample).
2. `POST http://localhost:8788/builds` with the fixture as the body.
3. On success, print:
   ```
   seeded build: <id>
   share URL:    http://localhost:5173/builder/<id>
   compare URL:  http://localhost:5173/builder/compare
   ```
4. On failure (most commonly "builds-api isn't running"), print a clear error hint referencing the local-dev doc.

**Implementation notes:**

- Runs via `tsx scripts/seed-local-build.ts`. Add `tsx` as a root devDep if not already present.
- No external deps beyond `tsx` and Node's built-in `fetch`.
- Fixture file: real build JSON matching the current build schema v4. Must validate against `Build` from `@tarkov/data` (the zod schema lives at `packages/tarkov-data/src/build-schema.ts`); the script parses the fixture at startup and fails loudly if schema drift happens.

**Why a pnpm script, not a dev-only builds-api endpoint:** keeps dev fixture logic out of the Worker codebase; matches the OG-cards pattern of env-var-gated fixtures (which are dev-only knobs, not first-class endpoints); easy to extend (seed pairs, seed-N-builds, etc.) without touching Worker code.

### 5. New doc: `docs/operations/local-development.md`

Sections:

- **Quick start** — the fresh-clone block above.
- **What runs where** — the port table from §1, with a note that `pnpm dev` handles it all.
- **Secrets & env vars** — the `.dev.vars.example` files, what each value does, what prod sets separately. Explicitly names `BUILDS_API_URL` as the one prod-only secret not covered by any example file.
- **Exercising save/load locally** — `pnpm seed:build` workflow; also how to manually POST to `:8788/builds` with curl.
- **Exercising OG cards locally** — set `OG_FIXTURE_BUILD_ID` in `apps/builds-api/.dev.vars`, restart, visit `/og/build/<id>` on the Pages dev server (requires `pnpm --filter @tarkov/web pages:dev` as a separate invocation — this is the one documented power-user escape hatch).
- **Production secret runbook** — the exact `wrangler pages secret put BUILDS_API_URL …` command that's been outstanding since OG cards shipped. Also covers `wrangler pages secret list` for verification and rotation.
- **Troubleshooting** — port-in-use (e.g., `lsof -i :8787`), stale KV state (`rm -rf apps/builds-api/.wrangler/state`), `.dev.vars` not taking effect (must restart `wrangler dev`), fresh-install issues.

### 6. CLAUDE.md updates

- `apps/builds-api/CLAUDE.md` — replace the "Local dev" section's single `pnpm --filter` line with a pointer to `docs/operations/local-development.md`; mention `.dev.vars.example`.
- `apps/data-proxy/CLAUDE.md` — same treatment.
- `apps/web/CLAUDE.md` — same treatment; additionally update the "Env vars on Cloudflare Pages" subsection to cross-link the runbook.
- Root `CLAUDE.md` — add a short "Local development" section under "Local development" header pointing at the new doc; remove the "**Production action still open**" callout once the runbook covers the same info.

## Architecture

Nothing new. This arc is configuration + scripts + docs. The only file additions:

```
apps/builds-api/.dev.vars.example       (new, committed)
apps/data-proxy/.dev.vars.example       (new, committed)
apps/web/.dev.vars.example              (new, committed)
scripts/seed-local-build.ts             (new, committed)
scripts/fixtures/build-m4a1.json        (new, committed)
docs/operations/local-development.md    (new, committed)
```

Modifications:

```
apps/builds-api/wrangler.jsonc          (add dev.port, remove OG_FIXTURE_* vars)
apps/data-proxy/wrangler.jsonc          (add dev.port)
.gitignore                              (add .dev.vars glob)
package.json                            (add seed:build script, tsx devDep if missing)
apps/builds-api/CLAUDE.md
apps/data-proxy/CLAUDE.md
apps/web/CLAUDE.md
CLAUDE.md                               (root)
```

## Testing

Primarily verified by manual smoke against the success-criteria checklist in §Goal. No CI additions:

- Automated CI for local-dev orchestration is too infra-heavy for its value (spinning up three wrangler workers in GitHub Actions to verify a dev-only script works would be more fragile than the thing it's testing).
- The `seed:build` fixture IS validated against the build schema at script start, so if schema drift happens the script fails loudly when a developer next runs it.

The one mechanical check worth adding: confirm `pnpm format:check && pnpm typecheck && pnpm lint && pnpm test` all still pass after the config edits.

## Rollout

Single PR. Commits roughly:

1. `chore(dev): pin wrangler dev ports + add .dev.vars.example templates`
2. `chore(dev): seed-build helper + fixture`
3. `docs(ops): local-development runbook + CLAUDE.md cross-links`

Merges via squash. Release-please will cut this as a `chore:` (no version bump), which is correct — nothing user-facing changes.

## Risks & open questions

- **Risk:** `tsx` interaction with pnpm hoisting. Mitigation: verify on a fresh `pnpm install`; fall back to `node --loader tsx` if needed.
- **Risk:** `.dev.vars` inheriting wrong values across workspaces (each worker reads its own `.dev.vars` from its own directory — no inheritance, so this shouldn't happen, but worth asserting in the runbook).
- **Open:** Should `pnpm dev` also start `pages:dev` (the Pages Functions emulator) so `/og/*` works without a second terminal? **Decision:** no — `pages:dev` doubles up the Vite-like server and conflicts with the `vite` dev server on port usage + SPA routing. Keep it a power-user escape hatch. Document it as such.

## Follow-ups outside this arc

- Switching SPA to route GraphQL through `data-proxy` (separate plan).
- GraphQL upstream mock for offline dev + deterministic tests (separate plan, triggered if `api.tarkov.dev` outages bite).
- Additional ops runbooks (rollback, custom domain, multi-env) — each as its own small plan when needed.
