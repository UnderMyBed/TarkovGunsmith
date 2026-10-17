// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type * as TarkovData from "@tarkov/data";
import {
  DEFAULT_PROFILE,
  type BuyForEntry,
  type PlayerProfile,
  type PricedPreset,
  type WeaponListItem,
} from "@tarkov/data";
import { useBuilderState, type UseBuilderStateArgs } from "./useBuilderState.js";

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
vi.mock("@tarkov/data", async () => {
  const actual = await vi.importActual<typeof TarkovData>("@tarkov/data");
  return {
    ...actual,
    useBuilderSnapshot: () => idleQuery,
    useWeaponList: () => weaponsQuery,
    usePartCatalog: () => idleQuery,
    useWeaponTree: () => idleQuery,
    useWeaponPresets: () => presetsQuery,
  };
});

afterEach(() => {
  cleanup();
  presetsQuery = idleQuery;
  weaponsQuery = idleQuery;
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

function args(overrides: Partial<UseBuilderStateArgs> = {}): UseBuilderStateArgs {
  return {
    initialWeaponId: "",
    initialModIds: undefined,
    initialAttachments: undefined,
    initialOrphaned: undefined,
    profile: FLEA_PROFILE,
    buildName: "",
    buildDescription: "",
    embedProfileOnSave: false,
    ...overrides,
  };
}

describe("useBuilderState and presets", () => {
  it("never seeds a loaded build, even when the presets arrive after it", () => {
    presetsQuery = { data: undefined, isLoading: true, error: null };
    const saved = { mod_muzzle: "mod-muzzle" };
    const { result, rerender } = renderHook(() =>
      useBuilderState(args({ initialWeaponId: WEAPON, initialAttachments: saved })),
    );
    expect(result.current.isLoading).toBe(true);

    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    rerender();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.attachments).toEqual(saved);
  });

  it("seeds the default when every weapon is shown (theorycraft), whatever it costs", () => {
    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    const { result } = renderHook(() => useBuilderState(args()));
    act(() => result.current.setShowAllWeapons(true));
    act(() => result.current.handleWeaponChange(WEAPON));
    expect(result.current.weaponId).toBe(WEAPON);
    expect(result.current.attachments).toEqual(DEFAULT.attachments);
  });

  it("seeds the cheapest preset the profile can buy when the default is locked", () => {
    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    const { result } = renderHook(() => useBuilderState(args()));
    act(() => result.current.handleWeaponChange(WEAPON));
    expect(result.current.attachments).toEqual(PRAPOR.attachments);
  });

  it("starts empty for a weapon without presets", () => {
    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    const { result } = renderHook(() =>
      useBuilderState(args({ initialAttachments: { mod_muzzle: "mod-muzzle" } })),
    );
    act(() => result.current.handleWeaponChange("w-other"));
    expect(result.current.attachments).toEqual({});
  });

  it("keeps a loaded build's orphans when a preset is applied", () => {
    presetsQuery = { data: PRESETS, isLoading: false, error: null };
    const { result } = renderHook(() =>
      useBuilderState(
        args({ initialWeaponId: WEAPON, initialAttachments: {}, initialOrphaned: ["gone"] }),
      ),
    );
    act(() => result.current.applyPreset(DEFAULT.attachments));
    expect(result.current.attachments).toEqual(DEFAULT.attachments);
    expect(result.current.orphaned).toEqual(["gone"]);

    act(() => result.current.clearOrphaned());
    expect(result.current.orphaned).toEqual([]);
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

  function render(initialWeaponId: string) {
    weaponsQuery = { data: [OTHER_LOCKED, LOCKED, OPEN], isLoading: false, error: null };
    return renderHook(() => useBuilderState(args({ initialWeaponId, profile: DEFAULT_PROFILE })));
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

  it("marks nothing when every weapon is shown", () => {
    const { result } = render(WEAPON);
    act(() => result.current.setShowAllWeapons(true));
    expect(result.current.weaponOptions.map((w) => [w.id, w.lockedBy])).toEqual([
      ["w-open", null],
      ["w-other", null],
      [WEAPON, null],
    ]);
  });
});
