import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Guard for GitHub issue #162: Tailwind v4 never scanned `packages/ui/src`.
 *
 * `@tarkov/ui` resolves through `node_modules` (a pnpm workspace symlink) and Tailwind's
 * automatic source detection deliberately never descends there, so every utility class used
 * ONLY by a design-system primitive was absent from the production stylesheet: no
 * `focus-visible:` ring on `<Button>`/`<Input>`, no `before:`/`after:` corner brackets on
 * `<Card variant="bracket">`, no `-rotate-2` on `<Stamp>`, no grid template on `<StatRow>`.
 * The components rendered the class names; the stylesheet had no matching rule.
 *
 * Why this test and not a jsdom one: the eleven `packages/ui/src/components/*.test.tsx`
 * files asserted on those exact class strings and passed straight through the bug, because
 * the class genuinely IS on the DOM node — only the CSS rule was missing. jsdom does not run
 * Tailwind, so `getComputedStyle` there cannot tell the difference either. The only honest
 * detector is the compiled stylesheet, so this test compiles it.
 *
 * The compile is the real one: the app's own `src/styles.css`, the real `@tailwindcss/vite`
 * plugin, and Vite rooted at `apps/web` — the two inputs that decide what gets scanned. It
 * runs in memory (`write: false`) and touches no build output.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "../..");
const UI_COMPONENTS = path.join(REPO_ROOT, "packages/ui/src/components");

/**
 * Classes that reach the stylesheet ONLY because `packages/ui/src` is scanned.
 *
 * Every entry is verified by `guards only classes apps/web does not use itself` below: if a
 * class also appears in this app's own sources, Tailwind's auto-detection of the `apps/web`
 * root would emit it regardless and the entry would silently stop guarding anything.
 *
 * These are the visually load-bearing ones — the classes whose absence is the difference
 * between a focus ring and none, a bracketed panel and a plain box, a stat grid and a
 * collapsed row.
 */
const UI_ONLY_CLASSES: ReadonlyArray<readonly [component: string, classes: readonly string[]]> = [
  [
    "button.tsx",
    [
      // The focus ring, and the `outline-none` that suppresses the UA default. These two
      // travel together: `outline-none` without the ring means NO focus indicator at all.
      //
      // <Button> still renders every one of these, but the string literals now live in
      // `packages/ui/src/lib/focus-ring.ts` — the single `focusRing` definition that both
      // this primitive and the app's raw <button> elements (tab strips, table sort headers,
      // body-zone hotspots, mod-list rows) share. Tailwind scans that file for the same
      // reason it scans this one, so the guard is unchanged: these classes must have rules.
      "focus-visible:outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-[var(--color-ring)]",
      "focus-visible:ring-offset-2",
      "focus-visible:ring-offset-[var(--color-background)]",
      "disabled:pointer-events-none",
      "disabled:opacity-40",
      // size="icon" — without this the icon button has no width.
      "w-9",
    ],
  ],
  [
    "card.tsx",
    [
      // variant="bracket" / "bracket-olive" — the Field Ledger corner brackets, in use at
      // every bracketed panel in the app.
      "before:content-['']",
      "before:absolute",
      "before:top-[-1px]",
      "before:left-[-1px]",
      "before:w-3.5",
      "before:h-3.5",
      "before:border-[2px]",
      "before:border-b-0",
      "before:border-r-0",
      "before:border-[var(--color-primary)]",
      "before:border-[var(--color-olive)]",
      "after:content-['']",
      "after:absolute",
      "after:bottom-[-1px]",
      "after:right-[-1px]",
      "after:w-3.5",
      "after:h-3.5",
      "after:border-[2px]",
      "after:border-t-0",
      "after:border-l-0",
      "after:border-[var(--color-primary)]",
      "after:border-[var(--color-olive)]",
      "text-[var(--color-card-foreground)]",
    ],
  ],
  [
    "input.tsx",
    [
      "focus-visible:border-[var(--color-primary)]",
      "focus-visible:ring-1",
      "focus-visible:ring-[var(--color-primary)]",
    ],
  ],
  ["stamp.tsx", ["-rotate-2", "tracking-25", "border-[1.5px]", "px-2.5"]],
  [
    "stat-row.tsx",
    [
      // The five-column template. Without it the whole row collapses to a single column.
      "grid-cols-[110px_46px_56px_48px_1fr]",
      "gap-2.5",
      "bg-[var(--color-olive)]",
    ],
  ],
  ["skeleton.tsx", ["animate-pulse", "space-y-2"]],
  ["dialog.tsx", ["max-w-2xl", "duration-150"]],
  ["pill.tsx", ["bg-[color:rgba(122,139,63,0.1)]", "bg-[color:rgba(245,158,11,0.08)]", "py-[2px]"]],
  ["section-title.tsx", ["my-8", "h-px", "bg-[var(--color-border)]"]],
  [
    "weapon-silhouette.tsx",
    ["[filter:grayscale(1)_brightness(0.95)_contrast(1.15)]", "mix-blend-multiply"],
  ],
];

/**
 * Primitives with no class of their own to guard, and why. Listed explicitly so the
 * completeness check below cannot be satisfied by simply forgetting a component.
 */
const UNGUARDABLE: ReadonlyMap<string, string> = new Map([
  [
    "tarkov-icon.tsx",
    "Its only class is `inline-block`, which apps/web uses directly in three places " +
      "(charts.tsx, profile-editor.tsx, slot-tree.tsx). The app's own scan emits it either " +
      "way, so it cannot detect whether packages/ui is scanned.",
  ],
]);

/**
 * Matches the CSS rule Tailwind emits for `cls`. Tailwind backslash-escapes every character
 * that is not valid bare in a selector (`focus-visible:ring-2` becomes
 * `.focus-visible\:ring-2`), so each non-`[A-Za-z0-9_-]` character is matched with an
 * optional leading backslash. The trailing lookahead stops `.h-1` from matching `.h-10`.
 */
function ruleFor(cls: string): RegExp {
  const body = [...cls]
    .map((ch) =>
      /[A-Za-z0-9_-]/.test(ch) ? ch : `\\\\?${ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    )
    .join("");
  return new RegExp(`\\.${body}(?![A-Za-z0-9_-])`);
}

/**
 * Every file Tailwind's auto-detection reads under `apps/web` — the whole Vite root, minus
 * what git ignores (Tailwind honours .gitignore) and minus what `src/styles.css` excludes
 * with `@source not`. Reading the root rather than a couple of hand-listed directories
 * matters: the top-level configs and `public/` are scanned too, and a guarded class hiding
 * in one of them would look green while guarding nothing.
 */
const NOT_SCANNED = new Set([
  // git-ignored, so Tailwind skips them
  "node_modules",
  "dist",
  ".turbo",
  ".wrangler",
  "coverage",
  "test-results",
  "playwright-report",
  // excluded by `@source not` in src/styles.css
  "e2e",
]);

function scannedAppSources(): string {
  const chunks: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (NOT_SCANNED.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        /\.(tsx?|jsx?|[cm]js|html|css|json|md|svg)$/.test(entry.name) &&
        !/\.test\.tsx?$/.test(entry.name)
      ) {
        chunks.push(readFileSync(full, "utf8"));
      }
    }
  };
  walk(APP_ROOT);
  return chunks.join("\n");
}

/**
 * True if `cls` appears in `haystack` as a whole class token rather than as a prefix of a
 * longer one (`h-1` inside `h-10`, `py-1` inside `py-16`).
 */
function usesClass(haystack: string, cls: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(cls, from);
    if (at === -1) return false;
    const before = haystack[at - 1] ?? " ";
    const after = haystack[at + cls.length] ?? " ";
    if (!/[\w[-]/.test(before) && !/[\w\]-]/.test(after)) return true;
    from = at + 1;
  }
}

let css = "";

beforeAll(async () => {
  const result = await build({
    root: APP_ROOT,
    configFile: false,
    logLevel: "silent",
    plugins: [tailwindcss()],
    build: {
      write: false,
      cssMinify: false,
      sourcemap: false,
      rollupOptions: { input: path.join(APP_ROOT, "src/styles.css") },
    },
  });
  const outputs = Array.isArray(result)
    ? result[0].output
    : "output" in result
      ? result.output
      : [];
  css = outputs
    .filter((o) => o.type === "asset" && o.fileName.endsWith(".css"))
    .map((o) => String(o.source))
    .join("\n");
  expect(
    css.length,
    "the stylesheet compiled to nothing — the harness itself is broken",
  ).toBeGreaterThan(1_000);
}, 180_000);

describe("production stylesheet — @tarkov/ui primitives", () => {
  it.each(UI_ONLY_CLASSES)(
    "%s: every class it renders has a matching rule in the compiled CSS",
    (component, classes) => {
      const missing = classes.filter((cls) => !ruleFor(cls).test(css));
      expect(
        missing,
        `packages/ui/src/components/${component} renders these classes but the stylesheet ` +
          `has no rule for them. The markup will carry the class names and paint nothing. ` +
          `Check the @source directives in packages/ui/src/styles/index.css.`,
      ).toEqual([]);
    },
  );

  it("keeps a visible focus ring wherever it suppresses the UA outline", () => {
    // `focus-visible:outline-none` removes the browser's own focus indicator. If it ships
    // without the ring that replaces it, keyboard users get NO focus indication anywhere —
    // strictly worse than the bug this file guards. The two must arrive together.
    expect(ruleFor("focus-visible:outline-none").test(css)).toBe(true);
    for (const ring of [
      "focus-visible:ring-2", // <Button>
      "focus-visible:ring-[var(--color-ring)]",
      "focus-visible:ring-1", // <Input>
      "focus-visible:ring-[var(--color-primary)]",
    ]) {
      expect(ruleFor(ring).test(css), `${ring} has no rule`).toBe(true);
    }
    // The ring is drawn as a box-shadow. Assert the emitted rule actually paints one rather
    // than merely existing as an empty selector.
    const ringRule = /\.focus-visible\\:ring-2:focus-visible\s*\{([^}]*)\}/.exec(css);
    expect(ringRule?.[1] ?? "", "focus-visible:ring-2 emitted no declarations").toMatch(
      /box-shadow/,
    );
  });
});

describe("the guard itself", () => {
  it("covers every primitive in packages/ui/src/components", () => {
    const components = readdirSync(UI_COMPONENTS)
      .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
      .sort();
    const guarded = new Set([...UI_ONLY_CLASSES.map(([c]) => c), ...UNGUARDABLE.keys()]);
    const unaccounted = components.filter((c) => !guarded.has(c));
    expect(
      unaccounted,
      "a new @tarkov/ui primitive landed without an entry here. Add its ui-only classes to " +
        "UI_ONLY_CLASSES, or add it to UNGUARDABLE with the reason it has none.",
    ).toEqual([]);
  });

  it("guards only classes apps/web does not use itself", () => {
    // A class this app also writes is emitted by the app's own scan whether or not
    // packages/ui is scanned — so it would look green while guarding nothing.
    const appSources = scannedAppSources();
    const useless = UI_ONLY_CLASSES.flatMap(([component, classes]) =>
      classes.filter((cls) => usesClass(appSources, cls)).map((cls) => `${component}: ${cls}`),
    );
    expect(
      useless,
      "these classes are used by apps/web directly, so apps/web's own source scan emits " +
        "them regardless and they cannot detect a packages/ui scan regression. Replace them " +
        "with classes unique to the primitive.",
    ).toEqual([]);
  });

  it("compiles the CSS the same way vite.config.ts does", () => {
    // This file reproduces production by rooting Vite at apps/web and calling
    // `tailwindcss()` with no options — the two inputs that decide what gets scanned. If the
    // real config ever passes options, mirror them in `beforeAll` above or this guard drifts
    // away from the build it claims to check.
    const viteConfig = readFileSync(path.join(APP_ROOT, "vite.config.ts"), "utf8");
    expect(viteConfig).toMatch(/\btailwindcss\(\)/);
    expect(statSync(path.join(APP_ROOT, "src/styles.css")).isFile()).toBe(true);
  });
});
