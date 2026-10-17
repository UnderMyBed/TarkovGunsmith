import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./repo.js";

/**
 * Colour comes from the `@theme` tokens in `packages/ui/src/styles/index.css` and nowhere
 * else. A raw hex, an `rgb()`/`hsl()` literal or a Tailwind palette class (`bg-red-700`,
 * `bg-black/70`) in a component renders perfectly well, so nothing else catches it — it just
 * stops moving when the palette does.
 *
 * Scanned: the TypeScript sources of the SPA, its Pages Functions and the UI primitives,
 * test files excluded (they may name a colour to assert on). `packages/og` is deliberately
 * out of scope: satori cannot read CSS variables, so `packages/og/src/colors.ts` is the one
 * sanctioned hex mirror of the palette.
 */
const SCANNED_DIRS = ["apps/web/src", "apps/web/functions", "packages/ui/src"];

const PALETTE_HUES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black";
const COLOUR_UTILITIES =
  "bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|divide|placeholder|accent|caret|shadow";

/** Each rule names what it found, so a failure reads as the fix. */
const RULES: ReadonlyArray<readonly [name: string, pattern: RegExp]> = [
  // Six or eight hex digits; or three or four with at least one letter, so an issue
  // reference like `#162` in a comment is not mistaken for a colour.
  [
    "hex colour",
    /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|(?=[0-9]*[a-fA-F])[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/,
  ],
  ["functional colour", /\b(?:rgba?|hsla?)\(/],
  [
    "Tailwind palette class",
    new RegExp(`\\b(?:${COLOUR_UTILITIES})-(?:${PALETTE_HUES})(?:-\\d{2,3})?(?![\\w-])`),
  ],
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "__fixtures__")
        out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every `file:line: rule — match` violation in `text`. */
function rawColours(file: string, text: string): string[] {
  const found: string[] = [];
  text.split("\n").forEach((line, i) => {
    for (const [name, pattern] of RULES) {
      const m = pattern.exec(line);
      if (m) found.push(`${file}:${i + 1}: ${name} — ${m[0]}`);
    }
  });
  return found;
}

describe("colour comes from the design tokens", () => {
  it("no raw colour in the SPA, its Pages Functions or the UI primitives", () => {
    const violations = SCANNED_DIRS.flatMap((dir) =>
      sourceFiles(join(REPO_ROOT, dir)).flatMap((file) =>
        rawColours(relative(REPO_ROOT, file), readFileSync(file, "utf8")),
      ),
    );
    expect(
      violations,
      "use a token from packages/ui/src/styles/index.css — `text-[var(--color-…)]`, or " +
        "`color-mix(in_srgb,var(--color-…)_N%,transparent)` for a tint",
    ).toEqual([]);
  });

  it("the guard catches each kind of raw colour, and passes tokens and issue refs", () => {
    expect(rawColours("x.tsx", 'className="text-[#f59e0b]"')).toHaveLength(1);
    expect(rawColours("x.tsx", "color: #fff;")).toHaveLength(1);
    expect(rawColours("x.tsx", 'className="bg-[rgba(245,158,11,0.06)]"')).toHaveLength(1);
    expect(rawColours("x.tsx", 'className="bg-red-700"')).toHaveLength(1);
    expect(rawColours("x.tsx", 'className="bg-black/70"')).toHaveLength(1);
    expect(rawColours("x.tsx", 'className="text-[var(--color-better)]"')).toEqual([]);
    expect(rawColours("x.tsx", "// See GitHub issue #162 and #1234.")).toEqual([]);
    expect(rawColours("x.tsx", 'className="bg-[var(--color-background)]/80"')).toEqual([]);
  });
});
