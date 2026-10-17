import type { ReactNode } from "react";
import { COLORS } from "./colors.js";
import { truncate } from "./truncate.js";
import type { PairCardViewModel, SideViewModel } from "./view-model.js";

const WIDTH = 1200;
const HEIGHT = 630;

const fontDisplay = "Bungee";
const fontSans = "Chivo";
const fontMono = "Azeret Mono";

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

function Side({
  side,
  label,
  tone,
}: {
  side: SideViewModel | null;
  label: "Build A" | "Build B";
  tone: "neutral" | "accent";
}): ReactNode {
  const nameColor = tone === "accent" ? COLORS.accentText : COLORS.foreground;
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
            fontFamily: fontSans,
            fontWeight: 700,
            fontSize: 20,
            color: COLORS.dim,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: fontSans,
            fontWeight: 700,
            fontSize: 48,
            color: COLORS.faint,
            lineHeight: 1,
          }}
        >
          Empty slot
        </div>
      </div>
    );
  }
  const rows: [string, string][] = [
    ["Ergo", fmt(side.stats.ergo)],
    ["Recoil V", fmt(side.stats.recoilV)],
    ["Recoil H", fmt(side.stats.recoilH)],
    ["Weight", fmt(side.stats.weight, 2)],
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
          fontFamily: fontSans,
          fontWeight: 700,
          fontSize: 20,
          color: COLORS.dim,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fontSans,
          fontWeight: 700,
          fontSize: 48,
          color: nameColor,
          lineHeight: 1,
        }}
      >
        {truncate(side.weapon, 14)}
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: fontSans,
          fontWeight: 700,
          fontSize: 22,
          color: COLORS.foreground2,
          flexWrap: "wrap",
          columnGap: 12,
        }}
      >
        {/* One unbreakable run per segment, each separator riding on the segment after it, so a
            long pill wraps between segments and never leaves a separator dangling. */}
        {[`${side.modCount} mods`, ...(side.availability?.split(" · ") ?? [])].map((seg, i) => (
          <span key={i} style={{ whiteSpace: "nowrap" }}>
            {i === 0 ? seg : `· ${seg}`}
          </span>
        ))}
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
              alignItems: "baseline",
              borderBottom: `1px solid ${COLORS.divider}`,
              paddingBottom: 6,
            }}
          >
            <span
              style={{ fontFamily: fontSans, fontWeight: 700, color: COLORS.dim, fontSize: 22 }}
            >
              {k}
            </span>
            <span
              style={{
                fontFamily: fontMono,
                color: COLORS.foreground,
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {v}
            </span>
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
      {/* Divider */}
      <div
        style={{
          position: "absolute",
          top: 100,
          bottom: 100,
          left: WIDTH / 2 - 0.5,
          width: 1,
          background: COLORS.line,
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
          border: `3px solid ${COLORS.accent}`,
          borderRadius: 42,
          background: COLORS.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fontSans,
          fontWeight: 700,
          fontSize: 30,
          color: COLORS.accentText,
        }}
      >
        vs
      </div>

      <Side side={vm.left} label="Build A" tone="neutral" />
      <Side side={vm.right} label="Build B" tone="accent" />

      {/* Brand */}
      <div
        style={{
          position: "absolute",
          bottom: 44,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: 22,
          gap: 10,
        }}
      >
        <Wordmark />
        <span style={{ fontFamily: fontSans, fontWeight: 700, color: COLORS.dim }}>
          · Build comparison
        </span>
      </div>
    </div>
  );
}
