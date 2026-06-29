import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BottomNav } from "./BottomNav";

// The mobile bar is Home · Loyalty · [Scan center]
// · Campaigns · Profile — five slots with a raised center Scan button, no Groups.
describe("BottomNav", () => {
  it("renders the four nav links plus a center scan button (5 slots, no Groups)", () => {
    render(<BottomNav />);

    // Icon-only nav: each destination's accessible name comes from aria-label
    // (i18n mock returns the key).
    for (const key of ["nav.home", "nav.loyalty", "nav.campaigns", "nav.profile"]) {
      expect(screen.getByRole("link", { name: key })).toBeInTheDocument();
    }
    // Groups is gone.
    expect(screen.queryByRole("link", { name: "nav.groups" })).not.toBeInTheDocument();

    // The raised center scan control is a button that opens the personal-QR
    // sheet over the current page (no route change), so the page stays visible.
    const scan = screen.getByRole("button", { name: "nav.scan" });
    expect(scan).toBeInTheDocument();

    // Four labelled nav destinations remain links; the scan control is a button.
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
  });
});
