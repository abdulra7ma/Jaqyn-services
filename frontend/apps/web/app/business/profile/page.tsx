"use client";

// Business public-profile editor (desktop + mobile), wired to /api/business/me/
// and the catalog endpoints. Form fields persist on Save; the menu section is
// backed by catalog items.

import {
  useAddCatalogItem,
  useBusinessMe,
  useCatalog,
  useOnboardingState,
  useRemoveCatalogItem,
  useSubmitOnboarding,
  useUpdateBusiness,
  useUploadBusinessCover,
  useUploadBusinessLogo,
} from "@jaqyn/api";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@jaqyn/i18n";
import { OwnerShell } from "../_components/OwnerShell";
import { useAuth } from "../../_lib/auth";

const FIELD =
  "w-full rounded-xl border-[1.5px] border-line bg-card px-3 py-3 text-sm font-semibold text-ink outline-none transition focus:border-brand";
const LABEL = "text-xs font-bold text-subtle";
const CARD = "rounded-[18px] border border-line bg-card p-5";

const CATEGORIES = [
  ["cafe", "Cafe"],
  ["restaurant", "Restaurant"],
  ["bakery", "Bakery"],
  ["barber", "Barber"],
  ["beauty", "Beauty"],
  ["retail", "Retail"],
  ["other", "Other"],
];
const PRICE_LEVELS = ["c", "cc", "ccc"];
const ACCENTS = ["#C25E3C", "#5E8B6A", "#E7A23E", "#6A6BC2", "#B0563A"];

export default function BusinessProfilePage() {
  const { isAuthenticated, ready } = useAuth();
  const enabled = ready && isAuthenticated;
  const t = useT();
  const me = useBusinessMe(enabled);
  const onboarding = useOnboardingState(enabled);
  const catalog = useCatalog(enabled);
  const update = useUpdateBusiness();
  const submit = useSubmitOnboarding();
  const addItem = useAddCatalogItem();
  const removeItem = useRemoveCatalogItem();
  const uploadLogo = useUploadBusinessLogo();
  const uploadCover = useUploadBusinessCover();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // The fresh business (with logo_url / cover_url) comes from the me query, which
  // both upload mutations write back into the cache on success.
  const logoUrl = me.data?.logo_url ?? null;
  const coverUrl = me.data?.cover_url ?? null;

  function onLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadLogo.mutate(file);
    e.target.value = "";
  }
  function onCoverPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadCover.mutate(file);
    e.target.value = "";
  }

  const [name, setName] = useState("");
  const [cat, setCat] = useState("cafe");
  const [price, setPrice] = useState("cc");
  const [desc, setDesc] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [hours, setHours] = useState("");
  const [glyph, setGlyph] = useState("☕");
  const [accent, setAccent] = useState("#C25E3C");
  const [tags, setTags] = useState("Specialty coffee, Brunch, Wi-Fi");
  const [draft, setDraft] = useState({ name: "", group: "Coffee", price: "" });
  const [saved, setSaved] = useState<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current || !me.data) return;
    const b = me.data;
    setName(b.name ?? "");
    setCat(b.category || "cafe");
    setDesc(b.description ?? "");
    setPhone(b.phone ?? "");
    setEmail(b.public_email ?? "");
    setWebsite(b.website_url ?? "");
    setInstagram(b.instagram_url ?? "");
    setAddress(b.address ?? "");
    setArea(b.area || b.address || "");
    setCity(b.city ?? "");
    setLat(b.latitude ?? "");
    setLng(b.longitude ?? "");
    setHours((b.working_hours as Record<string, string> | null)?.display ?? "");
    setGlyph(b.glyph || "☕");
    setAccent(b.accent_color || "#C25E3C");
    setPrice(b.price_level || "cc");
    setTags((b.tags ?? []).join(", ") || "Specialty coffee, Brunch, Wi-Fi");
    hydrated.current = true;
  }, [me.data]);

  const items = catalog.data ?? [];

  function addMenu() {
    if (!draft.name.trim()) return;
    addItem.mutate(
      { name: draft.name.trim(), category: draft.group, price: draft.price.trim(), module: "menu" },
      { onSuccess: () => setDraft({ name: "", group: draft.group, price: "" }) },
    );
  }
  function save() {
    update.mutate(
      {
        name,
        category: cat,
        description: desc,
        phone,
        public_email: email,
        website_url: website,
        instagram_url: instagram,
        address,
        area,
        city,
        latitude: lat.trim() || null,
        longitude: lng.trim() || null,
        glyph,
        accent_color: accent,
        price_level: price,
        tags: tagList,
        working_hours: { display: hours },
      },
      {
        onSuccess: () => {
          setSaved("Profile saved");
          setTimeout(() => setSaved(null), 2000);
        },
        onError: () => {
          setSaved("Save failed — check fields");
          setTimeout(() => setSaved(null), 2500);
        },
      },
    );
  }

  const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
  const catLabel = CATEGORIES.find(([v]) => v === cat)?.[1] ?? cat;
  const completion = onboarding.data?.completion_score ?? me.data?.completion_score ?? 0;
  const missing = onboarding.data?.missing_required_fields ?? me.data?.missing_required_fields ?? [];
  const readyToSubmit = missing.length === 0 && items.length > 0;
  const publicHref = me.data?.id ? `/nearby/${me.data.id}` : "/nearby";

  function submitForReview() {
    submit.mutate(undefined, {
      onSuccess: () => {
        setSaved("Submitted for verification");
        setTimeout(() => setSaved(null), 2400);
        onboarding.refetch();
      },
      onError: (e: unknown) => {
        setSaved((e as { message?: string })?.message ?? "Complete required fields first");
        setTimeout(() => setSaved(null), 2800);
      },
    });
  }

  if (ready && !isAuthenticated) {
    return (
      <OwnerShell title="Business Profile">
        <div className={`${CARD} max-w-md`}>
          <p className="text-sm text-subtle">Sign in to edit your business profile.</p>
        </div>
      </OwnerShell>
    );
  }

  return (
    <OwnerShell title="Business Profile">
      <div className="mx-auto flex w-full max-w-[1000px] flex-wrap items-start gap-6 sm:gap-[22px]">
        {/* form column */}
        <div className="flex min-w-0 max-w-[600px] flex-1 flex-col gap-4 lg:basis-[420px]">
          <div className={CARD}>
            <div className="font-display text-[15px] font-bold text-ink">Public profile</div>
            <div className="mt-[3px] text-[12.5px] text-subtle">Shown to customers on your Jaqyn profile.</div>
            <label className="mt-3.5 block">
              <span className={LABEL}>Business name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${FIELD} mt-1.5`} />
            </label>
            <div className="mt-3.5 flex gap-3">
              <label className="flex-1">
                <span className={LABEL}>Category</span>
                <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${FIELD} mt-1.5`}>
                  {CATEGORIES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex-1">
                <span className={LABEL}>Price level</span>
                <div className="mt-1.5 flex gap-1.5">
                  {PRICE_LEVELS.map((p) => {
                    const sel = price === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setPrice(p)}
                        className={`flex-1 rounded-xl border-[1.5px] py-3 text-sm font-bold ${sel ? "border-brand bg-brand text-brand-fg" : "border-line bg-card text-subtle"}`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <label className="mt-3.5 block">
              <span className={LABEL}>Description</span>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className={`${FIELD} mt-1.5 resize-none leading-relaxed`} />
            </label>
          </div>

          <div className={CARD}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-[15px] font-bold text-ink">Profile completion</div>
                <div className="mt-[3px] text-[12.5px] text-subtle">Required before your profile can be reviewed and published.</div>
              </div>
              <span className="rounded-pill bg-brand-muted px-3 py-1 text-[12.5px] font-bold text-brand">{completion}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-pill bg-[#F0E7D8]">
              <div className="h-full rounded-pill bg-brand transition-all" style={{ width: `${completion}%` }} />
            </div>
            {missing.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {missing.map((m) => (
                  <button
                    key={`${m.step}-${m.label}`}
                    className="rounded-pill border border-line bg-[#FBF7F0] px-3 py-1.5 text-xs font-semibold text-subtle"
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl bg-sage-soft px-3.5 py-3 text-[13px] font-semibold text-ok">
                Required fields complete. Add polish here, then submit for verification.
              </div>
            )}
          </div>

          <div className={CARD}>
            <div className="font-display text-[15px] font-bold text-ink">Contact &amp; location</div>
            <div className="mt-3.5 flex gap-3">
              <label className="flex-1">
                <span className={LABEL}>Phone</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={`${FIELD} mt-1.5`} />
              </label>
              <label className="flex-1">
                <span className={LABEL}>Public email</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} className={`${FIELD} mt-1.5`} />
              </label>
            </div>
            <div className="mt-3.5 flex gap-3">
              <label className="flex-1">
                <span className={LABEL}>Address</span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={`${FIELD} mt-1.5`} />
              </label>
              <label className="flex-1">
                <span className={LABEL}>Area</span>
                <input value={area} onChange={(e) => setArea(e.target.value)} className={`${FIELD} mt-1.5`} />
              </label>
            </div>
            <div className="mt-3.5 flex gap-3">
              <label className="flex-1">
                <span className={LABEL}>Website</span>
                <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className={`${FIELD} mt-1.5`} />
              </label>
              <label className="flex-1">
                <span className={LABEL}>Instagram</span>
                <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@handle or URL" className={`${FIELD} mt-1.5`} />
              </label>
            </div>
            <div className="mt-3.5 flex gap-3">
              <label className="flex-1">
                <span className={LABEL}>City</span>
                <input value={city} onChange={(e) => setCity(e.target.value)} className={`${FIELD} mt-1.5`} />
              </label>
              <label className="flex-1">
                <span className={LABEL}>Working hours</span>
                <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Mon-Fri 09:00-21:00" className={`${FIELD} mt-1.5`} />
              </label>
            </div>
            <div className="mt-3.5 flex gap-3">
              <label className="flex-1">
                <span className={LABEL}>Latitude</span>
                <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="42.8746" className={`${FIELD} mt-1.5`} />
              </label>
              <label className="flex-1">
                <span className={LABEL}>Longitude</span>
                <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="74.5698" className={`${FIELD} mt-1.5`} />
              </label>
            </div>
          </div>

          <div className={CARD}>
            <div className="font-display text-[15px] font-bold text-ink">Appearance</div>

            {/* Brand image (logo) + background image (cover) uploads. */}
            <div className="mt-3.5 flex flex-wrap items-end gap-4">
              <div className="flex-none">
                <span className={LABEL}>{t("business.profile.logo")}</span>
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-[18px] border border-line bg-brand-muted text-2xl">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt={t("business.profile.logo")} className="h-full w-full object-cover" />
                    ) : (
                      glyph
                    )}
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onLogoPick}
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadLogo.isPending}
                    className="rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[13px] font-bold text-ink disabled:opacity-60"
                  >
                    {uploadLogo.isPending ? t("common.loading") : t("business.profile.uploadLogo")}
                  </button>
                </div>
              </div>
              <div className="min-w-[180px] flex-1">
                <span className={LABEL}>{t("business.profile.cover")}</span>
                <div className="mt-1.5">
                  <div
                    className="flex h-16 w-full items-center justify-center overflow-hidden rounded-[14px] border border-line bg-board/40"
                    style={
                      coverUrl
                        ? { background: `url(${coverUrl}) center/cover` }
                        : { background: `linear-gradient(150deg, ${accent}, ${shade(accent)})` }
                    }
                  />
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onCoverPick}
                  />
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={uploadCover.isPending}
                    className="mt-2 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[13px] font-bold text-ink disabled:opacity-60"
                  >
                    {uploadCover.isPending ? t("common.loading") : t("business.profile.uploadCover")}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3.5 flex items-start gap-5">
              <label className="flex-none">
                <span className={LABEL}>Icon</span>
                <input
                  value={glyph}
                  onChange={(e) => setGlyph(e.target.value)}
                  maxLength={2}
                  className="mt-1.5 w-16 rounded-xl border-[1.5px] border-line bg-card p-2.5 text-center text-2xl outline-none focus:border-brand"
                />
              </label>
              <div className="flex-1">
                <span className={LABEL}>Accent color</span>
                <div className="mt-[9px] flex gap-2.5">
                  {ACCENTS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setAccent(a)}
                      className={`h-9 w-9 rounded-full border-2 ${accent === a ? "border-ink" : "border-white"}`}
                      style={{ background: a }}
                      aria-label={a}
                    />
                  ))}
                </div>
              </div>
            </div>
            <label className="mt-3.5 block">
              <span className={LABEL}>Tags · comma separated</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} className={`${FIELD} mt-1.5`} />
            </label>
          </div>

          <div className={CARD}>
            <div className="flex items-center justify-between">
              <div className="font-display text-[15px] font-bold text-ink">Menu</div>
              <span className="text-xs text-subtle">Shown on your customer profile</span>
            </div>
            <div className="mt-3.5 flex flex-wrap items-end gap-2.5">
              <label className="min-w-[150px] flex-[2]">
                <span className={LABEL}>Item</span>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Cappuccino" className={`${FIELD} mt-1.5`} />
              </label>
              <label className="min-w-[120px] flex-1">
                <span className={LABEL}>Section</span>
                <select value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })} className={`${FIELD} mt-1.5`}>
                  {["Coffee", "Kitchen", "Desserts", "Menu"].map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-[92px] flex-none">
                <span className={LABEL}>Price</span>
                <input value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="150 c" className={`${FIELD} mt-1.5`} />
              </label>
              <button onClick={addMenu} disabled={addItem.isPending} className="flex-none rounded-xl bg-brand px-[18px] py-3 text-sm font-bold text-brand-fg disabled:opacity-60">
                + Add
              </button>
            </div>
            <div className="mt-3.5 flex flex-col gap-2">
              {items.length === 0 ? (
                <div className="p-[18px] text-center text-[13px] text-subtle">No menu items yet — add your first above.</div>
              ) : (
                items.map((it) => (
                  <div key={it.id} className="flex items-center gap-3 rounded-xl border border-line bg-[#FBF7F0] px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold text-ink">{it.name}</div>
                      <div className="text-[11.5px] text-subtle">{it.category}</div>
                    </div>
                    <span className="text-[13.5px] font-semibold text-ink">{it.price}</span>
                    <button onClick={() => removeItem.mutate(it.id)} className="h-7 w-7 flex-none rounded-lg border border-line bg-card text-[15px] text-[#B0563A]">
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-[11px]">
            <Link href={publicHref} className="flex flex-1 items-center justify-center rounded-[14px] border-[1.5px] border-line bg-card py-[15px] text-[14.5px] font-semibold text-ink">
              View as customer
            </Link>
            <button
              onClick={save}
              disabled={update.isPending}
              className="flex-[1.6] rounded-[14px] bg-brand py-[15px] text-[14.5px] font-bold text-brand-fg shadow-glow transition hover:brightness-105 disabled:opacity-60"
            >
              {update.isPending ? "Saving…" : "Save profile"}
            </button>
          </div>
          <button
            onClick={submitForReview}
            disabled={!readyToSubmit || submit.isPending}
            className="rounded-[14px] bg-ink py-[15px] text-[14.5px] font-bold text-cream shadow-card disabled:opacity-45"
          >
            {submit.isPending ? "Submitting…" : "Submit for verification"}
          </button>
        </div>

        {/* preview column */}
        <div className="w-full flex-none sm:w-[300px]">
          <div className="mb-[11px] text-xs font-bold uppercase tracking-[0.05em] text-subtle">Customer preview</div>
          <div className="overflow-hidden rounded-[18px] border border-line bg-card shadow-card">
            <div
              className="flex h-[118px] items-end justify-center pb-3.5"
              style={
                coverUrl
                  ? { background: `url(${coverUrl}) center/cover` }
                  : { background: `linear-gradient(150deg, ${accent}, ${shade(accent)})` }
              }
            >
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[18px] bg-card text-[30px] shadow-card">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={name || "logo"} className="h-full w-full object-cover" />
                ) : (
                  glyph
                )}
              </div>
            </div>
            <div className="px-[18px] pb-5 pt-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 font-display text-lg font-bold text-ink">{name || "Your business"}</div>
                <span className="flex-none text-[12.5px] font-bold text-subtle">{price}</span>
              </div>
              <div className="mt-[3px] text-[13px] text-subtle">
                {catLabel} · {area || "—"}
              </div>
              <div className="mt-[7px] text-[12.5px] text-subtle">🕐 {hours || "—"}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tagList.map((t) => (
                  <span key={t} className="rounded-pill bg-[#F4ECDF] px-2.5 py-1 text-[11px] font-semibold text-subtle">
                    {t}
                  </span>
                ))}
              </div>
              <div className="mt-3 text-[12.5px] leading-relaxed text-subtle">{desc}</div>
            </div>
          </div>
        </div>
      </div>

      {saved && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-pill bg-ink px-5 py-3 text-sm font-semibold text-cream shadow-glow">{saved}</div>
      )}
    </OwnerShell>
  );
}

// darken a hex accent for the gradient stop
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 30);
  const g = Math.max(0, ((n >> 8) & 255) - 30);
  const b = Math.max(0, (n & 255) - 30);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
