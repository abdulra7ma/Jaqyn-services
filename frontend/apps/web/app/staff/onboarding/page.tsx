"use client";

// Staff first-login onboarding. An owner creates a staff account with a one-time
// password; on first sign-in the staffer lands here to set their own name +
// password (and an optional avatar) before entering the staff app. Renders its
// own minimal chrome — NOT StaffShell — so the StaffShell profile gate can't loop.

import { useCompleteStaffProfile, useUploadAvatar } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Input } from "@jaqyn/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStaffAuth } from "../_lib/staffAuth";

// Server enforces the same floor (StaffProfileCompleteSerializer new_password min_length=8).
const MIN_PASSWORD = 8;

export default function StaffOnboardingPage() {
  const t = useT();
  const router = useRouter();
  const { staff, ready } = useStaffAuth();

  const complete = useCompleteStaffProfile();
  const uploadAvatar = useUploadAvatar();
  const avatarInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);

  // Send anyone who doesn't belong here away: already-complete staff → app;
  // a signed-in non-staff user or a logged-out visitor → the staff login.
  useEffect(() => {
    if (!ready) return;
    if (!staff) router.replace("/staff/login");
    else if (staff.profile_completed) router.replace("/staff");
  }, [ready, staff, router]);

  const pending = complete.isPending || uploadAvatar.isPending;
  const valid = name.trim().length > 0 && password.length >= MIN_PASSWORD;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    // Avatar is optional — a failed upload must not block finishing setup.
    if (avatar) {
      try {
        await uploadAvatar.mutateAsync(avatar);
      } catch {
        /* ignore — proceed without the photo */
      }
    }
    complete.mutate(
      { name: name.trim(), new_password: password },
      { onSuccess: () => router.replace("/staff") },
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center bg-cream px-5 py-10 font-sans text-ink">
      <div className="rounded-2xl border border-line bg-card p-6 shadow-card">
        <h1 className="font-display text-xl font-bold text-ink">{t("staff.onboarding.title")}</h1>
        <p className="mt-1 text-sm text-subtle">{t("staff.onboarding.subtitle")}</p>

        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
          <Input
            id="staff-name"
            label={t("staff.onboarding.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("staff.onboarding.namePlaceholder")}
            autoComplete="name"
            required
          />
          <div>
            <Input
              id="staff-password"
              label={t("staff.onboarding.password")}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
            />
            <p className="mt-1 text-xs text-subtle">{t("staff.onboarding.passwordHint")}</p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="staff-avatar" className="text-sm font-medium text-ink">
              {t("staff.onboarding.avatar")}
            </label>
            <input
              id="staff-avatar"
              ref={avatarInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => avatarInput.current?.click()}
              className="min-h-11 rounded-xl border border-dashed border-line bg-cream px-3 text-left text-sm text-subtle transition hover:border-brand hover:text-brand"
            >
              {avatar ? avatar.name : t("staff.onboarding.avatarPick")}
            </button>
          </div>

          {complete.isError && (
            <p className="text-sm text-danger">{t("staff.onboarding.error")}</p>
          )}

          <Button type="submit" disabled={!valid || pending}>
            {pending ? t("staff.onboarding.submitting") : t("staff.onboarding.submit")}
          </Button>
        </form>
      </div>
    </div>
  );
}
