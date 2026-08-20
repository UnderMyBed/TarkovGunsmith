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

  /**
   * Issue #174, defect 1. The panel has always declared `aria-modal="true"`, which tells
   * assistive tech that focus cannot reach the page behind the dialog. Until this suite it
   * only moved focus IN on open and restored it on close — nothing intercepted Tab, so a
   * keyboard user tabbed straight out of the dialog into the page underneath while the
   * attribute claimed otherwise (WCAG 2.4.3).
   *
   * Driven with real `userEvent` throughout: `user.tab()` runs the browser's own tab-order
   * resolution and honours `preventDefault`, so these assert the behaviour a keyboard user
   * actually gets. Firing synthetic `keyDown` props instead would only prove the handler
   * ran.
   */
  describe("focus containment (the aria-modal contract)", () => {
    function Trapped({ onClose, ...rest }: Partial<ComponentProps<typeof Dialog>>) {
      return (
        <>
          <button type="button">outside</button>
          <Dialog open onClose={onClose ?? vi.fn()} labelledBy="trap-title" {...rest}>
            <DialogPanel>
              <DialogTitle id="trap-title">Confirm</DialogTitle>
              <DialogBody>
                <button type="button">first</button>
                <button type="button" disabled>
                  disabled
                </button>
                <input aria-label="middle" />
                <button type="button">last</button>
              </DialogBody>
            </DialogPanel>
          </Dialog>
        </>
      );
    }

    const inside = () => [
      screen.getByRole("button", { name: "first" }),
      screen.getByRole("textbox", { name: "middle" }),
      screen.getByRole("button", { name: "last" }),
    ];

    it("cycles Tab forward through its focusable content and wraps at the end", async () => {
      const user = userEvent.setup();
      render(<Trapped />);
      const [first, middle, last] = inside();

      expect(first).toHaveFocus();
      await user.tab();
      // The disabled button is not a stop — treating it as one would wrap a step early.
      expect(middle).toHaveFocus();
      await user.tab();
      expect(last).toHaveFocus();

      await user.tab();
      expect(first).toHaveFocus();
      expect(screen.getByRole("button", { name: "outside" })).not.toHaveFocus();
    });

    it("cycles Shift+Tab backward and wraps at the start", async () => {
      const user = userEvent.setup();
      render(<Trapped />);
      const [first, middle, last] = inside();

      expect(first).toHaveFocus();
      await user.tab({ shift: true });
      expect(last).toHaveFocus();
      await user.tab({ shift: true });
      expect(middle).toHaveFocus();
      await user.tab({ shift: true });
      expect(first).toHaveFocus();
    });

    it("never lets Tab reach the page behind the backdrop", async () => {
      const user = userEvent.setup();
      render(<Trapped />);
      const outside = screen.getByRole("button", { name: "outside" });

      // A full lap plus change. Without interception the second Tab here lands on `outside`,
      // because the portal is the last thing in the document and tab order wraps around.
      for (let i = 0; i < 8; i += 1) {
        await user.tab();
        expect(outside).not.toHaveFocus();
      }
    });

    it("holds focus on the panel when the dialog has no focusable content", async () => {
      const user = userEvent.setup();
      render(
        <>
          <button type="button">outside</button>
          <Dialog open onClose={vi.fn()} labelledBy="empty-title">
            <DialogPanel>
              <DialogTitle id="empty-title">Nothing to focus</DialogTitle>
              <DialogBody>Plain text only.</DialogBody>
            </DialogPanel>
          </Dialog>
        </>,
      );

      const dialog = screen.getByRole("dialog");
      const outside = screen.getByRole("button", { name: "outside" });
      expect(dialog).toHaveFocus();
      await user.tab();
      expect(dialog).toHaveFocus();
      await user.tab({ shift: true });
      expect(dialog).toHaveFocus();
      expect(outside).not.toHaveFocus();

      // And when focus is placed outside directly, the panel is the only thing left to pull
      // it back to.
      outside.focus();
      expect(dialog).toHaveFocus();
    });

    it("wraps Shift+Tab off the panel when content appears after the dialog opened", async () => {
      // A dialog that opens empty and fills in later (async content) leaves focus on the
      // panel itself, which sits before every stop in tab order. Shift+Tab from there has
      // to wrap to the last stop rather than stepping out to the page behind.
      const user = userEvent.setup();
      function Deferred() {
        const [loaded, setLoaded] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setLoaded(true)}>
              outside
            </button>
            <Dialog open onClose={vi.fn()} labelledBy="deferred-title">
              <DialogPanel>
                <DialogTitle id="deferred-title">Loading</DialogTitle>
                <DialogBody>{loaded ? <button type="button">arrived</button> : "…"}</DialogBody>
              </DialogPanel>
            </Dialog>
          </>
        );
      }
      render(<Deferred />);
      expect(screen.getByRole("dialog")).toHaveFocus();

      // Click the outside trigger to load content. The containment pulls focus back to the
      // panel immediately, which is the state this test needs.
      fireEvent.click(screen.getByRole("button", { name: "outside" }));
      expect(screen.getByRole("button", { name: "arrived" })).toBeInTheDocument();

      await user.tab({ shift: true });
      expect(screen.getByRole("button", { name: "arrived" })).toHaveFocus();
    });

    it("pulls focus back when it lands outside by a route Tab cannot cover", () => {
      render(<Trapped closeOnBackdropClick={false} />);
      const outside = screen.getByRole("button", { name: "outside" });

      // A programmatic focus() elsewhere on the page, or a click on a backdrop that is not
      // wired to close. `aria-modal` says neither can put focus behind the dialog.
      outside.focus();

      expect(outside).not.toHaveFocus();
      expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
    });

    it("does not reset focus when the parent re-renders with a new onClose", async () => {
      // `onClose` is an inline arrow at almost every call site, so it is a new function on
      // every parent render. If the containment effect depended on it, each re-render would
      // tear down and re-run — bouncing focus back to the first element mid-interaction.
      const user = userEvent.setup();
      function Rerendering() {
        // A controlled field: every keystroke re-renders the parent, and each render hands
        // <Dialog> a brand-new `onClose` identity — the exact churn the ref indirection is
        // there to absorb.
        const [text, setText] = useState("");
        return (
          <Dialog open onClose={() => setText("")} labelledBy="rr-title">
            <DialogPanel>
              <DialogTitle id="rr-title">Typed {text.length}</DialogTitle>
              <DialogBody>
                <button type="button">first</button>
                <input
                  aria-label="middle"
                  value={text}
                  onChange={(e) => setText(e.currentTarget.value)}
                />
              </DialogBody>
            </DialogPanel>
          </Dialog>
        );
      }
      render(<Rerendering />);

      await user.tab();
      const middle = screen.getByRole("textbox", { name: "middle" });
      expect(middle).toHaveFocus();

      await user.type(middle, "ab");

      // Two re-renders happened while the user was typing. Focus stayed put, and every
      // character landed — a re-run effect would have thrown focus back to "first" and
      // dropped the second keystroke.
      expect(screen.getByText("Typed 2")).toBeInTheDocument();
      expect(middle).toHaveFocus();
      expect(middle).toHaveValue("ab");
    });

    it("gives Escape and containment to the innermost dialog only", async () => {
      const user = userEvent.setup();
      const outerClose = vi.fn();
      const innerClose = vi.fn();
      render(
        <>
          <Dialog open onClose={outerClose} labelledBy="outer-title">
            <DialogPanel>
              <DialogTitle id="outer-title">Outer</DialogTitle>
              <DialogBody>
                <button type="button">outer action</button>
              </DialogBody>
            </DialogPanel>
          </Dialog>
          <Dialog open onClose={innerClose} labelledBy="inner-title">
            <DialogPanel>
              <DialogTitle id="inner-title">Inner</DialogTitle>
              <DialogBody>
                <button type="button">inner action</button>
              </DialogBody>
            </DialogPanel>
          </Dialog>
        </>,
      );

      const innerAction = screen.getByRole("button", { name: "inner action" });
      expect(innerAction).toHaveFocus();

      // The outer dialog must not drag focus out of the one stacked on top of it.
      await user.tab();
      expect(innerAction).toHaveFocus();

      await user.keyboard("{Escape}");
      expect(innerClose).toHaveBeenCalledTimes(1);
      expect(outerClose).not.toHaveBeenCalled();
    });
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
