import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn.js";

export interface ComboboxOption {
  /** What `onChange` reports. Unique within the list. */
  readonly value: string;
  /** The option's name: what is shown, searched and spoken. */
  readonly label: string;
  /** A second line under the label (a lock reason, say). Searched and spoken too. */
  readonly description?: string;
}

export interface ComboboxProps {
  /** The visible label, which also names the input. */
  readonly label: string;
  readonly options: readonly ComboboxOption[];
  /** The selected option's value, or `""` for none. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Shown in the input while nothing is selected and nothing is typed. */
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /** A key hint drawn at the input's end (`/`). Decorative: hidden from assistive tech. */
  readonly shortcut?: string;
  /** A line at the head of the open list, such as how many options there are. */
  readonly listHeader?: ReactNode;
  /** Shown in the open list when the typed text matches nothing. */
  readonly emptyText?: string;
  readonly className?: string;
}

/** Every whitespace-separated term of `query` appears in the option's label or description. */
function matches(option: ComboboxOption, query: string): boolean {
  const haystack = `${option.label} ${option.description ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

/**
 * A searchable single-select: the WAI-ARIA 1.2 editable combobox with a listbox popup.
 *
 * Focus stays in the input throughout; the highlighted option is announced through
 * `aria-activedescendant`. Typing filters the list (every typed word must appear in an option's
 * label or description). ArrowDown / ArrowUp open the list and move the highlight, Enter picks
 * it, Escape closes the list and puts back the selected option's label, and leaving the field
 * does the same. While nothing is being typed the input shows the selected option's label.
 */
export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  {
    label,
    options,
    value,
    onChange,
    placeholder,
    disabled = false,
    shortcut,
    listHeader,
    emptyText = "No match",
    className,
  },
  ref,
) {
  const id = useId();
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const [open, setOpen] = useState(false);
  // `null` while nothing is being typed: the input then shows the selected option's label.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);

  const selected = options.find((o) => o.value === value);
  /** Where the list opens: on the selected option when it is shown, else the first. */
  const startIndex = (): number =>
    selected === undefined ? 0 : Math.max(0, shown.indexOf(selected));
  const shown = useMemo(
    () =>
      query === null || query.trim() === ""
        ? options
        : options.filter((o) => matches(o, query.trim())),
    [options, query],
  );

  // Keep the highlighted option in view as the arrow keys move it through a long list.
  useEffect(() => {
    if (!open || active < 0) return;
    // Optional call: jsdom implements no scrolling.
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
    // optionId is derived from `id`, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  function close(): void {
    setOpen(false);
    setQuery(null);
    setActive(-1);
  }

  function pick(option: ComboboxOption): void {
    close();
    onChange(option.value);
  }

  function openAt(index: number): void {
    setOpen(true);
    setActive(index);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    const last = shown.length - 1;
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        if (!open) openAt(startIndex());
        else setActive(Math.min(last, active + 1));
        return;
      }
      case "ArrowUp": {
        e.preventDefault();
        if (!open) openAt(startIndex());
        else setActive(Math.max(0, active - 1));
        return;
      }
      case "Enter": {
        const option = open ? shown[active] : undefined;
        if (option === undefined) return;
        e.preventDefault();
        pick(option);
        return;
      }
      case "Escape": {
        if (!open && query === null) return;
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
    }
  }

  return (
    <div className={cn("relative min-w-0", className)}>
      <label
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-[var(--radius)] border border-[var(--color-border-strong)] bg-[var(--color-input)] px-3.5 py-1.5 focus-within:border-[var(--color-primary)]",
          disabled && "opacity-40",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span id={labelId} className="text-11 text-[var(--color-muted-foreground)]">
            {label}
          </span>
          <input
            ref={ref}
            type="text"
            role="combobox"
            aria-labelledby={labelId}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            placeholder={placeholder}
            value={query ?? selected?.label ?? ""}
            onChange={(e) => {
              setQuery(e.target.value);
              openAt(0);
            }}
            onFocus={(e) => e.currentTarget.select()}
            onClick={() => {
              if (!open) openAt(startIndex());
            }}
            onBlur={close}
            onKeyDown={onKeyDown}
            className="w-full truncate bg-transparent text-sm font-bold text-[var(--color-foreground)] outline-none placeholder:font-normal placeholder:text-[var(--color-faint)] disabled:cursor-not-allowed"
          />
        </span>
        {shortcut !== undefined && (
          <kbd
            aria-hidden
            className="rounded-[3px] border border-[var(--color-border-strong)] px-1.5 font-mono text-11 text-[var(--color-muted-foreground)]"
          >
            {shortcut}
          </kbd>
        )}
        <svg
          aria-hidden
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="shrink-0 text-[var(--color-muted-foreground)]"
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </label>
      <div
        hidden={!open}
        className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-[var(--radius)] border border-[var(--color-border-strong)] bg-[var(--color-popover)] py-1 shadow-lg"
      >
        {listHeader !== undefined && (
          <div className="px-3 py-1.5 text-12 text-[var(--color-muted-foreground)]">
            {listHeader}
          </div>
        )}
        <div id={listId} role="listbox" aria-labelledby={labelId}>
          {shown.map((option, index) => (
            // The keyboard reaches an option through the input (aria-activedescendant), as the
            // combobox pattern prescribes, so the option itself takes no key handler and no
            // Tab stop; tabIndex -1 keeps it focusable by script only.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              key={option.value}
              id={optionId(index)}
              role="option"
              tabIndex={-1}
              aria-selected={option.value === value}
              // Keep focus in the input: the click below picks, the blur would close first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(option)}
              onMouseMove={() => setActive(index)}
              className={cn(
                "flex cursor-pointer flex-col px-3 py-2 text-13",
                index === active && "bg-[var(--color-selected)]",
                option.value === value && "font-bold text-[var(--color-primary-text)]",
              )}
            >
              <span>{option.label}</span>
              {option.description !== undefined && (
                <span className="text-12 font-normal text-[var(--color-faint)]">
                  {option.description}
                </span>
              )}
            </div>
          ))}
        </div>
        {shown.length === 0 && (
          <p className="px-3 py-2 text-13 text-[var(--color-muted-foreground)]">{emptyText}</p>
        )}
      </div>
    </div>
  );
});
