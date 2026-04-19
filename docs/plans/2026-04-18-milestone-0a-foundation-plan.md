# Milestone 0a — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the empty monorepo skeleton, the AI-collaboration workflow (Tier B), and a green CI pipeline — so that subsequent plans (0b Workers, 0c Web app, 0d Data/Math packages) can land any code into a fully-wired environment.

**Architecture:** pnpm workspaces + Turborepo monorepo. Strict TypeScript everywhere. Vitest as the shared test runner. ESLint flat config + Prettier + Husky + commitlint enforce style and conventional commits. `.claude/` directory holds project-scoped settings, skills, and subagents. GitHub Actions runs typecheck + lint + format + tests on every push and PR.

**Tech Stack:** pnpm 10, Node 22 LTS, TypeScript 5.7, Turborepo 2, ESLint 9 (flat), Prettier 3, Vitest 2, Husky 9, lint-staged 15, commitlint 19, GitHub Actions.

---

## File map (what exists at the end of this plan)

```
TarkovGunsmith/
├── .claude/
│   ├── agents/
│   │   ├── tarkov-api-explorer.md
│   │   └── ballistics-verifier.md
│   ├── commands/                 (empty, reserved)
│   ├── skills/
│   │   ├── add-data-query.md
│   │   ├── add-calc-function.md
│   │   ├── add-feature-route.md
│   │   ├── verify-data-shape.md
│   │   └── update-tarkov-schema.md
│   └── settings.json
├── .github/
│   └── workflows/
│       └── ci.yml
├── .husky/
│   ├── pre-commit
│   └── commit-msg
├── docs/                          (already exists from spec phase)
├── .editorconfig
├── .gitignore
├── .node-version
├── .nvmrc
├── .prettierignore
├── .prettierrc.json
├── CLAUDE.md                      (already exists, updated in last task)
├── LICENSE
├── README.md
├── commitlint.config.js
├── eslint.config.js
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
├── turbo.json
└── vitest.config.ts
```

No `apps/*` or `packages/*` directories yet — those land in 0b/0c/0d.

---

## Task 0: Verify prerequisites

**Files:** none

- [ ] **Step 1: Verify Node 22 is installed**

```bash
node --version
```

Expected: `v22.x.x`. If not, install via `nvm install 22` or your version manager.

- [ ] **Step 2: Verify pnpm 10 is available**

```bash
pnpm --version
```

Expected: `10.x.x`. If not, `npm i -g pnpm@10` or `corepack enable && corepack prepare pnpm@latest --activate`.

- [ ] **Step 3: Verify gh CLI is authenticated**

```bash
gh auth status
```

Expected: logged in as `UnderMyBed`. If not: `gh auth login`.

---

## Task 1: Add `.gitignore`, `.editorconfig`, `.nvmrc`, `.node-version`

**Files:**

- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.nvmrc`
- Create: `.node-version`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
# deps
node_modules/
.pnpm-store/

# build outputs
dist/
build/
.turbo/
*.tsbuildinfo

# env
.env
.env.local
.env.*.local

# logs
*.log
npm-debug.log*
pnpm-debug.log*

# editor
.vscode/*
!.vscode/extensions.json
.idea/

# test
coverage/
.nyc_output/

# OS
.DS_Store
Thumbs.db

# wrangler / cloudflare
.wrangler/
.dev.vars
```

- [ ] **Step 2: Create `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 3: Create `.nvmrc` and `.node-version`**

Both files contain only:

```
22
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore .editorconfig .nvmrc .node-version
git commit -m "chore: add base ignore and editor config"
```

---

## Task 2: Initialize pnpm workspace + root `package.json`

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `README.md`
- Create: `LICENSE`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "tarkov-gunsmith",
  "version": "0.0.0",
  "private": true,
  "description": "AI-first rebuild of TarkovGunsmith — a community tool for Escape from Tarkov ballistics, weapon builds, and ammo-vs-armor analysis.",
  "license": "MIT",
  "engines": {
    "node": ">=22",
    "pnpm": ">=10"
  },
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "prepare": "husky"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create `README.md`**

````markdown
# TarkovGunsmith

AI-first rebuild of [TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith) — a community tool for Escape from Tarkov ballistics, weapon builds, and ammo-vs-armor analysis.

## Status

Foundation milestone. See [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) for the full design and [`CLAUDE.md`](CLAUDE.md) for how the project is developed.

## Quick start

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```
````

## License

MIT

```

- [ ] **Step 4: Create `LICENSE` (MIT)**

```

MIT License

Copyright (c) 2026 Matt Shipman

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

````

- [ ] **Step 5: Verify pnpm install works**

```bash
pnpm install
````

Expected: creates `node_modules/`, no errors. (No deps yet, so it's basically a no-op but verifies workspace is parsed.)

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml README.md LICENSE pnpm-lock.yaml
git commit -m "chore: initialize pnpm workspace"
```

---

## Task 3: Add Turborepo

**Files:**

- Modify: `package.json` (already references turbo scripts)
- Create: `turbo.json`

- [ ] **Step 1: Install Turborepo**

```bash
pnpm add -Dw turbo
```

- [ ] **Step 2: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "stream",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "build/**", ".wrangler/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": ["*.tsbuildinfo"]
    },
    "lint": {
      "outputs": []
    }
  }
}
```

- [ ] **Step 3: Verify turbo runs (no tasks to run yet, but the config parses)**

```bash
pnpm turbo run typecheck
```

Expected: "No tasks were executed as part of this run." Exit 0.

- [ ] **Step 4: Commit**

```bash
git add turbo.json package.json pnpm-lock.yaml
git commit -m "chore: add turborepo"
```

---

## Task 4: Root TypeScript config

**Files:**

- Create: `tsconfig.base.json`
- Create: `tsconfig.json`

- [ ] **Step 1: Install TypeScript and Node types**

```bash
pnpm add -Dw typescript @types/node
```

- [ ] **Step 2: Create `tsconfig.base.json`** (extended by every package later)

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "incremental": true
  },
  "exclude": ["node_modules", "dist", "build", ".turbo", "**/*.test.ts", "**/*.spec.ts"]
}
```

- [ ] **Step 3: Create root `tsconfig.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["*.ts", ".*.ts"],
  "files": []
}
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.base.json tsconfig.json package.json pnpm-lock.yaml
git commit -m "chore: add base typescript config"
```

---

## Task 5: ESLint (flat config)

**Files:**

- Create: `eslint.config.js`

- [ ] **Step 1: Install ESLint and plugins**

```bash
pnpm add -Dw eslint @eslint/js typescript-eslint eslint-config-prettier globals
```

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.turbo/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "**/node_modules/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
);
```

- [ ] **Step 3: Verify ESLint runs (no source files yet, so no errors)**

```bash
pnpm exec eslint . --max-warnings 0
```

Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js package.json pnpm-lock.yaml
git commit -m "chore: add eslint flat config with type-checked rules"
```

---

## Task 6: Prettier

**Files:**

- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: Install Prettier**

```bash
pnpm add -Dw prettier
```

- [ ] **Step 2: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
node_modules
dist
build
.turbo
.wrangler
coverage
pnpm-lock.yaml
```

- [ ] **Step 4: Verify Prettier check passes**

```bash
pnpm exec prettier --check .
```

Expected: exit 0. If any existing files (e.g., `CLAUDE.md`, the spec) fail formatting, run `pnpm exec prettier --write .` and review the diff before committing.

- [ ] **Step 5: Commit**

```bash
git add .prettierrc.json .prettierignore package.json pnpm-lock.yaml
git commit -m "chore: add prettier config"
```

---

## Task 7: Husky + lint-staged + commitlint (Conventional Commits enforcement)

**Files:**

- Create: `commitlint.config.js`
- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`
- Modify: `package.json` (add `lint-staged` config)

- [ ] **Step 1: Install Husky, lint-staged, commitlint**

```bash
pnpm add -Dw husky lint-staged @commitlint/cli @commitlint/config-conventional
```

- [ ] **Step 2: Initialize Husky**

```bash
pnpm exec husky init
```

This creates `.husky/pre-commit` with a default `pnpm test` line.

- [ ] **Step 3: Replace `.husky/pre-commit` content**

```sh
pnpm exec lint-staged
```

- [ ] **Step 4: Create `.husky/commit-msg`**

```sh
pnpm exec commitlint --edit "$1"
```

Make it executable:

```bash
chmod +x .husky/commit-msg
```

- [ ] **Step 5: Create `commitlint.config.js`**

```js
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "chore",
        "docs",
        "refactor",
        "test",
        "ci",
        "build",
        "perf",
        "style",
        "revert",
      ],
    ],
    "subject-case": [0],
  },
};
```

- [ ] **Step 6: Add `lint-staged` config to `package.json`**

Add to `package.json` (after `"scripts"` block):

```json
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml,css}": ["prettier --write"]
  }
```

- [ ] **Step 7: Verify hooks fire — try a bad commit message**

```bash
git commit --allow-empty -m "bad commit message no type" 2>&1 | head -20
```

Expected: commitlint rejects with `subject may not be empty` or `type may not be empty`.

- [ ] **Step 8: Commit (use a valid conventional message)**

```bash
git add .husky commitlint.config.js package.json pnpm-lock.yaml
git commit -m "chore: enforce conventional commits and pre-commit lint"
```

---

## Task 8: Vitest base setup

**Files:**

- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest**

```bash
pnpm add -Dw vitest @vitest/coverage-v8
```

- [ ] **Step 2: Create `vitest.config.ts`** (root config — packages can extend later)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: ["**/dist/**", "**/build/**", "**/*.config.*", "**/.wrangler/**"],
    },
  },
});
```

- [ ] **Step 3: Verify Vitest runs (no tests yet)**

```bash
pnpm exec vitest run
```

Expected: "No test files found." Exit 0 (or non-zero in some Vitest versions — that's fine for now since there genuinely are no tests; we just verify the binary works).

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml
git commit -m "chore: add vitest base config"
```

---

## Task 9: GitHub Actions CI

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    name: Typecheck • Lint • Format • Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Format check
        run: pnpm format:check

      - name: Test
        run: pnpm test
```

- [ ] **Step 2: Verify YAML is valid**

```bash
pnpm dlx @action-validator/cli .github/workflows/ci.yml || echo "validator unavailable, skipping"
```

Expected: no errors. (If validator unavailable, that's OK — GitHub will validate on push.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add typecheck, lint, format, and test pipeline"
```

---

## Task 10: `.claude/settings.json`

**Files:**

- Create: `.claude/settings.json`

- [ ] **Step 1: Create the settings file**

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(pnpm install)",
      "Bash(pnpm install:*)",
      "Bash(pnpm typecheck)",
      "Bash(pnpm typecheck:*)",
      "Bash(pnpm lint)",
      "Bash(pnpm lint:*)",
      "Bash(pnpm test)",
      "Bash(pnpm test:*)",
      "Bash(pnpm format)",
      "Bash(pnpm format:*)",
      "Bash(pnpm exec vitest:*)",
      "Bash(pnpm exec eslint:*)",
      "Bash(pnpm exec prettier:*)",
      "Bash(pnpm exec tsc:*)",
      "Bash(pnpm exec graphql-codegen:*)",
      "Bash(pnpm dlx:*)",
      "Bash(pnpm --filter:*)",
      "Bash(pnpm turbo:*)",
      "Bash(wrangler dev:*)",
      "Bash(wrangler deploy:*)",
      "Bash(wrangler tail:*)",
      "Bash(wrangler kv:*)",
      "Bash(wrangler types:*)",
      "Bash(gh repo:*)",
      "Bash(gh pr:*)",
      "Bash(gh issue:*)",
      "Bash(gh api:*)",
      "Bash(gh workflow:*)",
      "Bash(gh run:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git show:*)",
      "Bash(git branch:*)",
      "Bash(git switch:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git push)",
      "Bash(git push origin:*)"
    ],
    "deny": ["Bash(git push --force:*)", "Bash(git reset --hard:*)", "Bash(rm -rf:*)"]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "if echo \"$CLAUDE_TOOL_INPUT_FILE_PATH\" | grep -qE '\\.(ts|tsx)$'; then pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -50 || true; fi"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add .claude/settings.json
git commit -m "chore(ai): add claude code settings — allowlist, hooks"
```

---

## Task 11: Project skill — `add-data-query`

**Files:**

- Create: `.claude/skills/add-data-query.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: add-data-query
description: Use when adding a new GraphQL query against tarkov-api. Scaffolds the query file in packages/tarkov-data, generates types via packages/tarkov-types codegen, creates a typed TanStack Query hook, and stubs an MSW mock + a Vitest test using a recorded fixture.
---

# add-data-query

## When to use

Any time the SPA needs data from `api.tarkov.dev` that isn't already exposed by an existing hook in `packages/tarkov-data/src/hooks/`.

## What it does

1. Asks: "What's the query name (camelCase) and the GraphQL operation?"
2. Writes the `.graphql` file to `packages/tarkov-data/src/queries/<name>.graphql`.
3. Runs `pnpm --filter @tarkov/types codegen` to regenerate types.
4. Writes the hook to `packages/tarkov-data/src/hooks/use<Name>.ts` using TanStack Query + the generated types.
5. Records a fixture by calling tarkov-api once via the dev proxy and saves it to `packages/tarkov-data/src/__fixtures__/<name>.json`.
6. Writes an MSW handler in `packages/tarkov-data/src/__mocks__/handlers.ts`.
7. Writes a Vitest test that asserts the hook returns the fixture-shaped data.

## What it requires

- The query name (e.g. `ammoList`).
- The GraphQL operation body.
- Confirmation that the operation parses against the current tarkov-api schema (the codegen step will fail loudly otherwise).

## Conventions

- Hook names: `useAmmoList`, `useArmorList`, `useWeapon` — camelCase, prefixed `use`.
- Fixture file names match the query name.
- Every query MUST have a recorded fixture — never test against the live API in CI.

## Out of scope

- Modifying `data-proxy` cache rules. Use `add-cache-rule` (future) for that.
- UI components that consume the hook. Those are scaffolded by `add-feature-route`.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/add-data-query.md
git commit -m "chore(ai): add add-data-query project skill"
```

---

## Task 12: Project skill — `add-calc-function`

**Files:**

- Create: `.claude/skills/add-calc-function.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: add-calc-function
description: Use when adding a new ballistic or armor calculation to packages/ballistics. Enforces TDD — writes the failing test first against curated fixtures (cross-checked vs. original C# WishGranter outputs where available), then the minimal implementation. No game data is hardcoded; all inputs are typed args.
---

# add-calc-function

## When to use

Adding any pure-math function to `packages/ballistics/src/` — penetration, damage falloff, armor degradation, weapon-spec aggregation, etc.

## What it does (in order)

1. Asks: "What is the function name, signature, and one-paragraph description?"
2. Writes `packages/ballistics/src/<area>/<name>.test.ts` with at least 3 fixture cases:
   - One nominal case (typical input)
   - One edge case (zero, max, boundary)
   - One regression case cross-checked against the original C# `WishGranter` output (if available — otherwise marked `// SOURCE: in-game wiki [link]`)
3. Runs the test, confirms it fails for the right reason ("function not defined" or "module not found").
4. Writes the minimal implementation in `packages/ballistics/src/<area>/<name>.ts`.
5. Re-runs the test, confirms green.
6. Adds an export to `packages/ballistics/src/index.ts`.
7. Commits as `feat(ballistics): add <name>`.

## Hard rules

- No game data hardcoded inside the function. All ammo/armor stats are arguments.
- All numeric outputs must be deterministic given inputs (no `Math.random()` — pass an RNG if needed).
- Every function MUST have a JSDoc block with one example.
- Coverage target: 100% lines.

## Out of scope

- React components that render the result. Those use `add-feature-route`.
- Caching or memoization. The functions are pure; callers memoize via TanStack Query or `useMemo`.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/add-calc-function.md
git commit -m "chore(ai): add add-calc-function project skill"
```

---

## Task 13: Project skill — `add-feature-route`

**Files:**

- Create: `.claude/skills/add-feature-route.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: add-feature-route
description: Use when adding a new top-level route to apps/web (e.g. /calc, /matrix, /builder). Scaffolds the route file using TanStack Router file-based conventions, the page component, a loading/error boundary, a Vitest component test, and a Playwright e2e smoke test.
---

# add-feature-route

## When to use

Adding any new URL-addressable page to `apps/web`.

## What it does

1. Asks: "What is the route path, page name, and one-line description?"
2. Creates the route file: `apps/web/src/routes/<path>.tsx` (TanStack Router file-based — nested paths use directories).
3. Creates the page component: `apps/web/src/features/<name>/<Name>Page.tsx`.
4. Adds a loading state and an error boundary inside the route file.
5. Creates the Vitest component test: `apps/web/src/features/<name>/<Name>Page.test.tsx` — renders the page with mocked TanStack Query data, asserts the title and at least one interactive element.
6. Creates the Playwright e2e: `apps/web/e2e/<name>.spec.ts` — navigates to the route, asserts the page loads + key elements visible.
7. Updates `apps/web/CLAUDE.md` to mention the new route.

## Conventions

- One feature folder per route under `apps/web/src/features/<name>/`.
- Route files are thin: data loading + error/loading + render the feature component.
- Feature components contain the actual UI logic. shadcn primitives from `@tarkov/ui`.
- Forms use shadcn `Form` + Zod resolver.
- Data: TanStack Query hooks from `@tarkov/data`. Never call the GraphQL endpoint directly.

## Out of scope

- New data queries. Use `add-data-query` first if needed.
- Shared UI primitives. Those go in `packages/ui` via a different (future) skill.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/add-feature-route.md
git commit -m "chore(ai): add add-feature-route project skill"
```

---

## Task 14: Project skill — `verify-data-shape`

**Files:**

- Create: `.claude/skills/verify-data-shape.md`

- [ ] **Step 1: Create the skill**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/verify-data-shape.md
git commit -m "chore(ai): add verify-data-shape project skill"
```

---

## Task 15: Project skill — `update-tarkov-schema`

**Files:**

- Create: `.claude/skills/update-tarkov-schema.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: update-tarkov-schema
description: Use when api.tarkov.dev's GraphQL schema has changed and packages/tarkov-types needs to be regenerated. Re-runs codegen, surfaces breaking diffs, and walks through reconciling each broken query.
---

# update-tarkov-schema

## When to use

- The nightly schema-watcher (Tier C) opened a regen PR.
- A query started failing with "Cannot query field X on type Y".
- You want to adopt a newly-added upstream field.

## What it does

1. Runs `pnpm --filter @tarkov/types codegen`.
2. Diffs the generated types vs. the previous version (`git diff packages/tarkov-types/generated`).
3. For each `.graphql` file in `packages/tarkov-data/src/queries/`, runs the GraphQL validator against the new schema.
4. Reports:
   - Newly available fields (informational)
   - Removed fields used by our queries (errors — must fix)
   - Type changes affecting our queries (errors — must fix)
5. For each error, asks: "Drop this field, replace with <suggestion>, or rename to <suggestion>?"
6. Updates the affected `.graphql` files and re-runs codegen.
7. Updates fixtures by re-recording (calling `record-fixture` per query — separate skill, future).
8. Commits as `chore(types): regen tarkov-api schema` + `fix(data): adapt to schema changes`.

## Hard rules

- Never silently accept removed fields by deleting the affected hook. Surface them and decide together.
- Always update fixtures after type changes — stale fixtures hide regressions.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/update-tarkov-schema.md
git commit -m "chore(ai): add update-tarkov-schema project skill"
```

---

## Task 16: Project subagent — `tarkov-api-explorer`

**Files:**

- Create: `.claude/agents/tarkov-api-explorer.md`

- [ ] **Step 1: Create the agent**

```markdown
---
name: tarkov-api-explorer
description: Read-only research agent for api.tarkov.dev. Use when you need to know what fields exist on a type, what queries are available, what shape a response will have, or which existing query already does what you need. Never modifies code.
tools: Read, Grep, Glob, WebFetch, Bash
---

# tarkov-api-explorer

You are a read-only research agent specializing in the [tarkov-api](https://api.tarkov.dev) GraphQL API and its schema. Your job is to answer questions about what data is available, in what shape, and via which query.

## What you have access to

- `packages/tarkov-types/generated/schema.graphql` — the cached schema (refreshed by codegen)
- `packages/tarkov-types/generated/index.ts` — generated TypeScript types
- `packages/tarkov-data/src/queries/*.graphql` — every query the project currently uses
- `packages/tarkov-data/src/hooks/use*.ts` — every hook currently exposed
- The live API at `https://api.tarkov.dev/graphql` (via WebFetch — POST GraphQL queries to inspect live shapes)
- The community schema docs at `https://api.tarkov.dev/___graphql` (introspection UI)

## What you should answer

- "Does query X exist? Where?"
- "What fields are on type Y?"
- "What's the smallest query to get Z?"
- "Are any of our existing hooks already returning what I need?"
- "What's the actual shape of the response for query X with arguments Y?"

## What you must NOT do

- Modify files. You are read-only.
- Run codegen, regenerate types, or change schemas.
- Make recommendations about UI, caching, or anything outside the data layer.

## Output format

Always include:

- A short answer (1–3 sentences).
- The relevant file path and line range, if applicable.
- A minimal GraphQL snippet, if the question is about query shape.
- Any caveats (e.g. "this field is `null` for ~30% of items in current data").
```

- [ ] **Step 2: Commit**

```bash
git add .claude/agents/tarkov-api-explorer.md
git commit -m "chore(ai): add tarkov-api-explorer subagent"
```

---

## Task 17: Project subagent — `ballistics-verifier`

**Files:**

- Create: `.claude/agents/ballistics-verifier.md`

- [ ] **Step 1: Create the agent**

```markdown
---
name: ballistics-verifier
description: Use when reviewing or proposing a change to packages/ballistics. Runs the package's test suite, cross-checks fixture outputs against the original C# WishGranter expectations where present, and reports any numerical drift greater than 0.1%.
tools: Read, Grep, Glob, Bash
---

# ballistics-verifier

You are a verification agent for the `packages/ballistics` math engine. Your job: given a code change in that package, decide whether it preserves correctness against the curated fixture set.

## What you have access to

- `packages/ballistics/src/**` — implementation
- `packages/ballistics/src/__fixtures__/**` — curated cases, some annotated with `// SOURCE: WishGranter <commit>` for cross-check
- The Vitest runner via `pnpm --filter @tarkov/ballistics test`

## Procedure

1. Read the diff (use `git diff main -- packages/ballistics`).
2. Identify which functions changed.
3. Run the full test suite: `pnpm --filter @tarkov/ballistics test`.
4. If any test fails, report: which test, expected vs. actual, and the most likely cause based on the diff.
5. If all tests pass, scan the fixture outputs for any case with `// SOURCE:` annotation that the changed functions touch. For each, recompute and compare against the annotated value.
6. Report:
   - All-green: "✓ Tests pass, fixtures align."
   - Drift > 0.1% on any cross-checked fixture: "⚠ Drift detected: <case> expected <X>, got <Y> (<delta>%)."
   - Test failures: "✗ Failures: <list>."

## What you must NOT do

- Modify code. You verify; you do not fix.
- Suggest features or refactors. Stay narrowly on correctness.
- Skip the cross-check step even if all unit tests pass — that's the whole point.

## Output format
```

[verifier] <result line>
[verifier] tests: <count passing> / <count total>
[verifier] cross-checks: <count aligned> / <count checked>
[verifier] drifted: <list or "none">
[verifier] failures: <list or "none">

```

```

- [ ] **Step 2: Commit**

```bash
git add .claude/agents/ballistics-verifier.md
git commit -m "chore(ai): add ballistics-verifier subagent"
```

---

## Task 18: Update root `CLAUDE.md` to reflect actual state

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the "Status" callout in `CLAUDE.md`**

Find:

```markdown
> **Status:** Pre-implementation. Design approved, no code yet. See [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) for the design spec — it is the source of truth for everything below.
```

Replace with:

```markdown
> **Status:** Foundation in place (Milestone 0a complete). Monorepo, CI, and AI workflow Tier B are wired. No `apps/*` or `packages/*` exist yet — those land in Milestones 0b (Workers), 0c (Web app), and 0d (Data & Math packages). See [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) for the full design.
```

- [ ] **Step 2: Append a "Local development" section just before "Acknowledgements"**

````markdown
## Local development

```bash
pnpm install          # install everything
pnpm typecheck        # tsc across all packages
pnpm lint             # eslint across all packages
pnpm format:check     # prettier check
pnpm test             # vitest across all packages
pnpm format           # auto-format
```
````

Pre-commit (via Husky) runs `lint-staged` on changed files. Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint).

## CI

GitHub Actions runs typecheck, lint, format check, and tests on every push and PR. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## AI tooling installed

- `.claude/settings.json` — permissions allowlist + post-edit typecheck hook
- `.claude/skills/` — `add-data-query`, `add-calc-function`, `add-feature-route`, `verify-data-shape`, `update-tarkov-schema`
- `.claude/agents/` — `tarkov-api-explorer` (read-only), `ballistics-verifier`

````

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect milestone 0a completion"
````

---

## Task 19: Final verification — fresh clone simulation

**Files:** none modified

- [ ] **Step 1: Wipe `node_modules` and reinstall**

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

Expected: completes without error. New `pnpm-lock.yaml` produced.

- [ ] **Step 2: Run all gates**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

Expected: all four pass. (`pnpm test` may report "no tests found" — acceptable at this milestone.)

- [ ] **Step 3: Verify Husky hooks fire**

```bash
git commit --allow-empty -m "bad message" 2>&1 | tail -10
```

Expected: commitlint rejects.

```bash
git commit --allow-empty -m "chore: verify hooks fire"
```

Expected: succeeds.

- [ ] **Step 4: Ensure a GitHub remote exists, then push and verify CI**

If no remote is configured yet, create the repo and add it:

```bash
git remote -v
# if no output, create the GitHub repo
gh repo create UnderMyBed/TarkovGunsmith --public --source . --remote origin --description "AI-first rebuild of TarkovGunsmith"
```

Then push and watch CI:

```bash
git push -u origin main
gh run watch
```

Expected: workflow completes green.

- [ ] **Step 5: Tag the milestone**

```bash
git tag -a v0.0.1-milestone-0a -m "Foundation: monorepo, CI, AI workflow Tier B"
git push origin v0.0.1-milestone-0a
```

- [ ] **Step 6: Commit the regenerated lockfile if it changed**

```bash
git status
# if pnpm-lock.yaml shows as modified
git add pnpm-lock.yaml
git commit -m "chore: refresh pnpm lockfile"
git push
```

---

## Done — what's true now

- `pnpm install && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` all pass locally and in CI.
- Conventional Commits are enforced; pre-commit lints + formats staged files.
- `.claude/` directory is wired with project-specific skills, subagents, settings, and a post-edit typecheck hook.
- Root `CLAUDE.md` is up to date.
- The repo is ready for Plans 0b (Workers), 0c (Web app), and 0d (Data/Math packages) — they can be tackled in any order, including in parallel.

## What's NOT true yet (intentionally deferred)

- No `apps/*` or `packages/*` directories exist.
- No deployments to Cloudflare yet (those land with the Workers and Web plans).
- No per-package `CLAUDE.md` files (they land with each package).
- The `add-cache-rule` and `record-fixture` skills referenced in other skills don't exist yet — they'll be added when the packages they target exist.
