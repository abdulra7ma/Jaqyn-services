import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign, GroupSession, MyGroup } from "@jaqyn/api";

vi.mock("../../../_components/CustomerShell", () => ({
  CustomerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../_lib/auth", () => ({ useRequireAuth: () => ({ isAuthenticated: true }) }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "camp-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
// QR code renders a heavy SVG; stub it so the forming view test stays focused.
vi.mock("react-qr-code", () => ({ default: () => <div data-testid="qr" /> }));

// Mutable mock state the individual tests drive.
const state: {
  myGroups: MyGroup[];
  startMock: ReturnType<typeof vi.fn>;
} = {
  myGroups: [],
  startMock: vi.fn(),
};

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp-1",
    business: { id: "b", name: "Manas Coffee", category: "cafe", logo_url: null, area: "Center", address: "" },
    business_lat: null,
    business_lng: null,
    glyph: "",
    name: "Coffee Crew",
    description: "Bring friends.",
    blurb: "",
    campaign_type: "group",
    status: "active",
    start_label: "",
    end_label: "",
    days_left: 5,
    active_days: "",
    active_hours: "08:00 – 11:00",
    active_start_time: "08:00",
    active_end_time: "11:00",
    repeat_policy: "once",
    max_participants: null,
    rule: {
      mechanic: null,
      required_count: null,
      max_count_per_day: null,
      min_time_between: null,
      required_group_size: 4,
      group_checkin_window: "30 min",
      group_checkin_window_minutes: 30,
    },
    reward: {
      type: "discount",
      title: "20% off",
      description: "",
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

function session(over: Partial<GroupSession> = {}): GroupSession {
  return {
    id: "sess-1",
    campaign: { id: "camp-1", name: "Coffee Crew", glyph: "" },
    business_name: "Manas Coffee",
    business_logo_url: null,
    group_leader: "u1",
    invite_code: "ABC123",
    invite_url: "https://jaqyn.kg/g/ABC123",
    status: "forming",
    required_size: 4,
    joined_count: 1,
    members: [
      { id: "m1", name: "You", initial: "Y", is_leader: true, is_you: true, checked_in: false, status: "joined" },
    ],
    visit_time: null,
    name: null,
    note: null,
    checkin_token: null,
    ...over,
  };
}

vi.mock("@jaqyn/api", () => ({
  useMyGroups: () => ({ data: state.myGroups, isLoading: false, isError: false, refetch: vi.fn() }),
  useCampaign: () => ({ data: campaign(), isLoading: false, isError: false, refetch: vi.fn() }),
  useGroupSession: () => ({ data: session(), isLoading: false, isError: false, refetch: vi.fn() }),
  useStartGroupSession: () => ({ mutate: state.startMock, isPending: false, isError: false }),
  useInviteToGroupSession: () => ({ mutate: vi.fn(), isPending: false }),
  useLeaveGroupSession: () => ({ mutate: vi.fn(), isPending: false }),
  useDemoFillGroup: () => ({ mutate: vi.fn(), isPending: false }),
}));

import GroupSessionPage from "./page";

describe("Group route — create form (no active group)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 5, 8, 0, 0));
    state.myGroups = [];
    state.startMock = vi.fn();
  });

  afterEach(() => vi.useRealTimers());

  it("renders the create form with time slots, name and note", () => {
    render(<GroupSessionPage />);
    expect(screen.getByText("cmp.group.create.title")).toBeInTheDocument();
    // Slots are radios generated from the 08:00–11:00 window.
    expect(screen.getAllByRole("radio").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("cmp.group.create.name")).toBeInTheDocument();
    expect(screen.getByLabelText("cmp.group.create.note")).toBeInTheDocument();
  });

  it("submitting calls useStartGroupSession with the campaign id and a visit time", () => {
    render(<GroupSessionPage />);
    fireEvent.change(screen.getByLabelText("cmp.group.create.name"), {
      target: { value: "Crew" },
    });
    fireEvent.click(screen.getByRole("button", { name: "cmp.group.create.submit" }));
    expect(state.startMock).toHaveBeenCalledTimes(1);
    const arg = state.startMock.mock.calls[0]?.[0] as {
      campaignId: string;
      visit_time?: string;
      name?: string;
    };
    expect(arg.campaignId).toBe("camp-1");
    expect(arg.name).toBe("Crew");
    expect(typeof arg.visit_time).toBe("string");
  });
});

describe("Group route — forming view (active group exists)", () => {
  beforeEach(() => {
    state.myGroups = [
      {
        id: "sess-1",
        campaign_id: "camp-1",
        campaign_name: "Coffee Crew",
        business_name: "Manas Coffee",
        business_logo_url: null,
        status: "forming",
        required_size: 4,
        joined_count: 1,
      },
    ];
  });

  it("renders avatar slots, the need-more line and a leave button", () => {
    render(<GroupSessionPage />);
    // Leader initial appears in the avatar row.
    expect(screen.getByText("cmp.group.needMore")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "cmp.group.leave" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "cmp.group.inviteFriends" })).toBeInTheDocument();
  });
});
