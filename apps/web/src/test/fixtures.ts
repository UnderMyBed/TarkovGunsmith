/**
 * Hand-built upstream-shaped fixtures for route tests.
 *
 * `@tarkov/data`'s hooks (`useWeaponList`, `usePartCatalog`, `useAmmoList`, `useArmorList`,
 * `useWeaponTree`, `useTraders`, `useTasks`) all read through one `TarkovJsonClient` whose
 * `fetchResource(resource)` returns an already-translated document — see
 * `packages/tarkov-data/src/client.ts`. These fixtures are RAW upstream shape (pre-Zod-parse),
 * matching what `queries/*.ts` expects on the wire, so route tests exercise the real fetchers
 * and schemas rather than mocking around them.
 *
 * Deliberately NOT imported from `packages/tarkov-data/src/__fixtures__/` — that package only
 * exports its public API (`"."`) from `package.json#exports`, and this unit's brief scopes
 * changes to `apps/web/**`. These fixtures are smaller and hand-shaped for the specific
 * scenarios routes need (an available weapon, a locked mod, a helmet vs. a body armor, two
 * distinguishable ammo types) rather than a trimmed capture of the live document.
 *
 * Units: `recoilModifier`/`accuracyModifier` are fractions and `armorDamage` is a percent —
 * see the "Units" warning in `packages/tarkov-data/CLAUDE.md`. Values below stay inside the
 * live ranges recorded in `docs/operations/data-api-audit.md` so a unit-scale bug (like the
 * 100x recoil error that shipped once already) would be visible here too.
 */

const ICON = "https://assets.tarkov.dev/fixture-icon.webp";

// ---------- Traders ----------
// The 7 canonical profile-gating traders `itemAvailability` reads by normalizedName.
export const TRADERS_DOCUMENT: Record<string, unknown> = {
  "t-prapor": { id: "t-prapor", name: "Prapor", normalizedName: "prapor" },
  "t-therapist": { id: "t-therapist", name: "Therapist", normalizedName: "therapist" },
  "t-skier": { id: "t-skier", name: "Skier", normalizedName: "skier" },
  "t-peacekeeper": { id: "t-peacekeeper", name: "Peacekeeper", normalizedName: "peacekeeper" },
  "t-mechanic": { id: "t-mechanic", name: "Mechanic", normalizedName: "mechanic" },
  "t-ragman": { id: "t-ragman", name: "Ragman", normalizedName: "ragman" },
  "t-jaeger": { id: "t-jaeger", name: "Jaeger", normalizedName: "jaeger" },
};

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

// ---------- Items ----------
// One weapon with two slots, one always-available mod, one locked-by-default mod (LL2
// Mechanic, which the DEFAULT_PROFILE's all-LL1 traders can't reach) so availability-gating
// UI (SlotTree "Show all items", the weapon picker's "Show all weapons") has something real
// to gate. Two ammo types and two armor pieces (one head zone, one chest zone) so `/sim`'s
// helmet vs. body-armor split and `/matrix`, `/adc`, `/aec`, `/charts` all have distinct rows.
export const ITEMS_DOCUMENT: {
  items: Record<string, unknown>;
  armorMaterials: Record<string, unknown>;
} = {
  armorMaterials: ARMOR_MATERIALS,
  items: {
    "w-m4a1": {
      id: "w-m4a1",
      name: "Colt M4A1 5.56x45 assault rifle",
      shortName: "M4A1",
      iconLink: ICON,
      // The Builder snapshot's `dataAsOf` is the newest `updated` in the document.
      updated: "2026-10-16T12:00:00.000Z",
      weight: 3.4,
      types: ["gun"],
      // Top-level and a PERCENT, unlike the fraction-scale `properties` modifiers.
      velocity: 0,
      minLevelForFlea: 0,
      lastLowPrice: 40_000,
      avg24hPrice: 42_000,
      properties: {
        propertiesType: "ItemPropertiesWeapon",
        caliber: "Caliber556x45NATO",
        ergonomics: 47,
        recoilVertical: 108,
        recoilHorizontal: 296,
        fireRate: 800,
        centerOfImpact: 0.01,
        deviationCurve: 1.35,
        effectiveDistance: 500,
        sightingRange: 100,
        // An id the snapshot generator resolves to that ammo's `shortName` and `initialSpeed`.
        defaultAmmo: "ammo-m855",
        slots: [
          {
            id: "slot-w-m4a1-muzzle",
            nameId: "mod_muzzle",
            name: "Muzzle",
            required: false,
            filters: { allowedItems: ["mod-muzzle"], allowedCategories: [] },
          },
          {
            id: "slot-w-m4a1-stock",
            nameId: "mod_stock",
            name: "Stock",
            required: false,
            filters: { allowedItems: ["mod-stock"], allowedCategories: [] },
          },
        ],
      },
      // Prapor LL1 — satisfied by DEFAULT_PROFILE (every trader starts at LL1), so this
      // weapon is selectable in the Builder's default "available on your profile" filter
      // without the tester having to flip "Show all weapons" first.
      buyFromTrader: [
        {
          trader: "t-prapor",
          priceRUB: 35_000,
          currency: "RUB",
          minTraderLevel: 1,
          taskUnlock: null,
        },
      ],
    },
    "mod-muzzle": {
      id: "mod-muzzle",
      updated: "2026-10-16T12:00:00.000Z",
      name: "Zenit DTK-1 muzzle brake",
      shortName: "DTK-1",
      iconLink: ICON,
      weight: 0.14,
      types: ["mods"],
      velocity: 0,
      minLevelForFlea: 0,
      lastLowPrice: 4_200,
      avg24hPrice: 4_500,
      // Upstream sends both on every item, empty or not.
      conflictingItems: [],
      conflictingSlotIds: [],
      properties: {
        propertiesType: "ItemPropertiesWeaponMod",
        ergonomics: -1,
        recoilModifier: -0.05,
        accuracyModifier: 0.02,
        slots: [],
      },
      // Prapor LL1 — available by default, same as the weapon.
      buyFromTrader: [
        {
          trader: "t-prapor",
          priceRUB: 3_000,
          currency: "RUB",
          minTraderLevel: 1,
          taskUnlock: null,
        },
      ],
    },
    "mod-stock": {
      id: "mod-stock",
      updated: "2026-10-16T12:00:00.000Z",
      name: "Magpul CTR carbine stock",
      shortName: "CTR",
      iconLink: ICON,
      weight: 0.4,
      types: ["mods"],
      velocity: 0,
      // Locked off flea by level, AND its only trader offer needs Mechanic LL2 — the
      // DEFAULT_PROFILE (all traders LL1, flea off) can reach neither path. Deliberately
      // unavailable so SlotTree's "Show all items" toggle and itemAvailability's
      // "trader-ll-required" reason both have something real to render.
      minLevelForFlea: 15,
      lastLowPrice: 9_000,
      avg24hPrice: 9_500,
      // Upstream sends both on every item, empty or not.
      conflictingItems: [],
      conflictingSlotIds: [],
      properties: {
        propertiesType: "ItemPropertiesWeaponMod",
        ergonomics: 8,
        recoilModifier: -0.1,
        accuracyModifier: 0,
        slots: [],
      },
      buyFromTrader: [
        {
          trader: "t-mechanic",
          priceRUB: 9_000,
          currency: "RUB",
          minTraderLevel: 2,
          taskUnlock: null,
        },
      ],
    },
    // Two presets of the weapon, upstream-shaped: `containsItems` lists the base weapon with
    // its parts, and the trader offers live on the preset item. The default fits both mods and
    // Prapor sells it at LL1 (dearer than the bare weapon, so the weapon's own offer stays its
    // cheapest); the other fits the stock alone and only Mechanic LL2 sells it. A build with the
    // muzzle alone matches neither, so a loaded build can be told apart from a seeded one.
    "p-m4a1-default": {
      id: "p-m4a1-default",
      updated: "2026-10-16T12:00:00.000Z",
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
          trader: "t-prapor",
          priceRUB: 50_000,
          currency: "RUB",
          minTraderLevel: 1,
          taskUnlock: null,
        },
      ],
    },
    "p-m4a1-stock": {
      id: "p-m4a1-stock",
      updated: "2026-10-16T12:00:00.000Z",
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
          trader: "t-mechanic",
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
