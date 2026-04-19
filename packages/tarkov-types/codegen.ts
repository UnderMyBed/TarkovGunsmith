import type { CodegenConfig } from "@graphql-codegen/cli";

const REFRESH = process.env.SCHEMA_REFRESH === "1";

const config: CodegenConfig = {
  schema: REFRESH ? "https://api.tarkov.dev/graphql" : "./src/generated/schema.graphql",
  documents: [],
  generates: {
    "./src/generated/schema.graphql": {
      plugins: ["schema-ast"],
      config: {
        includeDirectives: true,
      },
    },
    "./src/generated/types.ts": {
      plugins: ["typescript"],
      config: {
        useTypeImports: true,
        skipTypename: true,
        enumsAsTypes: true,
        avoidOptionals: false,
        scalars: {
          DateTime: "string",
          ID: "string",
        },
      },
    },
  },
  hooks: {
    afterAllFileWrite: ["prettier --write"],
  },
};

export default config;
