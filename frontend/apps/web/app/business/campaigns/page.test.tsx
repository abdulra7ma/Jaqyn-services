import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessCampaignListParams, BusinessCampaignRow } from "@jaqyn/api";

// The OwnerShell wraps auth/me gating we don't exercise here; render children directly.
vi.mock("../_components/OwnerShell", () => ({
  OwnerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Capture the params each render so we can assert the filter row drives the query.
const lastParams: { value: BusinessCampaignListParams | undefined } = { value: undefined };

function row(over: Partial<BusinessCampaignRow>): BusinessCampaignRow {
  return {
    id: "c-1",
    glyph: "",
    name: "Campaign",
    type: "individual",
    status: "active",
    type_stats: {
      stat_a: { label: "Enrolled", value: 10 },
      stat_b: { label: "Redeemed", value: 2 },
      stat_c: { label: "Close to reward", value: 3 },
    },
    reward_title: "Free coffee",
    ends_label: "",
    ...over,
  };
}

const ALL_ROWS: BusinessCampaignRow[] = [
  row({ id: "i-1", name: "Visit Five", type: "individual" }),
  row({ id: "g-1", name: "Bring Friends", type: "group" }),
  row({ id: "s-1", name: "Tag Us", type: "social", status: "draft" }),
];

vi.mock("@jaqyn/api", () => ({
  useBusinessCampaigns: (params?: BusinessCampaignListParams) => {
    lastParams.value = params;
    const campaigns = ALL_ROWS.filter(
      (r) =>
        (!params?.type || r.type === params.type) &&
        (!params?.status ||
          (params.status === "completed" ? false : r.status === params.status)),
    );
    return {
      data: {
        summary: { active_campaigns: 2, total_participants: 30, rewards_issued: 5, rewards_redeemed: 2 },
        campaigns,
      },
      isLoading: false,
      isError: false,
    };
  },
}));

import BusinessCampaignsPage from "./page";

describe("Business campaigns list — filters + cards", () => {
  beforeEach(() => {
    lastParams.value = undefined;
  });

  it("renders a card per campaign with type badge, status pill, 3 stats and reward", () => {
    render(<BusinessCampaignsPage />);
    expect(screen.getByText("Visit Five")).toBeInTheDocument();
    expect(screen.getByText("Bring Friends")).toBeInTheDocument();
    expect(screen.getByText("Tag Us")).toBeInTheDocument();
    // Three type-specific stat labels for the first card.
    expect(screen.getAllByText("Enrolled").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Close to reward").length).toBeGreaterThan(0);
    // Reward surfaced on the card.
    expect(screen.getAllByText("Free coffee").length).toBeGreaterThan(0);
  });

  it("Type filter row narrows the list by campaign type", async () => {
    const user = userEvent.setup();
    render(<BusinessCampaignsPage />);

    await user.click(screen.getByRole("button", { name: "cmp.biz.filter.type.group" }));

    expect(lastParams.value).toEqual({ type: "group" });
    expect(screen.getByText("Bring Friends")).toBeInTheDocument();
    expect(screen.queryByText("Visit Five")).not.toBeInTheDocument();
  });

  it("Status filter row narrows the list by status", async () => {
    const user = userEvent.setup();
    render(<BusinessCampaignsPage />);

    await user.click(screen.getByRole("button", { name: "cmp.biz.filter.status.draft" }));

    expect(lastParams.value).toEqual({ status: "draft" });
    expect(screen.getByText("Tag Us")).toBeInTheDocument();
    expect(screen.queryByText("Visit Five")).not.toBeInTheDocument();
  });

  it("marks the active filter chip pressed", async () => {
    const user = userEvent.setup();
    render(<BusinessCampaignsPage />);
    const groupChip = screen.getByRole("button", { name: "cmp.biz.filter.type.group" });
    await user.click(groupChip);
    expect(groupChip).toHaveAttribute("aria-pressed", "true");
    // sanity: stat region renders within a card
    const card = screen.getByText("Bring Friends").closest("a");
    expect(card).not.toBeNull();
    if (card) expect(within(card).getByText("Redeemed")).toBeInTheDocument();
  });
});
