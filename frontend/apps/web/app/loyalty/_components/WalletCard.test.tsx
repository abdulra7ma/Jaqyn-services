import type { LoyaltyCardView } from "@jaqyn/api";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildWallet } from "../_lib/wallet";
import { WalletCard } from "./WalletCard";

function card(over: Partial<LoyaltyCardView> = {}): LoyaltyCardView {
  return {
    program_id: "p1",
    business_id: "b1",
    business_name: "Sierra Coffee",
    business_logo_url: null,
    business_card_accent: "",
    business_category: "cafe",
    business_area: "Center",
    business_hours: {},
    business_lat: null,
    business_lng: null,
    type: "stamp",
    name: "Stamps",
    reward_summary: "Free latte",
    reward_expiry_days: 30,
    joined: true,
    stamps_count: 2,
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

describe("WalletCard", () => {
  it("shows shop name + headline reward", () => {
    render(<WalletCard card={buildWallet([card()])[0]!} />);
    expect(screen.getByText("Sierra Coffee")).toBeInTheDocument();
    expect(screen.getByText("Free latte")).toBeInTheDocument();
    expect(screen.getByText("cmp.wallet.cardType.stamp")).toBeInTheDocument();
  });

  it("shows the Ready badge + 'ready to use' footer only when claimable", () => {
    const ready = buildWallet([card({ stamps_count: 6, required_count: 6 })])[0]!;
    const { rerender } = render(<WalletCard card={ready} />);
    // Badge ("Ready") + footer ("Ready to use") both render on a claimable card.
    expect(screen.getAllByText(/cmp\.wallet\.ready/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("cmp.wallet.showMyQr")).toBeInTheDocument();

    rerender(<WalletCard card={buildWallet([card({ stamps_count: 2, required_count: 6 })])[0]!} />);
    expect(screen.queryByText(/cmp\.wallet\.ready/)).not.toBeInTheDocument();
  });

  it("shows the item count only for wallets with several entries", () => {
    const single = buildWallet([card()])[0]!;
    const { rerender } = render(<WalletCard card={single} />);
    expect(screen.queryByText("cmp.wallet.programs")).not.toBeInTheDocument();

    const multi = buildWallet([
      card({ program_id: "p1" }),
      card({ program_id: "p2", type: "visit" }),
    ])[0]!;
    rerender(<WalletCard card={multi} />);
    expect(screen.getByText("cmp.wallet.items")).toBeInTheDocument();
  });

  it("shows a minted cashback reward amount instead of the now-spent points balance", () => {
    const wallet = buildWallet([
      card({
        type: "points",
        reward_summary: "5% cashback",
        cashback_per_point: "1.00",
        points_balance: 0,
      }),
    ])[0]!;
    wallet.rewards.push({
      id: "v1",
      source: "loyalty",
      businessId: "b1",
      businessName: "Sierra Coffee",
      businessLogoUrl: null,
      title: "5% cashback",
      subtitle: "Grill Rewards",
      glyph: "💰",
      qrToken: "token",
      code: "CODE",
      cashbackAmount: 180,
    });

    render(<WalletCard card={wallet} />);
    expect(screen.getByText("180")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
