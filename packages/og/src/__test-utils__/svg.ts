import satori, { type SatoriOptions } from "satori";
import type { ReactNode } from "react";

type SatoriFont = NonNullable<SatoriOptions["fonts"]>[number];

export async function renderSvg(
  jsx: ReactNode,
  fonts: SatoriFont[],
  opts: { width: number; height: number } = { width: 1200, height: 630 },
): Promise<string> {
  return satori(jsx, { ...opts, fonts, embedFont: false });
}

/**
 * Concatenate all `<text>` element inner content from a satori-produced SVG,
 * joined with spaces. Satori emits one `<text>` per word-run, so literal
 * multi-word strings like "RECOIL KING" fragment across siblings — regex
 * assertions must run against the concatenated form.
 */
export function textContent(svg: string): string {
  return Array.from(svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g))
    .map((m) => m[1] ?? "")
    .join(" ")
    .replace(/\s+/g, " ");
}
