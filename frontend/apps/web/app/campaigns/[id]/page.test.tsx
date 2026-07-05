/**
 * Campaign detail page — ended/cancelled dead-end fix (FIX-03).
 *
 * Asserts that campaigns with a non-active, non-completed status render an
 * informational status banner and links instead of a blank CTA area.
 * Active and completed states are not regressed here (they are exercised by
 * the campaigns hub sheet tests in campaigns/page.test.tsx).
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign } from "@jaqyn/api";

vi.mock("../../_components/CustomerShell", () => ({
  CustomerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../_lib/auth", () => ({ useRequireAuth: () => ({ isAuthenticated: true }) }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "camp-ended-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

// ---- Fixtures ----------------------------------------------------------------

function makeCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp-ended-1",
    business: { id: "b1", name: "Manas Coffee", category: "cafe", logo_url: null, area: "Centre", address: "" },
    business_lat: null,
    business_lng: null,
    glyph: "☕",
    name: "Winter Coffee Challenge",
    description: "Visit us 5 times.",
    blurb: "",
    campaign_type: "individual",
    status: "ended",
    start_label: "1 Jan",
    end_label: "28 Feb",
    days_left: 0,
    active_days: "",
    active_hours: "",
    active_start_time: "",
    active_end_time: "",
    repeat_policy: "once",
    max_participants: null,
    rule: {
      mechanic: "visit",
      required_count: 5,
      max_count_per_day: 1,
      min_time_between: null,
      required_group_size: null,
      group_checkin_window: null,
      group_checkin_window_minutes: null,
    },
    reward: {
      type: "free_item",
      title: "Free coffee",
      description: "Any drink on us",
      expiry_days_after_unlock: 7,
      max_redemptions: null,
      item_selection: null,
      catalog_item: null,
    },
    my_progress: null,
    instagram_handle: null,
    auto_join_link: null,
    ...over,
  };
}

// ---- Mock @jaqyn/api ---------------------------------------------------------

const mockCampaignState: { data: Campaign } = {
  data: makeCampaign(),
};

vi.mock("@jaqyn/api", () => ({
  useCampaign: () => ({ data: mockCampaignState.data, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useJoinCampaign: () => ({ mutate: vi.fn(), isPending: false }),
}));

import CampaignDetailPage from "./page";

describe("CampaignDetailPage — ended/cancelled status banner (FIX-03)", () => {
  beforeEach(() => {
    // Default: ended campaign, no progress.
    mockCampaignState.data = makeCampaign();
  });

  describe("ended campaign (no progress)", () => {
    it("renders the ended notice", () => {
      render(<CampaignDetailPage />);
      expect(screen.getByText("cmp.detail.ended.notice")).toBeInTheDocument();
    });

    it("renders the body copy", () => {
      render(<CampaignDetailPage />);
      expect(screen.getByText("cmp.detail.ended.body")).toBeInTheDocument();
    });

    it("renders a link back to /campaigns", () => {
      render(<CampaignDetailPage />);
      const link = screen.getByRole("link", { name: "cmp.detail.ended.backToCampaigns" });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/campaigns");
    });

    it("does NOT render the /rewards link when there is no voucher", () => {
      render(<CampaignDetailPage />);
      expect(screen.queryByRole("link", { name: "cmp.detail.ended.viewReward" })).not.toBeInTheDocument();
    });
  });

  describe("ended campaign with an earned voucher", () => {
    beforeEach(() => {
      // Joined but NOT completed (completed=false), yet a voucher_id exists.
      // This models a campaign that ended while the customer was in progress
      // and still earned a partial voucher, or a rare edge where voucher_id
      // is set pre-completion by the backend.
      mockCampaignState.data = makeCampaign({
        my_progress: {
          joined: true,
          status: "in_progress",
          current_count: 3,
          target_count: 5,
          completed: false,
          voucher_id: "v-abc123",
        },
      });
    });

    it("renders the ended notice", () => {
      render(<CampaignDetailPage />);
      expect(screen.getByText("cmp.detail.ended.notice")).toBeInTheDocument();
    });

    it("renders a /campaigns link", () => {
      render(<CampaignDetailPage />);
      const link = screen.getByRole("link", { name: "cmp.detail.ended.backToCampaigns" });
      expect(link).toHaveAttribute("href", "/campaigns");
    });

    it("renders the /rewards link when a voucher_id is present", () => {
      render(<CampaignDetailPage />);
      const link = screen.getByRole("link", { name: "cmp.detail.ended.viewReward" });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/rewards");
    });
  });

  describe("cancelled campaign", () => {
    beforeEach(() => {
      mockCampaignState.data = makeCampaign({ status: "cancelled" });
    });

    it("renders the ended notice for cancelled status too", () => {
      render(<CampaignDetailPage />);
      expect(screen.getByText("cmp.detail.ended.notice")).toBeInTheDocument();
    });

    it("renders a /campaigns link", () => {
      render(<CampaignDetailPage />);
      expect(screen.getByRole("link", { name: "cmp.detail.ended.backToCampaigns" })).toHaveAttribute(
        "href",
        "/campaigns",
      );
    });
  });

  describe("completed campaign (status ended, completed=true) — unchanged CTA", () => {
    beforeEach(() => {
      // Completed + ended: the existing completed CTA (sticky button) must still fire,
      // not the ended banner. The guard `!p?.completed` in the inactive check ensures this.
      mockCampaignState.data = makeCampaign({
        status: "ended",
        my_progress: {
          joined: true,
          status: "completed",
          current_count: 5,
          target_count: 5,
          completed: true,
          voucher_id: "v-done",
        },
      });
    });

    it("does NOT render the ended notice", () => {
      render(<CampaignDetailPage />);
      expect(screen.queryByText("cmp.detail.ended.notice")).not.toBeInTheDocument();
    });

    it("renders the completed CTA button instead", () => {
      render(<CampaignDetailPage />);
      expect(screen.getByRole("button", { name: "cmp.detail.completed" })).toBeInTheDocument();
    });
  });
});
