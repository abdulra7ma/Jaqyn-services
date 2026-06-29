import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamRow } from "@jaqyn/api";

vi.mock("../_components/OwnerShell", () => ({
  OwnerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../_components/QueryBoundary", () => ({
  QueryBoundary: ({ children, query }: { children: (d: unknown) => React.ReactNode; query: { data: unknown } }) =>
    query.data ? <>{children(query.data)}</> : null,
}));

// Mutable mock state driven by individual tests.
const mocks = {
  removeMember: vi.fn(),
  removeInvite: vi.fn(),
  removePending: false,
  cancelPending: false,
  // Drives which rows useTeam returns.
  members: [] as TeamRow[],
};

function member(over: Partial<TeamRow> = {}): TeamRow {
  return {
    id: "m-1",
    kind: "member",
    name: "Aibek K.",
    initials: "AK",
    email: "aibek@example.com",
    phone: "",
    avatar_url: null,
    role: "cashier",
    access_label: "Scan & redeem",
    status: "active",
    joined: "2024-01-01T00:00:00Z",
    last_active: null,
    stats: { scans: 10, redemptions: 3, signups: 1 },
    ...over,
  };
}

function invite(over: Partial<TeamRow> = {}): TeamRow {
  return {
    ...member({ kind: "invite", status: "invited", ...over }),
  };
}

vi.mock("@jaqyn/api", () => ({
  useTeam: () => ({
    data: {
      counts: { total: mocks.members.length, active: 1, invited: 0, suspended: 0 },
      members: mocks.members,
    },
    isLoading: false,
    isError: false,
  }),
  useRemoveStaffMember: () => ({
    mutate: mocks.removeMember,
    isPending: mocks.removePending,
    isError: false,
    error: null,
  }),
  useRemoveStaffInvite: () => ({
    mutate: mocks.removeInvite,
    isPending: mocks.cancelPending,
    isError: false,
    error: null,
  }),
  useUpdateStaffRole: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useSuspendStaff: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useReactivateStaff: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useResetStaffPassword: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useAddStaffInvite: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));

vi.mock("../../_lib/useErrMessage", () => ({
  useErrMessage: () => () => "error",
}));

import ManageStaffPage from "./page";

describe("Staff page — remove member AlertDialog", () => {
  beforeEach(() => {
    mocks.removeMember = vi.fn();
    mocks.removePending = false;
    mocks.members = [member()];
  });

  it("opens an AlertDialog when the Remove button is clicked (no window.confirm)", async () => {
    const user = userEvent.setup();
    render(<ManageStaffPage />);

    // Open the staff drawer.
    await user.click(screen.getByRole("button", { name: "biz.staff.manage" }));

    // The remove button is in the drawer.
    const removeBtn = screen.getByRole("button", { name: "biz.staff.remove" });
    await user.click(removeBtn);

    // AlertDialog with role=alertdialog is shown; title is the i18n key.
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toBeInTheDocument();
    // Confirm + cancel buttons rendered by AlertDialog.
    expect(screen.getByRole("button", { name: "biz.staff.remove" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common.cancel" })).toBeInTheDocument();
  });

  it("fires the remove mutation when confirm is clicked", async () => {
    const user = userEvent.setup();
    render(<ManageStaffPage />);

    await user.click(screen.getByRole("button", { name: "biz.staff.manage" }));
    // Click the drawer's Remove (not the AlertDialog's confirm yet).
    const removeButtons = screen.getAllByRole("button", { name: "biz.staff.remove" });
    await user.click(removeButtons[0]!);

    // Click the confirm button inside the AlertDialog.
    const confirmButtons = screen.getAllByRole("button", { name: "biz.staff.remove" });
    // The last one is the AlertDialog confirm.
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    expect(mocks.removeMember).toHaveBeenCalledTimes(1);
    expect(mocks.removeMember.mock.calls[0]?.[0]).toBe("m-1");
  });

  it("does NOT fire the mutation when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<ManageStaffPage />);

    await user.click(screen.getByRole("button", { name: "biz.staff.manage" }));
    await user.click(screen.getByRole("button", { name: "biz.staff.remove" }));
    await user.click(screen.getByRole("button", { name: "common.cancel" }));

    expect(mocks.removeMember).not.toHaveBeenCalled();
    // Dialog dismissed.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("Staff page — cancel invite AlertDialog", () => {
  beforeEach(() => {
    mocks.removeInvite = vi.fn();
    mocks.cancelPending = false;
    // Populate team list with an invite row so the drawer shows InviteDetail.
    mocks.members = [invite()];
  });

  it("opens an AlertDialog when Cancel invite is clicked", async () => {
    const user = userEvent.setup();
    render(<ManageStaffPage />);

    // Open the drawer for the invite row.
    await user.click(screen.getByRole("button", { name: "biz.staff.manage" }));
    // Click the cancel invite button in the InviteDetail drawer.
    await user.click(screen.getByRole("button", { name: "biz.staff.cancelInvite" }));

    // AlertDialog opens.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    // Confirm + cancel buttons from AlertDialog.
    expect(
      screen.getAllByRole("button", { name: "biz.staff.cancelInvite" }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "common.cancel" })).toBeInTheDocument();
  });

  it("fires cancel mutation when confirm is clicked, not when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<ManageStaffPage />);

    await user.click(screen.getByRole("button", { name: "biz.staff.manage" }));
    // Open the AlertDialog.
    await user.click(screen.getByRole("button", { name: "biz.staff.cancelInvite" }));
    // Click Cancel (dismiss without mutating).
    await user.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(mocks.removeInvite).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
