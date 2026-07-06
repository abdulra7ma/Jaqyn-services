import type { LoyaltyCardView } from "@jaqyn/api";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildWallet } from "../_lib/wallet";
import { WalletDetailSheet } from "./WalletDetailSheet";

function card(over: Partial<LoyaltyCardView> = {}): LoyaltyCardView {
  return {
    program_id: "p1",
    business_id: "b1",
    business_name: "Boorsok Bakery",
    business_logo_url: null,
    business_card_accent: "",
    business_category: "bakery",
    business_area: "Osh Bazaar",
    business_hours: { mon: ["07:00", "21:00"] },
    business_lat: null,
    business_lng: null,
    type: "stamp",
    name: "Stamps",
    reward_summary: "Buy 6, get 1 free",
    reward_expiry_days: 30,
    joined: true,
    stamps_count: 3,
    visits_count: 0,
    required_count: 6,
    points_balance: 0,
    min_redeem_points: null,
    points_per_som: null,
    cashback_per_point: null,
    pct_back: null,
    tiers: [],
    current_tier_name: null,
    next_tier_name: null,
    next_tier_visits_left: null,
    ...over,
  };
}

describe("WalletDetailSheet", () => {
  const handlers = {
    activeReward: null,
    pendingRewardId: null,
    onChooseReward: vi.fn(),
    onRewardChange: vi.fn(),
    onCloseReward: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders a row per program and the shop's info when a business runs several types", () => {
    const shop = buildWallet([
      card({ program_id: "p1", reward_summary: "Buy 6, get 1 free" }),
      card({
        program_id: "p2",
        type: "points",
        reward_summary: "Earn 10% back as cashback",
        cashback_per_point: "1.00",
        points_balance: 180,
      }),
    ])[0]!;

    render(<WalletDetailSheet card={shop} {...handlers} />);

    // Both programs listed (multi-type handling).
    expect(screen.getByText("Buy 6, get 1 free")).toBeInTheDocument();
    expect(screen.getByText("Earn 10% back as cashback")).toBeInTheDocument();
    // Program count + info rows + the QR action.
    expect(screen.getByText(/cmp\.wallet\.programs/)).toBeInTheDocument();
    expect(screen.getByText("Osh Bazaar")).toBeInTheDocument();
    expect(screen.getByText("07:00 – 21:00")).toBeInTheDocument();
    expect(screen.getByText("cmp.wallet.earnMore")).toBeInTheDocument();
  });

  it("renders nothing when no card is selected", () => {
    render(<WalletDetailSheet card={null} {...handlers} />);
    expect(screen.queryByText("cmp.wallet.earnMore")).not.toBeInTheDocument();
  });

  it("lets the customer choose a business reward", () => {
    const onChooseReward = vi.fn();
    const shop = buildWallet([card()])[0]!;
    const reward = {
      id: "v1",
      source: "loyalty" as const,
      businessId: "b1",
      businessName: "Boorsok Bakery",
      businessLogoUrl: null,
      title: "Free pastry",
      subtitle: "Bakery club",
      glyph: "🎁",
      qrToken: "qr-token",
      code: "CODE",
    };
    shop.rewards.push(reward);

    render(
      <WalletDetailSheet
        card={shop}
        {...handlers}
        onChooseReward={onChooseReward}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Free pastry/ }));
    expect(onChooseReward).toHaveBeenCalledWith(reward);
  });

  it("shows the chosen reward QR for staff to scan", () => {
    const shop = buildWallet([card()])[0]!;
    const reward = {
      id: "v1",
      source: "loyalty" as const,
      businessId: "b1",
      businessName: "Boorsok Bakery",
      businessLogoUrl: null,
      title: "Free pastry",
      subtitle: "Bakery club",
      glyph: "🎁",
      qrToken: "qr-token",
      code: "CODE-123",
    };

    render(<WalletDetailSheet card={shop} {...handlers} activeReward={reward} />);

    expect(screen.getAllByText("Free pastry")).toHaveLength(2);
    expect(screen.getByText("CODE-123")).toBeInTheDocument();
    expect(screen.getByText("cmp.voucher.showStaff")).toBeInTheDocument();
  });
});
