"use client";

import { useMe, useUpdateProfile, useUploadAvatar, type Language } from "@jaqyn/api";
import { useI18n, useT, type Locale } from "@jaqyn/i18n";
import { Button, Card, Input } from "@jaqyn/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CustomerShell } from "../_components/CustomerShell";
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
    <CustomerShell title={t("profile.title")}>
      {!isAuthenticated ? null : (
        <QueryBoundary query={me}>
          {(data) => (
            <div className="flex flex-col gap-4">
              {/* avatar header */}
              <Card className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadAvatar.isPending}
                  aria-label={t("profile.uploadPhoto")}
                  className="relative flex-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
                >
                  <UserAvatar user={data.user} size={58} />
                  {uploadAvatar.isPending && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/40 text-sm text-white">
                      …
                    </span>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-bold text-ink">
                    {data.user.name || t("profile.title")}
                  </p>
                  <p className="text-sm text-subtle">{data.user.phone}</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadAvatar.isPending}
                    className="mt-1 text-xs font-bold text-brand disabled:opacity-60"
                  >
                    {uploadAvatar.isPending ? t("common.loading") : t("profile.uploadPhoto")}
                  </button>
                </div>
              </Card>

              <Link
                href="/qr"
                className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3.5 shadow-card"
              >
                <span className="text-sm font-semibold text-ink">{t("qr.myQrTitle")}</span>
                <span className="text-subtle" aria-hidden>›</span>
              </Link>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  update.mutate({ name, email, birthday: birthday || undefined, language, marketing_opt_in: marketing });
                }}
                className="flex flex-col gap-4"
              >
                <Card className="flex flex-col gap-3">
                  <Input label={t("profile.name")} value={name} onChange={(e) => setName(e.target.value)} />
                  <Input label={t("profile.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <Input label={t("profile.birthday")} type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
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
                      className="min-h-11 rounded-xl border border-line bg-card px-3 text-base"
                    >
                      <option value="ru">RU</option>
                      <option value="en">EN</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
                    {t("profile.marketing")}
                  </label>
                </Card>

                {update.isError && <p className="text-sm text-danger">{errMessage(update.error)}</p>}
                {update.isSuccess && <p className="text-sm text-ok">{t("profile.saved")}</p>}
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? t("common.loading") : t("common.save")}
                </Button>
                <Button type="button" variant="ghost" onClick={onLogout}>{t("auth.logout")}</Button>
              </form>
            </div>
          )}
        </QueryBoundary>
      )}
    </CustomerShell>
  );
}
