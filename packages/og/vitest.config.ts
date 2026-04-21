import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/__fixtures__/**",
        "src/index.ts",
        "src/view-model.ts",
      ],
      thresholds: { lines: 95, functions: 95, branches: 85, statements: 95 },
    },
  },
});
