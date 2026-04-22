import { useEffect, useState } from "react";
import { router } from "../../router.js";

const CHORD_TIMEOUT_MS = 1000;

function isTypingContext(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export interface UseKeyboardShortcutsResult {
  overlayOpen: boolean;
  setOverlayOpen: (v: boolean) => void;
}

/**
 * Registers the global keyboard shortcut layer. Call once at the App root.
 *
 * Shortcuts:
 *   ?     Toggle the shortcut overlay
 *   g b   → /builder
 *   g c   → /calc
 *   g d   → /data
 *   /     Focus first <select>/<input type="search">
 *   Esc   Close overlay (dialogs handle their own Esc)
 *
 * Input-safety: no shortcut (except Esc for overlay) fires while focus is in
 * an input/textarea/select/contenteditable.
 */
export function useKeyboardShortcuts(): UseKeyboardShortcutsResult {
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    let chordPrefix: "g" | null = null;
    let chordTimer: ReturnType<typeof setTimeout> | null = null;

    const clearChord = () => {
      chordPrefix = null;
      if (chordTimer) {
        clearTimeout(chordTimer);
        chordTimer = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      // Escape always closes the overlay (but not other dialogs — they own it).
      if (e.key === "Escape" && overlayOpen) {
        setOverlayOpen(false);
        return;
      }

      // Input-safety gate for every other shortcut.
      if (isTypingContext(document.activeElement)) return;

      // Modifier keys skip.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // `?` toggles overlay (requires Shift+/ on most layouts).
      if (e.key === "?") {
        e.preventDefault();
        setOverlayOpen((o) => !o);
        clearChord();
        return;
      }

      // `/` focuses first select/search input.
      if (e.key === "/") {
        const target = document.querySelector<HTMLElement>("select, input[type='search']");
        if (target) {
          e.preventDefault();
          target.focus();
        }
        clearChord();
        return;
      }

      // Chord: `g` + letter
      if (chordPrefix === "g") {
        const dest =
          e.key === "b" ? "/builder" : e.key === "c" ? "/calc" : e.key === "d" ? "/data" : null;
        if (dest) {
          e.preventDefault();
          void router.navigate({ to: dest });
        }
        clearChord();
        return;
      }
      if (e.key === "g") {
        e.preventDefault();
        chordPrefix = "g";
        chordTimer = setTimeout(clearChord, CHORD_TIMEOUT_MS);
        return;
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearChord();
    };
  }, [overlayOpen]);

  return { overlayOpen, setOverlayOpen };
}
