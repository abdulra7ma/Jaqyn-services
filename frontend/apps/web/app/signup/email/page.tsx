"use client";

import { useRequestEmailOtp, useVerifyEmailOtp } from "@jaqyn/api";
import type { Area, AuthResult } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Input } from "@jaqyn/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useErrMessage } from "../../_lib/useErrMessage";

const RESEND_COOLDOWN_SECONDS = 60;

/** Where a user lands after auth — owner/staff to their console, else the fallback. */
function areaPath(area: Area, fallback: string) {
  if (area === "business") return "/business/dashboard";
  if (area === "staff") return "/staff";
  return fallback;
}

export default function EmailSignupPage() {
  const t = useT();
  const errMessage = useErrMessage();
  const router = useRouter();

  const [step, setStep] = useState<"form" | "verify">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
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

  const requestEmailOtp = useRequestEmailOtp();
  const verifyEmailOtp = useVerifyEmailOtp();

  const go = (r: AuthResult) => {
    if (r.area === "customer" && (r.is_new || r.onboarding_completed === false)) {
      router.replace("/onboarding");
      return;
    }
    router.replace(areaPath(r.area, "/"));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestEmailOtp.mutate(
      { email, name, password, phone: phone || undefined },
      {
        onSuccess: () => {
          setStep("verify");
          startResendTimer();
        },
      },
    );
  };

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyEmailOtp.mutate({ email, code }, { onSuccess: (r) => go(r) });
  };

  const handleResend = () => {
    requestEmailOtp.mutate(
      { email, name, password, phone: phone || undefined },
      { onSuccess: () => startResendTimer() },
    );
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
        onClick={() => (step === "verify" ? setStep("form") : router.back())}
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
            {step === "form" ? t("signup.email.title") : t("signup.verify.title")}
          </h1>
          {step === "verify" && (
            <p className="mt-1.5 text-sm text-subtle">
              {t("signup.verify.subtitle")} <b className="text-ink">{email}</b>
            </p>
          )}
        </div>

        <div className="mt-6 rounded-[22px] border border-line bg-card/80 p-5 shadow-card backdrop-blur-sm sm:p-6">
          {step === "form" ? (
            <form className="flex flex-col gap-4" onSubmit={handleFormSubmit}>
              <Input
                label={t("signup.email.name")}
                type="text"
                autoComplete="name"
                placeholder={t("signup.email.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
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
              <Input
                label={t("signup.email.password")}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <Input
                label={t("signup.email.phone")}
                type="tel"
                inputMode="tel"
                placeholder={t("auth.phonePlaceholder")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {requestEmailOtp.isError && (
                <p className="text-sm text-danger">{errMessage(requestEmailOtp.error)}</p>
              )}
              <Button
                type="submit"
                disabled={requestEmailOtp.isPending || !name || !email || password.length < 8}
              >
                {requestEmailOtp.isPending ? t("common.loading") : t("signup.email.submit")}
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleVerifySubmit}>
              <Input
                label={t("auth.enterCode")}
                type="tel"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              {verifyEmailOtp.isError && (
                <p className="text-sm text-danger">{errMessage(verifyEmailOtp.error)}</p>
              )}
              <Button type="submit" disabled={verifyEmailOtp.isPending || code.length < 6}>
                {verifyEmailOtp.isPending ? t("common.loading") : t("signup.verify.submit")}
              </Button>
              <button
                type="button"
                disabled={resendSeconds > 0 || requestEmailOtp.isPending}
                onClick={handleResend}
                className="text-sm font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resendSeconds > 0
                  ? t("signup.verify.resendIn").replace("{n}", String(resendSeconds))
                  : t("signup.verify.resend")}
              </button>
            </form>
          )}
        </div>

        {step === "form" && (
          <p className="mt-5 text-center text-[12.5px] text-subtle">
            {t("signup.haveAccount")}{" "}
            <Link href="/login" className="font-semibold text-brand hover:underline">
              {t("signup.signIn")}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
