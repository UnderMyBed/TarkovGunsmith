import {
  AZERET_MONO_500_B64,
  AZERET_MONO_700_B64,
  BUNGEE_400_B64,
  CHIVO_700_B64,
  FALLBACK_CARD_B64,
} from "./embedded.js";
import { fontsFromBytes } from "./fonts.js";
import type { SatoriOptions } from "satori";

type SatoriFont = NonNullable<SatoriOptions["fonts"]>[number];

/**
 * Decode a base64 string to a Uint8Array. Works in both Node and CF Workers;
 * `atob` is a global in both.
 */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedFonts: SatoriFont[] | null = null;

/**
 * Return the four satori fonts this package ships, decoded from the
 * base64-embedded bytes. Synchronous; memoized per isolate.
 *
 * Use from Cloudflare Pages Functions — no filesystem, no network, just
 * decode-in-memory. Size: ~348 KB of b64 strings bundled in the JS module.
 */
export function embeddedFonts(): SatoriFont[] {
  if (cachedFonts) return cachedFonts;
  cachedFonts = fontsFromBytes({
    bungee400: b64ToBytes(BUNGEE_400_B64),
    chivo700: b64ToBytes(CHIVO_700_B64),
    azeretMono500: b64ToBytes(AZERET_MONO_500_B64),
    azeretMono700: b64ToBytes(AZERET_MONO_700_B64),
  });
  return cachedFonts;
}

let cachedFallbackPng: Uint8Array | null = null;

export function embeddedFallbackPng(): Uint8Array {
  if (cachedFallbackPng) return cachedFallbackPng;
  cachedFallbackPng = b64ToBytes(FALLBACK_CARD_B64);
  return cachedFallbackPng;
}
