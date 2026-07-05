import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// Mock @jaqyn/api so tests don't hit the network.
vi.mock("@jaqyn/api", () => ({
  useMe: () => ({
    data: { user: { name: "Ada Lovelace", phone: "+996700123456" } },
    isLoading: false,
  }),
  useMyQr: () => ({
    data: {
      png: "data:image/png;base64,abc",
      url: "https://example.com/q/tok",
    },
    isLoading: false,
  }),
}));

// Navigator.wakeLock is not available in jsdom — silence the cast.
Object.defineProperty(navigator, "wakeLock", { value: undefined, configurable: true });

import { MyQrSheet } from "../MyQrSheet";

describe("MyQrSheet", () => {
  it("renders inside a dialog with the correct aria-label (qr.myQrTitle key)", () => {
    render(<MyQrSheet isAuthenticated onClose={vi.fn()} />);
    // vitest.setup.ts mocks @jaqyn/i18n so t(key) === key.
    expect(
      screen.getByRole("dialog", { name: "qr.myQrTitle" }),
    ).toBeInTheDocument();
  });

  it("shows the user name and the masked phone", () => {
    render(<MyQrSheet isAuthenticated onClose={vi.fn()} />);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    // +996700123456 → +996 700 *** 56
    expect(screen.getByText(/\+996 700 \*\*\* 56/)).toBeInTheDocument();
  });

  it("renders the QR image when data is ready", () => {
    render(<MyQrSheet isAuthenticated onClose={vi.fn()} />);
    const img = screen.getByAltText("home.myQr") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("data:image/png");
  });

  it("renders download and share buttons when QR is loaded", () => {
    render(<MyQrSheet isAuthenticated onClose={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /qr\.download/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /qr\.share/i }),
    ).toBeInTheDocument();
  });

  it("calls onClose when the dialog is dismissed via ESC", async () => {
    const onClose = vi.fn();
    render(<MyQrSheet isAuthenticated onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("triggers download on download button click", async () => {
    // Spy on createElement so we can capture the <a> click.
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === "a") {
        vi.spyOn(el as HTMLAnchorElement, "click").mockImplementation(clickSpy);
      }
      return el;
    });

    render(<MyQrSheet isAuthenticated onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /qr\.download/i }));
    expect(clickSpy).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });
});
