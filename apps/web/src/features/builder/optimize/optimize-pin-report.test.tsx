// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { tinyTree } from "../../../test/tiny-tree.js";
import { OptimizePinReport } from "./optimize-pin-report.js";

afterEach(() => cleanup());

const tree = tinyTree("w", [
  {
    nameId: "receiver",
    name: "Receiver",
    items: [["upper", [{ nameId: "barrel", name: "Barrel", items: ["b1", "b2"] }]], "upper2"],
  },
  { nameId: "stock", name: "Stock", required: true, items: ["s1"] },
  { nameId: "muzzle", name: "Muzzle", items: ["mz"] },
]);
const NAMES: Record<string, string> = {
  upper: "Upper receiver",
  upper2: "Short upper",
  b1: "Long barrel",
  mz: "Brake",
  s1: "Fixed stock",
};
const nameOf = (id: string) => NAMES[id] ?? id;

describe("OptimizePinReport", () => {
  it("renders nothing when the run had no pins", () => {
    const { container } = render(
      <OptimizePinReport
        pins={{ honoured: [], dropped: [] }}
        slotTree={tree}
        proposed={{}}
        current={{}}
        nameOf={nameOf}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("names each kept pin and says why each dropped one went, by slot and part name", () => {
    render(
      <OptimizePinReport
        pins={{
          honoured: ["receiver/barrel", "muzzle"],
          dropped: [
            { path: "receiver/barrel/muzzle", itemId: "mz", reason: "absent" },
            { path: "stock", itemId: "mz", reason: "not-allowed" },
            { path: "receiver", itemId: "ghost-id", reason: "unknown-item" },
            { path: "stock", itemId: null, reason: "required" },
          ],
        }}
        slotTree={tree}
        proposed={{ receiver: "upper", "receiver/barrel": "b1" }}
        current={{ stock: "s1" }}
        nameOf={nameOf}
      />,
    );
    const report = screen.getByRole("region", { name: "Pins" });
    expect(report).toHaveTextContent("2 KEPT");
    expect(report).toHaveTextContent("4 DROPPED");
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "KEPTReceiver › BarrelLong barrel",
      "KEPTMuzzleempty",
      "DROPPEDReceiver › Barrel › muzzleBrake · This build has no muzzle slot there.",
      "DROPPEDStockBrake · Stock doesn't take Brake.",
      "DROPPEDReceiverghost-id · ghost-id is not in the game data.",
      "DROPPEDStockempty · Stock is required, so it can't be left empty.",
    ]);
  });
});
