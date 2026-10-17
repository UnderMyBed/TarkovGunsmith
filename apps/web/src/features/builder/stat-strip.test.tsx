// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { weaponSpec, type WeaponSpec } from "@tarkov/ballistics";
import type { BuildPrice } from "@tarkov/data";
import { BARREL_10_3, M4A1, RECOIL_MODS, VP09 } from "../../test/weapon-fixtures.js";
import type { PricesStatus } from "./build-price.js";
import { StatStrip, direction, formatDelta, formatPercent, oneDecimal } from "./stat-strip.js";

afterEach(() => cleanup());

const STOCK = weaponSpec(M4A1, []);
const READY: PricesStatus = { state: "ready", asOf: "2026-10-17T00:00:00Z" };
const NAMES: Record<string, string> = { "w-m4a1": "M4A1", "mod-x": "Mystery stock" };
const nameOf = (id: string) => NAMES[id] ?? id;

function renderStrip(
  spec: WeaponSpec,
  opts: {
    prices?: PricesStatus;
    buildPrice?: BuildPrice | null;
    boughtAs?: string | null;
    onOptimize?: () => void;
  } = {},
) {
  render(
    <StatStrip
      spec={spec}
      stockSpec={STOCK}
      prices={opts.prices ?? READY}
      buildPrice={opts.buildPrice ?? null}
      boughtAs={opts.boughtAs ?? null}
      nameOf={nameOf}
      onOptimize={opts.onOptimize}
    />,
  );
}

/** A stat's value: the first `<dd>` after its `<dt>`. */
const value = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling as HTMLElement;
/** The line under a stat's value. */
const sub = (label: string) => value(label).nextElementSibling as HTMLElement;

describe("StatStrip", () => {
  it("shows each stat against stock, with a better/worse delta spoken as well as coloured", () => {
    renderStrip(weaponSpec(M4A1, RECOIL_MODS));
    expect(value("Ergonomics")).toHaveTextContent(/^78$/);
    expect(sub("Ergonomics")).toHaveTextContent("48 stock +30 better");
    expect(value("Vertical recoil")).toHaveTextContent(/^60\.1$/);
    // Both recoil axes take the same multiplier, so they move by the same percent.
    expect(sub("Vertical recoil")).toHaveTextContent("119 stock −50% better");
    expect(sub("Horizontal recoil")).toHaveTextContent("342 stock −50% better");
    expect(value("Weight")).toHaveTextContent("2.10 kg");
    expect(sub("Weight")).toHaveTextContent("0.75 stock +1.35 worse");
    expect(screen.getByText("+30")).toHaveAttribute("title", "better");
    expect(screen.getByText("+1.35")).toHaveAttribute("title", "worse");
  });

  it("leaves every delta blank for the stock weapon", () => {
    renderStrip(STOCK);
    expect(sub("Ergonomics")).toHaveTextContent(/^48 stock\s*$/);
    expect(screen.queryByText(/better|worse/)).not.toBeInTheDocument();
  });

  it("shows ergonomics summing below 0 as the game's 0, with the raw sum in a title", () => {
    const parts = [
      { ...BARREL_10_3, ergonomicsDelta: -32 },
      { ...VP09, ergonomicsDelta: -39 },
    ];
    renderStrip(weaponSpec(M4A1, parts));
    expect(value("Ergonomics")).toHaveTextContent(/^0$/);
    expect(value("Ergonomics")).toHaveAttribute("title", "−23 before the game's floor at 0");
    expect(sub("Ergonomics")).toHaveTextContent("48 stock −48 worse");
  });

  it("gives no title to ergonomics at or above the floor", () => {
    renderStrip(weaponSpec(M4A1, [VP09]));
    expect(value("Ergonomics")).toHaveTextContent(/^46$/);
    expect(value("Ergonomics")).not.toHaveAttribute("title");
  });

  it("shows accuracy alone, with its base and modifier and no comparison to the barrel-less stock", () => {
    renderStrip(weaponSpec(M4A1, [BARREL_10_3, VP09]));
    expect(value("Accuracy")).toHaveTextContent("2.64 MOA");
    expect(sub("Accuracy")).toHaveTextContent("base 2.75 · accuracy +4%");
    expect(sub("Accuracy")).not.toHaveTextContent("stock");
  });

  it("prices the build as the preset it is bought as, setting only the rouble figure in mono", () => {
    renderStrip(STOCK, {
      buildPrice: { status: "priced", totalRUB: 26_666, presetId: "p1" },
      boughtAs: "M4A1 Carbine",
    });
    const cost = screen.getByTestId("build-cost");
    expect(cost).toHaveTextContent("Cost₽26,666as the M4A1 Carbine preset");
    expect(value("Cost")).toHaveClass("font-mono");
    expect(sub("Cost")).not.toHaveClass("font-mono");
  });

  it("says what is known of a price with a part unpriced", () => {
    renderStrip(STOCK, {
      buildPrice: { status: "unknown", knownRUB: 12_000, unpriced: ["mod-x"], presetId: null },
    });
    expect(value("Cost")).toHaveTextContent("₽12,000");
    expect(sub("Cost")).toHaveTextContent("Known so far; no price for Mystery stock");
  });

  it("says what cannot be bought, with no figure", () => {
    renderStrip(STOCK, {
      buildPrice: { status: "unobtainable", missing: ["mod-x"] },
      boughtAs: "M4A1 Carbine",
    });
    expect(value("Cost")).toHaveTextContent("—");
    expect(sub("Cost")).toHaveTextContent(/^Can't be bought: Mystery stock$/);
  });

  it("waits for prices, and says when there are none", () => {
    renderStrip(STOCK, { prices: { state: "loading" } });
    expect(sub("Cost")).toHaveTextContent("Waiting for prices");
    expect(screen.queryByTestId("build-cost")).not.toBeInTheDocument();
    cleanup();
    renderStrip(STOCK, { prices: { state: "error", message: "down" } });
    expect(sub("Cost")).toHaveTextContent("No prices");
  });

  it("offers Optimize at its end only when given the action", async () => {
    const onOptimize = vi.fn();
    renderStrip(STOCK, { onOptimize });
    await userEvent.setup().click(screen.getByRole("button", { name: "Optimize" }));
    expect(onOptimize).toHaveBeenCalledOnce();
    cleanup();
    renderStrip(STOCK);
    expect(screen.queryByRole("button", { name: "Optimize" })).not.toBeInTheDocument();
  });
});

describe("stat formatting", () => {
  it("rounds to one decimal and drops a trailing .0", () => {
    expect(oneDecimal(119)).toBe("119");
    expect(oneDecimal(60.0905)).toBe("60.1");
    expect(oneDecimal(224.41000000001)).toBe("224.4");
  });

  it("signs a delta with a true minus, blank under rounding noise", () => {
    expect(formatDelta(7, 0)).toBe("+7");
    expect(formatDelta(-48, 0)).toBe("−48");
    expect(formatDelta(1.3555, 2)).toBe("+1.36");
    expect(formatDelta(0.001, 2)).toBe("");
  });

  it("gives a whole percent change, blank for no stock or under half a percent", () => {
    expect(formatPercent(60, 120)).toBe("−50%");
    expect(formatPercent(130, 100)).toBe("+30%");
    expect(formatPercent(100.2, 100)).toBe("");
    expect(formatPercent(5, 0)).toBe("");
  });

  it("calls a change better or worse by which way the stat runs", () => {
    expect(direction(5, false)).toBe("better");
    expect(direction(5, true)).toBe("worse");
    expect(direction(-5, true)).toBe("better");
    expect(direction(0, true)).toBeNull();
  });
});
