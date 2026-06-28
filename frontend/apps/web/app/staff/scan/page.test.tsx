import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignScanRow, ScanCustomerResult, ScanDispatchResult, UnifiedScanResult } from "@jaqyn/api";

// matchMedia is not implemented in jsdom; the scan page reads it to redirect on
// desktop. Stub it to a phone-width (non-matching) query so the scanner renders.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

// QrScanner is camera + DOM; replace it with a button that fires a scan so the
// test can drive the real handleScan path without a camera.
vi.mock("../../_components/QrScanner", () => ({
  parseScanned: (s: string) => s,
  QrScanner: ({ onResult }: { onResult: (token: string) => void }) => (
    <button type="button" onClick={() => onResult("TOKEN-123")}>
      fire-scan
    </button>
  ),
}));

vi.mock("../_components/StaffNav", () => ({ StaffNav: () => null }));
vi.mock("../_lib/staffAuth", () => ({
  useStaffAuth: () => ({
    isStaff: true,
    ready: true,
    staff: { name: "Aibek", role: "cashier", business_name: "Manas Coffee" },
  }),
}));
vi.mock("../../_lib/useErrMessage", () => ({ useErrMessage: () => () => "error" }));

// One scan-customer row factory with multi-form fields the chooser reads.
function row(over: Partial<CampaignScanRow>): CampaignScanRow {
  return {
    campaign_id: "c-1",
    name: "Program",
    sub: "",
    business_name: "Manas Coffee",
    current_count: 0,
    next_count: 1,
    goal: 5,
    eligible: true,
    reason: null,
    mechanic: "visit",
    campaign_type: "individual",
    reward_title: null,
    points_balance: 0,
    points_per_som: null,
    points_per_visit: null,
    cashback_per_point: null,
    current_spend: "0",
    ...over,
  };
}

// Captures the body the screen passed to confirmVisitUnified so assertions can
// inspect the amount/campaignId sent on confirm.
const confirmCall: { body: { token: string; campaignId?: string; amount?: string } | null } = {
  body: null,
};

// The customer dispatch the mocked resolveScan resolves to. Reassigned per test.
let dispatch: ScanDispatchResult;

vi.mock("@jaqyn/api", () => ({
  useResolveScan: () => ({
    mutate: (
      _token: string,
      opts: { onSuccess: (d: ScanDispatchResult) => void },
    ) => opts.onSuccess(dispatch),
    reset: vi.fn(),
  }),
  useConfirmVisitUnified: () => ({
    isPending: false,
    mutate: (
      body: { token: string; campaignId?: string; amount?: string },
      opts: { onSuccess: (d: UnifiedScanResult) => void },
    ) => {
      confirmCall.body = body;
      opts.onSuccess({
        customer: { name: "Bek", phone: "700123567" },
        campaigns: [
          {
            state: "counted",
            customer_name: "Bek",
            campaign_name: "Program",
            current_count: 1,
            goal: 5,
            reward_title: null,
            expires_label: null,
            points_balance: 60,
          },
        ],
        skipped_campaigns: [],
      });
    },
    reset: vi.fn(),
  }),
  useConfirmSocial: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
  useRedeemCampaignVoucher: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
  useConfirmGroup: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
}));

import StaffScanPage from "./page";

function customerDispatch(rows: CampaignScanRow[]): ScanDispatchResult {
  const customer: ScanCustomerResult = {
    customer: { id: "u-1", name: "Bek", phone: "700123567" },
    rows,
    none_eligible: rows.length === 0 || rows.every((r) => !r.eligible),
  };
  return { kind: "customer", customer, voucher: null, reason: null };
}

// Enable the camera, then fire a scan via the mocked QrScanner button.
async function scan(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("staff.scan.enableCamera"));
  await user.click(screen.getByText("fire-scan"));
}

describe("Staff scan — loyalty chooser (choose-one)", () => {
  beforeEach(() => {
    confirmCall.body = null;
  });

  it("scanning a customer with a points program shows the chooser with an Enter bill action", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([
      row({
        campaign_id: "pts-1",
        name: "Points Card",
        mechanic: "points",
        points_per_som: "0.5",
        cashback_per_point: "1",
        points_balance: 40,
      }),
    ]);
    render(<StaffScanPage />);
    await scan(user);

    expect(screen.getByText("staff.chooser.title")).toBeInTheDocument();
    expect(screen.getByText("Points Card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "staff.chooser.enterBill" })).toBeInTheDocument();
  });

  it("entering a bill amount calls confirmVisitUnified with that amount", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([
      row({
        campaign_id: "pts-1",
        name: "Points Card",
        mechanic: "points",
        points_per_som: "0.5",
        cashback_per_point: "1",
        points_balance: 40,
      }),
    ]);
    render(<StaffScanPage />);
    await scan(user);

    await user.click(screen.getByRole("button", { name: "staff.chooser.enterBill" }));
    // Key "120" on the numpad.
    await user.click(screen.getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "0" }));
    await user.click(screen.getByRole("button", { name: "staff.amount.award" }));

    expect(confirmCall.body).toEqual({ token: "TOKEN-123", campaignId: "pts-1", amount: "120" });
  });

  it("a stamp program's Add stamp calls confirm with no amount", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([
      row({ campaign_id: "stamp-1", name: "Stamp Card", mechanic: "stamp" }),
    ]);
    render(<StaffScanPage />);
    await scan(user);

    await user.click(screen.getByRole("button", { name: "staff.chooser.addStamp" }));

    expect(confirmCall.body).toEqual({ token: "TOKEN-123", campaignId: "stamp-1" });
  });
});
