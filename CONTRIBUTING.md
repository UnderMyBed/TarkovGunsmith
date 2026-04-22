# Contributing to TarkovGunsmith

Thanks for considering a contribution. This project is a community tool — the more people poke at it, the better it gets.

## Ways to help

- 🐞 **Report a bug** — something broken, wrong number, weird UI state.
- 📊 **Fix game data** — wrong penetration value, missing mod slot, bad armor class.
- ✨ **Suggest or build a feature** — a missing calculation, a view that'd help your squad, an import from another tool.
- 📝 **Improve the docs** — clarifications, typos, better examples.
- 💬 **Ask a question** — if the README or docs didn't answer it, open an issue. Odds are other people have the same question.

## How to contribute

How much process a change needs depends on how big it is:

| Change size                                                                             | Process                                                                                                         |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Trivial** — typo, copy tweak, docs fix, small bug fix                                 | Open a PR directly. No issue required.                                                                          |
| **Medium** — new feature on an existing route, non-trivial refactor, data schema change | Open an issue first. We'll align on the approach before you sink time into a PR.                                |
| **Large** — new route, architectural change, dependency swap                            | Open an issue, discuss, and expect a short design sketch (problem / approach / alternatives) before code lands. |

If you aren't sure where your change falls, open an issue and ask. "I was going to do X — does that need a design first?" gets a quick answer.

## Development setup

You'll need:

- Node.js 22+ (see `.nvmrc`)
- pnpm 10+
- Git

Fresh clone:

```bash
git clone https://github.com/UnderMyBed/TarkovGunsmith.git
cd TarkovGunsmith
pnpm install
pnpm dev
```

Full setup (env files, seeded builds, how the three processes fit together): [`docs/operations/local-development.md`](./docs/operations/local-development.md).

## What good PRs look like

- **Scoped.** One concern per PR. If you're tempted to sneak in an unrelated cleanup, open a second PR instead.
- **Tested.** If you add a new route, add an entry to `apps/web/e2e/smoke.spec.ts`. If you change ballistics math, add a Vitest. If it's pure UI copy, no test needed.
- **Green.** `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm test` pass locally. CI enforces the same.
- **Commit-styled.** Use [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `build:`, `perf:`, `style:`, `revert:`. Scope optional (`feat(builder): …`). `commitlint` checks every commit message.
- **Reviewed.** One maintainer approval. CI green. Squash merge.

## Branch and merge rules

- `main` is protected. All changes land via PR.
- Branch naming: `feat/...`, `fix/...`, `docs/...`, `chore/...`. Match the commit type.
- Don't force-push to `main`. Force-push to your own branch is fine, but courtesy-ping reviewers after.
- Don't merge your own PR unless explicitly authorized.

## Testing discipline (hard rule)

- New routes get an e2e entry in `apps/web/e2e/smoke.spec.ts`.
- New user-facing interaction flows worth protecting get their own spec file.
- Console errors fail the build; allowlist real false positives in `smoke.spec.ts` with a comment explaining why.
- Fonts are load-checked. Changing Bungee / Chivo / Azeret Mono means updating the font-load test.

Run e2e locally before pushing:

```bash
pnpm --filter @tarkov/web test:e2e
```

## Game data corrections

Most EFT game data (weapons, ammo, armor, traders) comes from upstream — [`api.tarkov.dev`](https://api.tarkov.dev), run by the [`the-hideout`](https://github.com/the-hideout) community. If the data is wrong _there_, it's wrong _here_, and the fix belongs in their repos. The `data-correction` issue template will help you figure out where a fix should go.

Things that are genuinely ours (not upstream):

- Ballistics math in `packages/ballistics/`
- UI, copy, layout
- Build schema, save/load, share URLs
- Mod-compatibility rules specific to how we model slot trees

## How this project is built

This repo is developed with Claude as the primary collaborator, using a strict spec → plan → TDD → review workflow. The maintainer handbook is [`CLAUDE.md`](./CLAUDE.md); methodology detail is in [`docs/ai-workflow/`](./docs/ai-workflow/).

**You do not need to adopt this workflow to contribute.** A working PR with tests is all we ask. The Claude-specific infrastructure (`.claude/`, `.superpowers/`, `docs/superpowers/`) is there because it's how the maintainer actually works — it's never a gate on your contribution.

## Reporting a security issue

If you believe you've found a security vulnerability, please open a [private security advisory](https://github.com/UnderMyBed/TarkovGunsmith/security/advisories/new) rather than a public issue. If that's not available, open an issue without sensitive details and ask how to send them privately.

## Questions?

Open an issue with the question label, or start a conversation on an existing issue or PR. The maintainer reads everything; response time depends on how EFT season treats us.
