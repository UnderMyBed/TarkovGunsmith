import { GraphQLClient } from "graphql-request";

/**
 * Construct a GraphQL client pointed at a TarkovGunsmith data endpoint.
 *
 * @param endpoint - The GraphQL HTTP endpoint URL.
 * @param fetchImpl - Optional fetch implementation (defaults to global fetch).
 */
export function createTarkovClient(endpoint: string, fetchImpl?: typeof fetch): GraphQLClient {
  return new GraphQLClient(endpoint, fetchImpl ? { fetch: fetchImpl } : {});
}

export type { GraphQLClient };
