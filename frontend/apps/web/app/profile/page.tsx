"use client";

import {
  useLoyaltyHomeSummary,
  useMe,
  usePatches,
  useUpdateProfile,
  useUploadAvatar,
  type Language,
  type PatchOut,
} from "@jaqyn/api";
import { useI18n, useT, type Locale } from "@jaqyn/i18n";
import { Button, Input } from "@jaqyn/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CustomerShell } from "../_components/CustomerShell";
import { CameraIcon, QrIcon } from "../_components/icons";
import { MyQrButton } from "../_components/QrSheet";
import { QueryBoundary } from "../_components/QueryBoundary";
import { UserAvatar } from "../_components/kit";
import { PatchBadge } from "../campaigns/patches/PatchBadge";
import { ShareCard } from "../campaigns/patches/ShareCard";
import { useErrMessage } from "../_lib/useErrMessage";
import { useAuth, useRequireAuth } from "../_lib/auth";

export default function ProfilePage() {
  const t = useT();
  const { setLocale } = useI18n();
  const errMessage = useErrMessage();
  const router = useRouter();
  const { isAuthenticated } = useRequireAuth();
  const { logout } = useAuth();
  const me = useMe(isAuthenticated);
  const update = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const homeSummary = useLoyaltyHomeSummary();
  const patches = usePatches();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shareTarget, setShareTarget] = useState<PatchOut | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Latest owned patches — earned only, most recently earned first, capped so the
  // profile stays a summary (the full board lives at /campaigns/patches).
  const latestPatches = (patches.data?.patches ?? [])
    .filter((p) => p.earned)
    .sort((a, b) => (b.earned_at ?? "").localeCompare(a.earned_at ?? ""))
    .slice(0, 3);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadAvatar.mutate(file);
    e.target.value = ""; // allow re-selecting the same file
  }

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [language, setLanguage] = useState<Language>("ru");
  const [marketing, setMarketing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (me.data) {
      setName(me.data.user.name ?? "");
      setEmail(me.data.user.email ?? "");
      setBirthday(me.data.profile?.birthday ?? "");
      setLanguage(me.data.profile?.language ?? "ru");
      setMarketing(me.data.profile?.marketing_opt_in ?? false);
      setDetailsOpen(!(me.data.profile?.profile_completed ?? false));
    }
  }, [me.data]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const isDirty = Boolean(
    me.data &&
      (name !== (me.data.user.name ?? "") ||
        email !== (me.data.user.email ?? "") ||
        birthday !== (me.data.profile?.birthday ?? "") ||
        language !== (me.data.profile?.language ?? "ru") ||
        marketing !== (me.data.profile?.marketing_opt_in ?? false)),
  );

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  const onLogout = () => {
    logout();
    router.replace("/");
  };

  return (
    <CustomerShell title={t("profile.title")} hideChromeTitle>
      {!isAuthenticated ? null : (
        <QueryBoundary query={me}>
          {(data) => (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{t("profile.title")}</h1>
                <div className="flex items-center gap-1.5 rounded-pill bg-amber-muted px-3 py-1.5 font-display text-sm font-extrabold text-amber-deep" aria-label={t("profile.streak").replace("{count}", String(homeSummary.data?.visit_streak_days ?? 0))}>
                  <span aria-hidden>🔥</span>
                  {homeSummary.data?.visit_streak_days ?? 0}
                </div>
              </div>

              <section className="relative overflow-hidden rounded-modal bg-ink p-5 text-white shadow-modal" aria-label={t("profile.identityCard")}>
                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber/15" aria-hidden />
                <div className="relative flex items-center gap-3.5">
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadAvatar.isPending} aria-label={t("profile.uploadPhoto")} className="relative flex-none rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber disabled:opacity-60">
                    <UserAvatar user={data.user} size={64} shape="rounded" />
                    {uploadAvatar.isPending && <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-ink/60 text-sm">…</span>}
                    {!uploadAvatar.isPending && (
                      <span className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-card text-brand shadow-card" aria-hidden>
                        <CameraIcon className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                  <div className="relative min-w-0 flex-1">
                    <p className="truncate font-display text-xl font-bold">{data.user.name || t("profile.title")}</p>
                    <p className="mt-0.5 text-xs opacity-75">{data.user.phone}</p>
                    <p className="mt-2 text-[10.5px] font-extrabold uppercase tracking-wide text-amber">{t("profile.member")}</p>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </section>

              <div className="grid grid-cols-3 gap-2">
                <ProfileStat href="/rewards" value={homeSummary.data?.rewards_earned ?? 0} label={t("profile.rewardsEarned")} loading={homeSummary.isLoading} />
                <ProfileStat href="/rewards" value={formatSavings(homeSummary.data?.som_saved)} label={t("profile.somSaved")} tone="sage" loading={homeSummary.isLoading} />
                <ProfileStat href="/loyalty" value={homeSummary.data?.active_cards ?? 0} label={t("profile.cardsActive")} tone="brand" loading={homeSummary.isLoading} />
              </div>

              <MyQrButton className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-3.5 text-left shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-tile text-brand" aria-hidden><QrIcon className="h-6 w-6" /></span>
                <span className="min-w-0 flex-1"><span className="block font-display text-[15px] font-bold text-ink">{t("qr.myQrTitle")}</span><span className="mt-0.5 block text-xs text-subtle">{t("profile.qrHint")}</span></span>
                <span className="text-xl text-subtle" aria-hidden>›</span>
              </MyQrButton>

              {latestPatches.length > 0 && (
                <section className="rounded-[20px] border border-line bg-card p-4 shadow-card" aria-label={t("profile.patches.title")}>
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[15px] font-bold text-ink">{t("profile.patches.title")}</span>
                    <Link href="/campaigns/patches" className="text-xs font-bold text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                      {t("profile.patches.viewAll")}
                    </Link>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {latestPatches.map((patch) => (
                      <PatchShareTile key={patch.slug} patch={patch} onShare={() => setShareTarget(patch)} />
                    ))}
                  </div>
                </section>
              )}

              {shareTarget && (
                <ShareCard patch={shareTarget} user={data.user} onClose={() => setShareTarget(null)} />
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  update.mutate(
                    { name, email, birthday: birthday || undefined, language, marketing_opt_in: marketing },
                    {
                      onSuccess: () => {
                        showToast(t("profile.saved"));
                        setDetailsOpen(false);
                      },
                    },
                  );
                }}
                className="flex flex-col gap-4"
              >
                <section className="rounded-[20px] border border-line bg-card p-4 shadow-card">
                  <button type="button" onClick={() => setDetailsOpen((open) => !open)} aria-expanded={detailsOpen} aria-controls="profile-details-fields" className="flex min-h-11 w-full items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                    <span className="min-w-0">
                      <span className="block font-display text-[15px] font-bold text-ink">{t("profile.details")}</span>
                      {!detailsOpen && (
                        <span className="mt-0.5 block truncate text-xs font-medium text-subtle">
                          {name || data.user.phone} · {email || t("profile.emailNotSet")}
                        </span>
                      )}
                    </span>
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-tile text-subtle transition ${detailsOpen ? "" : "-rotate-90"}`} aria-hidden>⌄</span>
                  </button>
                  {detailsOpen && <div id="profile-details-fields" className="mt-4 flex flex-col gap-3">
                  <Input id="profile-name" label={t("profile.name")} value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border-[1.5px] px-3.5 font-semibold focus:ring-4 focus:ring-brand/10" />
                  <Input id="profile-email" label={t("profile.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl border-[1.5px] px-3.5 font-semibold focus:ring-4 focus:ring-brand/10" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7.5rem]">
                  <Input id="profile-birthday" label={t("profile.birthday")} type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="rounded-xl border-[1.5px] px-3.5 font-semibold focus:ring-4 focus:ring-brand/10" />
                  <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                    {t("common.language")}
                    <select
                      value={language}
                      onChange={(e) => {
                        const val = e.target.value as Language;
                        setLanguage(val);
                        setLocale(val as Locale);
                      }}
                      className="min-h-11 rounded-xl border-[1.5px] border-line bg-card px-3 text-base font-semibold outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                    >
                      <option value="ru">RU</option>
                      <option value="en">EN</option>
                    </select>
                  </label>
                  </div>
                  <label className="flex cursor-pointer items-center gap-3 pt-1 text-sm font-semibold text-ink">
                    <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="peer sr-only" />
                    <span className="relative h-7 w-[46px] flex-none rounded-pill bg-handle transition peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 after:absolute after:left-[3px] after:top-[3px] after:h-[22px] after:w-[22px] after:rounded-full after:bg-card after:shadow-card after:transition-transform peer-checked:after:translate-x-[18px]" aria-hidden />
                    {t("profile.marketingAlerts")}
                  </label>
                  </div>}
                </section>

                {update.isError && <p className="text-sm text-danger">{errMessage(update.error)}</p>}
                <div className={isDirty ? "sticky bottom-20 z-10 rounded-modal bg-cream/95 p-2 shadow-card backdrop-blur lg:bottom-4" : ""}>
                  <Button type="submit" disabled={!isDirty || update.isPending} className="w-full rounded-2xl py-4 font-bold">
                    {update.isPending ? t("common.loading") : t("common.save")}
                  </Button>
                </div>
              </form>

              <section className="rounded-[20px] border border-line bg-card p-4 shadow-card" aria-label={t("profile.account")}>
                <p className="font-display text-[15px] font-bold text-ink">{t("profile.account")}</p>
                <p className="mt-1 text-xs leading-relaxed text-subtle">{t("profile.signOutHint")}</p>
                <Button type="button" variant="danger" onClick={onLogout} className="mt-3 w-full rounded-2xl">
                  {t("auth.logout")}
                </Button>
              </section>

              {toast && (
                <div role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-cream shadow-card lg:bottom-6">
                  {toast}
                </div>
              )}
            </div>
          )}
        </QueryBoundary>
      )}
    </CustomerShell>
  );
}

/** One latest-patch tile: badge + name, tap to open the share card. */
function PatchShareTile({ patch, onShare }: { patch: PatchOut; onShare: () => void }) {
  const t = useT();
  // `t()` echoes the key on a miss — fall back to the backend name (same rule as
  // the patches board's usePatchName helper).
  const nameKey = `patch.def.${patch.slug}.name`;
  const rawName = t(nameKey);
  const name = rawName === nameKey ? patch.name : rawName;
  return (
    <button
      type="button"
      onClick={onShare}
      aria-label={`${t("patch.share")}: ${name}`}
      className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="relative">
        <PatchBadge shape={patch.shape} colors={{ light: patch.light, color: patch.color, deep: patch.deep }} icon={patch.icon} size={64} shadow="soft" />
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] text-white shadow-card" aria-hidden>↗</span>
      </span>
      <span className="w-full truncate text-center text-[11px] font-semibold leading-tight text-ink">{name}</span>
    </button>
  );
}

function ProfileStat({ href, value, label, tone, loading }: { href: string; value: string | number; label: string; tone?: "sage" | "brand"; loading?: boolean }) {
  return (
    <Link href={href} className="rounded-xl border border-line bg-card px-1.5 py-3 text-center shadow-card transition active:scale-[.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      {loading ? (
        <span className="mx-auto block h-6 w-10 animate-pulse rounded-lg bg-tile" aria-hidden />
      ) : (
        <p className={`font-display text-xl font-extrabold ${tone === "sage" ? "text-sage" : tone === "brand" ? "text-brand" : "text-ink"}`}>{value}</p>
      )}
      <p className="mt-1 whitespace-pre-line text-[10px] font-bold leading-tight text-subtle">{label}</p>
    </Link>
  );
}

function formatSavings(amount: string | undefined) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(amount ?? 0));
}
