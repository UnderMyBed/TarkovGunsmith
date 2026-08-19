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
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      thresholds: {
        lines: 93,
        functions: 87,
        branches: 75,
        statements: 91,
      },
    },
  },
});
