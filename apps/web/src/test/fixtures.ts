// Imported rather than read with `fs`: route tests run under jsdom, where `import.meta.url` is
// not a file URL.
import itemsCapture from "../../../../packages/tarkov-data/src/__fixtures__/items-sample.json" with { type: "json" };

/**
 * Upstream-shaped fixtures for route tests.
 *
 * `@tarkov/data`'s hooks (`useWeaponList`, `usePartCatalog`, `useAmmoList`, `useArmorList`,
 * `useWeaponTree`, `useTraders`, `useTasks`) all read through one `TarkovJsonClient` whose
 * `fetchResource(resource)` returns an already-translated document — see
 * `packages/tarkov-data/src/client.ts`. These fixtures are RAW upstream shape (pre-Zod-parse),
 * matching what `queries/*.ts` expects on the wire, so route tests exercise the real fetchers
 * and schemas rather than mocking around them.
 *
 * The weapon and its parts are the captured records
 * (`packages/tarkov-data/src/__fixtures__/items-sample.json`), read by id through
 * {@link captured}: their weights, ergonomics, recoil, modifiers, prices and trader offers are
 * upstream's own. A slot's `required` flag is copied from the captured slot with the same
 * `nameId` ({@link capturedSlot}). What is hand-shaped is the scenario: which slots each item
 * offers (trimmed to the parts this document carries, plus a weapon-level muzzle slot upstream
 * does not have), the short ids the route tests name (`w-m4a1`, `mod-muzzle`, ...), and the
 * presets, ammo and armor.
 *
 * Units: `recoilModifier`/`accuracyModifier` are fractions and `armorDamage` is a percent —
 * see the "Units" warning in `packages/tarkov-data/CLAUDE.md`.
 */

const ICON = "https://assets.tarkov.dev/fixture-icon.webp";

// ---------- Traders ----------
// The 7 canonical profile-gating traders `itemAvailability` reads by normalizedName, under
// their real ids so the captured offers below resolve unchanged.
export const TRADER_IDS = {
  prapor: "54cb50c76803fa8b248b4571",
  therapist: "54cb57776803fa99248b456e",
  skier: "58330581ace78e27b8b10cee",
  peacekeeper: "5935c25fb3acc3127c3d8cd9",
  mechanic: "5a7c2eca46aef81a7ca2145d",
  ragman: "5ac3b934156ae10c4430e83c",
  jaeger: "5c0647fdd443bc2504c2d371",
} as const;

export const TRADERS_DOCUMENT: Record<string, unknown> = Object.fromEntries(
  Object.entries(TRADER_IDS).map(([normalizedName, id]) => [
    id,
    { id, name: normalizedName[0]!.toUpperCase() + normalizedName.slice(1), normalizedName },
  ]),
);

// ---------- Tasks ----------
// Empty: none of the fixture offers below carry a `taskUnlock`, so no task needs resolving.
// The snapshot generator still reads this resource (`createTestBuilderData`).
export const TASKS_DOCUMENT: { tasks: Record<string, unknown> } = { tasks: {} };

// ---------- Barters ----------
// Empty: the route scenarios gate on cash and flea offers only. The snapshot generator still
// reads this resource (upstream's `data` is an array) to collect offers.
export const BARTERS_DOCUMENT: unknown[] = [];

// ---------- Armor materials ----------
export const ARMOR_MATERIALS: Record<
  string,
  { id: string; name: string; destructibility: number }
> = {
  ArmorMaterial_Combined: {
    id: "ArmorMaterial_Combined",
    name: "MatCombined",
    destructibility: 0.4,
  },
  ArmorMaterial_Titan: { id: "ArmorMaterial_Titan", name: "MatTitan", destructibility: 0.35 },
};

// ---------- Captured records ----------
/** The Builder snapshot's `dataAsOf` is the newest `updated` in the document. */
const UPDATED = "2026-10-16T12:00:00.000Z";

interface CapturedRecord {
  name: string;
  shortName: string;
  properties: Record<string, unknown>;
  [field: string]: unknown;
}

const CAPTURED_ITEMS = (
  itemsCapture.document.data as unknown as { items: Record<string, CapturedRecord> }
).items;
const CAPTURED_LANG: Readonly<Record<string, string>> = itemsCapture.lang;

/** The captured record's fields the Builder reads, under the fixture's own id. */
const CAPTURED_FIELDS = [
  "iconLink",
  "weight",
  "types",
  "velocity",
  "minLevelForFlea",
  "lastLowPrice",
  "avg24hPrice",
  "conflictingItems",
  "conflictingSlotIds",
  "buyFromTrader",
] as const;

/**
 * The captured upstream record `capturedId`, as fixture `id`, translated, with its slots
 * replaced by `slots` (the scenario's). Throws on an id the capture does not carry, so a
 * trimmed capture fails here rather than quietly emptying a slot.
 */
function captured(
  id: string,
  capturedId: string,
  slots: readonly unknown[],
  properties: Record<string, unknown> = {},
): Record<string, unknown> {
  const record = CAPTURED_ITEMS[capturedId];
  if (record === undefined) throw new Error(`items-sample.json has no item ${capturedId}`);
  const translate = (key: string) => {
    const text = CAPTURED_LANG[key];
    if (text === undefined) throw new Error(`items-sample.json has no translation for ${key}`);
    return text;
  };
  return {
    id,
    updated: UPDATED,
    name: translate(record.name),
    shortName: translate(record.shortName),
    ...Object.fromEntries(CAPTURED_FIELDS.map((field) => [field, record[field]])),
    properties: { ...record.properties, ...properties, slots },
  };
}

/** Captured ids of the records below. */
export const CAPTURED_IDS = {
  m4a1: "5447a9cd4bdc2dbd208b4567",
  a2FlashHider: "544a38634bdc2d58388b4568",
  moeStock: "58d2946386f774496974c37e",
  stanag: "55d4887d4bdc2d962f8b4570",
  upper: "55d355e64bdc2d962f8b4569",
  barrel103: "55d35ee94bdc2d61338b4568",
  hamr: "544a3a774bdc2d3a388b4567",
} as const;

function slot(owner: string, nameId: string, name: string, required: boolean, items: string[]) {
  return {
    id: `slot-${owner}-${nameId}`,
    nameId,
    name,
    required,
    filters: { allowedItems: items, allowedCategories: [] },
  };
}

/**
 * A slot on fixture item `owner`, `required` exactly as the captured item `capturedOwner` has
 * its slot `nameId`. Throws when upstream has no such slot, so a scenario-only slot has to be
 * written with {@link slot} and say why.
 */
function capturedSlot(
  owner: string,
  capturedOwner: string,
  nameId: string,
  name: string,
  items: string[],
) {
  const slots = (CAPTURED_ITEMS[capturedOwner]?.properties.slots ?? []) as {
    nameId: string;
    required: boolean;
  }[];
  const upstream = slots.find((s) => s.nameId === nameId);
  if (upstream === undefined)
    throw new Error(`items-sample.json: ${capturedOwner} has no ${nameId}`);
  return slot(owner, nameId, name, upstream.required, items);
}

// ---------- Items ----------
// The M4A1 with the A2 flash hider (Mechanic LL1, so reachable on DEFAULT_PROFILE, where every
// trader is LL1 and flea is off), the MOE stock (Peacekeeper LL3 or flea at 20, so locked there:
// SlotInspector's "Show all items" and itemAvailability's "trader-ll-required" have something real to
// render), a STANAG magazine, and the upper receiver carrying the 10.3" barrel and the HAMR
// scope. The weapon itself is Mechanic LL3; DEFAULT_PROFILE reaches it through the default
// preset below. The stock, receiver and barrel slots are required, as upstream has them. Two ammo types and two armor pieces (one head zone, one chest zone) so `/sim`'s
// helmet vs. body-armor split and `/matrix`, `/adc`, `/aec`, `/charts` all have distinct rows.
export const ITEMS_DOCUMENT: {
  items: Record<string, unknown>;
  armorMaterials: Record<string, unknown>;
} = {
  armorMaterials: ARMOR_MATERIALS,
  items: {
    "w-m4a1": captured(
      "w-m4a1",
      CAPTURED_IDS.m4a1,
      [
        // Not an upstream slot: the M4A1's muzzle device sits on its barrel. It is here so the
        // route tests have an always-available part one click from the weapon.
        slot("w-m4a1", "mod_muzzle", "Muzzle", false, ["mod-muzzle"]),
        capturedSlot("w-m4a1", CAPTURED_IDS.m4a1, "mod_stock", "Stock", ["mod-stock"]),
        capturedSlot("w-m4a1", CAPTURED_IDS.m4a1, "mod_magazine", "Magazine", ["mod-magazine"]),
        capturedSlot("w-m4a1", CAPTURED_IDS.m4a1, "mod_reciever", "Receiver", ["mod-upper"]),
      ],
      // An id the snapshot generator resolves to that ammo's `shortName` and `initialSpeed`.
      { defaultAmmo: "ammo-m855" },
    ),
    "mod-muzzle": captured("mod-muzzle", CAPTURED_IDS.a2FlashHider, []),
    "mod-stock": captured("mod-stock", CAPTURED_IDS.moeStock, []),
    "mod-magazine": captured("mod-magazine", CAPTURED_IDS.stanag, []),
    "mod-upper": captured("mod-upper", CAPTURED_IDS.upper, [
      capturedSlot("mod-upper", CAPTURED_IDS.upper, "mod_barrel", "Barrel", ["mod-barrel"]),
      capturedSlot("mod-upper", CAPTURED_IDS.upper, "mod_scope", "Scope", ["mod-scope"]),
    ]),
    "mod-barrel": captured("mod-barrel", CAPTURED_IDS.barrel103, []),
    "mod-scope": captured("mod-scope", CAPTURED_IDS.hamr, []),
    // Two presets of the weapon, upstream-shaped: `containsItems` lists the base weapon with
    // its parts, and the trader offers live on the preset item. The default fits the muzzle and
    // the stock, and Prapor sells it at LL1. On DEFAULT_PROFILE that is the only way to get the
    // M4A1, whose own offer is Mechanic LL3. The other fits the stock alone and only Mechanic LL2
    // sells it. A build with the muzzle alone matches neither, so a loaded build can be told
    // apart from a seeded one.
    "p-m4a1-default": {
      id: "p-m4a1-default",
      updated: UPDATED,
      name: "Colt M4A1 5.56x45 assault rifle Default",
      shortName: "M4A1 Default",
      normalizedName: "colt-m4a1-556x45-assault-rifle-default",
      types: ["preset"],
      minLevelForFlea: 0,
      lastLowPrice: 57_000,
      avg24hPrice: 60_000,
      containsItems: [
        { item: "w-m4a1", count: 1 },
        { item: "mod-muzzle", count: 1 },
        { item: "mod-stock", count: 1 },
      ],
      properties: {
        propertiesType: "ItemPropertiesPreset",
        baseItem: "w-m4a1",
        default: true,
        ergonomics: 54,
        recoilVertical: 92,
        recoilHorizontal: 252,
        moa: 1.03,
      },
      buyFromTrader: [
        {
          trader: TRADER_IDS.prapor,
          priceRUB: 50_000,
          currency: "RUB",
          minTraderLevel: 1,
          taskUnlock: null,
        },
      ],
    },
    "p-m4a1-stock": {
      id: "p-m4a1-stock",
      updated: UPDATED,
      name: "Colt M4A1 5.56x45 assault rifle Stock",
      shortName: "M4A1 Stock",
      normalizedName: "colt-m4a1-556x45-assault-rifle-stock",
      types: ["preset"],
      minLevelForFlea: 15,
      lastLowPrice: 52_000,
      avg24hPrice: 55_000,
      containsItems: [
        { item: "w-m4a1", count: 1 },
        { item: "mod-stock", count: 1 },
      ],
      properties: {
        propertiesType: "ItemPropertiesPreset",
        baseItem: "w-m4a1",
        default: false,
        ergonomics: 55,
        recoilVertical: 97,
        recoilHorizontal: 266,
        moa: 1.03,
      },
      buyFromTrader: [
        {
          trader: TRADER_IDS.mechanic,
          priceRUB: 48_000,
          currency: "RUB",
          minTraderLevel: 2,
          taskUnlock: null,
        },
      ],
    },
    "ammo-m855": {
      id: "ammo-m855",
      name: "5.56x45mm M855",
      shortName: "M855",
      iconLink: ICON,
      weight: 0.012,
      types: ["ammo"],
      minLevelForFlea: 0,
      conflictingItems: [],
      conflictingSlotIds: [],
      properties: {
        propertiesType: "ItemPropertiesAmmo",
        caliber: "Caliber556x45NATO",
        penetrationPower: 31,
        damage: 63,
        armorDamage: 45,
        projectileCount: 1,
        initialSpeed: 922,
      },
    },
    "ammo-m995": {
      id: "ammo-m995",
      name: "5.56x45mm M995",
      shortName: "M995",
      iconLink: ICON,
      weight: 0.012,
      types: ["ammo"],
      minLevelForFlea: 0,
      conflictingItems: [],
      conflictingSlotIds: [],
      properties: {
        propertiesType: "ItemPropertiesAmmo",
        caliber: "Caliber556x45NATO",
        penetrationPower: 58,
        damage: 50,
        armorDamage: 62,
        projectileCount: 1,
        initialSpeed: 1013,
      },
    },
    "armor-6b13": {
      id: "armor-6b13",
      name: "6B13 assault armor (M)",
      shortName: "6B13",
      iconLink: ICON,
      properties: {
        propertiesType: "ItemPropertiesArmor",
        class: 4,
        durability: 80,
        material: "ArmorMaterial_Combined",
        zones: ["Chest", "Stomach"],
      },
    },
    "armor-altyn": {
      id: "armor-altyn",
      name: "Altyn helmet",
      shortName: "Altyn",
      iconLink: ICON,
      properties: {
        propertiesType: "ItemPropertiesArmor",
        class: 3,
        durability: 30,
        material: "ArmorMaterial_Titan",
        zones: ["Head"],
      },
    },
  },
};
