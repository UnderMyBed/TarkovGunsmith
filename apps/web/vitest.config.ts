import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/* Thresholds are a RATCHET, not an aspiration. They are set to the coverage this
 * package actually had when enforcement was switched on (see
 * docs/plans/2026-08-19-pre-refactor-hardening-plan.md for the measured baseline table).
 *
 * Raise them as tests land. NEVER lower one to make CI pass — if a change drops
 * coverage, the change needs tests, not a smaller number. */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "functions/lib/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      // NOTE: src/routes/** is excluded today — 3,058 lines, 40% of the app, including
      // the 512-line BuilderPage. Stage 1.4 of the hardening plan brings it in.
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/main.tsx",
        "src/app.tsx",
        "src/router.ts",
        "src/route-tree.gen.ts",
        "src/routes/**",
      ],
      thresholds: {
        lines: 36,
        functions: 29,
        branches: 34,
        statements: 35,
      },
    },
  },
});
