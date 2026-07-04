import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The tour only calls useUpdateProfile; stub it at the network seam.
const updateMock = vi.fn();
vi.mock("@jaqyn/api", () => ({
  useUpdateProfile: () => ({ mutate: updateMock, isPending: false }),
}));

import OnboardingPage from "./page";

describe("Onboarding tour — swipeable slides", () => {
  it("mounts every slide in the swipe track (Embla renders all panels)", () => {
    render(<OnboardingPage />);

    // All six slide titles are in the DOM at once — they live side by side in the
    // Embla track, not swapped in on navigation. Titles double as dot aria-labels,
    // so each appears twice (heading + dot button).
    for (const title of [
      "Welcome to Jaqyn",
      "Show your QR",
      "Track your rewards",
      "Discover nearby",
      "Team up in Groups",
      "You're all set",
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
  });

  it("exposes one progress dot per slide with the first marked current", () => {
    render(<OnboardingPage />);

    const firstDot = screen.getByRole("button", { name: "Welcome to Jaqyn" });
    expect(firstDot).toHaveAttribute("aria-current", "true");

    const lastDot = screen.getByRole("button", { name: "You're all set" });
    expect(lastDot).toHaveAttribute("aria-current", "false");
  });

  it("shows the Next CTA (not Get started) on the opening slide", () => {
    render(<OnboardingPage />);
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get started" })).not.toBeInTheDocument();
  });
});
