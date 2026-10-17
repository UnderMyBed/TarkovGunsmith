// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CompareProgressionRow } from "./compare-progression-row.js";

afterEach(() => cleanup());

const priced = { status: "priced", totalRUB: 26_666, presetId: "carbine" } as const;
const locked = { status: "unobtainable", missing: ["gun"] } as const;
const READY = { state: "ready", asOf: "2026-10-17T01:50:29.000Z" } as const;

describe("CompareProgressionRow", () => {
  it("claims nothing about either side until prices are in", () => {
    render(
      <CompareProgressionRow
        left={{ price: priced, gated: true }}
        right={{ price: locked, gated: true }}
        prices={{ state: "loading" }}
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
        prices={READY}
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
        prices={READY}
      />,
    );
    expect(screen.getByText("₽1,000+")).toBeInTheDocument();
    expect(screen.getByText("2 UNPRICED")).toBeInTheDocument();
    expect(screen.queryByText("REACHABLE")).not.toBeInTheDocument();
  });

  it("says why there are no prices when they failed", () => {
    render(
      <CompareProgressionRow
        left={{ price: priced, gated: true }}
        right={{ price: null, gated: false }}
        prices={{ state: "error", message: "json.tarkov.dev answered 503 Service Unavailable" }}
      />,
    );
    expect(screen.getByTestId("compare-price-row")).toHaveTextContent("——");
    expect(
      screen.getByText("Prices unavailable: json.tarkov.dev answered 503 Service Unavailable"),
    ).toBeInTheDocument();
  });

  it("shows how old a table served from the cache is", () => {
    // The fallback copy from two days earlier: its prices show, with their age beside them.
    const stale = "2026-10-15T09:12:00.000Z";
    render(
      <CompareProgressionRow
        left={{ price: priced, gated: false }}
        right={{ price: null, gated: false }}
        prices={{ state: "ready", asOf: stale }}
      />,
    );
    expect(screen.getByText("₽26,666")).toBeInTheDocument();
    const time = screen.getByText(/^Prices as of/).querySelector("time");
    expect(time).toHaveAttribute("datetime", stale);
    expect(time).toHaveTextContent("15 Oct, 09:12 UTC");
  });
});
