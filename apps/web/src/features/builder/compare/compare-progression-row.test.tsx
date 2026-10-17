// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CompareProgressionRow } from "./compare-progression-row.js";

afterEach(() => cleanup());

const priced = { status: "priced", totalRUB: 26_666, presetId: "carbine" } as const;
const locked = { status: "unobtainable", missing: ["gun"] } as const;

describe("CompareProgressionRow", () => {
  it("claims nothing about either side until prices are in", () => {
    render(
      <CompareProgressionRow
        left={{ price: priced, gated: true }}
        right={{ price: locked, gated: true }}
        pricesReady={false}
      />,
    );
    expect(screen.getByTestId("compare-price-row")).toHaveTextContent("——");
    expect(screen.queryByText("REACHABLE")).not.toBeInTheDocument();
    expect(screen.queryByText("LOCKED")).not.toBeInTheDocument();
  });

  it("then prices each side, and marks reach only on a side with a profile", () => {
    const { rerender } = render(
      <CompareProgressionRow
        left={{ price: priced, gated: true }}
        right={{ price: locked, gated: true }}
        pricesReady
      />,
    );
    expect(screen.getByText("₽26,666")).toBeInTheDocument();
    expect(screen.getByText("REACHABLE")).toBeInTheDocument();
    expect(screen.getByText("LOCKED")).toBeInTheDocument();

    rerender(
      <CompareProgressionRow
        left={{
          price: { status: "unknown", knownRUB: 1_000, unpriced: ["a", "b"], presetId: null },
          gated: false,
        }}
        right={{ price: null, gated: false }}
        pricesReady
      />,
    );
    expect(screen.getByText("₽1,000+")).toBeInTheDocument();
    expect(screen.getByText("2 UNPRICED")).toBeInTheDocument();
    expect(screen.queryByText("REACHABLE")).not.toBeInTheDocument();
  });
});
