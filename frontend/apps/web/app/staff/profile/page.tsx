"use client";

import { useMe, useUpdateProfile, useUploadAvatar } from "@jaqyn/api";
import { useI18n, useT } from "@jaqyn/i18n";
import type { Locale } from "@jaqyn/i18n";
import { Button, Card } from "@jaqyn/ui";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "../../_components/kit";
import { QueryBoundary } from "../../_components/QueryBoundary";
import { staffApi } from "@jaqyn/api";
import { StaffShell } from "../_components/StaffShell";
import { useStaffAuth } from "../_lib/staffAuth";

// A curated emoji set for avatar selection.
const EMOJI_OPTIONS = [
  "😊", "😎", "🧑‍💼", "👩‍💼", "🧑‍🍳", "💪", "🌟", "🔥",
  "🎯", "✨", "🦋", "🌈", "🍀", "🎉", "🚀", "💎",
];

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "active"
      ? "bg-ok/15 text-ok"
      : status === "pending"
        ? "bg-amber/15 text-amber-deep"
        : "bg-subtle/10 text-subtle";
  return (
    <span className={`rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${color}`}>
      {status}
    </span>
  );
}

export default function StaffProfilePage() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  const { isStaff, ready } = useStaffAuth();
  const me = useMe(ready && isStaff);
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleLogout() {
    staffApi.logout();
    router.replace("/staff/login");
  }

  function handleEmojiPick(emoji: string) {
    updateProfile.mutate({ avatar_emoji: emoji });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadAvatar.mutate(file);
    // reset so same file can be re-selected
    e.target.value = "";
  }

  return (
    <StaffShell title={t("staff.profile.title")}>
      {!ready ? null : !isStaff ? (
        <p className="text-sm text-subtle">{t("auth.loginRequired")}</p>
      ) : (
        <QueryBoundary query={me}>
          {(data) => {
            const user = data.user;
            const staff = data.staff;
            const business = data.business;
            const role = staff?.role ?? "cashier";

            return (
              <div className="flex flex-col gap-4">
                {/* ── Avatar header ── */}
                <Card className="flex flex-col items-center gap-3 py-6">
                  <div className="relative">
                    <UserAvatar user={user} size={80} />
                    {(uploadAvatar.isPending || updateProfile.isPending) && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/40">
                        <span className="text-sm text-white">…</span>
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="font-display text-lg font-bold text-ink">
                      {user.name || user.phone}
                    </p>
                    <p className="text-sm text-subtle">{t(`staff.role.${role}`)}</p>
                  </div>

                  {/* Emoji picker */}
                  <div className="w-full">
                    <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-[.06em] text-subtle">
                      {t("staff.profile.chooseEmoji")}
                    </p>
                    <div className="grid grid-cols-8 gap-1.5">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => handleEmojiPick(emoji)}
                          disabled={updateProfile.isPending}
                          className={[
                            "flex aspect-square items-center justify-center rounded-xl text-xl transition",
                            user.avatar_emoji === emoji
                              ? "bg-brand-muted ring-2 ring-brand"
                              : "bg-board/50 hover:bg-board",
                          ].join(" ")}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Photo upload */}
                  <div className="w-full">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      disabled={uploadAvatar.isPending}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadAvatar.isPending
                        ? t("common.loading")
                        : t("staff.profile.uploadPhoto")}
                    </Button>
                  </div>
                </Card>

                {/* ── Business / company details ── */}
                <Card className="flex flex-col gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[.06em] text-subtle">
                    {t("staff.profile.business")}
                  </p>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-subtle">{t("staff.profile.company")}</span>
                      <span className="text-sm font-semibold text-ink">
                        {business?.name ?? staff?.business_name ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-subtle">{t("staff.profile.role")}</span>
                      <span className="text-sm font-semibold text-ink capitalize">
                        {t(`staff.role.${role}`)}
                      </span>
                    </div>
                    {business?.status && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-subtle">{t("staff.profile.status")}</span>
                        <StatusBadge status={business.status} />
                      </div>
                    )}
                    {staff?.business_id && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-subtle">{t("staff.profile.businessId")}</span>
                        <span className="font-mono text-xs text-subtle">{staff.business_id}</span>
                      </div>
                    )}
                  </div>
                </Card>

                {/* ── Language ── */}
                <Card className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink">{t("common.language")}</span>
                    <select
                      value={locale}
                      onChange={(e) => setLocale(e.target.value as Locale)}
                      className="min-h-11 rounded-xl border border-line bg-cream px-3 text-base text-ink"
                    >
                      <option value="ru">RU — Русский</option>
                      <option value="en">EN — English</option>
                    </select>
                  </label>
                </Card>

                {/* ── Logout ── */}
                <Button type="button" variant="ghost" onClick={handleLogout} className="w-full">
                  {t("auth.logout")}
                </Button>
              </div>
            );
          }}
        </QueryBoundary>
      )}
    </StaffShell>
  );
}
