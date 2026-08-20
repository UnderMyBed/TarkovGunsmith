import { defineConfig } from "vitest/config";

/* Thresholds are a RATCHET, not an aspiration. They are set to the coverage this
 * package actually had when enforcement was switched on.
 *
 * Raise them as tests land. NEVER lower one to make CI pass — if a change drops
 * coverage, the change needs tests, not a smaller number. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__fixtures__/**", "src/index.ts", "src/types.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
