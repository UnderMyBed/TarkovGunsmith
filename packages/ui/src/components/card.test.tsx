import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardVariants,
} from "./card.js";
import { classList, classSignature } from "../__test-utils__/class-set.js";

afterEach(() => cleanup());

const VARIANTS = ["plain", "bracket", "bracket-olive"] as const;

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

  /* The bracket variants draw their corner marks with ::before / ::after pseudo-elements.
   * jsdom applies no stylesheet, so the only thing assertable here is that the variant adds
   * decoration on top of the shared base and that the two bracket colours differ. That those
   * classes resolve to real painted rules is checked against the compiled stylesheet in
   * apps/web/src/styles.test.ts — the check that GitHub issue #162 needed and jsdom cannot
   * give. */
  it("adds decoration classes for a bracket variant, on top of everything plain renders", () => {
    render(<Card data-testid="plain" />);
    const plain = classList(screen.getByTestId("plain"));
    cleanup();
    render(<Card variant="bracket" data-testid="bracket" />);
    const bracket = screen.getByTestId("bracket");
    expect(bracket).toHaveClass(...plain);
    expect(bracket.classList.length).toBeGreaterThan(plain.length);
  });

  it("renders the default (plain) variant with no decoration beyond the base", () => {
    render(<Card data-testid="implicit" />);
    const implicit = classSignature(screen.getByTestId("implicit"));
    cleanup();
    render(<Card variant="plain" data-testid="explicit" />);
    expect(classSignature(screen.getByTestId("explicit"))).toBe(implicit);
  });

  it("gives every variant its own class set", () => {
    const signatures = VARIANTS.map((variant) => {
      render(<Card variant={variant} data-testid="card" />);
      const sig = classSignature(screen.getByTestId("card"));
      cleanup();
      return sig;
    });
    expect(new Set(signatures).size).toBe(VARIANTS.length);
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

/* The pure-function tests below were previously a sibling `card.test.ts`. They live here
 * now because TypeScript's `include` resolution drops the lower-priority extension when two
 * files share a basename — `card.test.ts` silently shadowed `card.test.tsx`, excluding
 * the render tests from the type-checked program entirely. Vitest resolved both, so they ran
 * and passed while never being typechecked. One file per component avoids the collision. */
describe("cardVariants", () => {
  it("returns a distinct class string for each variant", () => {
    const strings = VARIANTS.map((variant) => cardVariants({ variant }));
    expect(new Set(strings).size).toBe(VARIANTS.length);
  });

  it("returns the base classes unchanged for the plain variant", () => {
    expect(cardVariants({ variant: "plain" }).trim()).toBe(cardVariants({}).trim());
  });

  it("keeps every plain class in the bracket variants and adds to them", () => {
    const plain = cardVariants({ variant: "plain" }).split(/\s+/).filter(Boolean);
    for (const variant of ["bracket", "bracket-olive"] as const) {
      const decorated = cardVariants({ variant }).split(/\s+/).filter(Boolean);
      expect(decorated).toEqual(expect.arrayContaining(plain));
      expect(decorated.length).toBeGreaterThan(plain.length);
    }
  });
});
