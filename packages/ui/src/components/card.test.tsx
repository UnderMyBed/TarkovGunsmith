import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card.js";

afterEach(() => cleanup());

describe("Card", () => {
  it("renders a full header/content/footer composition with real content", () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>M4A1</CardTitle>
          <CardDescription>Assault rifle</CardDescription>
        </CardHeader>
        <CardContent>512mm barrel</CardContent>
        <CardFooter>Save build</CardFooter>
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "M4A1", level: 3 })).toBeInTheDocument();
    expect(screen.getByText("Assault rifle")).toBeInTheDocument();
    expect(screen.getByText("512mm barrel")).toBeInTheDocument();
    expect(screen.getByText("Save build")).toBeInTheDocument();
  });

  it("applies the bracket variant's before/after pseudo-element classes to the DOM node", () => {
    render(<Card variant="bracket" data-testid="card" />);
    expect(screen.getByTestId("card").className).toContain("before:border-[var(--color-primary)]");
  });

  it("applies no bracket classes for the default (plain) variant", () => {
    render(<Card data-testid="card" />);
    const cls = screen.getByTestId("card").className;
    expect(cls).not.toContain("before:");
    expect(cls).not.toContain("after:");
  });

  it("forwards refs through Card and every subcomponent", () => {
    const cardRef = createRef<HTMLDivElement>();
    const titleRef = createRef<HTMLHeadingElement>();
    const descRef = createRef<HTMLParagraphElement>();
    render(
      <Card ref={cardRef}>
        <CardHeader>
          <CardTitle ref={titleRef}>Title</CardTitle>
          <CardDescription ref={descRef}>Desc</CardDescription>
        </CardHeader>
      </Card>,
    );
    expect(cardRef.current).toBeInstanceOf(HTMLDivElement);
    expect(titleRef.current).toBeInstanceOf(HTMLHeadingElement);
    expect(descRef.current).toBeInstanceOf(HTMLParagraphElement);
  });

  it("merges caller className onto CardHeader without dropping the border-b layout classes", () => {
    render(
      <Card>
        <CardHeader className="mt-2" data-testid="header" />
      </Card>,
    );
    const el = screen.getByTestId("header");
    expect(el.className).toContain("mt-2");
    expect(el.className).toContain("border-b");
  });
});
