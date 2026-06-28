import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../_components/OwnerShell", () => ({
  OwnerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../_components/SocialPostStudio", () => ({ SocialPostStudio: () => null }));
vi.mock("../../../_lib/useErrMessage", () => ({ useErrMessage: () => () => "error" }));

vi.mock("@jaqyn/api", () => ({
  useCreateCampaign: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  // The item-reward picker fetches the owner's catalog (multi-form-loyalty slice 3).
  useCatalog: () => ({
    data: [{ id: "ci-1", name: "Latte", price: "180" }],
    isLoading: false,
    isError: false,
  }),
}));

import NewCampaignPage from "./page";

describe("Campaign create flow — outcome chooser + adaptive form", () => {
  it("step 1 shows the three outcome cards with their technical-type subtitles + templates", () => {
    render(<NewCampaignPage />);
    expect(screen.getByText("cmp.biz.new.outcome.individual")).toBeInTheDocument();
    expect(screen.getByText("cmp.biz.new.outcome.group")).toBeInTheDocument();
    expect(screen.getByText("cmp.biz.new.outcome.social")).toBeInTheDocument();
    // technical type subtitles
    expect(screen.getByText("cmp.biz.new.outcome.individualType")).toBeInTheDocument();
    expect(screen.getByText("cmp.biz.new.outcome.socialType")).toBeInTheDocument();
    // starter templates + start-from-scratch
    expect(screen.getByText("cmp.biz.new.tpl.visit5")).toBeInTheDocument();
    expect(screen.getByText("cmp.biz.new.scratch")).toBeInTheDocument();
  });

  it("picking the Individual outcome advances to the adaptive form showing the mechanic + visits field", async () => {
    const user = userEvent.setup();
    render(<NewCampaignPage />);
    await user.click(screen.getByText("cmp.biz.new.outcome.individual"));

    // mechanic chooser + visit field, reward field
    expect(screen.getByText("cmp.biz.form.mechanic")).toBeInTheDocument();
    expect(screen.getByText("cmp.biz.form.requiredVisits")).toBeInTheDocument();
    expect(screen.getByText("cmp.biz.form.reward")).toBeInTheDocument();
    // group/social-only fields are not shown for individual
    expect(screen.queryByText("cmp.biz.form.groupSize")).not.toBeInTheDocument();
    expect(screen.queryByText("cmp.biz.form.instagram")).not.toBeInTheDocument();
  });

  it("picking the Group outcome shows group size + check-in window, not the mechanic", async () => {
    const user = userEvent.setup();
    render(<NewCampaignPage />);
    await user.click(screen.getByText("cmp.biz.new.outcome.group"));

    expect(screen.getByText("cmp.biz.form.groupSize")).toBeInTheDocument();
    expect(screen.getByText("cmp.biz.form.checkinWindow")).toBeInTheDocument();
    expect(screen.queryByText("cmp.biz.form.mechanic")).not.toBeInTheDocument();
  });

  it("picking the Social outcome shows the Instagram field only", async () => {
    const user = userEvent.setup();
    render(<NewCampaignPage />);
    await user.click(screen.getByText("cmp.biz.new.outcome.social"));

    expect(screen.getByText("cmp.biz.form.instagram")).toBeInTheDocument();
    expect(screen.queryByText("cmp.biz.form.groupSize")).not.toBeInTheDocument();
    expect(screen.queryByText("cmp.biz.form.requiredVisits")).not.toBeInTheDocument();
  });

  it("choosing the Points mechanic shows the basis toggle + per-visit + cashback fields", async () => {
    const user = userEvent.setup();
    render(<NewCampaignPage />);
    await user.click(screen.getByText("cmp.biz.new.outcome.individual"));

    // Switch the mechanic to Points (multi-form-loyalty slice 3).
    await user.click(screen.getByRole("button", { name: "cmp.biz.form.mechanic.points" }));

    expect(screen.getByText("cmp.biz.form.pointsBasis")).toBeInTheDocument();
    // Per-visit basis is the default → per-visit rate + cashback rate are shown.
    expect(screen.getByText("cmp.biz.form.pointsPerVisit")).toBeInTheDocument();
    expect(screen.getByText("cmp.biz.form.cashbackPerPoint")).toBeInTheDocument();
    // The visit-completion field is gone (points has no completion target), and the
    // item-reward picker (visit/stamp/spend only) is not shown for points.
    expect(screen.queryByText("cmp.biz.form.requiredVisits")).not.toBeInTheDocument();
    expect(screen.queryByText("cmp.biz.form.itemSelection")).not.toBeInTheDocument();
  });

  it("switching the points basis to spend swaps the rate field to points-per-som", async () => {
    const user = userEvent.setup();
    render(<NewCampaignPage />);
    await user.click(screen.getByText("cmp.biz.new.outcome.individual"));
    await user.click(screen.getByRole("button", { name: "cmp.biz.form.mechanic.points" }));
    await user.click(screen.getByRole("button", { name: "cmp.biz.form.pointsBasis.spend" }));

    expect(screen.getByText("cmp.biz.form.pointsPerSom")).toBeInTheDocument();
    expect(screen.queryByText("cmp.biz.form.pointsPerVisit")).not.toBeInTheDocument();
  });

  it("a visit campaign offers the item-selection toggle; Fixed reveals the catalog picker", async () => {
    const user = userEvent.setup();
    render(<NewCampaignPage />);
    await user.click(screen.getByText("cmp.biz.new.outcome.individual"));

    // visit/stamp/spend rewards expose the item-selection toggle (slice 3).
    expect(screen.getByText("cmp.biz.form.itemSelection")).toBeInTheDocument();
    // Default is customer-choice → no picker. Switching to Fixed reveals it.
    expect(screen.queryByText("cmp.biz.form.catalogItem")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "cmp.biz.form.item.fixed" }));
    expect(screen.getByText("cmp.biz.form.catalogItem")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Latte/ })).toBeInTheDocument();
  });

  it("a spend template prefills the spend mechanic + required-spend field", async () => {
    const user = userEvent.setup();
    render(<NewCampaignPage />);
    await user.click(screen.getByText("cmp.biz.new.tpl.spend1000"));

    // advanced to the details step with the spend mechanic field shown + prefilled
    // (the spend template sets mechanic=spend, required_spend=1000).
    expect(screen.getByText("cmp.biz.form.requiredSpend")).toBeInTheDocument();
    // 1000 appears on the spend field (template) and the max-participants default.
    expect(screen.getAllByDisplayValue("1000").length).toBeGreaterThanOrEqual(1);
    // the visit field is hidden because the mechanic is spend
    expect(screen.queryByText("cmp.biz.form.requiredVisits")).not.toBeInTheDocument();
  });
});
