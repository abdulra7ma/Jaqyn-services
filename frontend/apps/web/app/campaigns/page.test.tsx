/**
 * Campaigns page — behaviour tests for the 3-state hub (campaigns redesign F1).
 *
 * Tests mock the API hooks so no network calls are made. Each test exercises one
 * of the three states: returning / early / new user. The win-moment overlay is
 * tested separately (it fires when my_progress.completed flips true).
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Campaign,
  CampaignFeed,
  CampaignVoucher,
  CampaignWallet,
  LoyaltyCardView,
  LoyaltyHomeSummary,
  LoyaltyVoucherWallet,
  MyGroup,
  PatchesSummary,
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

const emptyPatches: PatchesSummary = {
  earned_count: 0, total: 15, board_seen: false, next: null, unseen_earned: [], patches: [],
};

// ---- Mock @jaqyn/api ---------------------------------------------------------

const mockState = {
  summary: null as LoyaltyHomeSummary | null,
  cards: [] as LoyaltyCardView[],
  feed: emptyFeed as CampaignFeed,
  wallet: emptyWallet as CampaignWallet,
  loyaltyWallet: emptyLoyaltyWallet as LoyaltyVoucherWallet,
  groups: emptyGroups as MyGroup[],
  patches: emptyPatches as PatchesSummary,
};

vi.mock("@jaqyn/api", () => ({
  useLoyaltyHomeSummary: () => ({ data: mockState.summary, isLoading: false, isError: false }),
  useLoyaltyCards: () => ({ data: mockState.cards, isLoading: false, isError: false }),
  useCampaignFeed: () => ({ data: mockState.feed, isLoading: false, isError: false }),
  useCampaignWallet: () => ({ data: mockState.wallet, isLoading: false, isError: false }),
  useLoyaltyVouchers: () => ({ data: mockState.loyaltyWallet, isLoading: false, isError: false }),
  useMyGroups: () => ({ data: mockState.groups, isLoading: false, isError: false }),
  useNearby: () => ({ data: [], isLoading: false, isError: false }),
  usePatches: () => ({ data: mockState.patches, isLoading: false, isError: false }),
  useJoinCampaign: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
    mockState.patches = emptyPatches;
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
  });
});
