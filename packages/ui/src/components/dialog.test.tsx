import "@testing-library/jest-dom/vitest";
import { useState, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogBody, DialogPanel, DialogTitle } from "./dialog.js";
import { cardVariants } from "./card.js";
import { classList } from "../__test-utils__/class-set.js";

afterEach(() => cleanup());

function Panel({ onClose, ...rest }: Partial<ComponentProps<typeof Dialog>>) {
  return (
    <Dialog open onClose={onClose ?? vi.fn()} labelledBy="dlg-title" {...rest}>
      <DialogPanel>
        <DialogTitle id="dlg-title">Confirm</DialogTitle>
        <DialogBody>
          <button type="button">Inside</button>
        </DialogBody>
      </DialogPanel>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    render(
      <Dialog open={false} onClose={vi.fn()}>
        <div>content</div>
      </Dialog>,
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("portals its content to document.body with dialog semantics when open", () => {
    render(<Panel />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "dlg-title");
    // Portal target is document.body, not the render container.
    expect(dialog.closest("body")).toBe(document.body);
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on other keys", () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked by default", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Panel onClose={onClose} />);
    await user.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on backdrop click when closeOnBackdropClick is false", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Panel onClose={onClose} closeOnBackdropClick={false} />);
    await user.click(screen.getByRole("presentation"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close when a click inside the panel bubbles (stopPropagation)", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Panel onClose={onClose} />);
    await user.click(screen.getByText("Confirm"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks body scroll while open and restores it on close", () => {
    const original = document.body.style.overflow;
    function Toggle() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(false)}>
            close
          </button>
          <Dialog open={open} onClose={() => setOpen(false)}>
            <div>body</div>
          </Dialog>
        </>
      );
    }
    render(<Toggle />);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByText("close"));
    expect(document.body.style.overflow).toBe(original);
  });

  it("keeps the scroll lock held while a second stacked dialog is still open (ref-counted)", () => {
    const originalOverflow = document.body.style.overflow;
    const { unmount: unmountFirst } = render(<Panel />);
    expect(document.body.style.overflow).toBe("hidden");

    const { unmount: unmountSecond } = render(<Panel />);
    expect(document.body.style.overflow).toBe("hidden");

    // Closing one of the two stacked dialogs must NOT release the lock —
    // the other dialog is still open. This is the ref-counting behaviour
    // acquireScrollLock/releaseScrollLock exist to protect.
    unmountFirst();
    expect(document.body.style.overflow).toBe("hidden");

    unmountSecond();
    expect(document.body.style.overflow).toBe(originalOverflow);
  });

  it("moves focus to the first focusable element in the panel on open", () => {
    render(<Panel />);
    expect(screen.getByRole("button", { name: "Inside" })).toHaveFocus();
  });

  it("falls back to focusing the dialog panel itself when it has no focusable children", () => {
    render(
      <Dialog open onClose={vi.fn()} labelledBy="no-focusables">
        <DialogPanel>
          <DialogTitle id="no-focusables">Nothing to focus</DialogTitle>
          <DialogBody>Plain text only, no interactive elements.</DialogBody>
        </DialogPanel>
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("restores focus to the previously-focused element after unmount", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "trigger";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const { unmount } = render(<Panel />);
    expect(trigger).not.toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});

describe("DialogPanel", () => {
  /* DialogPanel's contract is composition: it IS a bracket-variant <Card>, so a consumer
   * gets the Field Ledger corner marks without reaching for Card themselves. Deriving the
   * expectation from `cardVariants` rather than naming a token keeps this honest if the
   * bracket is restyled — and whether those classes paint anything is checked against the
   * compiled stylesheet in apps/web/src/styles.test.ts. */
  it("renders as a bracket-variant Card", () => {
    render(
      <Dialog open onClose={vi.fn()}>
        <DialogPanel data-testid="panel">content</DialogPanel>
      </Dialog>,
    );
    const bracket = cardVariants({ variant: "bracket" }).split(/\s+/).filter(Boolean);
    expect(screen.getByTestId("panel")).toHaveClass(...bracket);
  });

  it("lets a caller override its default width cap rather than emitting both", () => {
    render(
      <Dialog open onClose={vi.fn()}>
        <DialogPanel className="max-w-sm" data-testid="panel">
          content
        </DialogPanel>
      </Dialog>,
    );
    const caps = classList(screen.getByTestId("panel")).filter((c) => c.startsWith("max-w-"));
    expect(caps).toEqual(["max-w-sm"]);
  });
});

describe("DialogTitle and DialogBody", () => {
  it("renders the title as a level-2 heading that can label the dialog", () => {
    render(<DialogTitle id="dlg">Heading</DialogTitle>);
    const heading = screen.getByRole("heading", { name: "Heading", level: 2 });
    expect(heading).toHaveAttribute("id", "dlg");
  });

  it("merges caller classNames on top of their own", () => {
    render(
      <>
        <DialogTitle data-testid="base-title">Base</DialogTitle>
        <DialogBody data-testid="base-body">Base</DialogBody>
      </>,
    );
    const ownTitle = classList(screen.getByTestId("base-title"));
    const ownBody = classList(screen.getByTestId("base-body"));
    cleanup();

    render(
      <>
        <DialogTitle className="extra-title" data-testid="title">
          Heading
        </DialogTitle>
        <DialogBody className="extra-body" data-testid="body">
          Body copy
        </DialogBody>
      </>,
    );
    const title = screen.getByTestId("title");
    expect(title).toHaveClass("extra-title");
    expect(title).toHaveClass(...ownTitle);
    const body = screen.getByTestId("body");
    expect(body).toHaveClass("extra-body");
    expect(body).toHaveClass(...ownBody);
    expect(body).toHaveTextContent("Body copy");
  });
});
