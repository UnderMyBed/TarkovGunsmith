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
 * Scanned: the TypeScript and CSS sources of the SPA, its Pages Functions and the UI
 * primitives, test files excluded (they may name a colour to assert on). Exempt: the token
 * file itself, and `packages/og`, because satori cannot read CSS variables and
 * `packages/og/src/colors.ts` is the one sanctioned hex mirror of the palette.
 */
const SCANNED_DIRS = ["apps/web/src", "apps/web/functions", "packages/ui/src"];
const TOKEN_FILE = "packages/ui/src/styles/index.css";

const PALETTE_HUES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black";
const COLOUR_UTILITIES =
  "bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|divide|placeholder|accent|caret|shadow";

/**
 * A hex colour ends at anything that cannot continue it. `_` is not one of those: Tailwind
 * writes spaces in arbitrary values as `_`, so `color-mix(in_srgb,#f59e0b_10%,transparent)`
 * must still match.
 */
const HEX_END = "(?![0-9a-zA-Z-])";

/** The characters a colour value follows: a bracket, quote, `:`, `,`, `(`, `_` or a space. */
const COLOUR_CONTEXT = "(?<=[\\[\"'`:,(_\\s])";

/** Each rule names what it found, so a failure reads as the fix. */
const RULES: ReadonlyArray<readonly [name: string, pattern: RegExp]> = [
  // Six or eight hex digits, or three or four with at least one letter, anywhere.
  [
    "hex colour",
    new RegExp(`#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|(?=[0-9]*[a-fA-F])[0-9a-fA-F]{3,4})${HEX_END}`),
  ],
  ["functional colour", /\b(?:rgba?|hsla?)\(/],
  [
    "Tailwind palette class",
    new RegExp(`\\b(?:${COLOUR_UTILITIES})-(?:${PALETTE_HUES})(?:-\\d{2,3})?(?![\\w-])`),
  ],
];

/**
 * An all-digit short hex (`#000`, `#333`) reads exactly like an issue reference (`#162`), so
 * it only counts in code, where it follows a colour context — never in a comment.
 */
const DIGIT_HEX = new RegExp(`${COLOUR_CONTEXT}#[0-9]{3,4}${HEX_END}`);

/** The code on a line: nothing for a comment line, and no trailing `// …` comment. */
function codeOf(line: string): string {
  if (/^\s*(?:\/\/|\/\*|\*|\{\/\*)/.test(line)) return "";
  return line.replace(/\s\/\/\s.*$/, "");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "__fixtures__")
        out.push(...sourceFiles(full));
    } else if (/\.(?:tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
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
    const digits = DIGIT_HEX.exec(codeOf(line));
    if (digits) found.push(`${file}:${i + 1}: hex colour — ${digits[0]}`);
  });
  return found;
}

describe("colour comes from the design tokens", () => {
  it("no raw colour in the SPA, its stylesheet, its Pages Functions or the UI primitives", () => {
    const violations = SCANNED_DIRS.flatMap((dir) =>
      sourceFiles(join(REPO_ROOT, dir))
        .map((file) => relative(REPO_ROOT, file))
        .filter((file) => file !== TOKEN_FILE)
        .flatMap((file) => rawColours(file, readFileSync(join(REPO_ROOT, file), "utf8"))),
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
    // A hex inside Tailwind's `_`-separated arbitrary value — the form a tint takes.
    expect(
      rawColours("x.tsx", 'className="bg-[color-mix(in_srgb,#f59e0b_10%,transparent)]"'),
    ).toHaveLength(1);
    // All-digit short hex in a colour context, in a class, a string and an attribute.
    expect(rawColours("x.tsx", 'className="bg-[#000]"')).toHaveLength(1);
    expect(rawColours("x.ts", 'const c = "#333";')).toHaveLength(1);
    expect(rawColours("x.tsx", '<path fill="#000" />')).toHaveLength(1);
    expect(rawColours("x.css", "  color: #000;")).toHaveLength(1);
    // An issue reference in a comment, in every comment form, stays legal.
    expect(rawColours("x.tsx", " * Regression guard for issue #162.")).toEqual([]);
    expect(rawColours("x.tsx", "const x = 1; // see #265")).toEqual([]);
    expect(rawColours("x.tsx", "{/* fixed by #163 */}")).toEqual([]);
  });
});
