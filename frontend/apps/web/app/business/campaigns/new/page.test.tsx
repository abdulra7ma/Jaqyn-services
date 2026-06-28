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

  it("picking the Individual outcome shows a visit-count challenge without loyalty mechanics", async () => {
    const user = userEvent.setup();
    render(<NewCampaignPage />);
    await user.click(screen.getByText("cmp.biz.new.outcome.individual"));

    expect(screen.getByText("cmp.biz.form.requiredVisits")).toBeInTheDocument();
    expect(screen.getByText("cmp.biz.form.reward")).toBeInTheDocument();
    expect(screen.queryByText("cmp.biz.form.mechanic.points")).not.toBeInTheDocument();
    expect(screen.queryByText("cmp.biz.form.requiredSpend")).not.toBeInTheDocument();
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

  it("a visit campaign offers the item-selection toggle; Fixed reveals the catalog picker", async () => {
    const user = userEvent.setup();
    render(<NewCampaignPage />);
    await user.click(screen.getByText("cmp.biz.new.outcome.individual"));

    // Visit rewards expose the item-selection toggle.
    expect(screen.getByText("cmp.biz.form.itemSelection")).toBeInTheDocument();
    // Default is customer-choice → no picker. Switching to Fixed reveals it.
    expect(screen.queryByText("cmp.biz.form.catalogItem")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "cmp.biz.form.item.fixed" }));
    expect(screen.getByText("cmp.biz.form.catalogItem")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Latte/ })).toBeInTheDocument();
  });

});
