"use client";

import { postAuthRoute, useRequestPasswordReset, useResetPassword } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Input } from "@jaqyn/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useErrMessage } from "../_lib/useErrMessage";

const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPasswordPage() {
  const t = useT();
  const errMessage = useErrMessage();
  const router = useRouter();

  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const startResendTimer = () => {
    setResendSeconds(RESEND_COOLDOWN_SECONDS);
    timerRef.current = setInterval(() => {
      setResendSeconds((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const requestReset = useRequestPasswordReset();
  const resetPassword = useResetPassword();

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestReset.mutate(email, {
      onSuccess: () => {
        setStep("reset");
        startResendTimer();
      },
    });
  };

  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Reset auto-logs-in and returns the full auth payload — route by role/gate,
    // so a business/staff user lands on their console and an incomplete customer
    // still hits the completion gate, rather than always landing on "/".
    resetPassword.mutate(
      { email, code, newPassword },
      { onSuccess: (res) => router.replace(postAuthRoute(res, "/")) },
    );
  };

  const handleResend = () => {
    requestReset.mutate(email, { onSuccess: () => startResendTimer() });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-4 py-10 font-sans text-ink sm:px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-24 -top-24 h-[42vw] max-h-[420px] min-h-[260px] w-[42vw] min-w-[260px] max-w-[420px] rounded-full bg-brand/25 blur-3xl"
          style={{ animation: "jqFloatA 14s ease-in-out infinite" }}
        />
        <div
          className="absolute -right-20 top-1/3 h-[36vw] max-h-[360px] min-h-[220px] w-[36vw] min-w-[220px] max-w-[360px] rounded-full bg-sage/20 blur-3xl"
          style={{ animation: "jqFloatB 18s ease-in-out infinite" }}
        />
      </div>

      <button
        type="button"
        onClick={() => (step === "reset" ? setStep("email") : router.push("/login"))}
        className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card/70 text-subtle backdrop-blur transition hover:text-brand sm:left-6 sm:top-6"
        aria-label="Back"
      >
        ←
      </button>

      <div key={step} className="relative z-10 w-full max-w-[420px] animate-[jqIn_.4s_ease]">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-brand-gradient font-display text-3xl font-extrabold text-brand-fg shadow-glow">
            J
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink sm:text-[27px]">
            {step === "email" ? t("auth.forgot.title") : t("auth.forgot.codeTitle")}
          </h1>
          <p className="mt-1.5 text-sm text-subtle">
            {step === "email" ? (
              t("auth.forgot.subtitle")
            ) : (
              <>
                {t("auth.forgot.codeSentTo")} <b className="text-ink">{email}</b>
              </>
            )}
          </p>
        </div>

        <div className="mt-6 rounded-[22px] border border-line bg-card/80 p-5 shadow-card backdrop-blur-sm sm:p-6">
          {step === "email" ? (
            <form className="flex flex-col gap-4" onSubmit={handleEmailSubmit}>
              <Input
                label={t("auth.email")}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {requestReset.isError && (
                <p className="text-sm text-danger">{errMessage(requestReset.error)}</p>
              )}
              <Button type="submit" disabled={requestReset.isPending || !email}>
                {requestReset.isPending ? t("common.loading") : t("auth.forgot.emailSubmit")}
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleResetSubmit}>
              <Input
                label={t("auth.forgot.code")}
                type="tel"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              <Input
                label={t("auth.forgot.newPassword")}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
              {resetPassword.isError && (
                <p className="text-sm text-danger">{errMessage(resetPassword.error)}</p>
              )}
              <Button
                type="submit"
                disabled={resetPassword.isPending || code.length < 6 || newPassword.length < 8}
              >
                {resetPassword.isPending ? t("common.loading") : t("auth.forgot.submit")}
              </Button>
              <button
                type="button"
                disabled={resendSeconds > 0 || requestReset.isPending}
                onClick={handleResend}
                className="text-sm font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resendSeconds > 0
                  ? t("auth.forgot.resendIn").replace("{n}", String(resendSeconds))
                  : t("auth.forgot.resend")}
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-[12.5px] text-subtle">
          <Link href="/login" className="font-semibold text-brand hover:underline">
            {t("auth.forgot.backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}
