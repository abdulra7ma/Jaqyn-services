import type { LoyaltyCardView } from "@jaqyn/api";
import { render, screen } from "@testing-library/react";
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
    type: "stamp",
    name: "Stamps",
    reward_summary: "Buy 6, get 1 free",
    reward_expiry_days: 30,
    joined: true,
    stamps_count: 3,
    visits_count: 0,
    required_count: 6,
    points_balance: 0,
    points_per_som: null,
    cashback_per_point: null,
    pct_back: null,
    ...over,
  };
}

describe("WalletDetailSheet", () => {
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

    render(<WalletDetailSheet card={shop} onClose={vi.fn()} />);

    // Both programs listed (multi-type handling).
    expect(screen.getByText("Buy 6, get 1 free")).toBeInTheDocument();
    expect(screen.getByText("Earn 10% back as cashback")).toBeInTheDocument();
    // Program count + info rows + the QR action.
    expect(screen.getByText(/cmp\.wallet\.programs/)).toBeInTheDocument();
    expect(screen.getByText("Osh Bazaar")).toBeInTheDocument();
    expect(screen.getByText("07:00 – 21:00")).toBeInTheDocument();
    expect(screen.getByText("cmp.wallet.showMyQr")).toBeInTheDocument();
  });

  it("renders nothing when no card is selected", () => {
    render(<WalletDetailSheet card={null} onClose={vi.fn()} />);
    expect(screen.queryByText("cmp.wallet.showMyQr")).not.toBeInTheDocument();
  });
});
