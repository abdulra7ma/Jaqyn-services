/**
 * QrLandingPage — token validation tests.
 *
 * Key assertions:
 *  1. An invalid-shape token renders the error state and fires NO network request.
 *  2. A valid-shape token (32 base64url chars) passes through to useQrResolve.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QrResolve } from "@jaqyn/api";

// ---- navigation mock (token injected per test) ----

const mockToken: { value: string } = { value: "" };

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: mockToken.value }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("../../_lib/useErrMessage", () => ({
  useErrMessage: () => () => "error message",
}));

vi.mock("../../_lib/auth", () => ({
  useAuth: () => ({ isAuthenticated: false, ready: true }),
}));

vi.mock("framer-motion", () => ({
  useReducedMotion: () => true,
}));

// Track whether resolveQr was called — the spy is reset before each test.
const resolveQrSpy = vi.fn();

// Controllable hook state
const qrState: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  data: QrResolve | undefined;
  calledToken: string;
} = {
  isLoading: false,
  isError: false,
  error: null,
  data: undefined,
  calledToken: "",
};

vi.mock("@jaqyn/api", () => ({
  useQrResolve: (token: string) => {
    qrState.calledToken = token;
    resolveQrSpy(token);
    return {
      isLoading: qrState.isLoading,
      isError: qrState.isError,
      error: qrState.error,
      data: qrState.data,
      refetch: vi.fn(),
    };
  },
}));

vi.mock("@jaqyn/i18n", () => ({
  useT: () => (key: string) => key,
  LanguageSwitch: () => null,
}));

import QrLandingPage from "./page";

// A token that matches the real format: secrets.token_urlsafe(24) → 32 base64url chars.
// backend/core/qr.py:9
const VALID_TOKEN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"; // 32 chars, base64url

describe("QrLandingPage — token validation", () => {
  beforeEach(() => {
    resolveQrSpy.mockClear();
    qrState.isLoading = false;
    qrState.isError = false;
    qrState.error = null;
    qrState.data = undefined;
    qrState.calledToken = "";
  });

  it("invalid token: renders error state and does NOT fire a network request", () => {
    // Tokens shorter than 32 chars, or with bad chars, are invalid.
    mockToken.value = "../../evil";
    render(<QrLandingPage />);

    // Error state is rendered (uses common.error i18n key via the !token path)
    expect(screen.getByText("common.error")).toBeInTheDocument();

    // useQrResolve is called with an empty string (enabled:!!token → false),
    // meaning no real queryFn fires.
    expect(resolveQrSpy).toHaveBeenCalledWith("");
  });

  it("invalid token with injection chars: renders error state, no request", () => {
    mockToken.value = "<script>alert(1)</script>";
    render(<QrLandingPage />);

    expect(screen.getByText("common.error")).toBeInTheDocument();
    expect(resolveQrSpy).toHaveBeenCalledWith("");
  });

  it("token too short: treated as invalid, no request", () => {
    mockToken.value = "shorttoken";
    render(<QrLandingPage />);

    expect(screen.getByText("common.error")).toBeInTheDocument();
    expect(resolveQrSpy).toHaveBeenCalledWith("");
  });

  it("valid-shape token: passes through to useQrResolve", () => {
    mockToken.value = VALID_TOKEN;
    render(<QrLandingPage />);

    // Hook receives the real token (not empty string)
    expect(resolveQrSpy).toHaveBeenCalledWith(VALID_TOKEN);
    // No error state shown when hook has no error
    expect(screen.queryByText("common.error")).not.toBeInTheDocument();
  });

  it("valid token that resolves data: shows business card content", () => {
    mockToken.value = VALID_TOKEN;
    qrState.data = {
      token: VALID_TOKEN,
      type: "merchant_collect",
      business: {
        id: "biz-1",
        name: "Manas Coffee",
        category: "cafe",
        description: null,
        address: "",
        area: "",
        latitude: null,
        longitude: null,
        phone: "",
        public_email: null,
        website_url: null,
        instagram_url: null,
        logo_url: null,
        cover_url: null,
        glyph: "",
        accent_color: "#C25E3C",
        price_level: "",
        tags: [],
        working_hours: null,
      },
      reward_program: null,
      progress: null,
    };
    render(<QrLandingPage />);

    // Business name appears in the badge ("qr.scanned · Manas Coffee") and in the
    // h1 — use getAllByText with a partial-string regex to match either occurrence.
    expect(screen.getAllByText(/Manas Coffee/).length).toBeGreaterThanOrEqual(1);
  });
});
