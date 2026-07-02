"use client";

import { tokenStore, useRequestPitchCode, useVerifyPitch } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Input, Sheet } from "@jaqyn/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useErrMessage } from "../../../_lib/useErrMessage";

const RESEND_COOLDOWN = 60;

export type ClaimSheetProps = {
  token: string;
  businessName: string;
  goal: number;
  rewardText: string;
  open: boolean;
  onClose: () => void;
};

/**
 * Bottom sheet claim flow: email → 6-digit code → success.
 * After verify, stores tokens and routes directly to /business/dashboard
 * (a claimed pitch always yields a business owner; the verify response lacks the
 * area/full-User shape that postAuthRoute requires).
 */
export function ClaimSheet({ token, businessName, goal, rewardText, open, onClose }: ClaimSheetProps) {
  const t = useT();
  const errMessage = useErrMessage();
  const router = useRouter();

  const [step, setStep] = useState<"email" | "code" | "success">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      setStep("email");
      setEmail("");
      setCode("");
      setResendSeconds(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [open]);

  // Cleanup timer on unmount
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const startResendTimer = () => {
    setResendSeconds(RESEND_COOLDOWN);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendSeconds((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const requestCode = useRequestPitchCode();
  const verifyPitch = useVerifyPitch();

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestCode.mutate(
      { token, email },
      {
        onSuccess: () => {
          setStep("code");
          startResendTimer();
        },
      },
    );
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyPitch.mutate(
      { token, email, code, goal, reward_text: rewardText },
      {
        onSuccess: (result) => {
          // Store JWT tokens. Pitch always yields a business owner; verify
          // response lacks the area field postAuthRoute requires, so route directly.
          tokenStore.set(result.access, result.refresh);
          setStep("success");
          // Brief success pause, then navigate to dashboard
          setTimeout(() => router.push("/business/dashboard"), 1200);
        },
      },
    );
  };

  const handleResend = () => {
    requestCode.mutate({ token, email }, { onSuccess: () => startResendTimer() });
  };

  const emailTitle = t("pitch.claim.emailTitle").replace("{name}", businessName);
  const codeSub = t("pitch.claim.codeSub").replace("{email}", email);
  const resendLabel =
    resendSeconds > 0
      ? t("pitch.claim.resendIn").replace("{n}", String(resendSeconds))
      : t("pitch.claim.resend");

  const successTitle = t("pitch.claim.successTitle").replace("{name}", businessName);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      ariaLabel={emailTitle}
    >
      <div className="pb-2 pt-1">
        {step === "email" && (
          <>
            <h2 className="font-display text-xl font-bold text-ink">{emailTitle}</h2>
            <p className="mt-1 text-sm text-subtle">{t("pitch.claim.emailSub")}</p>
            <form className="mt-5 flex flex-col gap-4" onSubmit={handleEmailSubmit}>
              <Input
                label={t("pitch.claim.emailLabel")}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {requestCode.isError && (
                <p role="alert" className="text-sm text-danger">{errMessage(requestCode.error)}</p>
              )}
              <Button type="submit" disabled={requestCode.isPending || !email}>
                {requestCode.isPending ? t("common.loading") : t("pitch.claim.getCode")}
              </Button>
            </form>
          </>
        )}

        {step === "code" && (
          <>
            <h2 className="font-display text-xl font-bold text-ink">{t("pitch.claim.codeTitle")}</h2>
            <p className="mt-1 text-sm text-subtle">{codeSub}</p>
            <form className="mt-5 flex flex-col gap-4" onSubmit={handleCodeSubmit}>
              <Input
                label={t("pitch.claim.codeTitle")}
                type="tel"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              {verifyPitch.isError && (
                <p role="alert" className="text-sm text-danger">
                  {errMessage(verifyPitch.error) || t("pitch.claim.wrongCode")}
                </p>
              )}
              <Button type="submit" disabled={verifyPitch.isPending || code.length < 6}>
                {verifyPitch.isPending ? t("common.loading") : t("pitch.claim.getCode")}
              </Button>
              <button
                type="button"
                disabled={resendSeconds > 0 || requestCode.isPending}
                onClick={handleResend}
                className="text-sm font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resendLabel}
              </button>
            </form>
          </>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center py-6 text-center">
            {/* sage success pop (design §10 jqPop animation) */}
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full bg-sage-soft text-3xl"
              style={{ animation: "jqPop .4s ease" }}
              aria-hidden
            >
              ✓
            </div>
            <h2 className="mt-4 font-display text-xl font-bold text-ink">{successTitle}</h2>
            <p className="mt-1 text-sm text-subtle">{t("pitch.claim.successSub")}</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
