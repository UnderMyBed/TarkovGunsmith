import { useEffect, useRef } from "react";
import type { Progression } from "@tarkov/data";
import { track, type TrackEvent, type TrackEvents } from "./track.js";

type TrackArgs<E extends TrackEvent> = TrackEvents[E] extends undefined ? [] : [TrackEvents[E]];

/**
 * Sends `event` the first time `when` is true while the calling component is mounted, and
 * never again for that mount.
 */
export function useTrackOnce<E extends TrackEvent>(
  when: boolean,
  event: E,
  ...args: TrackArgs<E>
): void {
  const sent = useRef(false);
  useEffect(() => {
    if (!when || sent.current) return;
    sent.current = true;
    track(event, ...args);
    // Sent once, with the attributes it had then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when]);
}

/**
 * Sends `mode_changed` when the Builder's mode changes, whatever changed it: the mode switch,
 * or setting a profile. The mode the page opens in is not a change.
 */
export function useModeChangedEvent(mode: Progression["mode"]): void {
  const last = useRef(mode);
  useEffect(() => {
    if (last.current === mode) return;
    last.current = mode;
    track("mode_changed", { mode });
  }, [mode]);
}
