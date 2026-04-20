import type { SlotNode, WeaponTree } from "@tarkov/data";

export interface SlotTreeProps {
  tree: WeaponTree;
  attachments: Readonly<Record<string, string>>;
  onAttach: (path: string, itemId: string | null) => void;
}

export function SlotTree({ tree, attachments, onAttach }: SlotTreeProps) {
  if (tree.slots.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">This weapon has no mod slots.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {tree.slots.map((slot) => (
        <SlotRow key={slot.path} slot={slot} attachments={attachments} onAttach={onAttach} />
      ))}
    </ul>
  );
}

function SlotRow({
  slot,
  attachments,
  onAttach,
}: {
  slot: SlotNode;
  attachments: Readonly<Record<string, string>>;
  onAttach: (path: string, itemId: string | null) => void;
}) {
  const selectedId = attachments[slot.path] ?? null;
  const selectedItem = selectedId ? slot.allowedItems.find((i) => i.id === selectedId) : null;

  return (
    <li className="rounded-[var(--radius)] border">
      <details>
        <summary className="flex cursor-pointer items-center justify-between gap-2 p-3 hover:bg-[var(--color-accent)]">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{slot.name}</span>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {selectedItem ? selectedItem.name : "+ empty"}
              {slot.required && !selectedItem && (
                <span className="ml-2 text-[var(--color-destructive)]">required</span>
              )}
            </span>
          </div>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {slot.allowedItems.length} option{slot.allowedItems.length === 1 ? "" : "s"}
          </span>
        </summary>
        <div className="border-t p-2">
          {slot.allowedItems.length === 0 ? (
            <p className="p-2 text-xs text-[var(--color-muted-foreground)]">
              No explicit allowed items — this slot may be category-based (deferred).
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              <li>
                <button
                  type="button"
                  onClick={() => onAttach(slot.path, null)}
                  className={`w-full rounded-[var(--radius)] p-2 text-left text-sm ${
                    !selectedId ? "bg-[var(--color-accent)]" : "hover:bg-[var(--color-accent)]"
                  }`}
                >
                  (none)
                </button>
              </li>
              {slot.allowedItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onAttach(slot.path, item.id)}
                    className={`w-full rounded-[var(--radius)] p-2 text-left text-sm ${
                      selectedId === item.id
                        ? "bg-[var(--color-accent)]"
                        : "hover:bg-[var(--color-accent)]"
                    }`}
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedItem && selectedItem.children.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2 border-l-2 pl-3">
              {selectedItem.children.map((child) => (
                <SlotRow
                  key={child.path}
                  slot={child}
                  attachments={attachments}
                  onAttach={onAttach}
                />
              ))}
            </ul>
          )}
        </div>
      </details>
    </li>
  );
}
