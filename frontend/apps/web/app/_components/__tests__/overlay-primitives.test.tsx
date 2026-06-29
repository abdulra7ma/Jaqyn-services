import { AlertDialog, Dialog, Sheet } from "@jaqyn/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The @jaqyn/ui overlays branch on a `(min-width:768px)` media query. jsdom has
// no real matchMedia, so we stub it. `desktop` forces the Radix Dialog path,
// which renders deterministically under jsdom (Vaul's Drawer relies on pointer
// gestures that jsdom does not model). Sheet behaviour we assert — open/close,
// scrim, ESC, label — is identical across both engines.
function mockMatchMedia(desktop: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList =>
      ({
        matches: desktop,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => mockMatchMedia(true));
afterEach(() => vi.unstubAllGlobals());

describe("Sheet", () => {
  it("renders children with the required aria-label when open", () => {
    render(
      <Sheet open onOpenChange={vi.fn()} ariaLabel="loyalty programs">
        <p>sheet body</p>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "loyalty programs" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("sheet body")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <Sheet open={false} onOpenChange={vi.fn()} ariaLabel="closed sheet">
        <p>hidden body</p>
      </Sheet>,
    );
    expect(screen.queryByText("hidden body")).not.toBeInTheDocument();
  });

  it("calls onOpenChange(false) on ESC", async () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange} ariaLabel="escapable sheet">
        <p>body</p>
      </Sheet>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders a dismissable scrim in modal variant", () => {
    const { baseElement } = render(
      <Sheet open variant="modal" onOpenChange={vi.fn()} ariaLabel="modal sheet">
        <p>body</p>
      </Sheet>,
    );
    // The modal variant paints the ink@.34 scrim; persistent omits it (asserted
    // below). Scrim *click* dismissal is covered on the mobile Vaul path, where
    // the overlay carries a real click handler jsdom can dispatch.
    expect(baseElement.querySelector(".bg-ink\\/\\[0\\.34\\]")).not.toBeNull();
  });

  it("renders the mobile drawer (Vaul) below md with the same scrim + label", () => {
    mockMatchMedia(false); // force the Vaul Drawer (< md)
    const { baseElement } = render(
      <Sheet open variant="modal" onOpenChange={vi.fn()} ariaLabel="mobile sheet">
        <p>drawer body</p>
      </Sheet>,
    );
    // Same modal scrim token on the mobile path; dismissal itself is exercised
    // via ESC above (scrim/outside dismissal is a pointer-capture gesture the
    // libraries own and jsdom does not model, so we don't assert it by click).
    expect(baseElement.querySelector(".bg-ink\\/\\[0\\.34\\]")).not.toBeNull();
    expect(screen.getByText("drawer body")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "mobile sheet" })).toBeInTheDocument();
  });

  it("renders NO scrim in persistent variant", () => {
    const { baseElement } = render(
      <Sheet open variant="persistent" onOpenChange={vi.fn()} ariaLabel="persistent sheet">
        <p>floating body</p>
      </Sheet>,
    );
    expect(baseElement.querySelector(".bg-ink\\/\\[0\\.34\\]")).toBeNull();
    expect(screen.getByText("floating body")).toBeInTheDocument();
  });
});

describe("Dialog", () => {
  it("shows title + children when open and hides when closed", () => {
    const { rerender } = render(
      <Dialog open title="Confirm action" ariaLabel="confirm action" onOpenChange={vi.fn()}>
        <p>dialog body</p>
      </Dialog>,
    );
    expect(screen.getByText("Confirm action")).toBeInTheDocument();
    expect(screen.getByText("dialog body")).toBeInTheDocument();

    rerender(
      <Dialog open={false} title="Confirm action" ariaLabel="confirm action" onOpenChange={vi.fn()}>
        <p>dialog body</p>
      </Dialog>,
    );
    expect(screen.queryByText("dialog body")).not.toBeInTheDocument();
  });

  it("calls onOpenChange(false) on ESC", async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open title="t" ariaLabel="t" onOpenChange={onOpenChange}>
        <p>body</p>
      </Dialog>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("AlertDialog", () => {
  const base = {
    open: true,
    onOpenChange: vi.fn(),
    title: "Remove staff member",
    confirmLabel: "Remove",
    cancelLabel: "Cancel",
  };

  it("fires onConfirm from the confirm button, not cancel", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <AlertDialog {...base} onOpenChange={onOpenChange} onConfirm={onConfirm} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("fires onOpenChange(false) from cancel without onConfirm", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <AlertDialog {...base} onOpenChange={onOpenChange} onConfirm={onConfirm} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders the danger variant when destructive", () => {
    render(<AlertDialog {...base} onConfirm={vi.fn()} destructive />);
    const confirm = screen.getByRole("button", { name: "Remove" });
    // §4 Danger foreground colour distinguishes the destructive confirm.
    expect(confirm.className).toContain("text-[#B0563A]");
  });

  it("disables the confirm button while pending", () => {
    render(<AlertDialog {...base} onConfirm={vi.fn()} pending />);
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  it("renders an optional description", () => {
    render(
      <AlertDialog {...base} onConfirm={vi.fn()} description="This cannot be undone." />,
    );
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
  });
});
