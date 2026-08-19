import { defineConfig } from "vitest/config";

/* Thresholds are a RATCHET, not an aspiration. They are set to the coverage this
 * package actually had when enforcement was switched on (see
 * docs/plans/2026-08-19-pre-refactor-hardening-plan.md for the measured baseline table).
 *
 * Raise them as tests land. NEVER lower one to make CI pass — if a change drops
 * coverage, the change needs tests, not a smaller number. */
export default defineConfig({
  test: {
    // Hook tests (hooks/use*.test.ts) cover the previously-unmeasured hooks layer. They stay
    // plain `.ts` — `renderHook`'s QueryClientProvider/TarkovDataProvider wrapper is built via
    // `createElement` in `__test-utils__/query-wrapper.ts` rather than JSX, so no file in this
    // package needs a `.tsx`-aware ESLint project entry (see that file's comment for why, and
    // the root CLAUDE.md's per-package-tsconfig gotcha for the failure mode this avoids). Each
    // hook test carries a `// @vitest-environment jsdom` pragma per-file instead of switching
    // the whole package's default `environment` — mirrors the pattern apps/web already uses
    // (see e.g. features/builder/build-header.test.tsx).
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/__fixtures__/**", "src/index.ts", "src/provider.tsx"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
