import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMutate: vi.fn(),
  detail: { value: undefined as unknown },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "c-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../../_components/SocialPostStudio", () => ({ SocialPostStudio: () => null }));
vi.mock("../../../_lib/useErrMessage", () => ({ useErrMessage: () => () => "error" }));
vi.mock("../../_components/OwnerShell", () => ({
  OwnerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../_components/QueryBoundary", () => ({
  QueryBoundary: ({ query, children }: { query: { data: unknown }; children: (d: unknown) => React.ReactNode }) =>
    query.data ? <>{children(query.data)}</> : null,
}));

const noopMutation = { mutate: vi.fn(), isPending: false, isError: false, isSuccess: false, error: null };

vi.mock("@jaqyn/api", () => ({
  useBusinessCampaign: () => ({ data: mocks.detail.value, isLoading: false, isError: false, error: null }),
  useBusinessMe: () => ({ data: { display_name: "Manas Coffee" } }),
  useCampaignAction: () => noopMutation,
  useCancelCampaignVoucher: () => noopMutation,
  useDuplicateCampaign: () => noopMutation,
  useUploadCampaignImage: () => noopMutation,
  useUpdateCampaign: () => ({ ...noopMutation, mutate: mocks.updateMutate }),
}));

import CampaignDetailPage from "./page";

function campaign(over: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    glyph: "☕",
    image: null,
    name: "Cold Brew",
    description: "",
    type: "individual",
    status: "draft",
    start_label: "",
    end_label: "",
    active_days: "",
    active_hours: "",
    repeat_policy: "once",
    max_participants: null,
    staff_approval_required: true,
    instagram_handle: null,
    rule: {
      mechanic: "visit",
      required_count: 5,
      max_count_per_day: null,
      min_time_between: null,
      required_group_size: null,
      group_checkin_window: null,
    },
    reward: { type: "free_item", title: "Free coffee", description: "", expiry_days_after_unlock: 7, max_redemptions: null },
    analytics: {},
    ...over,
  };
}

function tabsFor(c: Record<string, unknown>) {
  return {
    overview: c,
    settings: c,
    participants: [],
    reward_usage: [],
    groups: [],
    analytics: { joined: 0, completed: 0, issued: 0, redeemed: 0, redemption_rate: 0, estimated_cost: "0", type_stats: { stat_a: { label: "", value: 0 }, stat_b: { label: "", value: 0 }, stat_c: { label: "", value: 0 } } },
  };
}

beforeEach(() => {
  mocks.updateMutate.mockReset();
});

describe("Campaign detail — editable settings (draft/scheduled only)", () => {
  it("a draft campaign can be edited; Save sends the patched fields", async () => {
    const user = userEvent.setup();
    mocks.detail.value = tabsFor(campaign({ status: "draft" }));
    render(<CampaignDetailPage />);

    await user.click(screen.getByRole("button", { name: "cmp.biz.tab.settings" }));

    const nameInput = screen.getByDisplayValue("Cold Brew");
    await user.clear(nameInput);
    await user.type(nameInput, "Cold Brew v2");
    await user.click(screen.getByRole("button", { name: "cmp.biz.settings.save" }));

    await waitFor(() => expect(mocks.updateMutate).toHaveBeenCalledTimes(1));
    const call = mocks.updateMutate.mock.calls[0];
    if (!call) throw new Error("update.mutate was not called");
    const arg = call[0];
    expect(arg.id).toBe("c-1");
    expect(arg.patch).toMatchObject({
      type: "individual",
      name: "Cold Brew v2",
      reward_title: "Free coffee",
      repeat_policy: "once",
      mechanic: "visit",
      required_count: 5,
    });
  });

  it("a running (active) campaign shows the frozen note and no Save button", async () => {
    const user = userEvent.setup();
    mocks.detail.value = tabsFor(campaign({ status: "active" }));
    render(<CampaignDetailPage />);

    await user.click(screen.getByRole("button", { name: "cmp.biz.tab.settings" }));

    expect(screen.getByText("cmp.biz.settings.frozen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "cmp.biz.settings.save" })).not.toBeInTheDocument();
  });
});
