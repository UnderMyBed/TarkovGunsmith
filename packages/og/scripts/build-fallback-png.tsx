/* `scripts/` sits outside tsconfig.json's `include`, so tsx would compile this file with the
 * classic JSX runtime and fail on a missing `React` global. The pragma selects the automatic
 * runtime the package itself builds with. */
/** @jsxRuntime automatic */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { COLORS } from "../src/colors.js";
import { loadFonts } from "../src/fonts.js";
import { renderPng } from "../src/render.js";

const WIDTH = 1200;
const HEIGHT = 630;

function fallbackCard(): ReactNode {
  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        background: COLORS.background,
        color: COLORS.foreground,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          fontFamily: "Chivo",
          fontWeight: 700,
          fontSize: 84,
          color: COLORS.foreground,
          lineHeight: 1,
        }}
      >
        Build not found
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: "Chivo",
          fontSize: 28,
          color: COLORS.dim,
        }}
      >
        Link expired or never existed
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 44,
          display: "flex",
          alignItems: "center",
          fontFamily: "Bungee",
          fontSize: 22,
          gap: 10,
          color: COLORS.foreground,
        }}
      >
        <svg width="20" height="17" viewBox="0 0 14 12">
          <path d="M7 0 14 12H0z" fill={COLORS.accent} />
        </svg>
        TarkovGunsmith
      </div>
    </div>
  );
}

async function main(): Promise<void> {
  const fonts = await loadFonts();
  const png = await renderPng(fallbackCard(), fonts, { width: WIDTH, height: HEIGHT });
  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  const out = resolve(scriptsDir, "../assets/fallback-card.png");
  writeFileSync(out, png);
  console.log(`wrote ${out} (${png.byteLength} bytes)`);
}

void main();
