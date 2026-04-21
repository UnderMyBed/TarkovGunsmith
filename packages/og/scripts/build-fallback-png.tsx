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
  const bracket = (pos: Record<string, number | string>): ReactNode => (
    <div
      style={{
        position: "absolute",
        width: 40,
        height: 40,
        border: `4px solid ${COLORS.amber}`,
        ...pos,
      }}
    />
  );
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
      {bracket({ top: 28, left: 28, borderRight: "none", borderBottom: "none" })}
      {bracket({ top: 28, right: 28, borderLeft: "none", borderBottom: "none" })}
      {bracket({ bottom: 28, left: 28, borderRight: "none", borderTop: "none" })}
      {bracket({ bottom: 28, right: 28, borderLeft: "none", borderTop: "none" })}
      <div
        style={{
          display: "flex",
          fontFamily: "Bungee",
          fontSize: 84,
          textTransform: "uppercase",
          color: COLORS.foreground,
          lineHeight: 1,
        }}
      >
        BUILD NOT FOUND
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: "Chivo",
          fontSize: 28,
          color: COLORS.paperDim,
        }}
      >
        link expired or never existed
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 44,
          display: "flex",
          fontFamily: "Azeret Mono",
          fontSize: 22,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          gap: 8,
          color: COLORS.amber,
        }}
      >
        ▲ TARKOVGUNSMITH
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
