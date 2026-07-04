"use client";

import { useUpdateProfile } from "@jaqyn/api";
import type { Language } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Input } from "@jaqyn/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRequireAuth } from "../../_lib/auth";
import { useErrMessage } from "../../_lib/useErrMessage";

const LANGS: Language[] = ["ru", "en"];

export default function CompleteProfilePage() {
  const t = useT();
  const errMessage = useErrMessage();
  const router = useRouter();
  const { isAuthenticated, ready } = useRequireAuth();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [language, setLanguage] = useState<Language>("ru");

  // Don't render the form until we know the user is authed (avoids a flash).
  if (!ready || !isAuthenticated) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(
      {
        name,
        ...(email ? { email } : {}),
        ...(birthday ? { birthday } : {}),
        language,
      },
      {
        // Profile now complete; the product tour is the next gate.
        onSuccess: () => router.replace("/onboarding"),
      },
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

      <div className="relative z-10 w-full max-w-[420px] animate-[jqIn_.4s_ease]">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-brand-gradient font-display text-3xl font-extrabold text-brand-fg shadow-glow">
            J
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink sm:text-[27px]">
            {t("profile.complete.title")}
          </h1>
          <p className="mt-1.5 text-sm text-subtle">{t("profile.complete.subtitle")}</p>
        </div>

        <div className="mt-6 rounded-[22px] border border-line bg-card/80 p-5 shadow-card backdrop-blur-sm sm:p-6">
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <Input
              label={t("profile.complete.name")}
              type="text"
              autoComplete="name"
              placeholder={t("profile.complete.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label={t("profile.complete.emailOptional")}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label={t("profile.complete.birthdayOptional")}
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-ink">{t("profile.complete.language")}</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-ink focus:border-brand focus:outline-none"
              >
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            {updateProfile.isError && (
              <p className="text-sm text-danger">{errMessage(updateProfile.error)}</p>
            )}
            <Button type="submit" disabled={updateProfile.isPending || !name.trim()}>
              {updateProfile.isPending ? t("common.loading") : t("profile.complete.submit")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
