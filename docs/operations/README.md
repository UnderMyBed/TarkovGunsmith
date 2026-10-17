# Operations runbooks

Runbooks for running and deploying this project.

- [`local-development.md`](./local-development.md) — fresh-clone setup, env files, `pnpm dev` for the full stack, seeding demo builds.
- [`cloudflare-deploys.md`](./cloudflare-deploys.md) — deploy pipeline (release-please → GitHub Actions → Cloudflare), token permissions, rotation, one-time setup.
- [`builder-snapshot.md`](./builder-snapshot.md) — the Builder's build-time game data: what it holds, how each build generates it, and what to do when generation fails on upstream drift.
- [`data-api-audit.md`](./data-api-audit.md) — field-by-field audit of `json.tarkov.dev` against our calculations: what the migration got right, the recoil unit defect it exposed, and how to re-run the check.

Additional runbooks (rollback, custom domain, multi-environment) get added here as they become necessary.
