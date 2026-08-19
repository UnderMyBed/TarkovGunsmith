import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/* This package is entirely React components, so `environment: "jsdom"` is set
 * package-wide rather than per-file via a `// @vitest-environment jsdom` docblock
 * (the convention `apps/web` uses, where most files are non-component logic and
 * jsdom is the exception). Both are sanctioned by the hardening plan; this one is
 * simpler for a design-system package where nearly every test renders JSX.
 *
 * Thresholds are a RATCHET, not an aspiration. They are set to the coverage this
 * package actually achieves with real render tests (see
 * docs/plans/2026-08-19-pre-refactor-hardening-plan.md for the measured baseline
 * this replaces — 15.85% statements over 5 lines, i.e. no real coverage at all).
 * Currently 100/98.38/100/100 (stmts/branch/funcs/lines); branches is set to 98,
 * one point under measured, to absorb float rounding rather than a real gap — the
 * single uncovered branch is dialog.tsx's `if (panel)` defensive null check on a
 * ref that is always attached by the time its effect runs (see dialog.test.tsx).
 *
 * Raise them as tests land. NEVER lower one to make CI pass — if a change drops
 * coverage, the change needs tests, not a smaller number. */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    coverage: {
      provider: "v8",
      // Widened from `src/lib/**/*.ts` + one icon file (5 statements) to the whole
      // package — this is the actual point of Stage 1.2. `src/index.ts` stays excluded
      // because it is a pure re-export barrel with no logic of its own to cover.
      include: ["src/**"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/index.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 98,
        statements: 100,
      },
    },
  },
});
