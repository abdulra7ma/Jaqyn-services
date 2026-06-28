import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../_components/CustomerShell", () => ({ CustomerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../_lib/auth", () => ({ useRequireAuth: () => ({ isAuthenticated: true }) }));
vi.mock("../_components/campaigns", () => ({
  VoucherCard: ({ voucher }: { voucher: { reward_title: string } }) => <div>{voucher.reward_title}</div>,
  VoucherRow: ({ voucher }: { voucher: { reward_title: string } }) => <div>{voucher.reward_title}</div>,
}));
vi.mock("@jaqyn/api", () => ({
  useCampaignWallet: () => ({ data: { active: [{ id: "c1", reward_title: "Campaign reward", expires_label: "2026-07-01" }], used: [], expired: [] }, isLoading: false }),
  useLoyaltyVouchers: () => ({ data: { active: [{ id: "l1", program: "p1", program_name: "Coffee club", business: "b1", business_name: "Manas", voucher_code: "ABC", status: "active", reward_type: "cashback", reward_title: "50 som cashback", cashback_amount: "50.00", catalog_item: null, catalog_item_name: null, qr_token: "qr", issued_at: "2026-06-28", expires_at: "2026-07-02", redeemed_at: null }], used: [], expired: [] }, isLoading: false }),
}));

import RewardsPage from "./page";

describe("Rewards wallet merge", () => {
  it("renders campaign and loyalty vouchers together", () => {
    render(<RewardsPage />);
    expect(screen.getByText("Campaign reward")).toBeInTheDocument();
    expect(screen.getByText("50 som cashback")).toBeInTheDocument();
  });
});
