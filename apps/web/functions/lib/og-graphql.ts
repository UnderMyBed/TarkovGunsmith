import type { HydrateMod, HydrateWeapon } from "@tarkov/og";

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
        }
        priceRUB
        minTraderLevel
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

interface ApiResp {
  data?: {
    weapon: HydrateWeapon | null;
    mods: HydrateMod[];
  };
  errors?: { message: string }[];
}

export async function fetchOgRowsForBuild(
  args: Args,
): Promise<{ weapon: HydrateWeapon; mods: HydrateMod[] }> {
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
  return { weapon: json.data.weapon, mods: json.data.mods };
}
