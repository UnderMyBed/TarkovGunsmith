// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ItemAvailability, WeaponPreset } from "@tarkov/data";
import { tinyTree } from "../../test/tiny-tree.js";
import { PresetPicker, type PresetPickerProps } from "./preset-picker.js";

afterEach(() => cleanup());

const M4A1 = "5447a9cd4bdc2dbd208b4567";

// `selectWeaponPresets` over the committed items capture: the M4A1 Carbine (default) and
// SOPMOD II, each trimmed to the slots this test needs, real ids throughout.
const CARBINE: WeaponPreset = {
  id: "5af08cf886f774223c269184",
  name: "Colt M4A1 5.56x45 assault rifle Carbine",
  shortName: "M4A1 Carbine",
  weaponId: M4A1,
  isDefault: true,
  attachments: {
    mod_pistol_grip: "55d4b9964bdc2d1d4e8b456e",
    mod_reciever: "55d355e64bdc2d962f8b4569",
    "mod_reciever/mod_barrel": "55d3632e4bdc2d972f8b4569",
  },
};
const SOPMOD: WeaponPreset = {
  id: "5a8ae73886f7747b2e6e1416",
  name: "Colt M4A1 5.56x45 assault rifle SOPMOD II",
  shortName: "M4A1 SOPMOD II",
  weaponId: M4A1,
  isDefault: false,
  attachments: {
    mod_pistol_grip: "5a339805c4a2826c6e06d73d",
    mod_reciever: "55d355e64bdc2d962f8b4569",
    "mod_reciever/mod_barrel": "55d35ee94bdc2d61338b4568",
  },
};
const PRESETS = [CARBINE, SOPMOD];

// The slots these presets fill, shaped as on the M4A1.
const TREE = tinyTree(M4A1, [
  { nameId: "mod_pistol_grip", items: ["55d4b9964bdc2d1d4e8b456e", "5a339805c4a2826c6e06d73d"] },
  {
    nameId: "mod_reciever",
    items: [
      [
        "55d355e64bdc2d962f8b4569",
        [{ nameId: "mod_barrel", items: ["55d3632e4bdc2d972f8b4569", "55d35ee94bdc2d61338b4568"] }],
      ],
    ],
  },
]);
const KNOWN = new Map(
  [
    "55d4b9964bdc2d1d4e8b456e",
    "5a339805c4a2826c6e06d73d",
    "55d355e64bdc2d962f8b4569",
    "55d3632e4bdc2d972f8b4569",
    "55d35ee94bdc2d61338b4568",
  ].map((id) => [id, { conflictingItems: [], conflictingSlotIds: [] }]),
);

function Picker(props: Omit<PresetPickerProps, "tree" | "known">) {
  return <PresetPicker tree={TREE} known={KNOWN} {...props} />;
}

// What `presetAvailability` reads at LL1 for the Carbine: Peacekeeper's LL2 barter.
const CARBINE_LOCKED: ItemAvailability = {
  available: false,
  reason: "trader-ll-required",
  traderNormalizedName: "peacekeeper",
  minLevel: 2,
  payment: "barter",
  preset: { id: CARBINE.id, normalizedName: "colt-m4a1-556x45-assault-rifle-carbine" },
};

const chip = (name: RegExp) => screen.getByRole("button", { name });

describe("PresetPicker", () => {
  it("renders nothing for a weapon without presets", () => {
    const { container } = render(<Picker presets={[]} attachments={{}} onApply={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists every preset and an empty build, marking the default and the current one", () => {
    render(<Picker presets={PRESETS} attachments={CARBINE.attachments} onApply={vi.fn()} />);
    expect(chip(/M4A1 Carbine/)).toHaveAttribute("aria-pressed", "true");
    expect(chip(/M4A1 Carbine/)).toHaveTextContent("Default");
    expect(chip(/M4A1 SOPMOD II/)).toHaveAttribute("aria-pressed", "false");
    expect(chip(/Empty/)).toHaveAttribute("aria-pressed", "false");
  });

  it("applies a preset at once when the build matches a preset", () => {
    const onApply = vi.fn();
    render(<Picker presets={PRESETS} attachments={{}} onApply={onApply} />);
    expect(chip(/Empty/)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip(/M4A1 SOPMOD II/));
    expect(onApply).toHaveBeenCalledWith(SOPMOD.attachments);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks before replacing parts that match no preset", () => {
    const onApply = vi.fn();
    const ownWork = {
      ...CARBINE.attachments,
      mod_pistol_grip: SOPMOD.attachments.mod_pistol_grip!,
    };
    render(<Picker presets={PRESETS} attachments={ownWork} onApply={onApply} />);

    fireEvent.click(chip(/M4A1 SOPMOD II/));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Replace your current parts with M4A1 SOPMOD II?",
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep current parts" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(chip(/Empty/));
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(onApply).toHaveBeenCalledWith({});
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("matches a preset whatever the key order", () => {
    const reordered = Object.fromEntries(Object.entries(CARBINE.attachments).reverse());
    expect(Object.keys(reordered)).not.toEqual(Object.keys(CARBINE.attachments));
    render(<Picker presets={PRESETS} attachments={reordered} onApply={vi.fn()} />);
    expect(chip(/M4A1 Carbine/)).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores a stale key no slot shows, so it neither hides the chip nor asks", () => {
    const onApply = vi.fn();
    // A part left under a slot the build does not show (its parent is gone) is not on the gun.
    const stale = { ...CARBINE.attachments, "mod_stock/mod_stock": "5a33cae9c4a28232980eb086" };
    render(<Picker presets={PRESETS} attachments={stale} onApply={onApply} />);
    expect(chip(/M4A1 Carbine/)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip(/M4A1 SOPMOD II/));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onApply).toHaveBeenCalledWith(SOPMOD.attachments);
  });

  it("shows why a preset is locked, and still applies it", () => {
    const onApply = vi.fn();
    render(
      <Picker
        presets={PRESETS}
        attachments={{}}
        getAvailability={(id) => (id === CARBINE.id ? CARBINE_LOCKED : null)}
        onApply={onApply}
      />,
    );
    expect(chip(/M4A1 Carbine/)).toHaveTextContent("peacekeeper LL2 barter");
    expect(chip(/M4A1 Carbine/)).toHaveTextContent("LOCKED");
    expect(chip(/M4A1 SOPMOD II/)).not.toHaveTextContent("LOCKED");
    fireEvent.click(chip(/M4A1 Carbine/));
    expect(onApply).toHaveBeenCalledWith(CARBINE.attachments);
  });

  it("in theorycraft, shows a preset nothing sells neither dimmed nor LOCKED", () => {
    const noSources: ItemAvailability = { available: false, reason: "no-sources" };
    const { rerender } = render(
      <Picker
        presets={PRESETS}
        attachments={{}}
        getAvailability={() => noSources}
        mode="theorycraft"
        onApply={vi.fn()}
      />,
    );
    expect(chip(/M4A1 Carbine/)).not.toHaveTextContent("LOCKED");
    expect(chip(/M4A1 Carbine/)).not.toHaveTextContent("No sources");
    // Dimming has no accessible signal; its class is the only observable.
    expect(chip(/M4A1 Carbine/)).not.toHaveClass("opacity-60");

    rerender(
      <Picker
        presets={PRESETS}
        attachments={{}}
        getAvailability={() => noSources}
        mode="progression"
        onApply={vi.fn()}
      />,
    );
    expect(chip(/M4A1 Carbine/)).toHaveTextContent("LOCKED");
    expect(chip(/M4A1 Carbine/)).toHaveClass("opacity-60");
  });
});
