import type { ReactNode } from "react";
import { COLORS } from "./colors.js";
import { truncate } from "./truncate.js";
import type { BuildCardViewModel } from "./view-model.js";

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 72;
const BRACKET = 40;
const BRACKET_STROKE = 4;

const fontDisplay = "Bungee";
const fontSans = "Chivo";
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

function Pill({ children, tone }: { children: ReactNode; tone: "amber" | "paper" }): ReactNode {
  const color = tone === "amber" ? COLORS.amber : COLORS.paperDim;
  return (
    <div
      style={{
        display: "flex",
        fontFamily: fontMono,
        fontSize: 22,
        fontWeight: 500,
        color,
        border: `1.5px solid ${color}`,
        padding: "6px 16px",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 8 }}>
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 20,
          color: COLORS.paperDim,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 44,
          fontWeight: 700,
          color: COLORS.foreground,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function fmt(n: number | null, digits = 0): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function buildCard(vm: BuildCardViewModel): ReactNode {
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
      }}
    >
      <Bracket corner="tl" />
      <Bracket corner="tr" />
      <Bracket corner="bl" />
      <Bracket corner="br" />

      {/* SHAREABLE stamp */}
      <div
        style={{
          position: "absolute",
          top: 44,
          right: 72,
          fontFamily: fontMono,
          fontSize: 22,
          color: COLORS.amber,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
        }}
      >
        SHAREABLE
      </div>

      {/* Headline + optional subtitle */}
      <div
        style={{
          position: "absolute",
          top: 108,
          left: PAD,
          right: PAD,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: fontDisplay,
            fontSize: 72,
            color: COLORS.foreground,
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          {truncate(vm.title, 22)}
        </div>
        {vm.subtitle && (
          <div style={{ fontFamily: fontSans, fontSize: 24, color: COLORS.paperDim }}>
            {vm.subtitle}
          </div>
        )}
      </div>

      {/* Pill row */}
      <div
        style={{
          position: "absolute",
          top: 260,
          left: PAD,
          right: PAD,
          display: "flex",
          gap: 12,
        }}
      >
        <Pill tone="amber">{vm.availability}</Pill>
        <Pill tone="paper">{vm.modCount} MODS</Pill>
        {vm.priceRub !== null && <Pill tone="paper">₽ {vm.priceRub.toLocaleString("en-US")}</Pill>}
      </div>

      {/* Stat row */}
      <div
        style={{
          position: "absolute",
          bottom: 104,
          left: PAD,
          right: PAD,
          display: "flex",
          gap: 32,
          paddingTop: 24,
          borderTop: `1px dashed ${COLORS.border}`,
        }}
      >
        <StatCell label="ERGO" value={fmt(vm.stats.ergo)} />
        <StatCell label="RECOIL V" value={fmt(vm.stats.recoilV)} />
        <StatCell label="RECOIL H" value={fmt(vm.stats.recoilH)} />
        <StatCell label="WEIGHT" value={fmt(vm.stats.weight, 2)} />
        <StatCell label="ACCURACY" value={fmt(vm.stats.accuracy, 1)} />
      </div>

      {/* Brand */}
      <div
        style={{
          position: "absolute",
          bottom: 44,
          left: PAD,
          display: "flex",
          fontFamily: fontMono,
          fontSize: 24,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          gap: 8,
        }}
      >
        <span style={{ color: COLORS.amber }}>▲ TARKOVGUNSMITH</span>
        <span style={{ color: COLORS.paperDim }}>· SHARED BUILD</span>
      </div>
    </div>
  );
}
