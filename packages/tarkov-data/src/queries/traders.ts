import { z } from "zod";
import type { GraphQLClient } from "../client.js";

export const TRADERS_QUERY = /* GraphQL */ `
  query Traders {
    traders {
      id
      name
      normalizedName
    }
  }
`;

const traderListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  normalizedName: z.string(),
});

export const tradersSchema = z.object({
  traders: z.array(traderListItemSchema),
});

export type TraderListItem = z.infer<typeof traderListItemSchema>;

/** The 7 canonical profile-gating traders (excludes Fence, Ref). */
const PROFILE_TRADERS = new Set([
  "prapor",
  "therapist",
  "skier",
  "peacekeeper",
  "mechanic",
  "ragman",
  "jaeger",
]);

/**
 * Fetch the list of traders, filtered to the 7 that have loyalty-level gating
 * relevant to builds (excludes Fence, Ref, and any future non-LL-gated vendors).
 */
export async function fetchTraders(client: GraphQLClient): Promise<TraderListItem[]> {
  const raw = await client.request<unknown>(TRADERS_QUERY);
  const { traders } = tradersSchema.parse(raw);
  return traders.filter((t) => PROFILE_TRADERS.has(t.normalizedName));
}
