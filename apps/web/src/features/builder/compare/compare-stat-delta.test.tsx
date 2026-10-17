// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CompareStatDelta } from "./compare-stat-delta.js";

afterEach(() => cleanup());

const base = { verticalRecoil: 60, horizontalRecoil: 170, weight: 3.1, accuracy: 2.17 };

/** The ergonomics row's four cells: label, left, right, delta. */
function ergonomicsRow(): HTMLElement[] {
  const label = screen.getByText("Ergonomics");
  const cells = [label];
  let next = label.nextElementSibling;
  while (next !== null && cells.length < 4) {
    cells.push(next as HTMLElement);
    next = next.nextElementSibling;
  }
  return cells;
}

describe("CompareStatDelta ergonomics floor", () => {
  it("shows a side below 0 as 0 with the raw sum in a title, and deltas the floored values", () => {
    render(
      <CompareStatDelta left={{ ...base, ergonomics: 55 }} right={{ ...base, ergonomics: -23 }} />,
    );
    const [, left, right, delta] = ergonomicsRow();
    expect(left).toHaveTextContent("55");
    expect(left).not.toHaveAttribute("title");
    expect(right).toHaveTextContent(/^0$/);
    expect(right).toHaveAttribute("title", "−23 before the game's floor at 0");
    expect(delta).toHaveTextContent("−55");
    expect(delta).toHaveAttribute("data-direction", "worse");
  });

  it("reads two builds below 0 as handling the same", () => {
    render(
      <CompareStatDelta
        left={{ ...base, ergonomics: -10 }}
        right={{ ...base, ergonomics: -23, weight: 3.4 }}
      />,
    );
    const [, left, right, delta] = ergonomicsRow();
    expect(left).toHaveAttribute("title", "−10 before the game's floor at 0");
    expect(right).toHaveAttribute("title", "−23 before the game's floor at 0");
    expect(delta).toHaveTextContent("±0");
    expect(delta).toHaveAttribute("data-direction", "neutral");
  });
});
