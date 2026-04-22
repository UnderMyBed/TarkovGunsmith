# TarkovGunsmith docs

Where to go depending on what you're trying to do.

## I'm a user

- **[Try the live app →](https://tarkov-gunsmith-web.pages.dev)** — the fastest way to understand what this project does.
- Top-level project overview: [`../README.md`](../README.md)

(We don't have user-facing written guides yet. If you want to write one, [open an issue](https://github.com/UnderMyBed/TarkovGunsmith/issues/new/choose).)

## I'm a contributor

- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — how contributions work, tiered by change size.
- [`operations/local-development.md`](./operations/local-development.md) — fresh-clone setup, env files, seeding demo builds.
- [`adr/`](./adr) — architectural decisions and why they were made.

## I'm a maintainer / curious about the workflow

This project is developed collaboratively with Claude using a strict spec → plan → TDD → review flow. These docs are the detail behind how that works:

- [`../CLAUDE.md`](../CLAUDE.md) — the maintainer handbook: conventions, testing discipline, release process.
- [`ai-workflow/`](./ai-workflow) — the tiered AI workflow (Tier B is current; Tier C is the next upgrade path).
- [`superpowers/specs/`](./superpowers/specs) — the design spec archive. Every feature started as a spec here before any code was written. Also currently holds the system-level design docs (this placement is under review — see [`superpowers/README.md`](./superpowers/README.md)).
- [`plans/`](./plans) — the implementation plan archive. One plan per spec.
- [`operations/`](./operations) — deploy runbooks + local dev setup.
