// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { weaponSpec } from "@tarkov/ballistics";
import type { BallisticMod, BallisticWeapon } from "@tarkov/ballistics";
import { BuildHeader } from "./build-header.js";

afterEach(() => cleanup());

// Colt M4A1 5.56x45 assault rifle, live values.
const m4a1: BallisticWeapon = {
  id: "5447a9cd4bdc2dbd208b4567",
  name: "M4A1",
  baseErgonomics: 48,
  baseVerticalRecoil: 119,
  baseHorizontalRecoil: 342,
  baseWeight: 0.75,
  baseAccuracy: 3.5,
};

// Hera Arms CQR + Magpul UBR GEN2 + Vltor MUR-1S: sum -0.495, a -49.5% build.
const realMods: BallisticMod[] = [
  {
    id: "5a33e75ac4a2826c6e06d759",
    name: "CQR AR15",
    ergonomicsDelta: 15,
    recoilModifier: -0.23,
    weight: 0.499,
    accuracyModifier: 0,
  },
  {
    id: "5947e98b86f774778f1448bc",
    name: "UBR GEN2",
    ergonomicsDelta: 8,
    recoilModifier: -0.225,
    weight: 0.61,
    accuracyModifier: 0,
  },
  {
    id: "59bfe68886f7746004266202",
    name: "MUR-1S",
    ergonomicsDelta: 7,
    recoilModifier: -0.04,
    weight: 0.246,
    accuracyModifier: 0,
  },
];

function renderHeader(mods: BallisticMod[]) {
  return render(
    <BuildHeader
      name=""
      description=""
      onNameChange={() => {}}
      onDescriptionChange={() => {}}
      weaponName="M4A1"
      weaponId={null}
      currentSpec={weaponSpec(m4a1, mods)}
      stockSpec={weaponSpec(m4a1, [])}
      modCount={mods.length}
    />,
  );
}

describe("BuildHeader recoil delta", () => {
  it("shows a real percentage delta for a recoil-reducing build", () => {
    // `formatPercent` suppresses anything under 0.5%. While recoil was computed
    // 100x too small this build produced a 0.495% delta and the badge rendered
    // BLANK — the headline number of the whole Builder was invisible.
    // 119 -> 60.095 is -49.5%, which formats as "−50%".
    renderHeader(realMods);
    // One badge for RECOIL V, one for RECOIL H: both scale by the same
    // multiplier, so an equal delta on the two rows is the expected invariant.
    expect(screen.getAllByText("−50%")).toHaveLength(2);
  });

  it("renders the stock and current recoil values either side of that delta", () => {
    renderHeader(realMods);
    // Stock 119 struck through, current 119 * 0.505 = 60.095.
    expect(screen.getByText("119")).toBeInTheDocument();
    expect(screen.getByText("60.095")).toBeInTheDocument();
  });

  it("leaves the delta blank when no mods are attached", () => {
    renderHeader([]);
    expect(screen.queryByText(/^[−+]\d+%$/)).not.toBeInTheDocument();
  });
});
