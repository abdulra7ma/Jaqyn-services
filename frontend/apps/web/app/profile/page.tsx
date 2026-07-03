"use client";

import {
  useLoyaltyHomeSummary,
  useMe,
  useUpdateProfile,
  useUploadAvatar,
  type Language,
} from "@jaqyn/api";
import { useI18n, useT, type Locale } from "@jaqyn/i18n";
import { Button, Input } from "@jaqyn/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CustomerShell } from "../_components/CustomerShell";
import { MyQrButton } from "../_components/QrSheet";
import { QueryBoundary } from "../_components/QueryBoundary";
import { UserAvatar } from "../_components/kit";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [detailsOpen, setDetailsOpen] = useState(true);

  useEffect(() => {
    if (me.data) {
      setName(me.data.user.name ?? "");
      setEmail(me.data.user.email ?? "");
      setBirthday(me.data.profile?.birthday ?? "");
      setLanguage(me.data.profile?.language ?? "ru");
      setMarketing(me.data.profile?.marketing_opt_in ?? false);
    }
  }, [me.data]);

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
                  </button>
                  <div className="relative min-w-0 flex-1">
                    <p className="truncate font-display text-xl font-bold">{data.user.name || t("profile.title")}</p>
                    <p className="mt-0.5 text-xs opacity-75">{data.user.phone}</p>
                    <p className="mt-2 text-[10.5px] font-extrabold uppercase tracking-wide text-amber">{t("profile.member")}</p>
                  </div>
                </div>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadAvatar.isPending} className="relative mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber disabled:opacity-60">
                  <span aria-hidden>↑</span>
                  {uploadAvatar.isPending ? t("common.loading") : t("profile.uploadPhoto")}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </section>

              <div className="grid grid-cols-3 gap-2">
                <ProfileStat value={homeSummary.data?.rewards_earned ?? 0} label={t("profile.rewardsEarned")} />
                <ProfileStat value={formatSavings(homeSummary.data?.som_saved)} label={t("profile.somSaved")} tone="sage" />
                <ProfileStat value={homeSummary.data?.active_cards ?? 0} label={t("profile.cardsActive")} tone="brand" />
              </div>

              <MyQrButton className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-3.5 text-left shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-tile text-xl text-brand" aria-hidden>▦</span>
                <span className="min-w-0 flex-1"><span className="block font-display text-[15px] font-bold text-ink">{t("qr.myQrTitle")}</span><span className="mt-0.5 block text-xs text-subtle">{t("profile.qrHint")}</span></span>
                <span className="text-xl text-subtle" aria-hidden>›</span>
              </MyQrButton>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  update.mutate({ name, email, birthday: birthday || undefined, language, marketing_opt_in: marketing });
                }}
                className="flex flex-col gap-4"
              >
                <section className="rounded-[20px] border border-line bg-card p-4 shadow-card">
                  <button type="button" onClick={() => setDetailsOpen((open) => !open)} aria-expanded={detailsOpen} className="flex min-h-8 w-full items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                    <span className="font-display text-[15px] font-bold text-ink">{t("profile.details")}</span>
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-tile text-subtle transition ${detailsOpen ? "" : "-rotate-90"}`} aria-hidden>⌄</span>
                  </button>
                  {detailsOpen && <div className="mt-4 flex flex-col gap-3">
                  <Input id="profile-name" label={t("profile.name")} value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border-[1.5px] px-3.5 font-semibold focus:ring-4 focus:ring-brand/10" />
                  <Input id="profile-email" label={t("profile.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl border-[1.5px] px-3.5 font-semibold focus:ring-4 focus:ring-brand/10" />
                  <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-3">
                  <Input id="profile-birthday" label={t("profile.birthday")} type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="rounded-xl border-[1.5px] px-3.5 font-semibold focus:ring-4 focus:ring-brand/10" />
                  <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                    {t("common.language")}
                    <select
                      value={language}
                      onChange={(e) => {
                        const val = e.target.value as Language;
                        setLanguage(val);
                        // Only set live locale for supported locales (ky is Language but not yet Locale)
                        if (val === "ru" || val === "en") setLocale(val as Locale);
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
                {update.isSuccess && <p className="text-sm text-ok">{t("profile.saved")}</p>}
                <Button type="submit" disabled={update.isPending} className="w-full rounded-2xl py-4 font-bold">
                  {update.isPending ? t("common.loading") : t("common.save")}
                </Button>
                <Button type="button" variant="ghost" onClick={onLogout} className="w-full">{t("auth.logout")}</Button>
              </form>
            </div>
          )}
        </QueryBoundary>
      )}
    </CustomerShell>
  );
}

function ProfileStat({ value, label, tone }: { value: string | number; label: string; tone?: "sage" | "brand" }) {
  return <div className="rounded-xl border border-line bg-card px-1.5 py-3 text-center"><p className={`font-display text-xl font-extrabold ${tone === "sage" ? "text-sage" : tone === "brand" ? "text-brand" : "text-ink"}`}>{value}</p><p className="mt-1 whitespace-pre-line text-[10px] font-bold leading-tight text-subtle">{label}</p></div>;
}

function formatSavings(amount: string | undefined) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(amount ?? 0));
}
