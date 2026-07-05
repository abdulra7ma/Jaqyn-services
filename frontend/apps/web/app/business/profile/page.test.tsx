import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../_components/OwnerShell", () => ({
  OwnerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../_components/LocationPicker", () => ({
  LocationPicker: () => <div data-testid="location-picker" />,
}));
vi.mock("../../_lib/auth", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("../../_lib/useErrMessage", () => ({ useErrMessage: () => () => "" }));

const updateMutate = vi.fn();
const business = {
  id: "b-1",
  name: "Test Cafe",
  category: "cafe",
  price_level: "cc",
  description: "Cozy",
  phone: "+996 555",
  working_hours: null,
};

vi.mock("@jaqyn/api", () => {
  const idle = { mutate: vi.fn(), isPending: false };
  return {
    useBusinessMe: () => ({ data: business }),
    useBusinessTypes: () => ({ data: [] }),
    useOnboardingState: () => ({
      data: { completion_score: 80, missing_required_fields: [{ label: "Logo image", step: 1 }] },
      refetch: vi.fn(),
    }),
    useCatalog: () => ({ data: [] }),
    useSubmitOnboarding: () => idle,
    useUpdateBusiness: () => ({ mutate: updateMutate, isPending: false }),
    useUploadBusinessLogo: () => idle,
    useUploadBusinessCover: () => idle,
    useAddCatalogItem: () => idle,
    useRemoveCatalogItem: () => idle,
    useUploadCatalogItemImage: () => idle,
    useGallery: () => ({ data: [] }),
    useUploadGalleryImage: () => idle,
    useDeleteGalleryImage: () => idle,
    useRegenerateApprovalCode: () => ({ ...idle, isSuccess: false, isError: false }),
    useSetOwnerStaff: () => idle,
  };
});

import BusinessSettingsPage from "./page";

const selectProfile = () =>
  userEvent.click(screen.getAllByRole("button", { name: "owner.settings.nav.profile" })[0]!);
const selectContact = () =>
  userEvent.click(screen.getAllByRole("button", { name: "owner.settings.nav.contact" })[0]!);

describe("BusinessSettingsPage", () => {
  it("shows Overview by default and reveals Profile on nav click", async () => {
    render(<BusinessSettingsPage />);
    // Sections stay mounted; Profile is hidden until selected.
    const nameField = screen.getByDisplayValue("Test Cafe");
    expect(nameField).not.toBeVisible();

    await selectProfile();
    expect(nameField).toBeVisible();
  });

  it("saves only the Profile section's fields", async () => {
    render(<BusinessSettingsPage />);
    await selectProfile();
    // Role query excludes the hidden sections' Save buttons, leaving Profile's.
    await userEvent.click(screen.getByRole("button", { name: "owner.settings.save" }));

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test Cafe", category: "cafe", price_level: "cc", description: "Cozy" }),
      expect.anything(),
    );
    // Contact-only fields are not part of the Profile save payload.
    expect(updateMutate.mock.calls[0]![0]).not.toHaveProperty("phone");
  });

  it("jumps to the relevant section when a missing-field chip is clicked", async () => {
    render(<BusinessSettingsPage />);
    // "Logo image" is fixed in the Brand section; its Upload-logo control lives there.
    const brandControl = screen.getByText("business.profile.uploadLogo");
    expect(brandControl).not.toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /Logo image/ }));
    expect(brandControl).toBeVisible();
  });

  it("keeps unsaved edits when switching sections and back", async () => {
    render(<BusinessSettingsPage />);
    await selectProfile();
    const nameField = screen.getByDisplayValue("Test Cafe");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "Renamed");

    await selectContact();
    await selectProfile();
    expect(screen.getByDisplayValue("Renamed")).toBeVisible();
  });
});
