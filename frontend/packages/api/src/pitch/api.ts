// Pitch API layer.
//
// Three public (unauthenticated) endpoints for the prospect pitch link flow:
// resolve a pitch token, request an email verification code, and verify the
// code to create a loyalty program and return JWT tokens.
// All calls pass { auth: false } — the shared client defaults auth to true.

import { api } from "../client";
import type { PitchClaimResult, PitchResolve, VerifyPitchInput } from "./types";

export const pitchApi = {
  resolve: (token: string) =>
    api.get<PitchResolve>(`/api/pitch/${encodeURIComponent(token)}/`, { auth: false }),

  requestCode: (token: string, email: string) =>
    api.post<{ sent: boolean }>(
      `/api/pitch/${encodeURIComponent(token)}/claim/`,
      { email },
      { auth: false },
    ),

  verify: (input: VerifyPitchInput) =>
    api.post<PitchClaimResult>(
      `/api/pitch/${encodeURIComponent(input.token)}/verify/`,
      { email: input.email, code: input.code, goal: input.goal, reward_text: input.reward_text },
      { auth: false },
    ),
};

export type PitchApi = typeof pitchApi;
