# Superpowers workflow artifacts

Design artifacts produced by the AI-assisted workflow (named "superpowers" after the [Anthropic `superpowers` skill collection](https://github.com/anthropics/claude-code) the maintainer uses during development).

- [`specs/`](./specs) — design specs. Every feature in this project started as a spec here before any code was written. Each spec is dated (`YYYY-MM-DD-<topic>-design.md`) and immutable once approved; material changes produce a follow-up spec rather than a rewrite.

**Under review:** the `specs/` folder currently holds both feature-level design docs _and_ the top-level system design doc ([`2026-04-18-tarkov-gunsmith-rebuild-design.md`](./specs/2026-04-18-tarkov-gunsmith-rebuild-design.md)). Whether to extract or reframe the latter as a first-class architecture doc outside this methodology-named folder is tracked as a follow-up — see the [public-repo prep spec](./specs/2026-04-22-public-repo-documentation-and-licensing-design.md).
