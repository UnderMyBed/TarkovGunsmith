import type { HydrateMod, HydrateWeapon } from "@tarkov/og";
import type { AvailabilityMod } from "./og-availability.js";

/**
 * The mods returned by this fetcher serve two consumers: `hydrateBuildCard`
 * (reads `buyFor[].priceRUB`) and `availabilityPillText` (reads
 * `buyFor[].vendor.normalizedName` + `minTraderLevel`). The GraphQL query
 * selects all three fields, so the runtime row satisfies both contracts;
 * this intersection type lets TypeScript see that.
 */
export type OgMod = HydrateMod & AvailabilityMod;

const ENDPOINT = "https://api.tarkov.dev/graphql";

const QUERY = /* GraphQL */ `
  query OgCardBuild($weaponId: ID!, $modIds: [ID!]!) {
    weapon: item(id: $weaponId) {
      id
      shortName
      properties {
        ... on ItemPropertiesWeapon {
          ergonomics
          recoilVertical
          recoilHorizontal
        }
      }
    }
    mods: items(ids: $modIds) {
      id
      shortName
      weight
      buyFor {
        vendor {
          normalizedName
          ... on TraderOffer {
            minTraderLevel
          }
        }
        priceRUB
      }
      properties {
        ... on ItemPropertiesWeaponMod {
          ergonomics
          recoilModifier
          accuracyModifier
        }
      }
    }
  }
`;

interface Args {
  weaponId: string;
  modIds: readonly string[];
}

/**
 * Raw shape coming back from tarkov.dev: `minTraderLevel` is a field on the
 * `TraderOffer` implementation of `Vendor`, surfaced via an inline fragment.
 * It is NOT on `ItemPrice` itself — selecting it there causes the upstream
 * GraphQL API to return a validation error and the fetcher to throw.
 */
interface RawOffer {
  vendor: { normalizedName: string; minTraderLevel?: number };
  priceRUB: number;
}

interface RawMod extends Omit<OgMod, "buyFor"> {
  buyFor: RawOffer[];
}

interface ApiResp {
  data?: {
    weapon: HydrateWeapon | null;
    mods: RawMod[];
  };
  errors?: { message: string }[];
}

/**
 * Hoist `minTraderLevel` from the `TraderOffer` inline fragment up to the
 * offer level so `availabilityPillText` (which reads
 * `AvailabilityOffer.minTraderLevel`) sees it where it expects.
 */
function flattenMod(raw: RawMod): OgMod {
  return {
    ...raw,
    buyFor: raw.buyFor.map((o) => ({
      vendor: { normalizedName: o.vendor.normalizedName },
      priceRUB: o.priceRUB,
      minTraderLevel: o.vendor.minTraderLevel,
    })),
  };
}

export async function fetchOgRowsForBuild(
  args: Args,
): Promise<{ weapon: HydrateWeapon; mods: OgMod[] }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables: { weaponId: args.weaponId, modIds: args.modIds },
    }),
  });
  if (!res.ok) throw new Error(`og-graphql: upstream ${res.status}`);
  // res.json() returns Promise<any> under Node's lib.dom typings; the cast is
  // load-bearing for downstream narrowing even though the rule thinks it's a no-op.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const json = (await res.json()) as ApiResp;
  if (json.errors && json.errors.length > 0) {
    throw new Error(`og-graphql: ${json.errors.map((e) => e.message).join(", ")}`);
  }
  if (!json.data?.weapon) throw new Error(`og-graphql: weapon ${args.weaponId} not found`);
  return { weapon: json.data.weapon, mods: json.data.mods.map(flattenMod) };
}
