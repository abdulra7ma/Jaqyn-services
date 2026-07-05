import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AuthResult } from "@jaqyn/api";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(),
}));

// GIS renders its own cross-origin iframe button — swap in a plain button that
// fires onSuccess with a fake credential, mirroring how a real Google sign-in
// resolves.
vi.mock("@react-oauth/google", () => ({
  GoogleLogin: ({ onSuccess }: { onSuccess: (cred: { credential?: string }) => void }) => (
    <button type="button" onClick={() => onSuccess({ credential: "fake-google-credential" })}>
      google-login
    </button>
  ),
}));

const googleAuthCall: { credential: string | null } = { credential: null };
const authResult: AuthResult = {
  access: "access-token",
  refresh: "refresh-token",
  user: {
    id: "user-1",
    phone: null,
    name: "New Customer",
    email: "new@example.com",
    role: "customer",
    is_phone_verified: false,
    is_email_verified: true,
    avatar: null,
    avatar_emoji: "",
  },
  area: "customer",
  is_new: true,
};

vi.mock("@jaqyn/api", () => ({
  postAuthRoute: () => "/signup/complete",
  useLoginResolve: () => ({ isPending: false, isError: false, mutate: vi.fn() }),
  useRequestOtp: () => ({ mutate: vi.fn() }),
  useVerifyOtp: () => ({ isPending: false, isError: false, mutate: vi.fn() }),
  useRequestEmailOtp: () => ({ mutate: vi.fn() }),
  useVerifyEmailOtp: () => ({ isPending: false, isError: false, mutate: vi.fn() }),
  usePasswordLogin: () => ({ isPending: false, isError: false, mutate: vi.fn() }),
  useGoogleAuth: () => ({
    isPending: false,
    isError: false,
    error: null,
    mutate: (credential: string, opts: { onSuccess: (r: AuthResult) => void }) => {
      googleAuthCall.credential = credential;
      opts.onSuccess(authResult);
    },
  }),
}));

vi.mock("../_lib/useErrMessage", () => ({ useErrMessage: () => () => "error" }));

import LoginPage from "./page";

describe("Login page — Google sign-in", () => {
  it("renders the live Google button", () => {
    render(<LoginPage />);
    expect(screen.getByText("google-login")).toBeInTheDocument();
  });

  it("clicking through Google sign-in calls useGoogleAuth and navigates via postAuthRoute", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByText("google-login"));

    expect(googleAuthCall.credential).toBe("fake-google-credential");
    expect(replaceMock).toHaveBeenCalledWith("/signup/complete");
  });
});
