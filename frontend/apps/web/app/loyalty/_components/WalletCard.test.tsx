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
    type: "stamp",
    name: "Stamps",
    reward_summary: "Free latte",
    reward_expiry_days: 30,
    joined: true,
    stamps_count: 2,
    visits_count: 0,
    required_count: 6,
    points_balance: 0,
    points_per_som: null,
    cashback_per_point: null,
    pct_back: null,
    ...over,
  };
}

describe("WalletCard", () => {
  it("shows shop name + headline reward", () => {
    render(<WalletCard card={buildWallet([card()])[0]!} />);
    expect(screen.getByText("Sierra Coffee")).toBeInTheDocument();
    expect(screen.getByText("Free latte")).toBeInTheDocument();
  });

  it("shows the Ready badge + 'ready to use' footer only when claimable", () => {
    const ready = buildWallet([card({ stamps_count: 6, required_count: 6 })])[0]!;
    const { rerender } = render(<WalletCard card={ready} />);
    // Badge ("Ready") + footer ("Ready to use") both render on a claimable card.
    expect(screen.getAllByText(/cmp\.wallet\.ready/).length).toBeGreaterThanOrEqual(2);

    rerender(<WalletCard card={buildWallet([card({ stamps_count: 2, required_count: 6 })])[0]!} />);
    expect(screen.queryByText(/cmp\.wallet\.ready/)).not.toBeInTheDocument();
  });

  it("shows the 'N programs' label only for multi-program shops", () => {
    const single = buildWallet([card()])[0]!;
    const { rerender } = render(<WalletCard card={single} />);
    expect(screen.queryByText("cmp.wallet.programs")).not.toBeInTheDocument();

    const multi = buildWallet([
      card({ program_id: "p1" }),
      card({ program_id: "p2", type: "visit" }),
    ])[0]!;
    rerender(<WalletCard card={multi} />);
    expect(screen.getByText("cmp.wallet.programs")).toBeInTheDocument();
  });
});
