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
 * `progression` with setters that send `mode_changed` when they change the mode: the mode
 * switch, and setting a profile, which moves to progression. Only setters called in this tab
 * send. A change another tab makes reaches this one through a storage event, outside these
 * setters, so it is counted once, in the tab where it was made.
 */
export function withModeTracking(progression: Progression): Progression {
  const { mode, setMode, setProfile } = progression;
  return {
    ...progression,
    setMode: (next) => {
      if (next !== mode) track("mode_changed", { mode: next });
      setMode(next);
    },
    setProfile: (next) => {
      if (mode !== "progression") track("mode_changed", { mode: "progression" });
      setProfile(next);
    },
  };
}
