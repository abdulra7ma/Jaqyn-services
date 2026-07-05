/**
 * Campaigns page — behaviour tests for the 3-state hub (campaigns redesign F1).
 *
 * Tests mock the API hooks so no network calls are made. Each test exercises one
 * of the three states: returning / early / new user. The win-moment overlay is
 * tested separately (it fires when my_progress.completed flips true).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Campaign,
  CampaignFeed,
  CampaignVoucher,
  CampaignWallet,
  GroupSession,
  LoyaltyCardView,
  LoyaltyHomeSummary,
  LoyaltyVoucherWallet,
  MyGroup,
} from "@jaqyn/api";

// Minimal shell stub.
vi.mock("../_components/CustomerShell", () => ({
  CustomerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../_lib/auth", () => ({ useRequireAuth: () => ({ isAuthenticated: true }) }));

// Framer-motion stub — reduced motion defaults to false in tests.
vi.mock("framer-motion", () => ({
  useReducedMotion: () => false,
}));

// ---- Fixtures ----------------------------------------------------------------

function makeLoyaltyCard(over: Partial<LoyaltyCardView> = {}): LoyaltyCardView {
  return {
    program_id: "p1", business_id: "b1", business_name: "Manas Coffee",
    business_logo_url: null, business_card_accent: "", business_category: "cafe",
    business_area: "Centre", business_hours: {},
    business_lat: null, business_lng: null,
    type: "stamp", name: "Coffee card", reward_summary: "Free coffee",
    reward_expiry_days: 30, joined: true, stamps_count: 3, visits_count: 0,
    required_count: 6, points_balance: 0, min_redeem_points: null,
    points_per_som: null, cashback_per_point: null, pct_back: null,
    ...over,
  };
}

function makeActiveCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "c1", business: { id: "b1", name: "Manas", category: "cafe", logo_url: null, area: "", address: "" },
    business_lat: null, business_lng: null,
    glyph: "", name: "Coffee Challenge", description: "", blurb: "",
    campaign_type: "individual", status: "active", start_label: "", end_label: "",
    days_left: 5, active_days: "", active_hours: "", active_start_time: "", active_end_time: "",
    repeat_policy: "once", max_participants: null,
    rule: { mechanic: "visit", required_count: 5, max_count_per_day: null, min_time_between: null, required_group_size: null, group_checkin_window: null, group_checkin_window_minutes: null },
    reward: { type: "free_item", title: "Free coffee", description: "", expiry_days_after_unlock: 7, max_redemptions: null, item_selection: null, catalog_item: null },
    my_progress: { joined: true, status: "in_progress", current_count: 3, target_count: 5, completed: false, voucher_id: null },
    instagram_handle: null, auto_join_link: null,
    ...over,
  };
}

const emptyFeed: CampaignFeed = {
  followed: [], discover: [], sections: { featured: [], trending: [], fresh: [] },
};

const emptyWallet: CampaignWallet = { active: [], used: [], expired: [] };

const emptyLoyaltyWallet: LoyaltyVoucherWallet = { active: [], used: [], expired: [] };

const emptyGroups: MyGroup[] = [];

// ---- Mock @jaqyn/api ---------------------------------------------------------

const mockState = {
  summary: null as LoyaltyHomeSummary | null,
  cards: [] as LoyaltyCardView[],
  feed: emptyFeed as CampaignFeed,
  wallet: emptyWallet as CampaignWallet,
  loyaltyWallet: emptyLoyaltyWallet as LoyaltyVoucherWallet,
  groups: emptyGroups as MyGroup[],
  groupSession: null as GroupSession | null,
};

const mockJoinCampaign = vi.fn();

vi.mock("@jaqyn/api", () => ({
  useLoyaltyHomeSummary: () => ({ data: mockState.summary, isLoading: false, isError: false }),
  useLoyaltyCards: () => ({ data: mockState.cards, isLoading: false, isError: false }),
  useCampaignFeed: () => ({ data: mockState.feed, isLoading: false, isError: false }),
  useCampaignWallet: () => ({ data: mockState.wallet, isLoading: false, isError: false }),
  useLoyaltyVouchers: () => ({ data: mockState.loyaltyWallet, isLoading: false, isError: false }),
  useMyGroups: () => ({ data: mockState.groups, isLoading: false, isError: false }),
  useGroupSession: () => ({ data: mockState.groupSession, isLoading: false, isError: false }),
  useLeaveGroupSession: () => ({ mutate: vi.fn(), isPending: false }),
  useNearby: () => ({ data: [], isLoading: false, isError: false }),
  useJoinCampaign: () => ({ mutateAsync: mockJoinCampaign, isPending: false }),
}));

import CampaignsPage from "./page";

describe("CampaignsPage — 3 states", () => {
  beforeEach(() => {
    // Reset to new-user state before each test.
    mockState.summary = null;
    mockState.cards = [];
    mockState.feed = emptyFeed;
    mockState.wallet = emptyWallet;
    mockState.loyaltyWallet = emptyLoyaltyWallet;
    mockState.groups = [];
    mockState.groupSession = null;
  });

  describe("new / empty user", () => {
    it("shows welcome heading and starter mission", () => {
      render(<CampaignsPage />);
      // i18n returns key in tests; check for the key.
      expect(screen.getByText("cmp.home.empty.title")).toBeInTheDocument();
      expect(screen.getByText("cmp.home.empty.subtitle")).toBeInTheDocument();
      expect(screen.getByText("cmp.home.empty.pick")).toBeInTheDocument();
    });

    it("does NOT show stats strip", () => {
      render(<CampaignsPage />);
      // Stats strip uses stats keys; none should appear in new-user state.
      expect(screen.queryByText("cmp.home.stats.rewards")).not.toBeInTheDocument();
    });

    it("starter mission joined state links to /campaigns/visit-qr", async () => {
      // Set up a joinable nearby campaign.
      mockState.feed = {
        followed: [],
        discover: [makeActiveCampaign({ id: "nearby-c1", my_progress: { joined: false, status: "joined", current_count: 0, target_count: 5, completed: false, voucher_id: null } })],
        sections: { featured: [], trending: [], fresh: [] },
      };
      // Mock the join mutation to resolve immediately.
      mockJoinCampaign.mockResolvedValueOnce(undefined);

      render(<CampaignsPage />);

      // Campaign selection buttons are rendered with business name + reward.
      // Click the first campaign button (accessible name is "Manas Free coffee").
      const campaignButton = screen.getByRole("button", { name: /Manas Free coffee/ });
      fireEvent.click(campaignButton);

      // Click join.
      const joinButton = screen.getByRole("button", { name: /cmp\.home\.empty\.join/ });
      fireEvent.click(joinButton);

      // Wait for the mutation to complete and the joined state to render.
      const showQrLink = await screen.findByRole("link", { name: /cmp\.home\.hero\.showQr/ });
      expect(showQrLink).toHaveAttribute("href", "/campaigns/visit-qr");
    });
  });

  describe("returning user", () => {
    beforeEach(() => {
      mockState.summary = {
        visit_streak_days: 7,
        visit_streak_weeks: 3,
        streak_active_today: true,
        featured_campaign_ids: [],
        rewards_earned: 5,
        som_saved: "1200",
        active_cards: 2,
      };
      mockState.cards = [makeLoyaltyCard()];
      mockState.feed = {
        followed: [makeActiveCampaign()],
        discover: [],
        sections: { featured: [], trending: [], fresh: [] },
      };
    });

    it("shows subtitle (not welcome)", () => {
      render(<CampaignsPage />);
      expect(screen.getByText("cmp.home.subtitle")).toBeInTheDocument();
      expect(screen.queryByText("cmp.home.empty.title")).not.toBeInTheDocument();
    });

    it("shows streak chip with week count", () => {
      render(<CampaignsPage />);
      // The streak chip renders t("cmp.home.streak") + n=3.
      // In tests, i18n returns the key, so the chip text is "cmp.home.streak".
      expect(screen.getByText("cmp.home.streak")).toBeInTheDocument();
    });

    it("shows vessel hero (closest reward)", () => {
      render(<CampaignsPage />);
      // VesselHero renders hero.eyebrow key.
      expect(screen.getByText("cmp.home.hero.eyebrow")).toBeInTheDocument();
    });

    it("shows stats strip when rewards_earned > 0", () => {
      render(<CampaignsPage />);
      // Stats strip is present.
      expect(screen.getByText("cmp.home.stats.rewards")).toBeInTheDocument();
    });

    it("shows in-progress list", () => {
      render(<CampaignsPage />);
      expect(screen.getByText("Coffee Challenge")).toBeInTheDocument();
      expect(screen.getByLabelText("3 / 5")).toBeInTheDocument();
    });

    it("opens campaign details in a sheet", () => {
      render(<CampaignsPage />);
      fireEvent.click(screen.getByRole("button", { name: /Coffee Challenge/ }));
      expect(screen.getByRole("dialog", { name: "Coffee Challenge" })).toBeInTheDocument();
      expect(screen.getByText("cmp.detail.howItWorks")).toBeInTheDocument();
      expect(screen.getByText("cmp.detail.rules")).toBeInTheDocument();
      expect(screen.getByText("cmp.detail.schedule")).toBeInTheDocument();
      expect(screen.getByText("cmp.detail.showQr")).toBeInTheDocument();
    });

    it("does not show the patches entry", () => {
      render(<CampaignsPage />);
      expect(screen.queryByText("cmp.home.patches.title")).not.toBeInTheDocument();
    });
  });

  describe("early user (joined but no rewards yet)", () => {
    beforeEach(() => {
      mockState.summary = {
        visit_streak_days: 7,
        visit_streak_weeks: 1,
        streak_active_today: true,
        featured_campaign_ids: [],
        rewards_earned: 0, // triggers early state
        som_saved: "0",
        active_cards: 1,
      };
      mockState.cards = [makeLoyaltyCard()];
      mockState.feed = {
        followed: [makeActiveCampaign()],
        discover: [],
        sections: { featured: [], trending: [], fresh: [] },
      };
    });

    it("does NOT show stats strip for early user", () => {
      render(<CampaignsPage />);
      expect(screen.queryByText("cmp.home.stats.rewards")).not.toBeInTheDocument();
    });

    it("still shows streak chip and hero", () => {
      render(<CampaignsPage />);
      expect(screen.getByText("cmp.home.streak")).toBeInTheDocument();
      expect(screen.getByText("cmp.home.hero.eyebrow")).toBeInTheDocument();
    });
  });

  describe("group reward hero", () => {
    it("shows the business logo", () => {
      mockState.summary = {
        visit_streak_days: 7,
        visit_streak_weeks: 1,
        streak_active_today: true,
        featured_campaign_ids: [],
        rewards_earned: 0,
        som_saved: "0",
        active_cards: 1,
      };
      mockState.feed = {
        followed: [
          makeActiveCampaign({
            business: {
              id: "b1",
              name: "Manas Coffee",
              category: "cafe",
              logo_url: "/media/manas.png",
              area: "",
              address: "",
            },
            campaign_type: "group",
            rule: {
              mechanic: "visit",
              required_count: null,
              max_count_per_day: null,
              min_time_between: null,
              required_group_size: 4,
              group_checkin_window: null,
              group_checkin_window_minutes: null,
            },
          }),
          makeActiveCampaign({ id: "individual-campaign" }),
        ],
        discover: [],
        sections: { featured: [], trending: [], fresh: [] },
      };
      mockState.groups = [{
        id: "g1",
        campaign_id: "c1",
        campaign_name: "Coffee Challenge",
        business_name: "Manas Coffee",
        business_logo_url: "/media/manas.png",
        status: "forming",
        required_size: 4,
        joined_count: 1,
      }];
      mockState.groupSession = {
        id: "g1",
        campaign: { id: "c1", name: "Coffee Challenge", glyph: "👥" },
        business_name: "Manas Coffee",
        business_logo_url: "/media/manas.png",
        group_leader: "u1",
        invite_code: "invite-code",
        invite_url: "https://jaqyn.example/q/invite-code",
        status: "forming",
        required_size: 4,
        joined_count: 1,
        members: [{
          id: "m1",
          name: "Test Client",
          initial: "T",
          is_leader: true,
          is_you: true,
          checked_in: false,
          status: "joined",
        }],
        visit_time: "2026-07-05T15:00:00Z",
        name: null,
        note: null,
        checkin_token: null,
      };

      const { container } = render(<CampaignsPage />);
      expect(container.querySelector('img[src="/media/manas.png"]')).toBeInTheDocument();
      expect(screen.getByText("cmp.home.inprogress.title")).toBeInTheDocument();
      expect(screen.getByText("cmp.home.groups.title")).toBeInTheDocument();
      expect(screen.getByText("cmp.home.groups.badge")).toBeInTheDocument();
      expect(screen.getByLabelText("cmp.home.groups.joined")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Manas Coffee cmp\.home\.groups\.badge/ }));
      expect(screen.getByRole("dialog", { name: "Coffee Challenge" })).toBeInTheDocument();
      expect(screen.getByText(/Test Client/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "common.copy" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "cmp.group.inviteFriends" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "cmp.group.leave" })).toBeInTheDocument();
    });
  });

  describe("claimable banner", () => {
    it("shows claimable banner when active campaign vouchers exist", () => {
      const voucher: CampaignVoucher = {
        id: "v1", code: "ABC", status: "active", glyph: "",
        business: { id: "b1", name: "Manas" },
        campaign: { id: "c1", name: "Coffee" },
        reward_title: "Free coffee", reward_description: "",
        qr_token: "tok", issued_label: "", expires_label: "",
        expiring_soon: false, redeemed_at_label: null, redeemed_by: null,
        redeemed_branch: null, catalog_item: null, item_selection: null,
      };
      mockState.wallet = { active: [voucher], used: [], expired: [] };
      mockState.summary = {
        visit_streak_days: 1, visit_streak_weeks: 1, streak_active_today: true,
        featured_campaign_ids: [], rewards_earned: 1, som_saved: "0", active_cards: 1,
      };
      mockState.cards = [makeLoyaltyCard()];
      render(<CampaignsPage />);
      expect(screen.getByText("cmp.home.claimable.title")).toBeInTheDocument();
    });

    it("opens the claimable reward in a sheet", () => {
      const voucher: CampaignVoucher = {
        id: "v1", code: "ABC", status: "active", glyph: "",
        business: { id: "b1", name: "Manas" },
        campaign: { id: "c1", name: "Coffee" },
        reward_title: "Free coffee", reward_description: "", qr_token: "qr",
        issued_label: "today", expires_label: "tomorrow", expiring_soon: false,
        redeemed_at_label: null, redeemed_by: null, redeemed_branch: null,
        catalog_item: null, item_selection: null,
      };
      mockState.wallet = { active: [voucher], used: [], expired: [] };
      mockState.summary = {
        visit_streak_days: 1, visit_streak_weeks: 1, streak_active_today: true,
        featured_campaign_ids: [], rewards_earned: 1, som_saved: "0", active_cards: 1,
      };
      mockState.cards = [makeLoyaltyCard()];
      render(<CampaignsPage />);

      fireEvent.click(screen.getByRole("button", { name: /cmp\.home\.claimable\.title/ }));
      expect(screen.getByRole("dialog", { name: "cmp.home.claimable.sheetTitle" })).toBeInTheDocument();
      expect(screen.getByText("cmp.home.claimable.viewReward")).toBeInTheDocument();
    });
  });
});
