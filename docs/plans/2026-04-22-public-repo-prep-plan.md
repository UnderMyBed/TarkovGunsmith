# Public-Repo Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repo ready to flip from private to public — new README, contribution infrastructure, docs audience router, targeted licensing audit + attribution, and AI-workflow repositioning.

**Architecture:** Additive documentation pass on branch `docs/public-repo-prep`. Adds public-facing files (`README.md` rewrite, `ACKNOWLEDGMENTS.md`, `CONTRIBUTING.md`, `.github/` templates, `docs/README.md` router, per-folder intros) and a single banner edit to `CLAUDE.md`. One PR. No code changes. Repo metadata + visibility flip happen after merge, user-driven.

**Tech Stack:** Markdown, GitHub Issue Forms (YAML), `gh` CLI for post-merge ops, Playwright for the optional hero screenshot capture. All tooling already installed.

**Spec reference:** `docs/superpowers/specs/2026-04-22-public-repo-documentation-and-licensing-design.md`

---

## File structure

**New files:**

| Path                                         | Responsibility                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ACKNOWLEDGMENTS.md`                         | Credits for original project, data sources, stack, fonts, assets. Trademark disclaimer. |
| `CONTRIBUTING.md`                            | How to contribute: tiered process, dev setup, testing, commit style, PR expectations.   |
| `.github/ISSUE_TEMPLATE/bug.yml`             | Form-based bug report template.                                                         |
| `.github/ISSUE_TEMPLATE/feature.yml`         | Form-based feature request template.                                                    |
| `.github/ISSUE_TEMPLATE/data-correction.yml` | Form-based data correction template (points upstream when applicable).                  |
| `.github/ISSUE_TEMPLATE/config.yml`          | Disables blank issues.                                                                  |
| `.github/PULL_REQUEST_TEMPLATE.md`           | PR template: summary, change type, test plan, screenshots for UI.                       |
| `.github/labels.yml`                         | Source-of-truth label definitions (applied via `gh label create` post-merge).           |
| `docs/README.md`                             | Audience router (user / contributor / maintainer).                                      |
| `docs/adr/README.md`                         | Folder intro: what ADRs are, numbering, pointer to ADR-0001.                            |
| `docs/ai-workflow/README.md`                 | Folder intro: Tier B / Tier C context, pointer back to `CLAUDE.md`.                     |
| `docs/operations/README.md`                  | Folder intro: runbooks index.                                                           |
| `docs/plans/README.md`                       | Folder intro: implementation-plan archive.                                              |
| `docs/superpowers/README.md`                 | Folder intro: methodology artifacts (spec archive lives under `specs/`).                |
| `docs/assets/hero.png`                       | README hero screenshot.                                                                 |

**Modified files:**

| Path        | Change                                        |
| ----------- | --------------------------------------------- |
| `README.md` | Full rewrite per spec §1.                     |
| `CLAUDE.md` | Prepend maintainer-handbook banner (spec §5). |

---

## Task 1: Licensing audit + `ACKNOWLEDGMENTS.md`

**Files:**

- Create: `ACKNOWLEDGMENTS.md`

**Purpose:** Complete the spec §4.3 audit and record findings directly in `ACKNOWLEDGMENTS.md`. Do the research before writing — the file is a by-product of the audit, not a template filled with guesses.

- [ ] **Step 1: Audit — original TarkovGunsmith license**

Fetch the upstream repo's LICENSE and note key facts.

```bash
# Use WebFetch on https://github.com/Xerxes-17/TarkovGunsmith/blob/main/LICENSE
# (or raw: https://raw.githubusercontent.com/Xerxes-17/TarkovGunsmith/main/LICENSE)
```

Record: license (expected: MIT), copyright holder, year. If anything other than MIT / Apache-2.0 / BSD surfaces, stop and escalate to the user.

Also fetch the upstream repo's root README briefly and confirm no assets (images, data JSON, prose) have been copied into this project. Spot-check by `grep -r "Xerxes" .` and scanning for copied text. Record the result as "ground-up rewrite; no source code, prose, or assets copied" if that holds, or list what was copied.

- [ ] **Step 2: Audit — `api.tarkov.dev` terms of use**

Fetch the ToU / usage policy.

```bash
# Try these URLs in order via WebFetch until one has the policy:
#   https://tarkov.dev/about
#   https://api.tarkov.dev
#   https://github.com/the-hideout/tarkov-api (README)
```

Record: the ToU URL, any attribution requirement, any rate-limit expectation, whether cached reads via a proxy are permitted. Current usage is `apps/data-proxy` Worker caching GraphQL responses; confirm that's compliant.

- [ ] **Step 3: Audit — fonts**

Confirm licenses and loading strategy for Bungee, Chivo, and Azeret Mono.

```bash
# Find how fonts are loaded
grep -r "fonts.googleapis" apps/web/
grep -r "Bungee\|Chivo\|Azeret" apps/web/ | head -20
grep -rn "@font-face" apps/web/ | head -20
ls apps/web/public/ 2>/dev/null | grep -i font
ls apps/web/src/assets/ 2>/dev/null
```

Expected: loaded via Google Fonts CDN in `apps/web/index.html` or a CSS file. All three are SIL Open Font License (OFL). If self-hosted font files exist under `apps/web/public/`, confirm the OFL license file ships alongside them.

Record: loading strategy + license. If any font is NOT OFL/Apache, stop and escalate.

- [ ] **Step 4: Audit — images and icons**

Walk the app's static assets and confirm provenance.

```bash
find apps/web/public apps/web/src -type f \
  \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.svg' -o -name '*.webp' -o -name '*.ico' \) 2>/dev/null
```

For each asset, ask: is it first-party (drawn / generated for this project), from a cleared-for-use library (e.g. Lucide/shadcn icons → MIT/ISC), or derived from tarkov.dev / the EFT wiki / BSG? Anything derived needs attribution here or removal.

Specifically check:

- `apps/web/public/favicon.svg`, `apple-touch-icon.png` — confirm first-party.
- Weapon silhouettes from M3.5 Arc 4 — locate their source file(s) and confirm provenance. If generated from tarkov.dev images or `tarkov-dev-image-generator`, record that with an attribution line.

Record: per-asset provenance (or a short "all assets first-party / MIT-licensed library / cleared with attribution" summary if that holds).

- [ ] **Step 5: Write `ACKNOWLEDGMENTS.md`**

Create the file with this structure, substituting the audit findings into the marked placeholders:

```markdown
# Acknowledgments

This project stands on other people's work. Here's who to thank and what to respect.

## Original project

TarkovGunsmith began as [TarkovGunsmith by Xerxes-17](https://github.com/Xerxes-17/TarkovGunsmith), released under the {LICENSE from Step 1} license. The current project is a ground-up rewrite — {finding from Step 1: copied / not copied}. Thanks to Xerxes-17 for laying the groundwork and proving the community wants a tool like this.

## Game data

Ballistics, weapon, ammo, armor, and trader data comes from [`api.tarkov.dev`](https://api.tarkov.dev), maintained by [`the-hideout`](https://github.com/the-hideout) community. Their terms of use: {URL from Step 2}. {Attribution / rate-limit notes from Step 2}.

Please respect their infrastructure — if you're running this project locally against live data, the `data-proxy` Worker caches responses at the edge to reduce load. If you want heavy programmatic access, run your own proxy or mirror their dataset.

## Stack

- [React](https://react.dev/) — MIT
- [Vite](https://vitejs.dev/) — MIT
- [TypeScript](https://www.typescriptlang.org/) — Apache-2.0
- [Tailwind CSS](https://tailwindcss.com/) — MIT
- [shadcn/ui](https://ui.shadcn.com/) — MIT
- [TanStack Query](https://tanstack.com/query) — MIT
- [Cloudflare Workers / Pages / KV](https://developers.cloudflare.com/) — hosting

## Fonts

- **Bungee** — SIL Open Font License, by David Jonathan Ross. {loading strategy from Step 3}
- **Chivo** — SIL Open Font License, by Omnibus-Type. {loading strategy from Step 3}
- **Azeret Mono** — SIL Open Font License, by Displaay Type Foundry. {loading strategy from Step 3}

## Assets

{Findings from Step 4: either a short "all first-party / MIT-licensed libraries" summary, or a per-asset provenance list.}

## Trademark

Escape from Tarkov, the EFT logo, and related marks are trademarks of Battlestate Games Limited. This project is an unofficial, fan-made community tool and is not affiliated with, endorsed by, or sponsored by Battlestate Games.

## Open items

{Empty by default. If any audit step surfaced something unresolved — e.g. an asset with unclear provenance, a font that isn't actually OFL, a ToU attribution requirement we haven't yet satisfied — list it here so it isn't hidden.}
```

If any audit step produced a hard blocker (e.g. a copied asset without a compatible license), stop and escalate to the user before writing the file.

- [ ] **Step 6: Commit**

```bash
git add ACKNOWLEDGMENTS.md
git commit -m "docs(repo): add ACKNOWLEDGMENTS with targeted license audit findings"
```

---

## Task 2: Capture hero screenshot

**Files:**

- Create: `docs/assets/hero.png`

**Purpose:** README §2 needs a representative image. One polished screenshot of `/builder` or `/calc` at ~1200px wide, showing the Field Ledger aesthetic.

- [ ] **Step 1: Start the web app locally**

```bash
pnpm install  # if not already done
pnpm --filter @tarkov/web dev
# Wait until Vite prints "Local: http://localhost:5173/"
```

- [ ] **Step 2: Capture the screenshot**

Use Playwright for a consistent, deterministic capture. Create a throw-away script at `scripts/capture-hero.ts`:

```ts
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = "http://localhost:5173/builder";
const OUT = "docs/assets/hero.png";

await mkdir("docs/assets", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const page = await context.newPage();
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500); // let fonts + entries settle
await page.screenshot({ path: OUT, fullPage: false });
await browser.close();
console.log("Wrote", OUT);
```

Run it:

```bash
pnpm tsx scripts/capture-hero.ts
```

- [ ] **Step 3: Sanity-check the image**

Open `docs/assets/hero.png`. Confirm: shows the Field Ledger look, legible at typical README render size (GitHub scales ~900px wide), no placeholder text, no dev-tools banners, no `localhost:` visible. If the default `/builder` route shows an empty state, navigate to a route that looks alive (e.g. a seeded build URL via `pnpm seed:build`) and re-capture.

- [ ] **Step 4: Delete the capture script**

The screenshot is a one-off; the script is not a durable part of the repo.

```bash
rm scripts/capture-hero.ts
```

- [ ] **Step 5: Commit**

```bash
git add docs/assets/hero.png
git commit -m "docs(repo): add README hero screenshot"
```

---

## Task 3: Rewrite `README.md`

**Files:**

- Modify: `README.md` (full replacement)

**Purpose:** New public-audience README per spec §1.

- [ ] **Step 1: Replace `README.md` with the new structure**

Overwrite the file with:

````markdown
# TarkovGunsmith

**Ballistics calculator, weapon builder, and ammo-vs-armor analysis for Escape from Tarkov.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![CI](https://github.com/UnderMyBed/TarkovGunsmith/actions/workflows/ci.yml/badge.svg)](https://github.com/UnderMyBed/TarkovGunsmith/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/UnderMyBed/TarkovGunsmith)](https://github.com/UnderMyBed/TarkovGunsmith/releases)

🔗 **[Try it live →]({LIVE_URL})**

![TarkovGunsmith builder view](./docs/assets/hero.png)

## What it does

- **Ballistics calculator (`/calc`)** — penetration chance, damage after armor, and effective range for any ammo-vs-armor matchup.
- **Weapon builder (`/builder`)** — pick a weapon, attach mods that actually fit its slots, see the stat deltas live.
- **Ammo-vs-armor matrix (`/matrix`)** — scan a whole armor tier in one view, find the breakpoints that matter.
- **Simulator (`/sim`)** — shot-by-shot outcome distributions for a full loadout against a full kit.
- **Share builds** — every build gets a short URL. Send it to your squad. Import on any device.

## Try it

Open **[{LIVE_URL}]({LIVE_URL})** — no login, no install.

Looking for a specific workflow? `/builder` is the fastest starting point; pick a weapon and start experimenting.

## Run it locally

```bash
pnpm install
pnpm dev
```

That brings up the SPA at `http://localhost:5173` plus the two Workers (`data-proxy`, `builds-api`). For fresh-clone setup (env files, seeded demo builds), see [`docs/operations/local-development.md`](./docs/operations/local-development.md).

## Contribute

Yes please — bug reports, data corrections, small fixes, new features. Good first issues are tagged [`good first issue`](https://github.com/UnderMyBed/TarkovGunsmith/labels/good%20first%20issue). Full contribution guide: [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## How this project is built

This repo is developed collaboratively with [Claude](https://claude.ai/code), using a spec → plan → TDD → review flow documented in [`CLAUDE.md`](./CLAUDE.md) (the maintainer handbook) and [`docs/ai-workflow/`](./docs/ai-workflow/). Contributors are welcome to use any workflow they prefer — adopting the Claude workflow is never required to submit a PR.

## Acknowledgments

Original [TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith) by [Xerxes-17](https://github.com/Xerxes-17). Game data from [`api.tarkov.dev`](https://api.tarkov.dev) by [`the-hideout`](https://github.com/the-hideout). Full credits: [`ACKNOWLEDGMENTS.md`](./ACKNOWLEDGMENTS.md).

## License

[MIT](./LICENSE). _Escape from Tarkov, the EFT logo, and related marks are trademarks of Battlestate Games Limited. This project is an unofficial, fan-made community tool and is not affiliated with, endorsed by, or sponsored by Battlestate Games._
````

**Substitutions to make before committing:**

- The production URL is `https://tarkov-gunsmith-web.pages.dev` (sourced from `apps/web/CLAUDE.md` and `docs/operations/cloudflare-deploys.md`). Replace every `{LIVE_URL}` literal in the README template above with that URL before writing the file. Sanity-check with `curl -sI https://tarkov-gunsmith-web.pages.dev | head -1` — expect a 200 or a 304; a 404 or connection refused means the deploy isn't live and execution should stop and escalate.

**Cross-checks:**

- Confirm the `UnderMyBed/TarkovGunsmith` GitHub path in the badges matches `git remote get-url origin`.
- Confirm `docs/assets/hero.png` exists (from Task 2).
- Confirm `CHANGELOG.md`, `docs/operations/local-development.md`, `CONTRIBUTING.md`, `ACKNOWLEDGMENTS.md`, `CLAUDE.md` all exist or are being added in this PR (link targets must not 404 post-merge).

- [ ] **Step 2: Format and lint-check**

```bash
pnpm prettier --write README.md
pnpm prettier --check README.md
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(repo): rewrite README for public audience"
```

---

## Task 4: Write `CONTRIBUTING.md`

**Files:**

- Create: `CONTRIBUTING.md`

**Purpose:** Contributor entry point per spec §2. Tiered process matching the locked contribution bar (Q2 answer A). Lowers friction for drive-by contributors while preserving the maintainer workflow as optional context.

- [ ] **Step 1: Create `CONTRIBUTING.md`**

````markdown
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
````

- [ ] **Step 2: Cross-check links**

Confirm every relative link resolves in the working tree: `./LICENSE`, `./ACKNOWLEDGMENTS.md`, `./CLAUDE.md`, `./docs/operations/local-development.md`, `./docs/ai-workflow/`, `apps/web/e2e/smoke.spec.ts`, `packages/ballistics/`. If any link is broken at execution time (file missing or renamed), fix the link or note a dependency on a later task.

Confirm the GitHub URLs (`UnderMyBed/TarkovGunsmith`) match `git remote get-url origin`.

- [ ] **Step 3: Format and commit**

```bash
pnpm prettier --write CONTRIBUTING.md
git add CONTRIBUTING.md
git commit -m "docs(repo): add CONTRIBUTING with tiered contribution process"
```

---

## Task 5: Issue templates

**Files:**

- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/ISSUE_TEMPLATE/data-correction.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`

**Purpose:** Form-based templates so issue filers provide structured info. GitHub renders these as actual forms, not free-text.

- [ ] **Step 1: Create `.github/ISSUE_TEMPLATE/bug.yml`**

```yaml
name: Bug report
description: Something is broken, wrong, or behaving unexpectedly.
title: "bug: "
labels: ["bug", "needs-triage"]
body:
  - type: textarea
    id: summary
    attributes:
      label: What happened?
      description: One or two sentences. What did you see?
      placeholder: "I opened /builder, picked an M4A1, and the recoil value didn't update when I added a stock."
    validations:
      required: true

  - type: textarea
    id: reproduce
    attributes:
      label: Steps to reproduce
      description: Numbered, minimal, exact.
      placeholder: |
        1. Go to /builder
        2. Pick M4A1
        3. Add Magpul CTR stock
        4. Look at the recoil stat
    validations:
      required: true

  - type: input
    id: expected
    attributes:
      label: Expected behavior
      placeholder: "Recoil should drop."
    validations:
      required: true

  - type: input
    id: actual
    attributes:
      label: Actual behavior
      placeholder: "Recoil stayed the same."
    validations:
      required: true

  - type: input
    id: share_url
    attributes:
      label: Share URL (if the bug involves a specific build)
      description: Paste the /builder/:id or similar URL.

  - type: dropdown
    id: browser
    attributes:
      label: Browser
      options:
        - Chrome / Chromium / Edge
        - Firefox
        - Safari
        - Mobile browser
        - Other / not browser-specific
    validations:
      required: true

  - type: input
    id: os
    attributes:
      label: OS
      placeholder: "Windows 11, macOS 14, Arch Linux, …"

  - type: textarea
    id: extra
    attributes:
      label: Anything else?
      description: Console errors, screenshots, suspicions about the cause, etc.
```

- [ ] **Step 2: Create `.github/ISSUE_TEMPLATE/feature.yml`**

```yaml
name: Feature request
description: Something you'd like the tool to do that it doesn't do yet.
title: "feat: "
labels: ["enhancement", "needs-triage"]
body:
  - type: textarea
    id: problem
    attributes:
      label: What problem are you trying to solve?
      description: Lead with the problem, not the solution. "I can't figure out X" is better than "add button Y."
    validations:
      required: true

  - type: textarea
    id: proposal
    attributes:
      label: Proposed behavior
      description: If you have an idea for how it should work, describe it. If not, skip this.

  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives you've considered
      description: Other ways to address the same problem, and why they're worse (or better) than your proposal.

  - type: dropdown
    id: scope
    attributes:
      label: Change size (your best guess)
      options:
        - Small — tweak to an existing screen
        - Medium — new feature on an existing route
        - Large — new route or architectural change
        - Not sure
    validations:
      required: true

  - type: textarea
    id: context
    attributes:
      label: Anything else?
      description: Screenshots, links to other tools doing this well, EFT patch notes that motivated it, etc.
```

- [ ] **Step 3: Create `.github/ISSUE_TEMPLATE/data-correction.yml`**

```yaml
name: Game data correction
description: A weapon / ammo / armor / trader stat is wrong or missing.
title: "data: "
labels: ["data", "needs-triage"]
body:
  - type: markdown
    attributes:
      value: |
        ⚠️ **Important:** Most game data here comes from [`api.tarkov.dev`](https://api.tarkov.dev), maintained by [the-hideout](https://github.com/the-hideout). If the data is wrong there, it's wrong here — **please report data issues upstream** at [the-hideout/tarkov-data](https://github.com/the-hideout/tarkov-data) or [tarkov-dev/tarkov-dev](https://github.com/tarkov-dev/tarkov-dev).

        This issue type is for:

        - Data that's correct upstream but displayed wrong here (our bug)
        - Ballistics math results that don't match expected behavior (our bug)
        - Data that we generate or derive ourselves (mod-compatibility rules, slot trees)

  - type: dropdown
    id: kind
    attributes:
      label: What kind of data is wrong?
      options:
        - Weapon stat
        - Ammo stat
        - Armor stat
        - Trader unlock / barter / craft
        - Mod compatibility (slot tree)
        - Ballistics calculation result
        - Other / not sure
    validations:
      required: true

  - type: input
    id: item
    attributes:
      label: Which item?
      placeholder: "M4A1 / 5.56x45 M995 / 6B43 / …"
    validations:
      required: true

  - type: textarea
    id: wrong
    attributes:
      label: What's wrong?
      placeholder: "Penetration value shows 45, should be 53 per the in-game tooltip."
    validations:
      required: true

  - type: textarea
    id: source
    attributes:
      label: Source of the correction
      description: Screenshot, wiki link, patch notes, tarkov.dev link.
    validations:
      required: true
```

- [ ] **Step 4: Create `.github/ISSUE_TEMPLATE/config.yml`**

```yaml
blank_issues_enabled: false
contact_links: []
```

- [ ] **Step 5: Validate YAML**

```bash
# Quick syntax check — yq reads YAML and will fail on malformed input.
for f in .github/ISSUE_TEMPLATE/*.yml; do
  echo "==> $f"
  pnpm exec prettier --check "$f" || true
done
```

If prettier rewrites anything, accept the changes (`pnpm prettier --write .github/ISSUE_TEMPLATE/`).

- [ ] **Step 6: Commit**

```bash
git add .github/ISSUE_TEMPLATE/
git commit -m "docs(repo): add issue templates (bug, feature, data correction)"
```

---

## Task 6: PR template

**Files:**

- Create: `.github/PULL_REQUEST_TEMPLATE.md`

- [ ] **Step 1: Create the template**

```markdown
## Summary

<!-- One or two sentences. What does this PR do, and why? -->

## Change type

<!-- Check all that apply. -->

- [ ] Bug fix (`fix:`)
- [ ] New feature (`feat:`)
- [ ] Docs (`docs:`)
- [ ] Refactor (`refactor:`) — no behavior change
- [ ] Chore / build / CI (`chore:` / `build:` / `ci:`)
- [ ] Other

## Linked issue

<!-- `Closes #123` / `Part of #456` / `(no linked issue — trivial change)` -->

## Test plan

<!-- How did you verify this works? Check all that apply, and add notes. -->

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (Vitest)
- [ ] `pnpm --filter @tarkov/web test:e2e` passes (Playwright) — required for any UI-visible change
- [ ] New route → added to `apps/web/e2e/smoke.spec.ts`
- [ ] Manual check in browser — _what you tried and what happened_

## Screenshots / recordings (for UI changes)

<!-- Before / after, or just after if this is net-new UI. -->

## Notes for reviewers

<!-- Anything non-obvious. Known limitations. Follow-up work you're punting on. -->
```

- [ ] **Step 2: Commit**

```bash
pnpm prettier --write .github/PULL_REQUEST_TEMPLATE.md
git add .github/PULL_REQUEST_TEMPLATE.md
git commit -m "docs(repo): add pull request template"
```

---

## Task 7: Labels definition

**Files:**

- Create: `.github/labels.yml`

**Purpose:** Source-of-truth list. Applied to the live repo via `gh label create` manually after merge — no sync action at this stage.

- [ ] **Step 1: Create `.github/labels.yml`**

```yaml
# Source-of-truth label definitions for the TarkovGunsmith repo.
# Apply manually after changes:
#
#   while IFS= read -r line; do ... end; read labels from YAML and `gh label create`
#
# or run the one-liner in CONTRIBUTING's "maintainer notes" section (future).
# There is no automated sync at this stage.

- name: good first issue
  description: Approachable tasks for new contributors.
  color: "7057ff"
- name: help wanted
  description: The maintainer would especially welcome help here.
  color: "008672"
- name: bug
  description: Something is broken, wrong, or behaving unexpectedly.
  color: "d73a4a"
- name: enhancement
  description: New feature or improvement.
  color: "a2eeef"
- name: docs
  description: Documentation-only change.
  color: "0075ca"
- name: data
  description: Game data correction or schema.
  color: "fbca04"
- name: ballistics
  description: Penetration, damage, or related math.
  color: "b60205"
- name: ui
  description: Visual / interaction / copy.
  color: "c5def5"
- name: needs-triage
  description: New issue, awaiting maintainer review.
  color: "ededed"
- name: needs-repro
  description: Maintainer needs a reproduction to proceed.
  color: "ededed"
```

- [ ] **Step 2: Commit**

```bash
pnpm prettier --write .github/labels.yml
git add .github/labels.yml
git commit -m "docs(repo): add labels.yml as source-of-truth label definitions"
```

---

## Task 8: `docs/README.md` audience router

**Files:**

- Create: `docs/README.md`

- [ ] **Step 1: Create the router**

```markdown
# TarkovGunsmith docs

Where to go depending on what you're trying to do.

## I'm a user

- **[Try the live app →]({LIVE_URL})** — the fastest way to understand what this project does.
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
```

**Substitutions before committing:** replace `{LIVE_URL}` with `https://tarkov-gunsmith-web.pages.dev` (same as Task 3).

- [ ] **Step 2: Commit**

```bash
pnpm prettier --write docs/README.md
git add docs/README.md
git commit -m "docs(repo): add docs README as audience router"
```

---

## Task 9: Per-folder intro paragraphs

**Files:**

- Create: `docs/adr/README.md`
- Create: `docs/ai-workflow/README.md`
- Create: `docs/operations/README.md`
- Create: `docs/plans/README.md`
- Create: `docs/superpowers/README.md`

**Purpose:** Each subfolder gets a one-paragraph intro so a visitor lands on a README, not a raw file listing.

- [ ] **Step 1: `docs/adr/README.md`**

```markdown
# Architecture Decision Records

Each ADR captures a significant, hard-to-reverse decision about how the project is built — the choice made, the alternatives considered, and the reasoning. Numbered sequentially (`NNNN-short-name.md`), immutable once merged (follow-up decisions get a new ADR that supersedes or refines the old one, rather than rewriting history).

Start at [`0001-stack-and-hosting.md`](./0001-stack-and-hosting.md) for why this project runs on Cloudflare with a pnpm + Turborepo monorepo.
```

- [ ] **Step 2: `docs/ai-workflow/README.md`**

```markdown
# AI workflow

This project is developed collaboratively with [Claude](https://claude.ai/code) using a tiered workflow. The tier governs how strict the process is and which tooling is in play.

- [`tier-b.md`](./tier-b.md) — the current tier. Spec → plan → TDD → code review → PR → merge, with each stage documented and committed.
- [`tier-c-upgrade.md`](./tier-c-upgrade.md) — the upgrade path: subagent-driven execution, worktree isolation, automated review subagents, deeper tooling integration.

The maintainer handbook for day-to-day working practices is [`../../CLAUDE.md`](../../CLAUDE.md). Contributors are **not required** to adopt this workflow — see [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) for the contribution bar.
```

- [ ] **Step 3: `docs/operations/README.md`**

```markdown
# Operations runbooks

Runbooks for running and deploying this project.

- [`local-development.md`](./local-development.md) — fresh-clone setup, env files, `pnpm dev` for the full stack, seeding demo builds.
- [`cloudflare-deploys.md`](./cloudflare-deploys.md) — deploy pipeline (release-please → GitHub Actions → Cloudflare), token permissions, rotation, one-time setup.

Additional runbooks (rollback, custom domain, multi-environment) get added here as they become necessary.
```

- [ ] **Step 4: `docs/plans/README.md`**

```markdown
# Implementation plan archive

Every feature that goes through the full workflow produces an implementation plan in this folder, named `YYYY-MM-DD-<feature-slug>-plan.md`. Plans break a spec into bite-sized TDD tasks, exact file paths, and exact commands. They exist for two reasons:

1. **Executability.** A subagent or a returning contributor can pick a plan up and make forward progress without rebuilding context from scratch.
2. **Archive.** Once a plan is executed, it stays here as a record of what was actually done and in what order. Plans are not re-edited to match the final code — use `git blame` and the PR history for that.

Plans are _not_ the source of truth for how the code works today — they're snapshots of how a specific change was sequenced.
```

- [ ] **Step 5: `docs/superpowers/README.md`**

```markdown
# Superpowers workflow artifacts

Design artifacts produced by the AI-assisted workflow (named "superpowers" after the [Anthropic `superpowers` skill collection](https://github.com/anthropics/claude-code) the maintainer uses during development).

- [`specs/`](./specs) — design specs. Every feature in this project started as a spec here before any code was written. Each spec is dated (`YYYY-MM-DD-<topic>-design.md`) and immutable once approved; material changes produce a follow-up spec rather than a rewrite.

**Under review:** the `specs/` folder currently holds both feature-level design docs _and_ the top-level system design doc ([`2026-04-18-tarkov-gunsmith-rebuild-design.md`](./specs/2026-04-18-tarkov-gunsmith-rebuild-design.md)). Whether to extract or reframe the latter as a first-class architecture doc outside this methodology-named folder is tracked as a follow-up — see the [public-repo prep spec](./specs/2026-04-22-public-repo-documentation-and-licensing-design.md).
```

- [ ] **Step 6: Verify all intros render**

```bash
ls docs/*/README.md
```

Expected: `docs/adr/README.md`, `docs/ai-workflow/README.md`, `docs/operations/README.md`, `docs/plans/README.md`, `docs/superpowers/README.md` all present.

- [ ] **Step 7: Commit**

```bash
pnpm prettier --write docs/
git add docs/adr/README.md docs/ai-workflow/README.md docs/operations/README.md docs/plans/README.md docs/superpowers/README.md
git commit -m "docs(repo): add per-folder intro READMEs under docs/"
```

---

## Task 10: `CLAUDE.md` maintainer-handbook banner

**Files:**

- Modify: `CLAUDE.md` (prepend banner)

- [ ] **Step 1: Prepend the banner**

Use Edit to insert the following block at the very top of the file, before the current first line (`# TarkovGunsmith`):

```markdown
> **For external contributors:** This file is the maintainer handbook for working on this repo with Claude. You are **not required** to adopt the spec → plan → TDD → review workflow described here to submit a PR. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the contributor bar and [`docs/ai-workflow/`](./docs/ai-workflow/) for methodology detail.

---
```

The `---` below the blockquote creates a visible horizontal rule separating the banner from the existing first-line `# TarkovGunsmith` heading.

- [ ] **Step 2: Verify file still reads correctly**

```bash
head -20 CLAUDE.md
```

Expected: banner, horizontal rule, then the existing `# TarkovGunsmith` heading and content unchanged.

- [ ] **Step 3: Commit**

```bash
pnpm prettier --write CLAUDE.md
git add CLAUDE.md
git commit -m "docs(repo): reframe CLAUDE.md as maintainer handbook (banner)"
```

---

## Task 11: Cold-read verification pass

**Files:**

- None (verification only; findings posted to PR thread)

**Purpose:** Spec §7 gate. Before opening the PR (or before flipping visibility post-merge, depending on timing), run a fresh-context read of the public-facing surface and confirm no dead ends.

- [ ] **Step 1: Dispatch an Explore subagent with cold context**

Use the `Explore` subagent. Prompt verbatim:

> You're simulating a first-time visitor to this repo. You have never read this codebase before. You are considering contributing a small bug fix. Read only the public-facing files in the following order: `README.md`, `CONTRIBUTING.md`, `docs/README.md`, `ACKNOWLEDGMENTS.md`, and skim any `.github/ISSUE_TEMPLATE/*.yml` files. Do NOT read `CLAUDE.md`, `docs/superpowers/`, `docs/plans/`, `docs/ai-workflow/`, or any file under `.claude/` or `.superpowers/` — those represent maintainer-only context you're pretending you don't have.
>
> Answer these questions:
>
> 1. In one sentence, what is this project?
> 2. Where do I try it? (Is the link present and does the path look live?)
> 3. How would I run it locally? (Is the quick-start actionable with no gaps?)
> 4. If I found a typo, what's the exact next action I'd take?
> 5. If I wanted to report that a penetration value is wrong, what's the exact next action?
> 6. Are there any broken links in the files you read? (Check by attempting to open each relative link.)
> 7. Are there any "internal jargon" references that didn't make sense without insider knowledge? (Things like "Tier B", "M3.5 Arc", "superpowers", "Field Ledger", etc., with no context.)
>
> Report as a short bulleted list. Be blunt about gaps.

- [ ] **Step 2: Act on findings**

Any "hard no" (broken link, missing live URL, unanswerable "how do I do X") blocks the PR. Fix inline, re-run the verification. "Soft" findings (jargon that could be clearer, a section that could be tighter) are either fixed now or recorded as follow-ups in the PR description.

- [ ] **Step 3: No commit required unless findings triggered fixes**

If fixes were made, commit them grouped by the task they relate to, matching the commit style used in that task.

---

## Task 12: Open the PR

**Files:**

- None (push + `gh pr create`)

- [ ] **Step 1: Run the full local gate before pushing**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

All four must pass. Fix and re-commit (on the same branch) before continuing — CI runs the same gate and will block merge otherwise.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin docs/public-repo-prep
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "docs(repo): prep repo for public visibility" --body "$(cat <<'EOF'
## Summary

Public-repo prep pass: new README, contribution infrastructure (`CONTRIBUTING.md` + issue & PR templates + labels), docs audience router, targeted licensing audit + `ACKNOWLEDGMENTS.md`, and a maintainer-handbook banner on `CLAUDE.md`.

Spec: [`docs/superpowers/specs/2026-04-22-public-repo-documentation-and-licensing-design.md`](docs/superpowers/specs/2026-04-22-public-repo-documentation-and-licensing-design.md).
Plan: [`docs/plans/2026-04-22-public-repo-prep-plan.md`](docs/plans/2026-04-22-public-repo-prep-plan.md).

**Deliberately NOT in this PR:** `CODE_OF_CONDUCT.md`, `SECURITY.md`, automated license-check CI, CLA, social preview image. See spec "Non-goals" and "Follow-up items."

## Change type

- [x] Docs

## Test plan

- [x] Cold-read verification pass run (see Task 11); findings resolved.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` green locally.
- [x] Every relative link in `README.md`, `CONTRIBUTING.md`, `docs/README.md`, and `ACKNOWLEDGMENTS.md` manually resolved.
- [x] Hero screenshot renders at GitHub's README width.

## Post-merge checklist (not part of this PR)

- [ ] Apply labels: `gh label create` from `.github/labels.yml`.
- [ ] Set repo description, website URL, topics via `gh repo edit`.
- [ ] Confirm branch protection still correct for public repo.
- [ ] Flip repo visibility to public.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Watch CI and merge**

```bash
gh pr checks --watch
# When green:
gh pr merge --squash --delete-branch
```

Per branch protection, CI must pass before merge. Per user preference, autonomous merge is approved for arcs with approved spec + plan.

---

## Post-merge operations (not plan tasks — runbook)

After the PR merges, the remaining work is one-time operational steps run against the live repo. These are **not** part of the PR itself.

### A. Apply labels

```bash
# From repo root on main after pull:
python3 - <<'PY'
import yaml, subprocess, sys
with open(".github/labels.yml") as f:
    labels = yaml.safe_load(f)
for l in labels:
    subprocess.run([
        "gh", "label", "create", l["name"],
        "--description", l.get("description", ""),
        "--color", l["color"],
        "--force",  # update if exists
    ], check=True)
PY
```

(If Python isn't convenient, use the GitHub web UI — 10 labels is not much. Or: `gh label list` to see what's there, then `gh label create NAME --color HEX --description DESC` for each missing one.)

### B. Apply repo metadata

```bash
gh repo edit \
  --description "Ballistics calculator, weapon builder, and ammo-vs-armor analysis for Escape from Tarkov. Cloudflare-hosted, AI-first open source." \
  --homepage "https://tarkov-gunsmith-web.pages.dev" \
  --add-topic escape-from-tarkov \
  --add-topic tarkov \
  --add-topic ballistics \
  --add-topic react \
  --add-topic typescript \
  --add-topic cloudflare-workers \
  --add-topic cloudflare-pages \
  --add-topic vite \
  --add-topic ai-assisted-development
```

### C. Confirm branch protection

```bash
gh api repos/UnderMyBed/TarkovGunsmith/branches/main/protection --jq '{required_status_checks, enforce_admins, required_pull_request_reviews}'
```

Expected: required status checks includes the CI workflow; PR reviews required; no force-push. Adjust via `gh api --method PUT ... /branches/main/protection` or the web UI if anything looks wrong.

### D. Visibility flip (user action)

Manual, user-triggered. Via `gh repo edit --visibility public` or the web UI (Settings → Danger Zone → Change visibility → Make public). Confirm once more that `ACKNOWLEDGMENTS.md` has no unresolved audit findings and that the live URL in README works.

---

## Follow-up tickets (tracked outside this plan, per spec §"Follow-up items")

- Evaluate extracting or reframing `docs/superpowers/specs/` as first-class architecture docs.
- Trim `CLAUDE.md` status / milestone preamble if it drifts from reality.
- Branded OG / social preview image (pairs with M3 Differentiator OG-cards work).
- Automated license-check CI (escalation path).
- `CODE_OF_CONDUCT.md` and `SECURITY.md` — revisit only if community or vulnerability-reporting pressure makes them load-bearing.
- CLA — revisit only if a legal concern emerges.
