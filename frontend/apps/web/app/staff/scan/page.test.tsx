import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignScanRow, ScanCustomerResult, ScanDispatchResult, UnifiedScanResult } from "@jaqyn/api";

// matchMedia is not implemented in jsdom. Sheet.tsx reads the 768px breakpoint
// to pick Vaul vs Radix Dialog — we return true for that query so Sheet renders
// via Radix Dialog (jsdom-compatible; Vaul's pointer-event internals crash in jsdom).
// The scan page no longer reads the 1024px breakpoint for redirecting, so all
// queries except the 768px one default to false (phone-width baseline).
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    // The ≥768px Sheet query must match so Radix Dialog is used instead of Vaul.
    matches: query.includes("768"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

// QrScanner is camera + DOM; replace it with buttons that fire a scan or an
// error so tests can drive handleScan and the permission-denied path without
// a real camera.
vi.mock("../../_components/QrScanner", () => ({
  parseScanned: (s: string) => s,
  QrScanner: ({
    onResult,
    onError,
  }: {
    onResult: (token: string) => void;
    onError?: (reason: string) => void;
  }) => (
    <>
      <button type="button" onClick={() => onResult("TOKEN-123")}>
        fire-scan
      </button>
      <button type="button" onClick={() => onError?.("permission")}>
        fire-permission-error
      </button>
      <button type="button" onClick={() => onError?.("https")}>
        fire-https-error
      </button>
    </>
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
    pct_back: null,
    tier_name: null,
    ...over,
  };
}

// Captures the body the screen passed to confirmVisitUnified so assertions can
// inspect the amount/campaignId sent on confirm.
const confirmCall: { body: { token: string; campaignId?: string; amount?: string } | null } = {
  body: null,
};

// Captures the combined-collect batch body sent to awardLoyaltyBatch.
const batchCall: { body: { token: string; awards: unknown[] } | null } = { body: null };

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
  useAwardLoyaltyBatch: () => ({
    isPending: false,
    mutate: (
      body: { token: string; awards: unknown[] },
      opts: { onSuccess: (d: unknown) => void },
    ) => {
      batchCall.body = body;
      opts.onSuccess({
        customer: "Bek",
        results: [
          {
            program_id: "pts-1",
            name: "Cashback",
            type: "points",
            points_awarded: 50,
            stamps_count: 0,
            visits_count: 1,
            required_count: null,
            points_balance: 50,
            tier_name: "Silver",
            vouchers: [],
          },
        ],
      });
    },
    reset: vi.fn(),
  }),
  useConfirmSocial: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
  useRedeemCampaignVoucher: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
  useRedeemVoucherById: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
  useConfirmGroup: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
}));

import StaffScanPage from "./page";

function customerDispatch(rows: CampaignScanRow[]): ScanDispatchResult {
  const customer: ScanCustomerResult = {
    customer: { id: "u-1", name: "Bek", phone: "700123567" },
    rows,
    none_eligible: rows.length === 0 || rows.every((r) => !r.eligible),
    active_vouchers: [],
  };
  return { kind: "customer", customer, voucher: null, group: null, reason: null };
}

// Enable the camera, then fire a scan via the mocked QrScanner button.
async function scan(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("staff.scan.enableCamera"));
  await user.click(screen.getByText("fire-scan"));
}

// Regression guard: at a desktop viewport (1024px+ matchMedia match), the scan
// page must render its content — not redirect and return null.
describe("Staff scan — desktop viewport regression", () => {
  it("renders the scan UI when matchMedia reports ≥1024px (no redirect loop)", () => {
    // Override the baseline mock so 1024px matches true (simulates desktop).
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("1024") || query.includes("768"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    dispatch = customerDispatch([]);
    render(<StaffScanPage />);
    // The camera-enable button proves the page rendered its scan UI, not null.
    expect(screen.getByText("staff.scan.enableCamera")).toBeInTheDocument();
  });
});

describe("Staff scan — combined collect (loyalty rows)", () => {
  beforeEach(() => {
    confirmCall.body = null;
    batchCall.body = null;
  });

  // Loyalty rows carry campaign_type "loyalty" + a "loyalty:" id prefix (adapter contract).
  const cashbackRow = () =>
    row({
      campaign_id: "loyalty:pts-1",
      campaign_type: "loyalty",
      name: "Cashback",
      mechanic: "points",
      points_per_som: null,
      cashback_per_point: "1",
      pct_back: "5.00",
      tier_name: "Silver",
      points_balance: 40,
    });
  const stampRow = () =>
    row({
      campaign_id: "loyalty:stamp-1",
      campaign_type: "loyalty",
      name: "Coffee card",
      mechanic: "stamp",
      current_count: 4,
      goal: 6,
    });

  it("a cashback program shows the bill field with the customer's status chip", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([cashbackRow()]);
    render(<StaffScanPage />);
    await scan(user);

    expect(screen.getByText("staff.collect.title")).toBeInTheDocument();
    expect(screen.getByText("Cashback")).toBeInTheDocument();
    // Tier-aware chip: status name + effective percent.
    expect(screen.getByText("Silver · 5%")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("0")).toBeInTheDocument();
  });

  it("typing a bill shows the cashback preview and confirm sends the batch", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([cashbackRow()]);
    render(<StaffScanPage />);
    await scan(user);

    await user.type(screen.getByPlaceholderText("0"), "1000");
    // 5% of 1000 som = 50 som back.
    expect(screen.getByText("staff.collect.cashbackPreview")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "staff.collect.confirm" }));

    expect(batchCall.body).toEqual({
      token: "TOKEN-123",
      awards: [{ program_id: "pts-1", amount: "1000" }],
    });
    // Success sheet lists the leg with the new balance.
    expect(screen.getByText("staff.result.pointsAwarded")).toBeInTheDocument();
  });

  it("a stamp program uses the stepper; confirm sends the chosen quantity", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([stampRow()]);
    render(<StaffScanPage />);
    await scan(user);

    // Default quantity 1 → step up to 3 (two taps on +).
    const plus = screen.getByRole("button", { name: "staff.collect.increase" });
    await user.click(plus);
    await user.click(plus);
    await user.click(screen.getByRole("button", { name: "staff.collect.confirm" }));

    expect(batchCall.body).toEqual({
      token: "TOKEN-123",
      awards: [{ program_id: "stamp-1", quantity: 3 }],
    });
  });

  it("stamps and cashback confirm together as one batch", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([stampRow(), cashbackRow()]);
    render(<StaffScanPage />);
    await scan(user);

    await user.click(screen.getByRole("button", { name: "staff.collect.increase" }));
    await user.type(screen.getByPlaceholderText("0"), "1000");
    await user.click(screen.getByRole("button", { name: "staff.collect.confirm" }));

    expect(batchCall.body).toEqual({
      token: "TOKEN-123",
      awards: [
        { program_id: "stamp-1", quantity: 2 },
        { program_id: "pts-1", amount: "1000" },
      ],
    });
  });

  it("stepping a stamp card to 0 skips its leg", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([stampRow(), cashbackRow()]);
    render(<StaffScanPage />);
    await scan(user);

    await user.click(screen.getByRole("button", { name: "staff.collect.decrease" }));
    await user.type(screen.getByPlaceholderText("0"), "500");
    await user.click(screen.getByRole("button", { name: "staff.collect.confirm" }));

    expect(batchCall.body).toEqual({
      token: "TOKEN-123",
      awards: [{ program_id: "pts-1", amount: "500" }],
    });
  });

  it("campaign rows still render as one-tap tiles alongside the collect panel", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([
      stampRow(),
      row({ campaign_id: "c-visit", name: "Weekend visits", mechanic: "visit" }),
    ]);
    render(<StaffScanPage />);
    await scan(user);

    // Collect panel for the loyalty leg + a campaign tile section.
    expect(screen.getByText("staff.collect.title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /staff\.scan\.progSpend/ })).toBeInTheDocument();

    // The campaign tile still confirms through the single-program endpoint.
    await user.click(screen.getByRole("button", { name: /staff\.scan\.progSpend/ }));
    expect(confirmCall.body).toEqual({ token: "TOKEN-123", campaignId: "c-visit" });
  });
});

describe("Staff scan — camera permission-denied guidance (FIX-08)", () => {
  it("permission-denied error switches to CameraOff with the hint text", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([]);
    render(<StaffScanPage />);

    // Enable camera so QrScanner mounts (cameraActive = true).
    await user.click(screen.getByText("staff.scan.enableCamera"));

    // Fire the permission error from the mocked QrScanner.
    await user.click(screen.getByText("fire-permission-error"));

    // Page should flip back to CameraOff with the permission-denied title.
    expect(screen.getByText("staff.scan.permDenied")).toBeInTheDocument();
    // Recovery hint (includes iOS Settings path) should be visible.
    expect(screen.getByText("staff.scan.permHint")).toBeInTheDocument();
  });

  it("permission-denied state shows manual entry immediately (form + submit)", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([]);
    render(<StaffScanPage />);

    await user.click(screen.getByText("staff.scan.enableCamera"));
    await user.click(screen.getByText("fire-permission-error"));

    // Manual-entry form should be open by default (no extra click required).
    expect(screen.getByPlaceholderText("staff.scan.manualPlaceholder")).toBeInTheDocument();
    // The "enter code instead" label should be visible as the form heading.
    expect(screen.getByText("staff.scan.enterCodeInstead")).toBeInTheDocument();
    // The submit button should be present.
    expect(screen.getByRole("button", { name: "staff.scan.manualSubmit" })).toBeInTheDocument();
  });

  it("manual code entry in permission-denied state triggers the scan flow", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([row({ campaign_id: "c-perm", name: "Stamp" })]);
    render(<StaffScanPage />);

    await user.click(screen.getByText("staff.scan.enableCamera"));
    await user.click(screen.getByText("fire-permission-error"));

    // Type a code and submit the manual-entry form.
    await user.type(screen.getByPlaceholderText("staff.scan.manualPlaceholder"), "TOKEN-MANUAL");
    await user.click(screen.getByRole("button", { name: "staff.scan.manualSubmit" }));

    // The scan dispatch should fire and show the chooser sheet.
    expect(screen.getAllByText("staff.chooser.title").length).toBeGreaterThanOrEqual(1);
  });

  it("https error shows the HTTPS-required title", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([]);
    render(<StaffScanPage />);

    await user.click(screen.getByText("staff.scan.enableCamera"));
    await user.click(screen.getByText("fire-https-error"));

    expect(screen.getByText("staff.scan.httpsRequired")).toBeInTheDocument();
    expect(screen.getByText("staff.scan.httpsHint")).toBeInTheDocument();
  });

  it("re-enabling camera after permission error clears the reason", async () => {
    const user = userEvent.setup();
    dispatch = customerDispatch([]);
    render(<StaffScanPage />);

    // Trigger permission error.
    await user.click(screen.getByText("staff.scan.enableCamera"));
    await user.click(screen.getByText("fire-permission-error"));
    expect(screen.getByText("staff.scan.permDenied")).toBeInTheDocument();

    // Re-enable camera: should go back to the generic camera-off title once
    // camera is deactivated again via the camera-off button (not tested here),
    // but at minimum the reason-specific heading disappears and camera mounts.
    await user.click(screen.getByRole("button", { name: "staff.scan.enableCamera" }));
    // After re-enabling, cameraActive = true so CameraOff is unmounted.
    expect(screen.queryByText("staff.scan.permDenied")).not.toBeInTheDocument();
  });
});
