import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BottomNav } from "./BottomNav";

// The mobile bar is Home · Loyalty · [Scan center]
// · Campaigns · Profile — five slots with a raised center Scan button, no Groups.
describe("BottomNav", () => {
  it("renders the four nav links plus a center scan button (5 slots, no Groups)", () => {
    render(<BottomNav />);

    // The four labelled nav destinations (i18n mock returns the key).
    for (const key of ["nav.home", "nav.loyalty", "nav.campaigns", "nav.profile"]) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
    // Groups is gone.
    expect(screen.queryByText("nav.groups")).not.toBeInTheDocument();

    // The raised center scan control links to the personal-QR scan route.
    const scan = screen.getByRole("link", { name: "nav.scan" });
    expect(scan).toHaveAttribute("href", "/qr");

    // Five interactive slots total (4 nav links + the scan link).
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(5);
  });
});
