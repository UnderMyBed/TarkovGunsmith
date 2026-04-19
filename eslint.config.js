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
      "**/worker-configuration.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "packages/*/vitest.config.ts",
            "packages/ballistics/src/*.test.ts",
            "packages/ballistics/src/*/*.test.ts",
            "packages/tarkov-types/codegen.ts",
            "packages/tarkov-data/src/queries/*.test.ts",
            "packages/tarkov-data/src/client.test.ts",
            "packages/ui/src/lib/*.test.ts",
            "packages/ui/src/components/*.test.ts",
            "apps/*/vitest.config.ts",
            "apps/data-proxy/src/*.test.ts",
          ],
          defaultProject: "packages/ui/tsconfig.test.json",
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 20,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Disable type-checked rules for non-TypeScript files (e.g. eslint.config.js itself)
  // so that files outside any tsconfig project are not erroneously linted with type info.
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
