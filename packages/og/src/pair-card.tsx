import type { ReactNode } from "react";
import { COLORS } from "./colors.js";
import { truncate } from "./truncate.js";
import type { PairCardViewModel, SideViewModel } from "./view-model.js";

const WIDTH = 1200;
const HEIGHT = 630;
const BRACKET = 40;
const BRACKET_STROKE = 4;

const fontDisplay = "Bungee";
const fontMono = "Azeret Mono";

function Bracket({ corner }: { corner: "tl" | "tr" | "bl" | "br" }): ReactNode {
  const base = {
    position: "absolute" as const,
    width: BRACKET,
    height: BRACKET,
    border: `${BRACKET_STROKE}px solid ${COLORS.amber}`,
  };
  const pos =
    corner === "tl"
      ? { top: 28, left: 28, borderRight: "none", borderBottom: "none" }
      : corner === "tr"
        ? { top: 28, right: 28, borderLeft: "none", borderBottom: "none" }
        : corner === "bl"
          ? { bottom: 28, left: 28, borderRight: "none", borderTop: "none" }
          : { bottom: 28, right: 28, borderLeft: "none", borderTop: "none" };
  return <div style={{ ...base, ...pos }} />;
}

function fmt(n: number | null, digits = 0): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function Side({
  side,
  label,
  tone,
}: {
  side: SideViewModel | null;
  label: "BUILD A" | "BUILD B";
  tone: "paper" | "amber";
}): ReactNode {
  const nameColor = tone === "amber" ? COLORS.amber : COLORS.foreground;
  if (!side) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "100px 72px",
          gap: 24,
        }}
      >
        <div
          style={{
            fontFamily: fontMono,
            fontSize: 20,
            color: COLORS.paperDim,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: fontDisplay,
            fontSize: 48,
            color: COLORS.paperDim,
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          EMPTY SLOT
        </div>
      </div>
    );
  }
  const rows: [string, string][] = [
    ["ERGO", fmt(side.stats.ergo)],
    ["RECOIL V", fmt(side.stats.recoilV)],
    ["RECOIL H", fmt(side.stats.recoilH)],
    ["WEIGHT", fmt(side.stats.weight, 2)],
  ];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "100px 72px",
        gap: 18,
      }}
    >
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 20,
          color: COLORS.paperDim,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 48,
          color: nameColor,
          textTransform: "uppercase",
          lineHeight: 1,
        }}
      >
        {truncate(side.weapon, 14)}
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: fontMono,
          fontSize: 22,
          color: COLORS.paperDim,
          letterSpacing: "0.05em",
        }}
      >
        {side.modCount} MODS · {side.availability}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 12,
          gap: 10,
        }}
      >
        {rows.map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: fontMono,
              borderBottom: `1px dashed ${COLORS.lineMuted}`,
              paddingBottom: 6,
            }}
          >
            <span style={{ color: COLORS.paperDim, fontSize: 22, letterSpacing: "0.1em" }}>
              {k}
            </span>
            <span style={{ color: COLORS.foreground, fontSize: 26, fontWeight: 700 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function pairCard(vm: PairCardViewModel): ReactNode {
  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        background: COLORS.background,
        color: COLORS.foreground,
        position: "relative",
        display: "flex",
      }}
    >
      <Bracket corner="tl" />
      <Bracket corner="tr" />
      <Bracket corner="bl" />
      <Bracket corner="br" />

      {/* Divider */}
      <div
        style={{
          position: "absolute",
          top: 100,
          bottom: 100,
          left: WIDTH / 2 - 0.5,
          width: 1,
          background: COLORS.border,
        }}
      />

      {/* VS circle */}
      <div
        style={{
          position: "absolute",
          top: HEIGHT / 2 - 42,
          left: WIDTH / 2 - 42,
          width: 84,
          height: 84,
          border: `4px solid ${COLORS.amber}`,
          background: COLORS.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fontDisplay,
          fontSize: 32,
          color: COLORS.amber,
        }}
      >
        VS
      </div>

      <Side side={vm.left} label="BUILD A" tone="paper" />
      <Side side={vm.right} label="BUILD B" tone="amber" />

      {/* Brand */}
      <div
        style={{
          position: "absolute",
          bottom: 44,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          fontFamily: fontMono,
          fontSize: 22,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          gap: 8,
        }}
      >
        <span style={{ color: COLORS.amber }}>▲ TARKOVGUNSMITH</span>
        <span style={{ color: COLORS.paperDim }}>· BUILD COMPARISON</span>
      </div>
    </div>
  );
}
