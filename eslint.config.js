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
            "packages/optimizer/src/*.test.ts",
            "packages/optimizer/src/*/*.test.ts",
            "packages/tarkov-types/codegen.ts",
            "packages/tarkov-data/src/*.test.ts",
            "packages/tarkov-data/src/queries/*.test.ts",
            "packages/tarkov-data/src/queries/shared/*.test.ts",
            "packages/ui/src/lib/*.test.ts",
            "packages/ui/src/components/*.test.ts",
            "apps/*/vitest.config.ts",
            "apps/data-proxy/src/*.test.ts",
            "apps/builds-api/src/*.test.ts",
            "apps/builds-api/worker-configuration.d.ts",
            "apps/web/src/*.test.ts",
            "apps/web/src/*.test.tsx",
            "apps/web/src/features/*/*.test.ts",
            "apps/web/src/features/*/*.test.tsx",
            "apps/web/src/features/*/*/*.test.ts",
            "apps/web/src/features/*/*/*.test.tsx",
          ],
          defaultProject: "packages/ui/tsconfig.test.json",
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 30,
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
  // Workers test files import from cloudflare:test which is not resolvable from
  // the root default project tsconfig — disable type-checked rules for them.
  {
    files: ["apps/*/src/*.test.ts"],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
