"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { pitchApi } from "./api";
import type { VerifyPitchInput } from "./types";

export const pitchKeys = {
  resolve: (token: string) => ["pitch", token] as const,
};

// A dead/expired pitch link should surface immediately — no retry noise.
export const usePitchResolve = (token: string) =>
  useQuery({
    queryKey: pitchKeys.resolve(token),
    queryFn: () => pitchApi.resolve(token),
    retry: false,
  });

export const useRequestPitchCode = () =>
  useMutation({
    mutationFn: ({ token, email }: { token: string; email: string }) =>
      pitchApi.requestCode(token, email),
  });

export const useVerifyPitch = () =>
  useMutation({ mutationFn: (input: VerifyPitchInput) => pitchApi.verify(input) });
