import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PitchResolve } from "@jaqyn/api";

// Sheet.tsx reads a matchMedia breakpoint (768px) to pick Vaul vs Radix Dialog.
// Return true so Sheet renders via Radix Dialog, which jsdom handles correctly;
// Vaul's pointer-event internals crash in jsdom.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("768"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "test-token-abc" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../../_lib/useErrMessage", () => ({ useErrMessage: () => () => "error" }));

// Controllable resolve state — tests mutate this to exercise error path
const resolveState: {
  isLoading: boolean;
  isError: boolean;
  data: PitchResolve | undefined;
} = {
  isLoading: false,
  isError: false,
  data: {
    business_id: "biz-1",
    business_name: "Manas Coffee",
    logo_url: null,
    category: "cafe",
    default_goal: 6,
    default_reward: "coffee",
    published_count: 12,
  },
};

// Captured request-code call for assertion 3
const requestCodeCall: { args: { token: string; email: string } | null } = { args: null };

vi.mock("@jaqyn/api", () => ({
  usePitchResolve: () => ({ ...resolveState }),
  useRequestPitchCode: () => ({
    isPending: false,
    isError: false,
    mutate: (
      args: { token: string; email: string },
      opts: { onSuccess: () => void },
    ) => {
      requestCodeCall.args = args;
      opts.onSuccess();
    },
  }),
  useVerifyPitch: () => ({
    isPending: false,
    isError: false,
    mutate: vi.fn(),
  }),
  tokenStore: { set: vi.fn() },
}));

import PitchPage from "./page";

describe("Pitch page", () => {
  beforeEach(() => {
    requestCodeCall.args = null;
    // Reset to a successful resolve state before each test
    resolveState.isLoading = false;
    resolveState.isError = false;
    resolveState.data = {
      business_id: "biz-1",
      business_name: "Manas Coffee",
      logo_url: null,
      category: "cafe",
      default_goal: 6,
      default_reward: "coffee",
      published_count: 12,
    };
  });

  it("renders the business name and the claim CTA on a resolved pitch", () => {
    render(<PitchPage />);
    // business name appears on the hero card
    expect(screen.getByText("Manas Coffee")).toBeInTheDocument();
    // sticky CTA button
    expect(screen.getByRole("button", { name: "pitch.cta" })).toBeInTheDocument();
  });

  it("renders the dead-link screen when resolve fails", () => {
    resolveState.isError = true;
    resolveState.data = undefined;
    render(<PitchPage />);
    expect(screen.getByText("pitch.dead.title")).toBeInTheDocument();
  });

  it("opening the sheet and submitting an email calls the request-code mutation", async () => {
    const user = userEvent.setup();
    render(<PitchPage />);

    // Open the claim sheet via the sticky CTA
    await user.click(screen.getByRole("button", { name: "pitch.cta" }));

    // Email input is now labelled via id="pitch-email"; getByLabelText is unambiguous
    const emailInput = screen.getByLabelText("pitch.claim.emailLabel");
    await user.type(emailInput, "owner@example.com");

    // Submit the form
    await user.click(screen.getByRole("button", { name: "pitch.claim.getCode" }));

    expect(requestCodeCall.args).toEqual({
      token: "test-token-abc",
      email: "owner@example.com",
    });
  });
});
