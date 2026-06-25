"use client";

import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const t = useT();
  const router = useRouter();

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

      <Link
        href="/"
        className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card/70 text-subtle backdrop-blur transition hover:text-brand sm:left-6 sm:top-6"
        aria-label="Back home"
      >
        ←
      </Link>

      <div className="relative z-10 w-full max-w-[420px] animate-[jqIn_.4s_ease]">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-brand-gradient font-display text-3xl font-extrabold text-brand-fg shadow-glow">
            J
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink sm:text-[27px]">
            {t("signup.title")}
          </h1>
          <p className="mt-1.5 text-sm text-subtle">{t("signup.subtitle")}</p>
        </div>

        <div className="mt-6 rounded-[22px] border border-line bg-card/80 p-5 shadow-card backdrop-blur-sm sm:p-6">
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="flex items-center gap-3 rounded-xl border border-line bg-card/60 px-4 py-3.5 text-sm font-semibold text-ink transition hover:border-brand/40 hover:bg-brand/5"
            >
              <span className="text-xl">📱</span>
              {t("signup.option.phone")}
            </button>

            <button
              type="button"
              onClick={() => router.push("/signup/email")}
              className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3.5 text-sm font-semibold text-ink transition hover:border-brand/50 hover:bg-brand/10"
            >
              <span className="text-xl">✉️</span>
              {t("signup.option.email")}
            </button>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">
                or
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>

            {[
              { key: "google", label: t("signup.option.google"), glyph: "G" },
              { key: "apple", label: t("signup.option.apple"), glyph: "" },
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                disabled
                title="Social sign-in is coming soon"
                className="flex cursor-not-allowed items-center justify-center gap-2.5 rounded-xl border border-line bg-card/60 py-3 text-sm font-semibold text-subtle"
              >
                <span className="font-display text-[15px]">{p.glyph}</span>
                {p.label}
                <span className="ml-1 rounded-full bg-board/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-subtle">
                  Soon
                </span>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-5 text-center text-[12.5px] text-subtle">
          {t("signup.haveAccount")}{" "}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            {t("signup.signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
