import { defineConfig } from "vitest/config";

/* Thresholds are a RATCHET, not an aspiration. They are set to the coverage this
 * package actually had when enforcement was switched on (see
 * docs/plans/2026-08-19-pre-refactor-hardening-plan.md for the measured baseline table).
 *
 * Raise them as tests land. NEVER lower one to make CI pass — if a change drops
 * coverage, the change needs tests, not a smaller number. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // NOTE: src/hooks/** is excluded today, so the React hooks layer is unmeasured.
      // Stage 1.3 of the hardening plan removes this exclusion and covers it.
      exclude: [
        "src/**/*.test.ts",
        "src/__fixtures__/**",
        "src/index.ts",
        "src/provider.tsx",
        "src/hooks/**",
      ],
      thresholds: {
        lines: 96,
        functions: 92,
        branches: 81,
        statements: 93,
      },
    },
  },
});
