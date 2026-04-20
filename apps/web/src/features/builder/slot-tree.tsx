import type { SlotNode, WeaponTree, ItemAvailability } from "@tarkov/data";
import { Pill } from "@tarkov/ui";

export interface SlotTreeProps {
  tree: WeaponTree;
  attachments: Readonly<Record<string, string>>;
  onAttach: (path: string, itemId: string | null) => void;
  getAvailability?: (itemId: string) => ItemAvailability | null;
  showAll?: boolean;
}

export function SlotTree({ tree, attachments, onAttach, getAvailability, showAll }: SlotTreeProps) {
  if (tree.slots.length === 0) {
    return (
      <p className="font-mono text-xs tracking-[0.15em] uppercase text-[var(--color-muted-foreground)]">
        This weapon has no mod slots.
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {tree.slots.map((slot) => (
        <SlotRow
          key={slot.path}
          slot={slot}
          attachments={attachments}
          onAttach={onAttach}
          getAvailability={getAvailability}
          showAll={showAll}
          depth={0}
        />
      ))}
    </ul>
  );
}

function SlotRow({
  slot,
  attachments,
  onAttach,
  getAvailability,
  showAll,
  depth,
}: {
  slot: SlotNode;
  attachments: Readonly<Record<string, string>>;
  onAttach: (path: string, itemId: string | null) => void;
  getAvailability?: (itemId: string) => ItemAvailability | null;
  showAll?: boolean;
  depth: number;
}) {
  const selectedId = attachments[slot.path] ?? null;
  const selectedItem = selectedId ? slot.allowedItems.find((i) => i.id === selectedId) : null;
  const selectedAvailability =
    selectedItem && getAvailability ? getAvailability(selectedItem.id) : null;

  const indentPx = depth * 20;

  return (
    <li>
      <details className="group border-b border-dashed border-[var(--color-border)]">
        <summary
          className="flex cursor-pointer items-center gap-3 py-2 pr-3 hover:bg-[var(--color-muted)] transition-colors"
          style={{ paddingLeft: `${12 + indentPx}px` }}
        >
          <span
            aria-hidden
            className="font-mono text-[var(--color-primary)] text-xs group-open:rotate-90 transition-transform inline-block w-[10px]"
          >
            ▸
          </span>
          <span className="font-mono text-[11px] tracking-[0.15em] uppercase text-[var(--color-muted-foreground)] min-w-[140px]">
            {slot.name}
          </span>
          <span className="flex-1 text-sm truncate">
            {selectedItem ? (
              <span className="text-[var(--color-foreground)]">{selectedItem.name}</span>
            ) : (
              <span className="italic text-[var(--color-paper-dim)]">
                — empty —
                {slot.required && (
                  <span className="not-italic ml-2 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-destructive)]">
                    REQUIRED
                  </span>
                )}
              </span>
            )}
          </span>
          {selectedItem && <AvailabilityPill availability={selectedAvailability} />}
          <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-paper-dim)] whitespace-nowrap">
            {slot.allowedItems.length} opt{slot.allowedItems.length === 1 ? "" : "s"}
          </span>
        </summary>
        <div
          className="border-t border-dashed border-[var(--color-border)] py-2"
          style={{ paddingLeft: `${24 + indentPx}px` }}
        >
          {slot.allowedItems.length === 0 ? (
            <p className="p-2 font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-paper-dim)]">
              No explicit allowed items — category-based slot (deferred).
            </p>
          ) : (
            <ul className="flex flex-col">
              <li>
                <button
                  type="button"
                  onClick={() => onAttach(slot.path, null)}
                  className={`w-full px-3 py-1.5 text-left text-sm border-l-2 ${
                    !selectedId
                      ? "border-[var(--color-primary)] bg-[var(--color-muted)] text-[var(--color-primary)]"
                      : "border-transparent hover:bg-[var(--color-muted)]"
                  }`}
                >
                  <span className="font-mono text-[10px] tracking-[0.2em] uppercase">— none —</span>
                </button>
              </li>
              {slot.allowedItems.map((item) => {
                const availability = getAvailability?.(item.id) ?? null;
                const dim = !showAll && availability?.available === false;
                const requirementLabel =
                  availability && !availability.available ? formatRequirement(availability) : null;
                const isSelected = selectedId === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onAttach(slot.path, item.id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm border-l-2 ${
                        isSelected
                          ? "border-[var(--color-primary)] bg-[var(--color-muted)]"
                          : "border-transparent hover:bg-[var(--color-muted)]"
                      } ${dim ? "opacity-40" : ""}`}
                    >
                      <span className="truncate">{item.name}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {requirementLabel && (
                          <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-paper-dim)]">
                            {requirementLabel}
                          </span>
                        )}
                        <AvailabilityPill availability={availability} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {selectedItem && selectedItem.children.length > 0 && (
            <ul className="flex flex-col mt-2 border-t border-dashed border-[var(--color-border)]">
              {selectedItem.children.map((child) => (
                <SlotRow
                  key={child.path}
                  slot={child}
                  attachments={attachments}
                  onAttach={onAttach}
                  getAvailability={getAvailability}
                  showAll={showAll}
                  depth={depth + 1}
                />
              ))}
            </ul>
          )}
        </div>
      </details>
    </li>
  );
}

function AvailabilityPill({ availability }: { availability: ItemAvailability | null }) {
  if (!availability) return null;
  if (availability.available) {
    return <Pill tone="reliable">{availabilityShortLabel(availability) ?? "OK"}</Pill>;
  }
  return <Pill tone="marginal">LOCKED</Pill>;
}

function availabilityShortLabel(a: ItemAvailability): string | null {
  if (!a.available) return null;
  // Prefer compact labels like "LL2" / "FLEA".
  if (a.kind === "flea") return "FLEA";
  if (a.kind === "trader") return `LL${a.minLevel}`;
  return null;
}

function formatRequirement(a: ItemAvailability): string {
  if (a.available) return "";
  switch (a.reason) {
    case "trader-ll-required":
      return `${a.traderNormalizedName} LL${a.minLevel}`;
    case "quest-required":
      return `Quest: ${a.questNormalizedName}`;
    case "flea-locked":
      return "Flea only";
    case "no-sources":
      return "No sources";
  }
}
