"use client";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CampaignVoucher } from "@jaqyn/api";

// Shell + auth — not under test here.
vi.mock("../../_components/CustomerShell", () => ({
  CustomerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../_lib/auth", () => ({ useRequireAuth: () => ({ isAuthenticated: true }) }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "v-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

// QR code is heavy — stub it.
vi.mock("react-qr-code", () => ({ default: () => <div data-testid="qr" /> }));

// Mutable state driven by individual tests.
const voucherState: { data: CampaignVoucher | null; needsItem: boolean } = {
  data: null,
  needsItem: false,
};

function makeVoucher(over: Partial<CampaignVoucher> = {}): CampaignVoucher {
  return {
    id: "v-1",
    code: "ABC123",
    qr_token: "qr-token",
    status: "active",
    glyph: "🎁",
    reward_title: "Free Coffee",
    reward_description: "",
    issued_label: "1 Jan 2025",
    expires_label: "31 Dec 2025",
    expiring_soon: false,
    redeemed_at_label: null,
    redeemed_branch: null,
    redeemed_by: null,
    // item_selection determines whether VoucherItemSheet is shown.
    item_selection: voucherState.needsItem ? "customer" : null,
    catalog_item: null,
    campaign: { id: "camp-1", name: "Coffee Crew" },
    business: { id: "biz-1", name: "Manas Coffee" },
    domain: "campaign",
    ...over,
  };
}

vi.mock("@jaqyn/api", () => ({
  useCampaignVoucher: () => ({
    data: voucherState.data,
    isLoading: false,
    isError: false,
  }),
  usePresentVoucher: () => ({ mutate: vi.fn(), isPending: false }),
  useCampaignCatalog: () => ({
    data: [{ id: "item-1", name: "Croissant", price: "120 сом", image: null }],
    isLoading: false,
    isError: false,
  }),
  useSelectCampaignVoucherItem: () => ({ mutate: vi.fn(), isPending: false }),
}));

import CampaignVoucherPage from "./page";

describe("CampaignVoucherPage — VoucherItemSheet wrapped in Sheet", () => {
  it("renders the item picker inside a Sheet (role=dialog) when item is unselected", () => {
    voucherState.needsItem = true;
    voucherState.data = makeVoucher({
      item_selection: "customer",
      catalog_item: null,
    });
    render(<CampaignVoucherPage />);

    // Sheet renders a dialog with the ariaLabel from the i18n key.
    const dialog = screen.getByRole("dialog", { name: "cmp.voucher.chooseItem" });
    expect(dialog).toBeInTheDocument();

    // The picker heading is inside the dialog (sr-only Sheet title + visible h2 both carry the key).
    expect(screen.getAllByText("cmp.voucher.chooseItem").length).toBeGreaterThanOrEqual(1);

    // Catalog item from the mock is listed.
    expect(screen.getByText("Croissant")).toBeInTheDocument();
  });

  it("does NOT render the item-picker Sheet when catalog_item is already set", () => {
    voucherState.needsItem = false;
    voucherState.data = makeVoucher({
      item_selection: "customer",
      catalog_item: { id: "item-1", name: "Croissant", price: "120 сом", image: null },
    });
    render(<CampaignVoucherPage />);

    // QR block shown instead; no dialog for item selection.
    expect(screen.queryByRole("dialog", { name: "cmp.voucher.chooseItem" })).not.toBeInTheDocument();
    expect(screen.getByTestId("qr")).toBeInTheDocument();
  });
});
