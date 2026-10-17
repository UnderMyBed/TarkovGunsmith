// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
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
  centerOfImpact: 0.01,
  deviationCurve: 1.35,
  velocity: 0,
  fireRate: 800,
  effectiveDistance: 500,
  sightingRange: 100,
  defaultAmmo: { name: "M855", initialSpeed: 922 },
};

/** What every mod that is neither a barrel nor a sight carries for these fields. */
const PLAIN = { centerOfImpact: 0, deviationMax: null, velocity: 0, sightingRange: null } as const;

// Hera Arms CQR + Magpul UBR GEN2 + Vltor MUR-1S: sum -0.495, a -49.5% build.
const realMods: BallisticMod[] = [
  {
    id: "5a33e75ac4a2826c6e06d759",
    name: "CQR AR15",
    ergonomicsDelta: 15,
    recoilModifier: -0.23,
    weight: 0.499,
    accuracyModifier: 0,
    ...PLAIN,
  },
  {
    id: "5947e98b86f774778f1448bc",
    name: "UBR GEN2",
    ergonomicsDelta: 8,
    recoilModifier: -0.225,
    weight: 0.61,
    accuracyModifier: 0,
    ...PLAIN,
  },
  {
    id: "59bfe68886f7746004266202",
    name: "MUR-1S",
    ergonomicsDelta: 7,
    recoilModifier: -0.04,
    weight: 0.246,
    accuracyModifier: 0,
    ...PLAIN,
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
    // Stock 119 struck through, current 119 * 0.505 = 60.095, to one decimal as the Spec panel shows it.
    expect(screen.getByText("119")).toBeInTheDocument();
    expect(screen.getByText("60.1")).toBeInTheDocument();
  });

  it("rounds away floating-point noise in the current values", () => {
    // A -34.4% build: 119 × 0.656 is 78.06400000000001 in floating point, which production
    // printed whole.
    renderHeader([{ ...realMods[0]!, ergonomicsDelta: 7, recoilModifier: -0.344 }]);
    expect(screen.getByText("78.1")).toBeInTheDocument();
    expect(screen.getByText("224.4")).toBeInTheDocument();
    expect(screen.queryByText(/\d\.\d{3,}/)).not.toBeInTheDocument();
  });

  it("leaves the delta blank when no mods are attached", () => {
    renderHeader([]);
    expect(screen.queryByText(/^[−+]\d+%$/)).not.toBeInTheDocument();
  });
});

// AR-15 5.56x45 10.3 inch barrel (55d35ee94bdc2d61338b4568), live values.
const BARREL_10_3: BallisticMod = {
  id: "55d35ee94bdc2d61338b4568",
  name: "AR-15 5.56x45 10.3 inch barrel",
  ergonomicsDelta: -2,
  recoilModifier: -0.052000000000000005,
  weight: 0.409,
  accuracyModifier: 0,
  centerOfImpact: 0.07,
  deviationMax: 22,
  velocity: -11,
  sightingRange: null,
};

describe("BuildHeader accuracy", () => {
  it("shows the build's MOA alone, with no comparison against the barrel-less stock", () => {
    // (0.01 + 0.07) cm × 100 / 2.9089 = 2.75 MOA. The stock receiver alone is 0.34, which
    // a delta or a bar would show every real build as worse than.
    renderHeader([BARREL_10_3]);
    const row = screen.getByText("MOA").parentElement!;
    expect(row).toHaveTextContent(/^MOA2\.75$/);
    expect(screen.queryByText("0.34")).not.toBeInTheDocument();
    expect(screen.queryByText("+2.41")).not.toBeInTheDocument();
    // No bar fill: StatRow renders one only when given a percent.
    expect(row.querySelector("span[style]")).toBeNull();
  });
});

describe("BuildHeader ergonomics floor", () => {
  // 48 base − 71 from parts sums to −23; the game floors effective ergonomics at 0.
  const heavy: BallisticMod = { ...realMods[0]!, ergonomicsDelta: -71 };

  it("shows a build summing below 0 as 0, with the raw sum in the row's title", () => {
    renderHeader([heavy]);
    const row = screen.getByText("Ergonomics").parentElement!;
    expect(row).toHaveAttribute("title", "−23 before the game's floor at 0");
    // Label, stock 48, delta −48 (named "worse") against the floored 0 (not −71), value 0.
    expect(row).toHaveTextContent(/^Ergonomics48-48 worse0$/);
    expect(within(row).getByText("-48")).toBeInTheDocument();
    expect(row.querySelector("span[style]")).toHaveStyle({ width: "0%" });
  });

  it("gives no title to a build at or above the floor", () => {
    renderHeader(realMods);
    expect(screen.getByText("Ergonomics").parentElement!).not.toHaveAttribute("title");
  });
});

describe("BuildHeader flags", () => {
  const base = {
    name: "",
    description: "",
    onNameChange: () => {},
    onDescriptionChange: () => {},
    currentSpec: null,
    stockSpec: null,
  };

  it("flags an incomplete build, naming the empty required slots", () => {
    render(<BuildHeader {...base} missingRequired={["Barrel", "Gas block"]} />);
    const pill = screen.getByText(/Incomplete/);
    expect(pill).toHaveTextContent("Incomplete · 2 required empty");
    expect(pill).toHaveAttribute("title", "Required slots empty: Barrel, Gas block");
  });

  it("flags clashing parts, listing each pair", () => {
    render(<BuildHeader {...base} conflicts={["ADAR stock × M4SS"]} />);
    const pill = screen.getByText(/Conflict/);
    expect(pill).toHaveTextContent("Conflict · 1");
    expect(pill).toHaveAttribute("title", "ADAR stock × M4SS");
  });

  it("shows neither for a complete build with no clash", () => {
    render(<BuildHeader {...base} />);
    expect(screen.queryByText(/Incomplete/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Conflict/)).not.toBeInTheDocument();
  });
});
