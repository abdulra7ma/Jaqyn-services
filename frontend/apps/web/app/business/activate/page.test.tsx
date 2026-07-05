/**
 * BusinessActivatePage — token validation tests.
 *
 * Key assertions:
 *  1. A malformed token renders the invalid-link state and fires NO validateInvite call.
 *  2. A valid-shape token (43 base64url chars) proceeds to the API call.
 *
 * Wraps in act() because ActivateInner's useEffect fires asynchronously.
 */

import { render, screen, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- navigation: token injected per test ----

const mockToken: { value: string } = { value: "" };

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mockToken.value ? `token=${mockToken.value}` : ""),
  useRouter: () => ({ replace: vi.fn() }),
}));

// Track validateInvite calls
const validateInviteSpy = vi.fn();

vi.mock("@jaqyn/api", () => ({
  ApiClientError: class ApiClientError extends Error {
    code: string;
    constructor(msg: string, code = "GENERIC") {
      super(msg);
      this.code = code;
    }
  },
  businessApi: {
    validateInvite: (token: string) => {
      validateInviteSpy(token);
      // Return a pending promise — tests only care about whether it was called.
      return new Promise(() => {});
    },
  },
  tokenStore: { set: vi.fn() },
  useActivateInvite: () => ({ mutate: vi.fn(), isPending: false }),
}));

import BusinessActivatePage from "./page";

// A token matching the real format: secrets.token_urlsafe(32) → 43 base64url chars.
// backend/apps/businesses/onboarding_services.py:31
const VALID_TOKEN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq"; // 43 chars

describe("BusinessActivatePage — token validation", () => {
  beforeEach(() => {
    validateInviteSpy.mockClear();
  });

  it("no token: shows invalid state, no API call", async () => {
    mockToken.value = "";
    await act(async () => {
      render(<BusinessActivatePage />);
    });

    expect(screen.getByText("Activation link unavailable")).toBeInTheDocument();
    expect(validateInviteSpy).not.toHaveBeenCalled();
  });

  it("malformed token (short): shows invalid state, no API call", async () => {
    mockToken.value = "short-invalid";
    await act(async () => {
      render(<BusinessActivatePage />);
    });

    expect(screen.getByText("Activation link unavailable")).toBeInTheDocument();
    expect(validateInviteSpy).not.toHaveBeenCalled();
  });

  it("malformed token (injection chars): shows invalid state, no API call", async () => {
    mockToken.value = "../../../etc/passwd";
    await act(async () => {
      render(<BusinessActivatePage />);
    });

    expect(screen.getByText("Activation link unavailable")).toBeInTheDocument();
    expect(validateInviteSpy).not.toHaveBeenCalled();
  });

  it("valid-shape token: proceeds to validateInvite API call", async () => {
    mockToken.value = VALID_TOKEN;
    render(<BusinessActivatePage />);

    // The effect fires asynchronously — wait until the spy has been called.
    await waitFor(() => {
      expect(validateInviteSpy).toHaveBeenCalledWith(VALID_TOKEN);
    });
    // No invalid-link screen while the API call is in flight (returns pending Promise).
    expect(screen.queryByText("Activation link unavailable")).not.toBeInTheDocument();
  });
});
