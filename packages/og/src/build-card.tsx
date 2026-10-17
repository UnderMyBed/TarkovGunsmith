import type { ReactNode } from "react";
import { COLORS } from "./colors.js";
import { truncate } from "./truncate.js";
import type { BuildCardViewModel } from "./view-model.js";

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 72;

const fontDisplay = "Bungee";
const fontSans = "Chivo";
const fontMono = "Azeret Mono";

/** A share-card chip. The availability pill takes the accent; the rest are neutral. */
function Pill({
  children,
  tone,
  numeric = false,
}: {
  children: ReactNode;
  tone: "accent" | "neutral";
  numeric?: boolean;
}): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: numeric ? fontMono : fontSans,
        fontSize: 22,
        fontWeight: numeric ? 500 : 700,
        color: tone === "accent" ? COLORS.accentText : COLORS.foreground2,
        border: `1.5px solid ${tone === "accent" ? COLORS.accent : COLORS.lineStrong}`,
        borderRadius: 6,
        padding: "6px 16px",
      }}
    >
      {children}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 8 }}>
      <div style={{ fontFamily: fontSans, fontSize: 20, color: COLORS.dim }}>{label}</div>
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

/** The triangle mark and the Bungee wordmark — the one place Bungee is used. */
function Wordmark(): ReactNode {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width="20" height="17" viewBox="0 0 14 12">
        <path d="M7 0 14 12H0z" fill={COLORS.accent} />
      </svg>
      <span style={{ fontFamily: fontDisplay, color: COLORS.foreground }}>TarkovGunsmith</span>
    </div>
  );
}

function fmt(n: number, digits = 0): string {
  if (Number.isNaN(n)) return "—";
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
      {/* Shareable stamp */}
      <div
        style={{
          position: "absolute",
          top: 44,
          right: PAD,
          display: "flex",
          fontFamily: fontSans,
          fontSize: 22,
          fontWeight: 700,
          color: COLORS.accentText,
          border: `1.5px solid ${COLORS.accent}`,
          borderRadius: 6,
          padding: "4px 14px",
        }}
      >
        Shareable
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
            fontFamily: fontSans,
            fontWeight: 700,
            fontSize: 72,
            color: COLORS.foreground,
            lineHeight: 1,
          }}
        >
          {truncate(vm.title, 22)}
        </div>
        {vm.subtitle && (
          <div style={{ fontFamily: fontSans, fontSize: 24, color: COLORS.dim }}>{vm.subtitle}</div>
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
        {vm.availability !== null && <Pill tone="accent">{vm.availability}</Pill>}
        <Pill tone="neutral">{vm.modCount} mods</Pill>
        {vm.priceRub !== null && (
          <Pill tone="neutral" numeric>
            ₽ {vm.priceRub.toLocaleString("en-US")}
          </Pill>
        )}
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
          borderTop: `1px solid ${COLORS.line}`,
        }}
      >
        <StatCell label="Ergo" value={fmt(vm.stats.ergo)} />
        <StatCell label="Recoil V" value={fmt(vm.stats.recoilV)} />
        <StatCell label="Recoil H" value={fmt(vm.stats.recoilH)} />
        <StatCell label="Weight" value={fmt(vm.stats.weight, 2)} />
        <StatCell label="MOA" value={fmt(vm.stats.accuracy, 2)} />
      </div>

      {/* Brand */}
      <div
        style={{
          position: "absolute",
          bottom: 44,
          left: PAD,
          display: "flex",
          alignItems: "center",
          fontSize: 24,
          gap: 10,
        }}
      >
        <Wordmark />
        <span style={{ fontFamily: fontSans, fontWeight: 700, color: COLORS.dim }}>
          · Shared build
        </span>
      </div>
    </div>
  );
}
