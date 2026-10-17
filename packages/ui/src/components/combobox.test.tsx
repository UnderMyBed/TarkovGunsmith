import "@testing-library/jest-dom/vitest";
import { createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox, type ComboboxOption } from "./combobox.js";
import { classList } from "../__test-utils__/class-set.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const OPTIONS: readonly ComboboxOption[] = [
  { value: "m4", label: "Colt M4A1 5.56x45 assault rifle" },
  { value: "ak", label: "Kalashnikov AK-74N 5.45x39 assault rifle" },
  {
    value: "mp7",
    label: "HK MP7A1 4.6x30 submachine gun",
    description: "locked · Peacekeeper LL3",
  },
];

/** A controlled Combobox, as a page uses it. */
function Harness({
  initial = "",
  onChange,
  ...rest
}: {
  initial?: string;
  onChange?: (v: string) => void;
  listHeader?: string;
  shortcut?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Combobox
      label="Weapon"
      options={OPTIONS}
      value={value}
      placeholder="Search weapons"
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      {...rest}
    />
  );
}

const input = () => screen.getByRole("combobox", { name: "Weapon" });
const optionNames = () => screen.queryAllByRole("option").map((o) => o.textContent);

describe("Combobox", () => {
  it("is a closed combobox named by its label, showing the selected option", () => {
    render(<Harness initial="ak" />);
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(input()).toHaveValue("Kalashnikov AK-74N 5.45x39 assault rifle");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows the selected option's description under it", () => {
    render(<Harness initial="mp7" />);
    // The closed list holds the option's own copy of it; the one shown is outside the list.
    const shown = screen
      .getAllByText("locked · Peacekeeper LL3")
      .filter((el) => el.closest("[role='listbox']") === null);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toBeVisible();
    // The lock reason is spoken with the input, not only drawn under it.
    expect(input()).toHaveAccessibleDescription("locked · Peacekeeper LL3");
  });

  it("shows the placeholder with nothing selected", () => {
    render(<Harness />);
    expect(input()).toHaveValue("");
    expect(input()).toHaveAttribute("placeholder", "Search weapons");
  });

  it("filters by every typed word, across label and description, and picks on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} listHeader="3 weapons" />);
    await user.type(input(), "assault 5.45");
    expect(input()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("3 weapons")).toBeVisible();
    expect(optionNames()).toEqual(["Kalashnikov AK-74N 5.45x39 assault rifle"]);

    await user.clear(input());
    await user.type(input(), "peacekeeper");
    expect(optionNames()).toEqual(["HK MP7A1 4.6x30 submachine gunlocked · Peacekeeper LL3"]);

    await user.click(screen.getByRole("option", { name: /MP7A1/ }));
    expect(onChange).toHaveBeenCalledWith("mp7");
    expect(input()).toHaveValue("HK MP7A1 4.6x30 submachine gun");
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(input()).toHaveFocus();
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "zzz");
    expect(optionNames()).toEqual([]);
    expect(screen.getByText("No match", { selector: "p" })).toBeVisible();
    // Spoken, and the highlight points at no option, since there is none.
    expect(screen.getByRole("status")).toHaveTextContent("No match");
    expect(input()).not.toHaveAttribute("aria-activedescendant");
    // ArrowUp and ArrowDown on the empty list highlight nothing either.
    await user.keyboard("{ArrowUp}");
    expect(input()).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{ArrowDown}");
    expect(input()).not.toHaveAttribute("aria-activedescendant");
    // Enter with nothing highlighted picks nothing.
    await user.keyboard("{Enter}");
    expect(input()).toHaveValue("zzz");
  });

  it("speaks how many options the typed text leaves, and nothing while closed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("status")).toHaveTextContent(/^$/);
    await user.type(input(), "assault");
    expect(screen.getByRole("status")).toHaveTextContent("2 options");
    await user.type(input(), " colt");
    expect(screen.getByRole("status")).toHaveTextContent("1 option");
  });

  it("clamps the highlight when typing shrinks the list under it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    input().focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(input()).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[2]!.id);
    await user.type(input(), "colt");
    const only = screen.getByRole("option");
    expect(only).toHaveTextContent(/Colt M4A1/);
    expect(input()).toHaveAttribute("aria-activedescendant", only.id);
  });

  it("clamps the highlight when the options shrink while the list is open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Combobox label="Weapon" options={OPTIONS} value="" onChange={() => {}} />,
    );
    input().focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    rerender(
      <Combobox label="Weapon" options={OPTIONS.slice(0, 1)} value="" onChange={() => {}} />,
    );
    expect(input()).toHaveAttribute("aria-activedescendant", screen.getByRole("option").id);
    await user.keyboard("{Enter}");
  });

  it("ignores keys pressed while an input method composes", () => {
    render(<Harness />);
    fireEvent.keyDown(input(), { key: "ArrowDown", isComposing: true });
    expect(input()).toHaveAttribute("aria-expanded", "false");
  });

  it("moves the highlight with the arrow keys and picks with Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    input().focus();

    await user.keyboard("{ArrowDown}");
    expect(input()).toHaveAttribute("aria-expanded", "true");
    const first = screen.getAllByRole("option")[0]!;
    expect(input()).toHaveAttribute("aria-activedescendant", first.id);

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    const last = screen.getAllByRole("option")[2]!;
    expect(input()).toHaveAttribute("aria-activedescendant", last.id);

    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(input()).toHaveAttribute("aria-activedescendant", first.id);

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("ak");
    expect(input()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on the selected option, by ArrowUp or by click, and marks it selected", async () => {
    const user = userEvent.setup();
    render(<Harness initial="mp7" />);
    input().focus();
    await user.keyboard("{ArrowUp}");
    const mp7 = screen.getByRole("option", { name: /MP7A1/ });
    expect(mp7).toHaveAttribute("aria-selected", "true");
    expect(input()).toHaveAttribute("aria-activedescendant", mp7.id);

    await user.keyboard("{Escape}");
    expect(input()).toHaveAttribute("aria-expanded", "false");
    await user.click(input());
    expect(input()).toHaveAttribute("aria-expanded", "true");
    // A second click on an open list leaves it open.
    await user.click(input());
    expect(input()).toHaveAttribute("aria-expanded", "true");
  });

  it("follows the pointer through the list", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(input());
    const ak = screen.getByRole("option", { name: /AK-74N/ });
    fireEvent.mouseMove(ak);
    expect(input()).toHaveAttribute("aria-activedescendant", ak.id);
  });

  it("Escape and blur both drop the typed text and restore the selection", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness initial="m4" />
        <button type="button">elsewhere</button>
      </>,
    );
    await user.click(input());
    await user.keyboard("{Control>}a{/Control}kal");
    expect(input()).toHaveValue("kal");
    await user.keyboard("{Escape}");
    expect(input()).toHaveValue("Colt M4A1 5.56x45 assault rifle");

    await user.type(input(), "x");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(input()).toHaveValue("Colt M4A1 5.56x45 assault rifle");
    expect(input()).toHaveAttribute("aria-expanded", "false");
  });

  it("leaves Escape to the page when there is nothing to close", () => {
    const onPageKey = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div
        onKeyDown={(e) => {
          onPageKey(e.key);
        }}
      >
        <Harness />
      </div>,
    );
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(onPageKey).toHaveBeenCalledWith("Escape");
  });

  it("scrolls the highlighted option into view where the engine can scroll", async () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: scroll,
      configurable: true,
    });
    const user = userEvent.setup();
    render(<Harness />);
    input().focus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(scroll).toHaveBeenLastCalledWith({ block: "nearest" });
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("draws a decorative shortcut hint, hidden from the accessible name", () => {
    render(<Harness shortcut="/" />);
    expect(screen.getByText("/")).toHaveAttribute("aria-hidden");
    expect(input()).toHaveAccessibleName("Weapon");
  });

  it("is disableable, and dims when it is", () => {
    render(<Harness />);
    const enabled = classList(input().closest("label")!);
    cleanup();
    render(<Harness disabled />);
    expect(input()).toBeDisabled();
    expect(classList(input().closest("label")!)).not.toEqual(enabled);
  });

  it("forwards a ref to the input and merges a caller className", () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = render(
      <Combobox
        ref={ref}
        label="Weapon"
        options={OPTIONS}
        value=""
        onChange={() => undefined}
        className="mt-4"
      />,
    );
    expect(ref.current).toBe(input());
    expect(container.firstElementChild).toHaveClass("mt-4");
  });
});
