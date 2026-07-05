/**
 * Business dashboard — today's activity feed (FIX-04).
 *
 * The metric cards read live data; this test covers the activity section, which
 * flips between the empty-state copy and a populated event feed. API hooks are
 * mocked so no network calls run; i18n returns the key identity in tests.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent, Dashboard } from "@jaqyn/api";

// Shell renders children only — keeps the test focused on the page body.
vi.mock("../_components/OwnerShell", () => ({
  OwnerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockState: { dashboard: Dashboard | undefined; isError: boolean } = {
  dashboard: undefined,
  isError: false,
};

vi.mock("@jaqyn/api", () => ({
  useBusinessMe: () => ({ isError: mockState.isError }),
  useDashboard: () => ({ data: mockState.dashboard, isLoading: false }),
}));

import BusinessDashboardPage from "./page";

function makeEvent(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "e1",
    kind: "visit",
    customer: "Aida N.",
    label: "Visit Streak",
    created_at: new Date().toISOString(),
    ...over,
  };
}

function makeDashboard(activity: ActivityEvent[]): Dashboard {
  return {
    // Only the fields the page reads matter; cast the rest through unknown.
    business: {} as Dashboard["business"],
    metrics: { total_scans: 0 } as Dashboard["metrics"],
    activity,
  };
}

describe("BusinessDashboardPage — today's activity", () => {
  beforeEach(() => {
    mockState.dashboard = undefined;
    mockState.isError = false;
  });

  it("shows the empty-state copy when there is no activity today", () => {
    mockState.dashboard = makeDashboard([]);
    render(<BusinessDashboardPage />);
    expect(screen.getByText("owner.dashboard.activityEmpty")).toBeInTheDocument();
  });

  it("renders one row per event with customer and label", () => {
    mockState.dashboard = makeDashboard([
      makeEvent({ id: "e1", customer: "Aida N.", label: "Visit Streak" }),
      makeEvent({ id: "e2", kind: "redeem", customer: "Bek M.", label: "Free coffee" }),
    ]);
    render(<BusinessDashboardPage />);

    expect(screen.queryByText("owner.dashboard.activityEmpty")).not.toBeInTheDocument();
    expect(screen.getByText("Aida N.")).toBeInTheDocument();
    expect(screen.getByText("Visit Streak")).toBeInTheDocument();
    expect(screen.getByText("Bek M.")).toBeInTheDocument();
    expect(screen.getByText("Free coffee")).toBeInTheDocument();
  });

  it("falls back to the kind label when an event has no customer/label", () => {
    mockState.dashboard = makeDashboard([
      makeEvent({ id: "e3", kind: "stamp", customer: "", label: "" }),
    ]);
    render(<BusinessDashboardPage />);
    // Both the title and sub fall back to the owner-surface kind-label i18n key.
    expect(screen.getAllByText("owner.dashboard.activity.kind.stamp").length).toBeGreaterThan(0);
  });
});
