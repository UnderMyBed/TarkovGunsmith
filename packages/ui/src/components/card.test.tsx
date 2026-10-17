import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card.js";
import { classList } from "../__test-utils__/class-set.js";

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

  it("merges a caller className onto Card without dropping its own classes", () => {
    render(<Card data-testid="card" />);
    const own = classList(screen.getByTestId("card"));
    cleanup();
    render(<Card className="p-4" data-testid="card" />);
    const el = screen.getByTestId("card");
    expect(el).toHaveClass("p-4");
    expect(el).toHaveClass(...own);
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

  it.each([
    ["CardHeader", CardHeader],
    ["CardContent", CardContent],
    ["CardFooter", CardFooter],
  ])("merges a caller className onto %s without dropping its own layout classes", (_name, Sub) => {
    render(<Sub data-testid="sub" />);
    const own = classList(screen.getByTestId("sub"));
    cleanup();
    render(<Sub className="mt-2" data-testid="sub" />);
    const el = screen.getByTestId("sub");
    expect(el).toHaveClass("mt-2");
    expect(el).toHaveClass(...own);
  });
});
