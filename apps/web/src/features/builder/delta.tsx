import { cn } from "@tarkov/ui";

/** Whether a change is an improvement; `null` when it is too small to call either way. */
export type Direction = "better" | "worse" | null;

/**
 * A signed change, coloured better or worse. The colour is never the only signal: the direction
 * is spoken (screen readers) and shown on hover. Renders nothing for an empty `text`.
 */
export function Delta({ text, dir }: { text: string; dir: Direction }) {
  if (text === "") return null;
  return (
    <span
      className={cn(
        "font-semibold",
        dir === "better" && "text-[var(--color-better)]",
        dir === "worse" && "text-[var(--color-worse)]",
      )}
      title={dir ?? undefined}
    >
      {text}
      {dir !== null && <span className="sr-only"> {dir}</span>}
    </span>
  );
}
