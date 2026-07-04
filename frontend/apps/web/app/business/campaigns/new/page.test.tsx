import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the vi.mock factories (which are hoisted above imports) can close
// over the same spies the tests configure/assert.
const mocks = vi.hoisted(() => ({
  createMutate: vi.fn(),
  uploadCampaignImage: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("../../_components/OwnerShell", () => ({
  OwnerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../_components/SocialPostStudio", () => ({ SocialPostStudio: () => null }));
vi.mock("../../../_lib/useErrMessage", () => ({ useErrMessage: () => () => "error" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}));

vi.mock("@jaqyn/api", () => ({
  businessApi: { uploadCampaignImage: mocks.uploadCampaignImage },
  useCreateCampaign: () => ({
    mutate: mocks.createMutate,
    isPending: false,
    isError: false,
    error: null,
  }),
  // The item-reward picker fetches the owner's catalog (multi-form-loyalty slice 3).
  useCatalog: () => ({
    data: [{ id: "ci-1", name: "Latte", price: "180" }],
    isLoading: false,
    isError: false,
  }),
}));

import NewCampaignPage from "./page";

beforeEach(() => {
  mocks.createMutate.mockReset();
  mocks.uploadCampaignImage.mockReset();
  mocks.replace.mockReset();
  // jsdom lacks object-URL APIs the PhotoField preview relies on.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

/** Drive the form to a valid, submittable Individual campaign with a photo. */
async function fillValidIndividualWithPhoto(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("cmp.biz.new.outcome.individual"));
  await user.type(screen.getByPlaceholderText("cmp.biz.form.namePlaceholder"), "Morning");
  await user.type(screen.getByPlaceholderText("cmp.biz.form.rewardTitlePlaceholder"), "Free coffee");
  const file = new File(["x"], "card.png", { type: "image/png" });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, file);
  return file;
}

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

  it("submitting with a photo uploads it onto the created campaign, then navigates", async () => {
    const user = userEvent.setup();
    mocks.createMutate.mockImplementation((_p, opts) => opts.onSuccess({ id: "c-9" }));
    mocks.uploadCampaignImage.mockResolvedValue({ id: "c-9" });
    render(<NewCampaignPage />);

    const file = await fillValidIndividualWithPhoto(user);
    await user.click(screen.getByRole("button", { name: "cmp.biz.form.create" }));

    await waitFor(() => expect(mocks.uploadCampaignImage).toHaveBeenCalledWith("c-9", file));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/business/campaigns/c-9"));
  });

  it("keeps the created campaign and offers retry when the photo upload fails", async () => {
    const user = userEvent.setup();
    mocks.createMutate.mockImplementation((_p, opts) => opts.onSuccess({ id: "c-9" }));
    mocks.uploadCampaignImage.mockRejectedValueOnce(new Error("cors"));
    render(<NewCampaignPage />);

    await fillValidIndividualWithPhoto(user);
    await user.click(screen.getByRole("button", { name: "cmp.biz.form.create" }));

    // Failure is surfaced, not swallowed; the campaign is not re-created and we
    // do not silently navigate away.
    await waitFor(() => expect(screen.getByText("cmp.biz.form.photoFailed")).toBeInTheDocument());
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "cmp.biz.form.photoRetry" })).toBeInTheDocument();

    // Retry succeeds → uploads again and navigates.
    mocks.uploadCampaignImage.mockResolvedValueOnce({ id: "c-9" });
    await user.click(screen.getByRole("button", { name: "cmp.biz.form.photoRetry" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/business/campaigns/c-9"));
  });

});
