/**
 * Intercepted campaign detail — static-sibling escape guard.
 *
 * The @modal slot's (.)campaigns/[id] interceptor also catches client
 * navigations to the static /campaigns/* pages (patches, discover, visit-qr)
 * because the slot tree has no static siblings. A non-UUID id must therefore
 * bypass the sheet and hard-navigate so the server resolves the real route.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const back = vi.fn();
let paramId = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back }),
  useParams: () => ({ id: paramId }),
}));

vi.mock("../../../campaigns/[id]/CampaignDetailRoute", () => ({
  CampaignDetailSheet: ({ campaignId }: { campaignId: string }) => (
    <div data-testid="sheet">{campaignId}</div>
  ),
}));

import InterceptedCampaignDetail from "./page";

const replace = vi.fn();
const originalLocation = window.location;

function stubLocation() {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, replace },
  });
}

function restoreLocation() {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
}

afterEach(() => {
  restoreLocation();
  vi.clearAllMocks();
});

describe("InterceptedCampaignDetail", () => {
  it("renders the sheet for a UUID campaign id", () => {
    stubLocation();
    paramId = "3f2b8c1a-9d4e-4f6a-8b2c-1d5e7f9a0b3c";
    render(<InterceptedCampaignDetail />);
    expect(screen.getByTestId("sheet")).toHaveTextContent(paramId);
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(["patches", "discover", "visit-qr"])(
    "escapes interception for static sibling %s via full navigation",
    (slug) => {
      stubLocation();
      paramId = slug;
      render(<InterceptedCampaignDetail />);
      expect(screen.queryByTestId("sheet")).toBeNull();
      expect(replace).toHaveBeenCalledWith(`/campaigns/${slug}`);
    },
  );
});
