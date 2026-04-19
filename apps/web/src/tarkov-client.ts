import { createTarkovClient } from "@tarkov/data";
import type { GraphQLClient } from "@tarkov/data";

/**
 * Default GraphQL endpoint for v0.7.0 — direct calls to api.tarkov.dev.
 *
 * A follow-up plan switches this to `/api/data/graphql` once the data-proxy
 * Worker is wired into prod (Vite proxies it locally; Pages Functions or a
 * service binding routes it in prod).
 */
export const TARKOV_GRAPHQL_ENDPOINT = "https://api.tarkov.dev/graphql";

export const tarkovClient: GraphQLClient = createTarkovClient(TARKOV_GRAPHQL_ENDPOINT);
