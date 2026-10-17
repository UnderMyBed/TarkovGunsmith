// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type * as TarkovData from "@tarkov/data";
import {
  DEFAULT_PROFILE,
  type AttachablePart,
  type BuildV6,
  type BuyForEntry,
  type PlayerProfile,
  type PricedPreset,
  type WeaponListItem,
} from "@tarkov/data";
import { useBuilderState, type UseBuilderStateArgs } from "./useBuilderState.js";
import { tinyTree } from "../../test/tiny-tree.js";

// Only the presets matter here, so the game-data hooks are inert and `useWeaponPresets`
// answers whatever the test has set, as it would once its query resolves.
const idleQuery = { data: undefined, isLoading: false, error: null };
let presetsQuery: {
  data: Record<string, PricedPreset[]> | undefined;
  isLoading: boolean;
  error: Error | null;
} = idleQuery;
let weaponsQuery: {
  data: WeaponListItem[] | undefined;
  isLoading: boolean;
  error: Error | null;
} = idleQuery;
let treeQuery: { data: unknown; isLoading: boolean; error: Error | null } = idleQuery;
let catalogQuery: { data: AttachablePart[] | undefined; isLoading: boolean; error: Error | null } =
  idleQuery;
// Live prices: loading (`idleQuery`) until a test sets them ready or failed.
let pricesQuery: { data: { asOf: string } | undefined; isLoading: boolean; error: Error | null } =
  idleQuery;
const PRICES_READY = { data: { asOf: "2026-10-17T00:00:00.000Z" }, isLoading: false, error: null };
vi.mock("@tarkov/data", async () => {
  const actual = await vi.importActual<typeof TarkovData>("@tarkov/data");
  return {
    ...actual,
    useBuilderSnapshot: () => idleQuery,
    useWeaponList: () => weaponsQuery,
    usePartCatalog: () => catalogQuery,
    useWeaponTree: () => treeQuery,
    useWeaponPresets: () => presetsQuery,
    useLivePrices: () => pricesQuery,
  };
});

afterEach(() => {
  cleanup();
  presetsQuery = idleQuery;
  weaponsQuery = idleQuery;
  treeQuery = idleQuery;
  catalogQuery = idleQuery;
  pricesQuery = idleQuery;
});

const WEAPON = "w-m4a1";

function trader(
  name: string,
  minTraderLevel: number,
  priceRUB: number,
  presetId: string,
): BuyForEntry {
  return {
    priceRUB,
    currency: "RUB",
    vendor: {
      __typename: "TraderOffer",
      normalizedName: name,
      minTraderLevel,
      taskUnlock: null,
      trader: { normalizedName: name },
    },
    preset: { id: presetId, normalizedName: presetId },
  };
}

function flea(priceRUB: number): BuyForEntry {
  return {
    priceRUB,
    currency: "RUB",
    vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 0 },
  };
}

function preset(
  id: string,
  isDefault: boolean,
  attachments: Record<string, string>,
  buyFor: BuyForEntry[],
): PricedPreset {
  return { id, name: id, shortName: id, weaponId: WEAPON, isDefault, attachments, buyFor };
}

// The default needs Mechanic LL2; of the two others the profile can buy, the Prapor one is
// cheaper than the flea one, even though the flea one is listed first.
const DEFAULT = preset("default", true, { mod_muzzle: "mod-muzzle", mod_stock: "mod-stock" }, [
  trader("mechanic", 2, 40_000, "default"),
]);
const FLEA = preset("flea", false, { mod_stock: "mod-stock" }, [flea(90_000)]);
const PRAPOR = preset("prapor", false, { mod_muzzle: "mod-muzzle" }, [
  trader("prapor", 1, 50_000, "prapor"),
]);
const PRESETS = { [WEAPON]: [DEFAULT, FLEA, PRAPOR] };

const FLEA_PROFILE: PlayerProfile = { ...DEFAULT_PROFILE, flea: true, level: 20 };

/** A saved build as `loadSavedBuild` hands it over. */
function saved(
  weaponId: string,
  attachments: Record<string, string> = {},
  orphaned: string[] = [],
): BuildV6 {
  return { version: 6, weaponId, attachments, orphaned, createdAt: "2026-10-16T00:00:00.000Z" };
}

/** Only the two fields the build core reads from a part. */
function part(id: string): AttachablePart {
  return { id, conflictingItems: [], conflictingSlotIds: [] } as unknown as AttachablePart;
}

function args(overrides: Partial<UseBuilderStateArgs> = {}): UseBuilderStateArgs {
  return {
    initialBuild: undefined,
    profile: FLEA_PROFILE,
    mode: "progression",
    buildName: "",
    buildDescription: "",
    embedProfileOnSave: false,
    ...overrides,
  };
}

describe("useBuilderState and presets", () => {
  it("never seeds a loaded build, even when the presets arrive after it", () => {
    presetsQuery = { data: undefined, isLoading: true, error: null };
    const kept = { mod_muzzle: "mod-muzzle" };
    const { result, rerender } = renderHook(() =>
      useBuilderState(args({ initialBuild: saved(WEAPON, kept) })),
    );
    expect(result.current.isLoading).toBe(true);

    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    rerender();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.attachments).toEqual(kept);
  });

  it("seeds the default in theorycraft, whatever it costs", () => {
    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    const { result } = renderHook(() => useBuilderState(args({ mode: "theorycraft" })));
    act(() => result.current.handleWeaponChange(WEAPON));
    expect(result.current.weaponId).toBe(WEAPON);
    expect(result.current.attachments).toEqual(DEFAULT.attachments);
  });

  it("gates by the profile in progression, and by nothing in theorycraft", () => {
    let mode: UseBuilderStateArgs["mode"] = "progression";
    const { result, rerender } = renderHook(() => useBuilderState(args({ mode })));
    expect(result.current.gate).toBe(FLEA_PROFILE);
    mode = "theorycraft";
    rerender();
    expect(result.current.gate).toBeNull();
    expect(result.current.prices).toEqual({ state: "loading" });
  });

  it("seeds the cheapest preset the profile can buy when the default is locked", () => {
    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    pricesQuery = PRICES_READY;
    const { result } = renderHook(() => useBuilderState(args()));
    act(() => result.current.handleWeaponChange(WEAPON));
    expect(result.current.attachments).toEqual(PRAPOR.attachments);
  });

  it("starts empty for a weapon without presets", () => {
    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    const { result } = renderHook(() =>
      useBuilderState(args({ initialBuild: saved(WEAPON, { mod_muzzle: "mod-muzzle" }) })),
    );
    act(() => result.current.handleWeaponChange("w-other"));
    expect(result.current.attachments).toEqual({});
  });

  it("keeps a loaded build's orphans when a preset is applied", () => {
    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    treeQuery = {
      data: tinyTree(WEAPON, [
        { nameId: "mod_muzzle", items: ["mod-muzzle"] },
        { nameId: "mod_stock", items: ["mod-stock"] },
      ]),
      isLoading: false,
      error: null,
    };
    catalogQuery = { data: [part("mod-muzzle"), part("mod-stock")], isLoading: false, error: null };
    const { result } = renderHook(() =>
      useBuilderState(args({ initialBuild: saved(WEAPON, {}, ["gone"]) })),
    );
    act(() => result.current.applyPreset(DEFAULT.attachments));
    expect(result.current.attachments).toEqual(DEFAULT.attachments);
    expect(result.current.orphaned).toEqual(["gone"]);

    act(() => result.current.clearOrphaned());
    expect(result.current.orphaned).toEqual([]);
  });

  it("throws a refused action to its caller and keeps rendering the build as it was", () => {
    const kept = { mod_muzzle: "mod-muzzle" };
    const { result } = renderHook(() =>
      useBuilderState(args({ initialBuild: saved(WEAPON, kept) })),
    );
    // The tree has not loaded, so there is nothing to check the attachment against.
    expect(() => result.current.handleAttach("mod_stock", "mod-stock")).toThrow(
      /No slot tree for weapon/,
    );
    expect(result.current.attachments).toEqual(kept);
  });

  it("joins the presets' error into the Builder's", () => {
    const error = new Error("presets down");
    presetsQuery = { data: undefined, isLoading: false, error };
    const { result } = renderHook(() => useBuilderState(args()));
    expect(result.current.error).toBe(error);
  });
});

// Only what `itemAvailability`, the picker and the stat adapter read. The stats are the live
// M4A1's (as in build-header.test.tsx); no assertion reads them.
function weapon(id: string, name: string, buyFor: BuyForEntry[]): WeaponListItem {
  return {
    id,
    name,
    types: [],
    weight: 0.75,
    velocity: 0,
    properties: {
      ergonomics: 48,
      recoilVertical: 119,
      recoilHorizontal: 342,
      fireRate: 800,
      centerOfImpact: 0.01,
      deviationCurve: 1.35,
      effectiveDistance: 500,
      sightingRange: 100,
    },
    defaultAmmo: { id: "54527a984bdc2d4e668b4567", shortName: "M855", initialSpeed: 922 },
    buyFor,
  } as unknown as WeaponListItem;
}

describe("useBuilderState weapon options", () => {
  const OPEN = weapon("w-open", "AK-74N", [trader("prapor", 1, 30_000, "w-open")]);
  // Mechanic LL4 and no flea listing: locked on a fresh profile.
  const LOCKED = weapon(WEAPON, "M4A1", [trader("mechanic", 4, 90_000, WEAPON)]);
  const OTHER_LOCKED = weapon("w-other", "HK 416A5", [trader("peacekeeper", 4, 99_000, "x")]);

  function render(initialWeaponId: string, mode: UseBuilderStateArgs["mode"] = "progression") {
    weaponsQuery = { data: [OTHER_LOCKED, LOCKED, OPEN], isLoading: false, error: null };
    const initialBuild = initialWeaponId ? saved(initialWeaponId) : undefined;
    return renderHook(() =>
      useBuilderState(args({ initialBuild, profile: DEFAULT_PROFILE, mode })),
    );
  }

  it("keeps the current weapon listed, with its requirement, when the profile cannot buy it", () => {
    const { result } = render(WEAPON);
    expect(result.current.weaponOptions.map((w) => w.id)).toEqual(["w-open", WEAPON]);
    const current = result.current.weaponOptions.find((w) => w.id === WEAPON);
    expect(current?.lockedBy).toMatchObject({
      available: false,
      reason: "trader-ll-required",
      traderNormalizedName: "mechanic",
      minLevel: 4,
    });
    expect(result.current.weaponOptions.find((w) => w.id === "w-open")?.lockedBy).toBeNull();
  });

  it("lists only available weapons when the current one is available or none is chosen", () => {
    expect(render("").result.current.weaponOptions.map((w) => w.id)).toEqual(["w-open"]);
    expect(render("w-open").result.current.weaponOptions.map((w) => w.id)).toEqual(["w-open"]);
  });

  it("lists every weapon and marks nothing in theorycraft", () => {
    const { result } = render(WEAPON, "theorycraft");
    expect(result.current.weaponOptions.map((w) => [w.id, w.lockedBy])).toEqual([
      ["w-open", null],
      ["w-other", null],
      [WEAPON, null],
    ]);
  });
});

// Before live prices arrive every price is unknown: the flea preset counts as buyable at an
// unknown price, and the unknown-price presets order by short name, so "flea" is picked over
// "prapor". Once prices arrive the Prapor preset is the cheaper one.
const UNPRICED = {
  [WEAPON]: [
    DEFAULT,
    preset("flea", false, FLEA.attachments, [{ ...flea(90_000), priceRUB: null }]),
    preset("prapor", false, PRAPOR.attachments, [
      { ...trader("prapor", 1, 0, "prapor"), priceRUB: null },
    ]),
  ],
};

describe("useBuilderState seeding before live prices arrive", () => {
  it("redoes a progression seed made before prices once they arrive", () => {
    presetsQuery = { data: UNPRICED, isLoading: false, error: null };
    const { result, rerender } = renderHook(() => useBuilderState(args()));
    act(() => result.current.handleWeaponChange(WEAPON));
    expect(result.current.attachments).toEqual(FLEA.attachments);

    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    pricesQuery = PRICES_READY;
    rerender();
    expect(result.current.weaponId).toBe(WEAPON);
    expect(result.current.attachments).toEqual(PRAPOR.attachments);
  });

  it("never overwrites an edit made before prices arrive", () => {
    presetsQuery = { data: UNPRICED, isLoading: false, error: null };
    treeQuery = {
      data: tinyTree(WEAPON, [
        { nameId: "mod_muzzle", items: ["mod-muzzle"] },
        { nameId: "mod_stock", items: ["mod-stock"] },
      ]),
      isLoading: false,
      error: null,
    };
    catalogQuery = { data: [part("mod-muzzle"), part("mod-stock")], isLoading: false, error: null };
    const { result, rerender } = renderHook(() => useBuilderState(args()));
    act(() => result.current.handleWeaponChange(WEAPON));
    act(() => result.current.handleAttach("mod_muzzle", "mod-muzzle"));
    const edited = result.current.attachments;
    expect(edited).toEqual({ mod_stock: "mod-stock", mod_muzzle: "mod-muzzle" });

    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    pricesQuery = PRICES_READY;
    rerender();
    expect(result.current.attachments).toEqual(edited);
  });

  it.each([
    ["a loaded shared build", saved(WEAPON, { mod_muzzle: "mod-muzzle" })],
    ["a restored draft", saved(WEAPON, {}, ["gone"])],
  ])("never seeds %s, before or after prices arrive", (_, initialBuild) => {
    presetsQuery = { data: UNPRICED, isLoading: false, error: null };
    const { result, rerender } = renderHook(() => useBuilderState(args({ initialBuild })));
    expect(result.current.attachments).toEqual(initialBuild.attachments);

    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    pricesQuery = PRICES_READY;
    rerender();
    expect(result.current.attachments).toEqual(initialBuild.attachments);
    expect(result.current.orphaned).toEqual(initialBuild.orphaned);
  });

  it("keeps the seed made without prices when they fail", () => {
    presetsQuery = { data: UNPRICED, isLoading: false, error: null };
    const { result, rerender } = renderHook(() => useBuilderState(args()));
    act(() => result.current.handleWeaponChange(WEAPON));

    pricesQuery = { data: undefined, isLoading: false, error: new Error("prices down") };
    rerender();
    expect(result.current.attachments).toEqual(FLEA.attachments);

    // A later success does not resurrect it.
    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    pricesQuery = PRICES_READY;
    rerender();
    expect(result.current.attachments).toEqual(FLEA.attachments);
  });

  it("does not wait for prices in theorycraft, whose seed reads none", () => {
    presetsQuery = { data: UNPRICED, isLoading: false, error: null };
    const { result, rerender } = renderHook(() => useBuilderState(args({ mode: "theorycraft" })));
    act(() => result.current.handleWeaponChange(WEAPON));
    expect(result.current.attachments).toEqual(DEFAULT.attachments);

    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    pricesQuery = PRICES_READY;
    rerender();
    expect(result.current.attachments).toEqual(DEFAULT.attachments);
  });
});

describe("useBuilderState gate", () => {
  const STOCK = {
    ...part("mod-stock"),
    buyFor: [trader("mechanic", 4, 9_000, "x")],
    types: ["mods"],
  } as unknown as AttachablePart;

  it("gives every part its availability under the gate the price uses", () => {
    catalogQuery = { data: [STOCK], isLoading: false, error: null };
    let mode: UseBuilderStateArgs["mode"] = "progression";
    const { result, rerender } = renderHook(() =>
      useBuilderState(args({ mode, profile: DEFAULT_PROFILE })),
    );
    expect(result.current.availabilityById.get("mod-stock")).toMatchObject({ available: false });
    mode = "theorycraft";
    rerender();
    expect(result.current.availabilityById.get("mod-stock")).toMatchObject({
      available: true,
      priceRUB: 9_000,
    });
  });

  it("embeds the profile in a saved build only in progression", () => {
    let mode: UseBuilderStateArgs["mode"] = "progression";
    const { result, rerender } = renderHook(() =>
      useBuilderState(args({ mode, embedProfileOnSave: true })),
    );
    expect(result.current.currentBuild.profileSnapshot).toEqual(FLEA_PROFILE);
    mode = "theorycraft";
    rerender();
    expect(result.current.currentBuild.profileSnapshot).toBeUndefined();
  });
});
