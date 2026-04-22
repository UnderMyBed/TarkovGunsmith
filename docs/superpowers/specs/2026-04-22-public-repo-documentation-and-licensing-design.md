# Public-Repo Prep — Docs, Contribution, Licensing

**Status:** design approved 2026-04-22. Writing-plans is next.

**Context:** The repo is currently private and has been built with Claude as the primary collaborator using a strict Tier B workflow (spec → plan → TDD → review). The user wants to flip visibility to public so the wider EFT community can see it, try it, and contribute. Before that flip, the repo needs a public-facing front door (README), a realistic contribution process, a restructured docs entry point, and a licensing/attribution pass that covers a fan-made derivative project built on third-party data.

## Goal

Make the repo ready to go public without embarrassment or legal loose ends, and without imposing the full maintainer workflow on drive-by contributors.

### Success criteria

1. A first-time visitor understands what the project is in one screen and can reach the live demo in one click.
2. A drive-by contributor (typo, data fix, small bug) can open a PR without reading more than `README.md` + `CONTRIBUTING.md`.
3. A serious contributor can find the spec / ADR / plan archive through `docs/README.md` — no hunting through directory names that read like internal jargon.
4. Every derived work, data source, font, and trademark is credited or disclaimed. No silent dependencies on material we don't have rights to use.
5. The AI-first workflow is discoverable but never on the critical path for a contributor who doesn't want to adopt it.

## Framing decisions (locked during brainstorming)

| Decision                | Choice                                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public framing          | **Community tool, modern rebuild.** EFT value is the lead. AI-first methodology is context, not the pitch.                                                                                                                               |
| Contribution bar        | **Tiered by change size.** Trivial → direct PR. Medium → issue first. Large (new route / architecture) → spec + discussion. The full superpowers flow is documented as maintainer practice, not required of external contributors.       |
| Docs restructure        | **Topic-first with an audience router.** `docs/README.md` routes by audience. Existing subfolders stay put; each gets a one-paragraph intro. No file moves, no renames, no rewrites of existing specs / plans / ADRs in this pass.       |
| Licensing audit scope   | **Targeted audit.** Credit the original project and the tarkov.dev ecosystem, trademark-disclaim BSG/EFT, verify the non-code risk items (original-project license, tarkov.dev ToU, fonts, asset provenance). No full dep audit. No CLA. |
| Community health subset | `CONTRIBUTING.md` + issue templates + PR template + labels. **No `CODE_OF_CONDUCT.md`, no `SECURITY.md`** (explicitly dropped). GitHub will show a "community standards" nudge — accepted.                                               |
| AI-workflow positioning | `CLAUDE.md` stays at repo root and is re-framed as the **maintainer handbook**. `.claude/` and `.superpowers/` stay in-tree, visible. `docs/ai-workflow/` gets a router pointer. No content rewrites in this pass.                       |

## Non-goals

- No Contributor License Agreement (CLA) or Developer Certificate of Origin (DCO). MIT is enough at this stage.
- No automated license-check CI tooling (e.g. `license-checker` in a CI step).
- No marketing site or docs site generator — the GitHub README and `docs/` tree are the site.
- No i18n, no sponsor link, no branded OG / social preview image (the last pairs with the existing M3 Differentiator OG-cards work).
- No migration or renaming of `.claude/`, `.superpowers/`, `docs/superpowers/`, `docs/ai-workflow/`.
- No rewriting of existing ADRs, specs, or plans. They are the historical record and stay as-is.
- No changes to `LICENSE` itself. No per-file copyright headers.
- No trimming of `CLAUDE.md`'s existing content (separate follow-up pass if it drifts).
- No Discussions, no wiki, no project board setup.

## Design

### 1. `README.md` rewrite

Replace the current 21-line stub with a public-audience README structured top to bottom as:

1. **Hero.** Project name + one-line tagline (_"Ballistics calculator, weapon builder, and ammo-vs-armor analysis for Escape from Tarkov."_) + badges (license, CI build, latest release) + live-demo link.
2. **Screenshot.** One representative image from `/builder` or `/calc` showing the Field Ledger aesthetic. Captured via Playwright or by hand during implementation; committed to `docs/assets/` (or similar — decide during plan). PNG, reasonable width (~1200px), optimized.
3. **What it does.** 3–5 bullets written for EFT players, not developers: calc, builder, matrix, share URLs, save/load, etc.
4. **Try it.** Link to deployed URL + one-liner on where to start.
5. **Run it locally.** Minimal quick-start (`pnpm install && pnpm dev`) + pointer to `docs/operations/local-development.md` for fresh-clone setup (env files, seeding).
6. **Contribute.** One paragraph pointing at `CONTRIBUTING.md`. Mentions the `good first issue` label.
7. **How this project is built.** 3–4 sentences acknowledging the AI-first workflow, honest framing: _"Developed collaboratively with Claude using a spec → plan → TDD → review flow. Maintainer handbook: `CLAUDE.md`. Methodology detail: `docs/ai-workflow/`. Contributors are welcome to use any workflow they prefer."_
8. **Acknowledgments.** Short block pointing at `ACKNOWLEDGMENTS.md` for the full list.
9. **License + trademark disclaimer.** MIT statement. BSG/EFT trademark block (text in §5 below).

**Removed from the current README:** the milestone status paragraph (that churn belongs to `CHANGELOG.md` / release notes), and the direct deep-link to `docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md` (the path name reads as internal jargon on first contact; moves to the docs router).

### 2. Contribution infrastructure

**Files to add:**

| File                                          | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTRIBUTING.md`                             | Ways to help (bugs, data corrections, features, docs); tiered process (trivial → direct PR, medium → issue first, large → spec + discussion); dev setup pointer to `docs/operations/local-development.md`; testing expectations per CLAUDE.md (e2e for new routes, Vitest for logic); Conventional Commits + pnpm + branch naming; PR review expectations; short "AI-first, not required" note pointing at `docs/ai-workflow/`. |
| `.github/ISSUE_TEMPLATE/bug.yml`              | Form-based issue template: steps to reproduce, expected vs actual, browser + OS, build ID / share URL if relevant.                                                                                                                                                                                                                                                                                                              |
| `.github/ISSUE_TEMPLATE/feature.yml`          | Form-based: problem statement, proposed behavior, alternatives considered, is this already in an existing spec?                                                                                                                                                                                                                                                                                                                 |
| `.github/ISSUE_TEMPLATE/data-correction.yml`  | Form-based: which item (weapon / ammo / armor), what's wrong, source of the correction. Prominently notes data comes from `tarkov.dev` upstream and points to their repo when the fix belongs there.                                                                                                                                                                                                                            |
| `.github/ISSUE_TEMPLATE/config.yml`           | `blank_issues_enabled: false`. Optional `contact_links` if we have any (probably none at launch).                                                                                                                                                                                                                                                                                                                               |
| `.github/PULL_REQUEST_TEMPLATE.md`            | Summary, change type, linked issue, test plan checklist, screenshots for UI changes.                                                                                                                                                                                                                                                                                                                                            |
| `.github/labels.yml` (+ one-time application) | Labels: `good first issue`, `help wanted`, `bug`, `enhancement`, `docs`, `data`, `ballistics`, `ui`, `needs-triage`, `needs-repro`. Applied manually via `gh label create …` or a small script during implementation. No ongoing sync job.                                                                                                                                                                                      |

**Deliberately excluded:** `CODE_OF_CONDUCT.md`, `SECURITY.md`. Accepted tradeoff: GitHub's "community profile" checklist will show those missing.

### 3. Docs tree restructure

**Add `docs/README.md`** (new) — the audience router. Three sections:

- **I'm a user.** Link to the live demo, short feature list, pointer to in-app help (if any). Reserved space for future user-facing guides.
- **I'm a contributor.** Root `CONTRIBUTING.md`, `docs/operations/local-development.md`, most-relevant ADRs (stack + hosting).
- **I'm a maintainer / curious about the workflow.** `CLAUDE.md`, `docs/ai-workflow/`, `docs/superpowers/specs/` (archive), `docs/plans/` (archive), `docs/adr/`.

**Add one-paragraph intros** at the top of each existing subfolder's `README.md` (create if missing). Scope:

- `docs/adr/` — what an ADR is in this project, numbering convention, pointer to ADR-0001.
- `docs/ai-workflow/` — what this folder is, Tier B / Tier C context, pointer to `CLAUDE.md`.
- `docs/operations/` — runbooks for local dev and Cloudflare deploys; who they're for.
- `docs/plans/` — implementation plans generated during execution; archive, not source of truth.
- `docs/superpowers/` — methodology artifacts (specs + any future sub-artifacts). Flagged as archive; pointer back to the docs router.

**Explicitly no file moves, no renames, no rewrites** of existing content in this pass.

**Follow-up item, recorded here:** _"Evaluate whether `docs/superpowers/specs/` should be extracted or reframed as first-class architecture docs."_ The concern is real — that folder currently holds the system design record but lives under a methodology-named path. Punted to a separate evaluation after we see how the first pass reads in practice.

### 4. Licensing & attribution

#### 4.1 `ACKNOWLEDGMENTS.md` (new, repo root)

Sections:

- **Original project.** Credit to [TarkovGunsmith by Xerxes-17](https://github.com/Xerxes-17/TarkovGunsmith). License statement (MIT, pending verification per §4.3.1). "This project is a ground-up rewrite; no source code was copied." (Adjust wording after verification.)
- **Data.** [`api.tarkov.dev`](https://api.tarkov.dev) by the `the-hideout` collective. Link to their terms of use. Note the caching layer (`apps/data-proxy`) and explicit "please respect their infrastructure" pointer.
- **Stack.** shadcn/ui, Tailwind v4, Vite, React, TanStack Query, Cloudflare Workers / Pages / KV. License lines (MIT / Apache-2.0 / etc.).
- **Fonts.** Bungee, Chivo, Azeret Mono — SIL Open Font License, with links to the upstream font repos and the hosting strategy (Google Fonts CDN vs self-hosted).
- **Assets.** Any images, icons, or silhouettes, with per-asset provenance (see §4.3.4 / §4.3.5 audit).
- **Trademark disclaimer.** Full text (see §4.2).

#### 4.2 Trademark disclaimer (canonical text)

Included both in `ACKNOWLEDGMENTS.md` and at the bottom of `README.md`:

> _Escape from Tarkov, the EFT logo, and related marks are trademarks of Battlestate Games Limited. This project is an unofficial, fan-made community tool and is not affiliated with, endorsed by, or sponsored by Battlestate Games._

#### 4.3 Targeted audit checklist

Each item produces a finding recorded in `ACKNOWLEDGMENTS.md`. If an item can't be resolved, it's listed as an open question under the "Open items" section of the acknowledgments file (not hidden).

1. **Original TarkovGunsmith license.** Confirm license text on the upstream repo. Confirm the rebuild copied no source files, no prose, no assets. If any asset provenance is unclear, either re-source or remove.
2. **`api.tarkov.dev` terms of use.** Read current ToU, record URL, confirm cached-read usage via `data-proxy` is compliant, note any explicit attribution requirement (expected: yes — put in ACKNOWLEDGMENTS).
3. **Fonts.** Confirm Bungee, Chivo, and Azeret Mono are SIL OFL-licensed; record how they're loaded (Google Fonts CDN vs self-hosted in `apps/web/public/`). If self-hosted, ensure the license file ships with them.
4. **Image / icon assets.** Walk `apps/web/public/`, `apps/web/src/assets/`, and any other asset directories. Confirm provenance of every raster / vector / SVG. Anything sourced from tarkov.dev / the EFT wiki / BSG gets flagged for attribution or removal.
5. **Weapon silhouettes (M3.5 Arc 4).** Confirm provenance of the silhouettes shipped in the recent arc. Record source + license. If self-drawn, note that.

**No changes to `LICENSE`.** No per-file copyright headers.

### 5. AI-workflow repositioning

- **`CLAUDE.md` banner (new).** Short block added at the top: _"This file is the maintainer handbook for working on this repo with Claude. Contributors are welcome to use any workflow they prefer — see `CONTRIBUTING.md` for the contribution bar."_ No other edits to existing CLAUDE.md content.
- **`docs/ai-workflow/` intro.** One paragraph at the top of the folder's `README.md` (create if missing) framing the tier model and pointing back at both `CLAUDE.md` and the docs router.
- **`.claude/` and `.superpowers/`.** Stay in-tree, unmoved, fully visible. They are part of the project's honest story. No `.gitignore` additions, no archival.
- **Contributor signal.** `CONTRIBUTING.md` explicitly states: adopting the Claude workflow is optional; the expected artifacts from a contributor are working code + tests + a PR description, not a spec file.

### 6. Repo metadata

Applied via `gh` CLI after merge, or via the GitHub web UI — one-time:

- **Description.** _"Ballistics calculator, weapon builder, and ammo-vs-armor analysis for Escape from Tarkov. Cloudflare-hosted, AI-first open source."_
- **Website URL.** The deployed Cloudflare Pages URL. Placeholder value `TODO(url)` if not supplied at merge time; resolved before visibility flip.
- **Topics.** `escape-from-tarkov`, `tarkov`, `ballistics`, `react`, `typescript`, `cloudflare-workers`, `cloudflare-pages`, `vite`, `ai-assisted-development`.
- **Discussions.** Off (issues + PRs are sufficient until there's traffic).
- **Branch protection.** Verify the existing rules still make sense in a public context (required status checks, no force-push to `main`, PRs required). No structural changes expected.
- **Social preview image.** Deferred.
- **Sponsor link.** Deferred.

### 7. Verification gate before visibility flip

Before the user flips repo visibility from private → public, a cold-read verification pass: a fresh Claude session (or a subagent) reads only the public-facing artifacts — `README.md`, `CONTRIBUTING.md`, `docs/README.md`, `ACKNOWLEDGMENTS.md`, and whichever issue templates would fire — and reports whether a non-Claude developer could get from "landed on the repo" to "ran it locally and opened a PR" without hitting a dead end. Findings captured as a short report in the PR thread. Fix blockers, confirm, then flip.

## Rollout sequence (single PR on `docs/public-repo-prep`)

1. Write this spec (done in this file).
2. Write the implementation plan (`docs/plans/`) — next step after spec approval.
3. Execute:
   1. Rewrite `README.md` (§1) + capture hero screenshot.
   2. Add `ACKNOWLEDGMENTS.md` (§4.1) + complete targeted audit (§4.3); record findings inline.
   3. Add `CONTRIBUTING.md` + `.github/ISSUE_TEMPLATE/*` + `.github/PULL_REQUEST_TEMPLATE.md` + `.github/labels.yml` (§2).
   4. Add `docs/README.md` router + per-folder intro paragraphs (§3).
   5. Add maintainer-handbook banner to `CLAUDE.md` (§5).
   6. Apply GitHub labels via `gh label create` (one-time).
4. Cold-read verification pass (§7).
5. Open PR, CI green, merge.
6. After merge: apply repo metadata (description, topics, website) via `gh` (§6).
7. User flips visibility manually. Last step, user-triggered.

## Follow-up items (deferred, recorded for tracking)

- Evaluate extracting or reframing `docs/superpowers/specs/` as first-class architecture docs.
- Trim `CLAUDE.md` status / milestone preamble if it drifts from reality.
- Branded OG / social preview image (pairs with M3 Differentiator OG-cards work).
- Automated license-check CI (escalation path if the project grows and full dep audit becomes warranted).
- `CODE_OF_CONDUCT.md` and `SECURITY.md` (revisit if community behavior or vulnerability-reporting pressure makes them load-bearing).
- Contributor license agreement (revisit only if a legal concern emerges).
