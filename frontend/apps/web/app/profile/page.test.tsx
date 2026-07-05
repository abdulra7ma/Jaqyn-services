import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const updateProfile = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@jaqyn/i18n", () => ({
  useT: () => (key: string) => key,
  useI18n: () => ({ setLocale: vi.fn() }),
}));
vi.mock("../_lib/auth", () => ({
  useAuth: () => ({ logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthenticated: true }),
}));
vi.mock("../_components/CustomerShell", () => ({
  CustomerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../_components/QueryBoundary", () => ({
  QueryBoundary: ({ children, query }: { children: (data: unknown) => React.ReactNode; query: { data: unknown } }) => <>{children(query.data)}</>,
}));
vi.mock("../_components/QrSheet", () => ({
  MyQrButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
vi.mock("@jaqyn/api", () => {
  const me = { user: { name: "Aida", phone: "+996 700", email: "aida@example.com", avatar: null, avatar_emoji: "", role: "customer" }, profile: { birthday: null, language: "en", marketing_opt_in: false, profile_completed: true } };
  return {
  useMe: () => ({ data: me }),
  useUpdateProfile: () => ({ mutate: updateProfile, isPending: false }),
  useUploadAvatar: () => ({ mutate: vi.fn(), isPending: false }),
  usePatches: () => ({ data: { patches: [] } }),
  useLoyaltyHomeSummary: () => ({
    data: {
      visit_streak_days: 4,
      rewards_earned: 3,
      som_saved: "125.00",
      active_cards: 1,
    },
    isLoading: false,
  }),
  };
});

import ProfilePage from "./page";

describe("ProfilePage", () => {
  it("renders live loyalty stats and collapses profile details", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    expect(screen.getByLabelText("profile.streak")).toHaveTextContent("4");
    expect(screen.getByText("125")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled();
    expect(screen.queryByLabelText("profile.name")).not.toBeInTheDocument();

    const details = screen.getByRole("button", { name: "profile.details Aida · aida@example.com" });
    fireEvent.click(details);
    expect(screen.getByLabelText("profile.name")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "profile.marketingAlerts" }));
    await user.click(screen.getByRole("button", { name: "common.save" }));
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ marketing_opt_in: true }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    expect(screen.getByRole("link", { name: "3 profile.rewardsEarned" })).toHaveAttribute("href", "/rewards");
    expect(screen.getByRole("link", { name: "1 profile.cardsActive" })).toHaveAttribute("href", "/loyalty");
    expect(screen.getByRole("link", { name: /profile\.patches\.firstTitle/ })).toHaveAttribute(
      "href",
      "/campaigns/patches",
    );
  });
});
