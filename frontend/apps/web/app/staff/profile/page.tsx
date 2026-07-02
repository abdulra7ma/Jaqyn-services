"use client";

import { useMe, useStaffStats, useUpdateProfile, useUploadAvatar } from "@jaqyn/api";
import { useI18n, useT } from "@jaqyn/i18n";
import type { Locale } from "@jaqyn/i18n";
import { Button, Card } from "@jaqyn/ui";
import { useRef, useState } from "react";
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

/** Today's counter tile — mirrors the owner dashboard metric card pattern. */
function StatTile({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-card">
      <div className="text-[12.5px] font-semibold text-subtle">{label}</div>
      <div className="mt-2 font-display text-[28px] font-extrabold leading-none text-ink">
        {value ?? "—"}
      </div>
    </div>
  );
}

export default function StaffProfilePage() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  const { isStaff, ready } = useStaffAuth();
  const me = useMe(ready && isStaff);
  const stats = useStaffStats(ready && isStaff);
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingAvatar, setEditingAvatar] = useState(false);

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
            const businessName = business?.name ?? staff?.business_name ?? "";

            return (
              <div className="flex flex-col gap-4">
                {/* ── Profile card: avatar · name · role · business ── */}
                <Card className="flex flex-col items-center gap-3 py-6">
                  <button
                    type="button"
                    onClick={() => setEditingAvatar((v) => !v)}
                    aria-label={t("staff.profile.editAvatar")}
                    className="relative rounded-full"
                  >
                    <UserAvatar user={user} size={80} />
                    {(uploadAvatar.isPending || updateProfile.isPending) && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/40">
                        <span className="text-sm text-white">…</span>
                      </div>
                    )}
                  </button>
                  <div className="text-center">
                    <p className="font-display text-lg font-bold text-ink">
                      {user.name || user.phone}
                    </p>
                    <p className="text-sm text-subtle">
                      {t(`staff.role.${role}`)}
                      {businessName ? ` · ${businessName}` : ""}
                    </p>
                  </div>

                  {/* Avatar editing — collapsed behind an avatar tap to keep the
                      card as lean as the design mock. */}
                  {editingAvatar && (
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
                        className="mt-2 w-full"
                        disabled={uploadAvatar.isPending}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploadAvatar.isPending
                          ? t("common.loading")
                          : t("staff.profile.uploadPhoto")}
                      </Button>
                    </div>
                  )}
                </Card>

                {/* ── Today's stats ── */}
                <div className="grid grid-cols-2 gap-3">
                  <StatTile
                    label={t("staff.profile.scansToday")}
                    value={stats.data?.scans_today}
                  />
                  <StatTile
                    label={t("staff.profile.redemptionsToday")}
                    value={stats.data?.redemptions_today}
                  />
                </div>

                {/* ── Account ── */}
                <div>
                  <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[.06em] text-subtle">
                    {t("staff.profile.account")}
                  </p>
                  <Card className="p-0">
                    <label className="flex items-center justify-between gap-3 px-4 py-3.5">
                      <span className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-board/50 text-lg"
                        >
                          🌐
                        </span>
                        <span className="text-sm font-semibold text-ink">
                          {t("common.language")}
                        </span>
                      </span>
                      <select
                        value={locale}
                        onChange={(e) => setLocale(e.target.value as Locale)}
                        className="min-h-11 rounded-xl border border-line bg-cream px-3 text-sm text-ink"
                      >
                        <option value="ru">RU — Русский</option>
                        <option value="en">EN — English</option>
                      </select>
                    </label>
                  </Card>
                </div>

                {/* ── Logout ── */}
                <Button type="button" variant="danger" onClick={handleLogout} className="w-full">
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
