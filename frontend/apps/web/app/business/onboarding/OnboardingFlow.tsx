"use client";

// Desktop + mobile business-onboarding wizard, wired live to the backend.
// Loads the owner's business + onboarding state, autosaves each step (debounced
// PATCH /api/business/onboarding/), manages the catalog and staff accounts through
// their endpoints, and submits for verification. Visual language from Jaqyn.dc.html.

import {
  ApiClientError,
  useAddCatalogItem,
  useBusinessMe,
  useBusinessTypes,
  useCatalog,
  useCreateStaffAccount,
  useDeleteGalleryImage,
  useGallery,
  useOnboardingState,
  useRemoveCatalogItem,
  useSaveOnboarding,
  useSubmitOnboarding,
  useTeam,
  useUploadBusinessCover,
  useUploadBusinessLogo,
  useUploadCatalogItemImage,
  useUploadGalleryImage,
  type BusinessType,
  type CatalogItem,
  type GalleryImage,
  type TeamRow,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { AlertDialog, Dialog } from "@jaqyn/ui";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocationPicker } from "../../_components/LocationPicker";
import {
  WeekHoursEditor,
  formatWeek,
  initialWeek,
  readWeek,
  weekToPayload,
  type Week,
} from "../_components/WeekHoursEditor";
import { useRequireAuth } from "../../_lib/auth";
import { useErrMessage } from "../../_lib/useErrMessage";
import { MENU_STYLES, ROLE_HINT, STAFF_LIMIT, STAFF_ROLES, type StaffRole } from "./schema";
import { MODULE_META, labelSuggestions, type CatalogModule } from "../_lib/catalogModule";

const FIELD =
  "w-full rounded-xl border-[1.5px] border-line bg-card px-3 py-3 text-sm font-semibold text-ink outline-none transition focus:border-brand";
const LABEL = "text-xs font-bold text-subtle";
const CARD = "rounded-[18px] border border-line bg-card p-5";

const STEP_DEFS = [
  { n: 1, label: "Business identity", sub: "Profile & location" },
  { n: 2, label: "Business type", sub: "What you offer" },
  { n: 3, label: "Setup", sub: "Build your catalog" },
  { n: 4, label: "Add staff", sub: "Optional · up to 5" },
  { n: 5, label: "Review & submit", sub: "Final check" },
];
const STEP_TITLE: Record<number, string> = {
  1: "Business identity & location",
  2: "What type of business are you?",
  3: "Business setup",
  4: "Invite your team",
  5: "Review & submit",
};
const STEP_SUB: Record<number, string> = {
  1: "Tell customers who you are and where to find you.",
  2: "This configures the right profile sections and customer display.",
  3: "Add what customers will see — you can edit anytime from the dashboard.",
  4: "Optional — invite up to 5 teammates now or add them later.",
  5: "Check everything, then send to Jaqyn for verification.",
};

type Form = {
  displayName: string;
  legalName: string;
  desc: string;
  phone: string;
  pubEmail: string;
  website: string;
  instagram: string;
  week: Week;
  address: string;
  city: string;
  country: string;
  tz: string;
  currency: string;
  lat: string;
  lng: string;
  businessType: string;
  menuStyle: string;
};

const EMPTY: Form = {
  displayName: "",
  legalName: "",
  desc: "",
  phone: "",
  pubEmail: "",
  website: "",
  instagram: "",
  week: readWeek(undefined),
  address: "",
  city: "",
  country: "Kyrgyzstan",
  tz: "Asia/Bishkek",
  currency: "KGS",
  lat: "",
  lng: "",
  businessType: "",
  menuStyle: "Card grid",
};

export function OnboardingFlow() {
  const t = useT();
  const { isAuthenticated, ready } = useRequireAuth();
  const enabled = ready && isAuthenticated;

  const me = useBusinessMe(enabled);
  const state = useOnboardingState(enabled);
  const types = useBusinessTypes();
  const catalog = useCatalog(enabled);
  const team = useTeam(enabled);

  const save = useSaveOnboarding();
  const addItem = useAddCatalogItem();
  const removeItem = useRemoveCatalogItem();
  const createStaff = useCreateStaffAccount();
  const submit = useSubmitOnboarding();
  const uploadLogo = useUploadBusinessLogo();
  const uploadCover = useUploadBusinessCover();
  const uploadCatalogImage = useUploadCatalogItemImage();
  const gallery = useGallery(enabled);
  const uploadGalleryImage = useUploadGalleryImage();
  const deleteGalleryImage = useDeleteGalleryImage();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const errMessage = useErrMessage();
  // Optimistic local previews (object URLs) shown the instant a file is picked,
  // so the tile updates immediately instead of waiting on the upload round-trip.
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  // Per-field upload errors — rendered under the specific tile that failed.
  const [logoError, setLogoError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  // Release object URLs when they're replaced or the component unmounts (no leak
  // if the wizard is left mid-upload). Separate effects so a cover change never
  // revokes a logo preview that's still on screen.
  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  const [stage, setStage] = useState(1);
  const [f, setF] = useState<Form>(EMPTY);
  // Inline validation errors, keyed by field. Shown all at once under each field
  // when the owner tries to continue, cleared as they fix each one.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState({ name: "", category: "", price: "", duration: "" });
  const [staffDraft, setStaffDraft] = useState<{ phone: string; role: StaffRole }>({
    phone: "",
    role: "cashier",
  });
  const [staffTempPassword, setStaffTempPassword] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hydrated = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refetch completion state when the user reaches the review step so canSubmit is live.
  useEffect(() => {
    if (stage === 5) void state.refetch();
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // hydrate the form buffer once the business loads
  useEffect(() => {
    if (hydrated.current || !me.data) return;
    const b = me.data;
    setF({
      displayName: b.name ?? "",
      legalName: b.legal_name ?? "",
      desc: b.description ?? "",
      phone: b.phone ?? "",
      pubEmail: b.public_email ?? "",
      website: b.website_url ?? "",
      instagram: b.instagram_url ?? "",
      week: initialWeek(b.working_hours),
      address: b.address ?? "",
      city: b.city ?? "",
      country: b.country ?? "Kyrgyzstan",
      tz: b.timezone ?? "Asia/Bishkek",
      currency: b.default_currency ?? "KGS",
      lat: b.latitude ?? "",
      lng: b.longitude ?? "",
      businessType: b.business_type ?? "",
      menuStyle: b.menu_style ?? "Card grid",
    });
    if (b.onboarding_status === "submitted" || b.onboarding_status === "completed") setStage(6);
    hydrated.current = true;
  }, [me.data]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  function persist(next: Form) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      save.mutate(
        {
          display_name: next.displayName,
          legal_name: next.legalName,
          description: next.desc,
          phone: next.phone,
          public_email: next.pubEmail,
          website_url: next.website,
          instagram_url: next.instagram,
          address: next.address,
          city: next.city,
          country: next.country,
          latitude: next.lat,
          longitude: next.lng,
          timezone: next.tz,
          default_currency: next.currency,
          business_type: next.businessType,
          menu_style: next.menuStyle,
          working_hours: weekToPayload(next.week),
        },
        { onError: () => showToast("Auto-save failed — check your connection") },
      );
    }, 600);
  }

  function set(patch: Partial<Form>) {
    setF((s) => {
      const next = { ...s, ...patch };
      persist(next);
      return next;
    });
    // Clear any inline error for the fields being edited.
    setErrors((e) => {
      if (Object.keys(patch).every((k) => !(k in e))) return e;
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  }
  const on = (k: keyof Form) => (e: { target: { value: string } }) => set({ [k]: e.target.value } as Partial<Form>);

  const selType = types.data?.find((t) => t.key === f.businessType) ?? null;
  const catalogModule: CatalogModule = selType?.module ?? "services";
  const meta = MODULE_META[catalogModule];
  const showDuration = catalogModule === "services" || catalogModule === "plans";
  const showMenuStyle = catalogModule === "menu";

  const items = catalog.data ?? [];
  // Section-label suggestions for the datalist: module defaults + labels already
  // used by this business. The owner can still type a brand-new label.
  const catType = useMemo(
    () => labelSuggestions(catalogModule, items.map((i) => i.category)),
    [catalogModule, items],
  );
  const staffList = team.data?.members ?? [];
  const staffUsed = staffList.length;
  const completion = state.data?.completion_score ?? 0;
  const missing = state.data?.missing_required_fields ?? [];
  const canSubmit = missing.length === 0 && !!f.businessType && items.length > 0 && !state.isError;
  const status = state.data?.onboarding_status;
  const changeNote = state.data?.change_note ?? "";

  function selectType(key: string) {
    set({ businessType: key });
  }
  function addCatalogItem() {
    if (!draft.name.trim()) return showToast(`Enter a ${meta.noun} name`);
    if (!draft.price.trim()) return showToast("Enter a price");
    addItem.mutate(
      {
        name: draft.name.trim(),
        category: draft.category || catType[0],
        price: draft.price.trim(),
        duration: draft.duration.trim(),
        module: catalogModule,
      },
      {
        onSuccess: () => setDraft({ name: "", category: "", price: "", duration: "" }),
        onError: (e) => showToast((e as { message?: string })?.message ?? "Failed to add"),
      },
    );
  }
  function doCreateStaff() {
    if (staffUsed >= STAFF_LIMIT) return;
    if (!staffDraft.phone.trim()) return showToast("Enter a phone number");
    createStaff.mutate(
      { phone: staffDraft.phone.trim(), role: staffDraft.role },
      {
        onSuccess: (r) => {
          setStaffTempPassword(r.temp_password);
          setStaffDraft({ phone: "", role: "cashier" });
        },
        onError: (e) => showToast((e as { message?: string })?.message ?? "Failed to create account"),
      },
    );
  }
  function doSubmit() {
    setConfirmOpen(false);
    submit.mutate(undefined, {
      onSuccess: () => setStage(6),
      onError: (e: unknown) => showToast((e as { message?: string })?.message ?? "Complete required fields first"),
    });
  }

  // Required fields per the backend's onboarding_services.required_fields, so the
  // inline gate matches exactly what the server enforces at submit — the owner
  // never passes a step only to be blocked later. Returns field → message.
  function validateStage(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!f.displayName.trim()) e.displayName = "Business name is required";
      if (!f.desc.trim()) e.desc = "Add a short description";
      if (!f.phone.trim()) e.phone = "Phone number is required";
      if (!f.address.trim()) e.address = "Address is required";
      if (!me.data?.logo_url && !logoPreview) e.logo = "Upload a logo — it appears on your card";
    }
    if (s === 2 && !f.businessType) e.businessType = "Pick a business type to continue";
    if (s === 3 && items.length === 0) e.items = `Add at least one ${meta.noun}`;
    return e;
  }

  function goNext() {
    const e = validateStage(stage);
    if (Object.keys(e).length > 0) {
      setErrors(e);
      // Bring the first problem into view so the owner sees what to fix.
      setTimeout(
        () => document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: "smooth", block: "center" }),
        0,
      );
      return;
    }
    setErrors({});
    setStage(stage + 1);
  }

  // Pull the most specific message the backend gave us. DRF puts field errors in
  // `details` (e.g. {"image": ["Upload a valid image."]}); the top-level message is
  // the generic "Validation error". Prefer the field detail so we can tell the owner
  // exactly what's wrong, falling back to the localized code message.
  function uploadErrorText(e: unknown): string {
    if (e instanceof ApiClientError && e.details && typeof e.details === "object") {
      for (const v of Object.values(e.details as Record<string, unknown>)) {
        if (Array.isArray(v) && v.length && typeof v[0] === "string") return v[0];
        if (typeof v === "string" && v) return v;
      }
    }
    return errMessage(e);
  }

  function onLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLogoError(null);
    setErrors((e) => { const { logo, ...rest } = e; return rest; }); // clear "logo required"
    setLogoPreview(url); // show instantly, before the upload completes
    uploadLogo.mutate(file, {
      // Real logo_url is now in the `me` cache; dropping the preview reveals it.
      // The URL is revoked by the cleanup effect keyed on logoPreview.
      onSuccess: () => setLogoPreview(null),
      onError: (err) => {
        setLogoPreview(null);
        setLogoError(uploadErrorText(err));
      },
    });
  }
  function onCoverPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCoverError(null);
    setCoverPreview(url); // show instantly, before the upload completes
    uploadCover.mutate(file, {
      onSuccess: () => setCoverPreview(null),
      onError: (err) => {
        setCoverPreview(null);
        setCoverError(uploadErrorText(err));
      },
    });
  }

  if (!ready || (enabled && (me.isLoading || state.isLoading))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBF7F0] text-subtle">Loading onboarding…</div>
    );
  }
  if (enabled && me.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBF7F0] px-6 text-center text-subtle">
        No business found for this account. Activate an invite first.
      </div>
    );
  }
  if (enabled && state.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FBF7F0] px-6 text-center">
        <div className="text-[15px] font-semibold text-ink">Could not load onboarding state.</div>
        <button
          onClick={() => state.refetch()}
          className="rounded-[13px] bg-brand px-5 py-3 text-[14px] font-bold text-brand-fg shadow-glow"
        >
          Retry
        </button>
      </div>
    );
  }

  const bizName = f.displayName || "your business";

  // ---- pending / status ----
  if (stage === 6) {
    return (
      <Pending
        status={status}
        changeNote={changeNote}
        bizName={f.displayName || "Your business"}
        typeName={selType?.name}
        glyph={selType?.glyph}
        itemCount={items.length}
        staffCount={staffUsed}
        onRefresh={() => state.refetch()}
        onMakeChanges={() => setStage(1)}
        toast={toast}
      />
    );
  }

  return (
    <div className="min-h-screen font-sans text-ink">
      <div className="flex min-h-screen flex-col lg:h-screen lg:flex-row">
        {/* sidebar — desktop */}
        <aside className="hidden w-[268px] flex-none flex-col bg-ink px-4 py-6 lg:flex">
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-brand font-display text-base font-extrabold text-brand-fg">
              J
            </div>
            <div className="font-display text-base font-bold text-white">Jaqyn</div>
            <span className="ml-auto text-[11px] font-semibold text-[#9A8B7B]">Setup</span>
          </div>
          <div className="mx-2 mb-1.5 mt-[22px]">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#7E7060]">Setting up</div>
            <div className="mt-[3px] font-display text-base font-bold text-white">{bizName}</div>
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            {STEP_DEFS.map((d) => {
              const done = stage > d.n;
              const active = stage === d.n;
              return (
                <button
                  key={d.n}
                  onClick={() => d.n <= stage && setStage(d.n)}
                  className={`flex w-full items-center gap-3 rounded-xl p-[10px_11px] ${active ? "bg-white/10" : "bg-transparent"} ${
                    d.n <= stage ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <span
                    className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full font-display text-[13px] font-bold ${
                      done ? "bg-sage-deep text-white" : active ? "bg-brand text-white" : "border-[1.5px] border-white/15 bg-white/5 text-[#9A8B7B]"
                    }`}
                  >
                    {done ? "✓" : d.n}
                  </span>
                  <span className="flex min-w-0 flex-col text-left">
                    <span className={`text-[13.5px] font-bold ${active ? "text-white" : done ? "text-board" : "text-[#9A8B7B]"}`}>
                      {d.n === 3 && f.businessType ? `${meta.plural} setup` : d.label}
                    </span>
                    <span className={`mt-px text-[11px] ${active ? "text-white/55" : "text-[#7E7060]"}`}>{d.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-auto flex items-center gap-2 rounded-xl bg-white/5 p-[11px_13px]">
            <span
              className={`h-[7px] w-[7px] rounded-full ${save.isPending ? "bg-amber" : save.isError ? "bg-[#C25E3C]" : "bg-sage-deep"}`}
            />
            <span className="text-[11.5px] text-[#C9BCA8]">
              {save.isPending ? "Saving…" : save.isError ? "Save failed" : "Progress saved automatically"}
            </span>
          </div>
        </aside>

        {/* main */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#FBF7F0]">
          <div className="flex items-center gap-2 border-b border-line bg-ink px-4 py-3 lg:hidden">
            <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] bg-brand font-display text-[13px] font-extrabold text-brand-fg">
              J
            </div>
            <div className="ml-1 flex flex-1 items-center gap-1.5">
              {STEP_DEFS.map((d) => (
                <span key={d.n} className={`h-1.5 flex-1 rounded-pill ${stage > d.n ? "bg-sage-deep" : stage === d.n ? "bg-brand" : "bg-white/15"}`} />
              ))}
            </div>
            <span className="ml-1 text-[11px] font-bold text-board">{stage}/5</span>
          </div>

          <header className="flex flex-col gap-3 border-b border-line bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 lg:px-[30px] lg:py-5">
            <div className="min-w-0">
              <div className="font-display text-lg font-bold text-ink sm:text-[21px]">{STEP_TITLE[stage]}</div>
              <div className="mt-0.5 text-[13px] text-subtle">{STEP_SUB[stage]}</div>
            </div>
            <div className="flex flex-none items-center gap-[11px]">
              <div className="h-[7px] w-full min-w-[120px] overflow-hidden rounded-pill bg-line sm:w-[120px]">
                <div className="h-full rounded-pill bg-brand transition-all" style={{ width: `${completion}%` }} />
              </div>
              <span className="text-[12.5px] font-bold text-subtle">{completion}%</span>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-[30px] lg:py-6">
            <div className="mx-auto max-w-[680px]">
              {stage === 1 && (
                <StageIdentity
                  f={f}
                  on={on}
                  errors={errors}
                  onLocationChange={(lat, lng, address) =>
                    set({ lat: String(lat), lng: String(lng), ...(address ? { address } : {}) })
                  }
                  onWeekChange={(week) => set({ week })}
                  logoUrl={logoPreview ?? me.data?.logo_url ?? null}
                  coverUrl={coverPreview ?? me.data?.cover_url ?? null}
                  logoUploading={uploadLogo.isPending}
                  coverUploading={uploadCover.isPending}
                  logoError={logoError}
                  coverError={coverError}
                  logoInputRef={logoInputRef}
                  coverInputRef={coverInputRef}
                  onLogoPick={onLogoPick}
                  onCoverPick={onCoverPick}
                />
              )}
              {stage === 2 && (
                types.isLoading ? (
                  <div className="py-12 text-center text-[13.5px] text-subtle">Loading business types…</div>
                ) : types.isError ? (
                  <div className="flex flex-col items-center gap-4 py-12 text-center">
                    <div className="text-[14px] font-semibold text-ink">Could not load business types.</div>
                    <button
                      onClick={() => types.refetch()}
                      className="rounded-[13px] bg-brand px-5 py-3 text-[14px] font-bold text-brand-fg shadow-glow"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <StageType types={types.data ?? []} selected={f.businessType} onSelect={selectType} error={errors.businessType} />
                )
              )}
              {stage === 3 && (
                <StageSetup
                  meta={meta}
                  showDuration={showDuration}
                  showMenuStyle={showMenuStyle}
                  menuStyle={f.menuStyle}
                  onMenuStyle={(m) => set({ menuStyle: m })}
                  items={items}
                  draft={draft}
                  setDraft={setDraft}
                  categories={catType}
                  onAdd={addCatalogItem}
                  onRemove={(id) => removeItem.mutate(id)}
                  adding={addItem.isPending}
                  onUploadItemImage={(id, file) => uploadCatalogImage.mutate({ id, file })}
                  uploadingItemImageId={uploadCatalogImage.isPending ? (uploadCatalogImage.variables?.id ?? null) : null}
                  galleryImages={gallery.data ?? []}
                  onUploadGalleryImages={(files) => {
                    files.forEach((f) =>
                      uploadGalleryImage.mutate(f, {
                        onError: (e) =>
                          showToast((e as { message?: string })?.message ?? "Gallery upload failed"),
                      }),
                    );
                  }}
                  onDeleteGalleryImage={(id) => deleteGalleryImage.mutate(id)}
                  galleryUploading={uploadGalleryImage.isPending}
                  showToast={showToast}
                  error={errors.items}
                />
              )}
              {stage === 4 && (
                <StageStaff
                  members={staffList}
                  used={staffUsed}
                  draft={staffDraft}
                  setDraft={setStaffDraft}
                  onCreate={doCreateStaff}
                  creating={createStaff.isPending}
                  tempPassword={staffTempPassword}
                  onClearPassword={() => setStaffTempPassword(null)}
                />
              )}
              {stage === 5 && (
                <StageReview
                  f={f}
                  meta={meta}
                  typeName={selType?.name}
                  itemCount={items.length}
                  staffCount={staffUsed}
                  missing={missing}
                  canSubmit={canSubmit}
                  goStage={setStage}
                  logoUploaded={!!me.data?.logo_url}
                />
              )}
            </div>
          </div>

          <footer className="sticky bottom-0 flex items-center justify-between gap-3.5 border-t border-line bg-card px-4 py-3.5 sm:px-6 lg:px-[30px] lg:py-4">
            {stage > 1 ? (
              <button onClick={() => setStage(stage - 1)} className="rounded-[13px] border-[1.5px] border-line bg-card px-5 py-3 text-[14.5px] font-semibold text-ink sm:px-[22px]">
                ‹ Back
              </button>
            ) : (
              <span />
            )}
            {stage < 5 ? (
              <button
                onClick={goNext}
                className="rounded-[14px] bg-brand px-6 py-3.5 text-[15px] font-bold text-brand-fg shadow-glow transition hover:brightness-105 sm:px-7"
              >
                Continue ›
              </button>
            ) : (
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={!canSubmit || submit.isPending}
                className={`rounded-[14px] px-5 py-3.5 text-[15px] font-bold text-brand-fg sm:px-[26px] ${
                  canSubmit ? "bg-brand shadow-glow" : "cursor-not-allowed bg-[#E2D6C2]"
                }`}
              >
                {submit.isPending ? t("biz.onboard.submit.confirming") : t("biz.onboard.submit.button")}
              </button>
            )}
          </footer>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-pill bg-ink px-5 py-3 text-sm font-semibold text-cream shadow-glow">
          {toast}
        </div>
      )}

      <OnboardSubmitDialog
        open={confirmOpen}
        isPending={submit.isPending}
        onClose={() => setConfirmOpen(false)}
        onSubmit={doSubmit}
      />
    </div>
  );
}

/* --------------------------------------------------------------- stage cards */

/**
 * Submit-for-verification confirm — replaces the hand-rolled modal with the
 * design-system AlertDialog. Copy comes from biz.onboard.submit.* i18n keys
 * added in this PR; the AlertDialog owns focus trap, ESC and roles.
 */
function OnboardSubmitDialog({
  open,
  isPending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  isPending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const t = useT();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={t("biz.onboard.submit.title")}
      description={t("biz.onboard.submit.description")}
      confirmLabel={t("biz.onboard.submit.confirm")}
      cancelLabel={t("biz.onboard.submit.cancel")}
      onConfirm={onSubmit}
      pending={isPending}
    />
  );
}

function Field({
  label,
  children,
  className = "",
  error,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  error?: string;
}) {
  return (
    <label className={`block ${className}`} data-error={error ? "true" : undefined}>
      <span className={LABEL}>{label}</span>
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1 text-[12px] font-semibold text-danger">{error}</p>}
    </label>
  );
}

// Error-aware input class: red border when the field has a validation error.
function fieldClass(hasError?: boolean) {
  return hasError ? `${FIELD} border-danger` : FIELD;
}

type FormShape = Form;

function StageIdentity({
  f,
  on,
  errors,
  onLocationChange,
  onWeekChange,
  logoUrl,
  coverUrl,
  logoUploading,
  coverUploading,
  logoError,
  coverError,
  logoInputRef,
  coverInputRef,
  onLogoPick,
  onCoverPick,
}: {
  f: FormShape;
  on: (k: keyof FormShape) => (e: { target: { value: string } }) => void;
  errors: Record<string, string>;
  onLocationChange: (lat: number, lng: number, address?: string) => void;
  onWeekChange: (week: Week) => void;
  logoUrl: string | null;
  coverUrl: string | null;
  logoUploading: boolean;
  coverUploading: boolean;
  logoError: string | null;
  coverError: string | null;
  logoInputRef: React.RefObject<HTMLInputElement>;
  coverInputRef: React.RefObject<HTMLInputElement>;
  onLogoPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCoverPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const t = useT();
  const [hoursOpen, setHoursOpen] = useState(false);
  // Same per-day summary the profile settings shows; empty until a day is set.
  const hoursSummary = formatWeek(f.week, (d) => t(`owner.settings.day.${d}`));
  return (
    <div className="flex animate-[jqIn_.3s_ease] flex-col gap-4">
      <div className={CARD}>
        <div className="font-display text-[15px] font-bold text-ink">Brand</div>
        <div className="mt-[3px] text-[12.5px] text-subtle">Click a tile to upload an image.</div>
        <div className="mt-3.5 flex gap-3.5">
          {/* Logo tile */}
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={onLogoPick} />
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={logoUploading}
            className={`relative flex h-24 w-24 flex-none flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl ${
              logoUrl
                ? "border-[1.5px] border-brand bg-brand-muted"
                : errors.logo
                  ? "border-[1.5px] border-dashed border-danger bg-cream"
                  : "border-[1.5px] border-dashed border-line bg-cream"
            }`}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Business logo" className="h-full w-full object-cover" />
            ) : (
              <>
                <span className="text-xl text-[#C7B193]">＋</span>
                <span className="text-[10.5px] font-semibold text-subtle">Logo *</span>
              </>
            )}
            {logoUploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-[11px] font-semibold text-white">
                Uploading…
              </span>
            )}
          </button>
          {/* Cover tile */}
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={onCoverPick} />
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={coverUploading}
            className={`relative flex h-24 flex-1 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl ${
              coverUrl ? "border-[1.5px] border-brand" : "border-[1.5px] border-dashed border-line bg-cream"
            }`}
            style={coverUrl ? { background: `url(${coverUrl}) center/cover` } : undefined}
          >
            {coverUrl ? null : (
              <>
                <span className="text-xl text-[#C7B193]">＋</span>
                <span className="text-[10.5px] font-semibold text-subtle">Cover image · optional</span>
              </>
            )}
            {coverUploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-[11px] font-semibold text-white">
                Uploading…
              </span>
            )}
          </button>
        </div>
        {/* Upload failures + the "logo required" gate both surface under the tiles. */}
        {(logoError || errors.logo) && (
          <div className="mt-2 text-[12px] font-semibold text-danger">
            {logoError ? `Logo: ${logoError}` : errors.logo}
          </div>
        )}
        {coverError && <div className="mt-1 text-[12px] font-semibold text-danger">Cover: {coverError}</div>}
      </div>

      <div className={CARD}>
        <div className="font-display text-[15px] font-bold text-ink">Business profile</div>
        <Field label="Display name *" className="mt-3.5" error={errors.displayName}>
          <input value={f.displayName} onChange={on("displayName")} placeholder="Manas Coffee" className={fieldClass(!!errors.displayName)} />
        </Field>
        <Field label="Legal name · optional" className="mt-3.5">
          <input value={f.legalName} onChange={on("legalName")} placeholder="Manas Coffee LLC" className={FIELD} />
        </Field>
        <Field label="Description *" className="mt-3.5" error={errors.desc}>
          <textarea value={f.desc} onChange={on("desc")} rows={3} placeholder="A cozy specialty roastery…" className={`${fieldClass(!!errors.desc)} resize-none leading-relaxed`} />
        </Field>
        <div className="mt-3.5 flex gap-3">
          <Field label="Primary phone *" className="flex-1" error={errors.phone}>
            <input value={f.phone} onChange={on("phone")} placeholder="+996 555 120 880" className={fieldClass(!!errors.phone)} />
          </Field>
          <Field label="Public email" className="flex-1">
            <input value={f.pubEmail} onChange={on("pubEmail")} placeholder="hello@manas.kg" className={FIELD} />
          </Field>
        </div>
        <div className="mt-3.5 flex gap-3">
          {/* Per-day hours — summary opens the same editor as profile settings. */}
          <Field label="Working hours" className="flex-1">
            <button
              type="button"
              onClick={() => setHoursOpen(true)}
              className={`${FIELD} flex items-center justify-between gap-2 text-left`}
            >
              <span className={`truncate ${hoursSummary ? "" : "text-subtle"}`}>
                {hoursSummary || t("owner.settings.hours.notSet")}
              </span>
              <span aria-hidden className="flex-none text-subtle">
                ✎
              </span>
            </button>
          </Field>
          <Field label="Website · optional" className="flex-1">
            <input value={f.website} onChange={on("website")} placeholder="https://manas.kg" className={FIELD} />
          </Field>
        </div>
        <Field label="Instagram · optional" className="mt-3.5">
          <input value={f.instagram} onChange={on("instagram")} placeholder="@manascoffee" className={FIELD} />
        </Field>
      </div>

      <div className={CARD}>
        <div className="font-display text-[15px] font-bold text-ink">Location</div>
        <Field label="Address *" className="mt-3.5" error={errors.address}>
          <input value={f.address} onChange={on("address")} placeholder="Chuy Avenue 142, Bishkek" className={fieldClass(!!errors.address)} />
        </Field>
        <div className="mt-3.5">
          <LocationPicker
            lat={f.lat}
            lng={f.lng}
            onChange={onLocationChange}
          />
        </div>
        {/* Coordinates are set by the map above (search / drag / tap), never typed —
            shown read-only, matching the profile settings. */}
        {f.lat && f.lng ? (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-tile px-3 py-1.5 text-[12.5px] font-semibold text-subtle">
            <span aria-hidden>📍</span>
            {f.lat}, {f.lng}
          </div>
        ) : (
          <div className="mt-2 text-[12.5px] text-subtle">{t("owner.settings.coordsEmpty")}</div>
        )}
        <Field label="City" className="mt-3.5">
          <input value={f.city} onChange={on("city")} placeholder="Bishkek" className={FIELD} />
        </Field>
        {/* Regional defaults are pre-filled and rarely changed — tucked into a
            disclosure so the form stays light, still editable when needed. */}
        <details className="group mt-3.5 rounded-xl border border-line bg-card px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-semibold text-ink">
            <span>Regional settings</span>
            <span className="flex items-center gap-2 text-[12px] font-normal text-subtle">
              {f.country} · {f.tz} · {f.currency}
              <span aria-hidden className="transition group-open:rotate-180">⌄</span>
            </span>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <Field label="Country">
              <input value={f.country} onChange={on("country")} className={FIELD} />
            </Field>
            <div className="flex gap-3">
              <Field label="Time zone" className="flex-1">
                <input value={f.tz} onChange={on("tz")} className={FIELD} />
              </Field>
              <Field label="Currency" className="flex-1">
                <input value={f.currency} onChange={on("currency")} className={FIELD} />
              </Field>
            </div>
          </div>
        </details>
      </div>

      <Dialog
        open={hoursOpen}
        onOpenChange={setHoursOpen}
        title={t("owner.profile.hours")}
        ariaLabel={t("owner.profile.hours")}
      >
        <WeekHoursEditor value={f.week} onChange={onWeekChange} />
        <button
          type="button"
          onClick={() => setHoursOpen(false)}
          className="mt-4 w-full rounded-[14px] bg-brand py-3 text-[14px] font-bold text-brand-fg shadow-glow transition hover:brightness-105"
        >
          {t("common.close")}
        </button>
      </Dialog>
    </div>
  );
}

function StageType({ types, selected, onSelect, error }: { types: BusinessType[]; selected: string; onSelect: (k: string) => void; error?: string }) {
  return (
    <div className="animate-[jqIn_.3s_ease]">
      {error && (
        <div data-error="true" className="mb-3.5 rounded-[14px] border border-[#EBC9BB] bg-[#F7E4DC] px-4 py-3 text-[13px] font-semibold text-danger">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-[13px] sm:grid-cols-2">
        {types.map((t) => {
          const sel = selected === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              className={`flex flex-col gap-2 rounded-2xl p-[15px] text-left ${
                sel ? "border-2 border-brand bg-brand-muted shadow-glow" : "border-[1.5px] border-line bg-card"
              }`}
            >
              <span className={`flex h-[42px] w-[42px] items-center justify-center rounded-xl text-[21px] ${sel ? "bg-brand" : "bg-[#F4ECDF]"}`}>{t.glyph}</span>
              <span className="font-display text-[14.5px] font-bold text-ink">{t.name}</span>
              <span className="text-xs leading-snug text-subtle">{t.description}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-start gap-[11px] rounded-[14px] bg-[#FBF3E6] px-4 py-3.5">
        <span className="text-[17px]">💡</span>
        <div className="text-[12.5px] leading-relaxed text-[#8A6A3A]">
          Your type controls which profile sections, catalog forms, and customer-facing display you get next.
        </div>
      </div>
    </div>
  );
}

// Max gallery images per business. Business rule: cap enforced server-side (409 GALLERY_LIMIT_REACHED);
// client disables upload at the same threshold for immediate feedback.
const GALLERY_LIMIT = 8;

function StageSetup(props: {
  meta: { plural: string; noun: string };
  showDuration: boolean;
  showMenuStyle: boolean;
  menuStyle: string;
  onMenuStyle: (m: string) => void;
  items: CatalogItem[];
  draft: { name: string; category: string; price: string; duration: string };
  setDraft: (d: { name: string; category: string; price: string; duration: string }) => void;
  categories: string[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  adding: boolean;
  onUploadItemImage: (id: string, file: File) => void;
  uploadingItemImageId: string | null;
  galleryImages: GalleryImage[];
  onUploadGalleryImages: (files: File[]) => void;
  onDeleteGalleryImage: (id: string) => void;
  galleryUploading: boolean;
  showToast: (msg: string) => void;
  error?: string;
}) {
  const { meta, items, draft, setDraft, categories, showDuration, showMenuStyle } = props;
  // One hidden file input per catalog item row; keyed by item id via refs map.
  const itemInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const galleryCount = props.galleryImages.length;
  const galleryFull = galleryCount >= GALLERY_LIMIT;

  function handleItemImagePick(item: CatalogItem, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) props.onUploadItemImage(item.id, file);
    // Reset so the same file can be re-picked after a failed upload.
    e.target.value = "";
  }

  function handleGalleryPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) props.onUploadGalleryImages(files);
    e.target.value = "";
  }

  return (
    <div className="flex animate-[jqIn_.3s_ease] flex-col gap-4">
      {props.error && (
        <div data-error="true" className="rounded-[14px] border border-[#EBC9BB] bg-[#F7E4DC] px-4 py-3 text-[13px] font-semibold text-danger">
          {props.error}
        </div>
      )}
      <div className="flex items-center gap-[11px] rounded-[14px] border border-[#D4E4D9] bg-[#EAF1EC] px-4 py-3">
        <span className="text-base">⚙️</span>
        <div className="text-[12.5px] leading-snug text-[#3F6B52]">These fields are generated from your business type.</div>
      </div>

      {showMenuStyle && (
        <div className={CARD}>
          <div className="font-display text-[15px] font-bold text-ink">Menu style</div>
          <div className="mt-[3px] text-[12.5px] text-subtle">How customers see your menu.</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {MENU_STYLES.map((m) => {
              const sel = props.menuStyle === m;
              return (
                <button
                  key={m}
                  onClick={() => props.onMenuStyle(m)}
                  className={`whitespace-nowrap rounded-pill border-[1.5px] px-3.5 py-2 text-[12.5px] font-semibold ${
                    sel ? "border-brand bg-brand text-brand-fg" : "border-line bg-card text-subtle"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={CARD}>
        <div className="font-display text-[15px] font-bold text-ink">Add {meta.noun}</div>
        <div className="mt-3.5 flex flex-wrap gap-2.5">
          <Field label="Name" className="min-w-[160px] flex-[2]">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Cappuccino" className={FIELD} />
          </Field>
          {/* Section label — pick a suggestion or type a brand-new one (datalist). */}
          <Field label="Section" className="min-w-[120px] flex-1">
            <input
              list="onb-catalog-labels"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              placeholder={categories[0] ?? "Featured"}
              className={FIELD}
            />
            <datalist id="onb-catalog-labels">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2.5">
          {showDuration && (
            <Field label="Duration" className="min-w-[110px] flex-1">
              <input value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} placeholder="45 min" className={FIELD} />
            </Field>
          )}
          <Field label="Price" className="min-w-[110px] flex-1">
            <input value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="150 c" className={FIELD} />
          </Field>
          <button onClick={props.onAdd} disabled={props.adding} className="flex-none rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-fg disabled:opacity-60">
            + Add
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-line bg-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-[15px]">
          <div className="font-display text-[15px] font-bold text-ink">{meta.plural}</div>
        </div>
        {items.length === 0 ? (
          <div className="px-5 py-[34px] text-center text-[13.5px] text-subtle">No {meta.noun}s yet — add your first above.</div>
        ) : (
          items.map((it) => {
            const isUploadingThis = props.uploadingItemImageId === it.id;
            return (
              <div key={it.id} className="flex items-center gap-3.5 border-b border-[#F4ECDF] px-5 py-3.5">
                {/* Image thumb / upload button */}
                <button
                  type="button"
                  onClick={() => itemInputRefs.current.get(it.id)?.click()}
                  disabled={isUploadingThis}
                  aria-label={it.image_url ? `Replace image for ${it.name}` : `Upload image for ${it.name}`}
                  className={`relative flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-[10px] border disabled:opacity-60 ${
                    it.image_url ? "border-brand bg-brand-muted" : "border-dashed border-line bg-[#F4ECDF]"
                  }`}
                >
                  {isUploadingThis ? (
                    <span className="text-[9px] font-bold text-subtle">…</span>
                  ) : it.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display text-sm font-bold text-brand">
                      {(it.name || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </button>
                {/* Hidden file input for this item */}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={(el) => {
                    if (el) itemInputRefs.current.set(it.id, el);
                    else itemInputRefs.current.delete(it.id);
                  }}
                  onChange={(e) => handleItemImagePick(it, e)}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">{it.name}</div>
                  <div className="mt-px text-xs text-subtle">{[it.category, it.duration, it.price].filter(Boolean).join("   ·   ")}</div>
                </div>
                <button onClick={() => props.onRemove(it.id)} aria-label={`Remove ${it.name}`} className="h-[30px] w-[30px] flex-none rounded-[9px] border border-line bg-card text-[15px] text-[#B0563A]">
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Gallery card */}
      <div className={CARD}>
        <div className="flex items-center justify-between">
          <div className="font-display text-[15px] font-bold text-ink">Photos</div>
          <span className="text-[12.5px] font-semibold text-subtle">{galleryCount}/{GALLERY_LIMIT}</span>
        </div>
        <div className="mt-[3px] text-[12.5px] text-subtle">Show customers what your space looks like.</div>

        {props.galleryImages.length > 0 && (
          <div className="mt-3.5 grid grid-cols-4 gap-2 sm:grid-cols-4">
            {props.galleryImages.map((img) => (
              <div key={img.id} className="group relative aspect-square overflow-hidden rounded-[10px] border border-line bg-[#F4ECDF]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.image_url} alt={img.caption || "Gallery photo"} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => props.onDeleteGalleryImage(img.id)}
                  aria-label="Delete photo"
                  className="absolute right-1 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ink/70 text-[12px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3.5">
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleGalleryPick}
          />
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={galleryFull || props.galleryUploading}
            className="rounded-xl border-[1.5px] border-dashed border-line bg-cream px-5 py-2.5 text-[13px] font-semibold text-subtle transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {props.galleryUploading ? "Uploading…" : galleryFull ? "Limit reached (8)" : "+ Add photos"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StageStaff(props: {
  members: TeamRow[];
  used: number;
  draft: { phone: string; role: StaffRole };
  setDraft: (d: { phone: string; role: StaffRole }) => void;
  onCreate: () => void;
  creating: boolean;
  tempPassword: string | null;
  onClearPassword: () => void;
}) {
  const t = useT();
  const { members, used, draft, setDraft, tempPassword } = props;
  const full = used >= STAFF_LIMIT;
  const [copied, setCopied] = useState(false);

  function copyPassword() {
    if (!tempPassword) return;
    // ponytail: navigator.clipboard is undefined in non-secure contexts; guard avoids runtime throw
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(tempPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex animate-[jqIn_.3s_ease] flex-col gap-4">
      <div className="flex items-center justify-between rounded-[14px] bg-[#FBF3E6] px-4 py-3">
        <div className="text-[12.5px] leading-snug text-[#8A6A3A]">Create staff accounts now or add them later from the Staff page.</div>
        <span className="ml-3.5 flex-none font-display text-[13px] font-bold text-amber-deep">{used} / 5</span>
      </div>

      {/* One-time password reveal — protected from accidental close */}
      {tempPassword && (
        <div className={CARD}>
          <div className="font-display text-[15px] font-bold text-ink">{t("staff.create.passwordTitle")}</div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-subtle">{t("staff.create.passwordHelp")}</p>
          <div className="mt-3 rounded-xl bg-amber/15 px-4 py-3.5">
            <div className="font-mono text-lg font-extrabold tracking-[0.04em] text-amber-deep">{tempPassword}</div>
          </div>
          <div className="mt-3 flex gap-2.5">
            <button
              onClick={copyPassword}
              className="flex-1 rounded-xl border border-line bg-card py-3 text-[13px] font-semibold text-ink transition hover:bg-board/40"
            >
              {copied ? t("common.copied") : t("staff.create.copy")}
            </button>
            <button
              onClick={props.onClearPassword}
              className="flex-1 rounded-xl bg-brand py-3 text-[13px] font-bold text-brand-fg shadow-glow"
            >
              {t("staff.create.done")}
            </button>
          </div>
        </div>
      )}

      <div className={CARD}>
        <div className="font-display text-[15px] font-bold text-ink">{t("staff.create.title")}</div>
        <div className="mt-3.5 flex flex-wrap gap-2.5">
          <Field label={t("staff.create.phone")} className="min-w-[160px] flex-[2]">
            <input
              type="tel"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder={t("staff.create.phonePlaceholder")}
              className={FIELD}
            />
          </Field>
          <Field label={t("staff.create.role")} className="w-[130px] flex-none">
            <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as StaffRole })} className={FIELD}>
              {STAFF_ROLES.map((r) => (
                <option key={r.v} value={r.v}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <div className="text-xs leading-snug text-subtle">{ROLE_HINT[draft.role]}</div>
          {full ? (
            <span className="flex-none rounded-xl bg-[#F2EEE7] px-[18px] py-[11px] text-[13px] font-bold text-[#9A8B7B]">Limit reached</span>
          ) : (
            <button onClick={props.onCreate} disabled={props.creating} className="flex-none rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-fg disabled:opacity-60">
              {props.creating ? t("staff.create.submitting") : t("staff.create.submit")}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-line bg-card">
        <div className="border-b border-line px-5 py-[15px] font-display text-[15px] font-bold text-ink">Team</div>
        {members.length === 0 ? (
          <div className="px-5 py-[30px] text-center text-[13.5px] text-subtle">No staff yet — optional. You can skip and continue.</div>
        ) : (
          members.map((m) => {
            const initials = (m.initials || m.name || "?").slice(0, 2).toUpperCase();
            const rLabel = STAFF_ROLES.find((r) => r.v === m.role)?.label ?? m.role;
            return (
              <div key={m.id} className="flex items-center gap-3.5 border-b border-[#F4ECDF] px-5 py-3.5">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#F4ECDF] font-display text-[13px] font-bold text-brand">{initials}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">{m.name || "—"}</div>
                  <div className="text-xs text-subtle">{m.phone || m.email || "—"}</div>
                </div>
                <span className="text-xs font-bold text-subtle">{rLabel}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StageReview(props: {
  f: FormShape;
  meta: { plural: string; noun: string };
  typeName?: string;
  itemCount: number;
  staffCount: number;
  missing: { label: string; step: number }[];
  canSubmit: boolean;
  goStage: (n: number) => void;
  logoUploaded: boolean;
}) {
  const { f, meta, missing, canSubmit, goStage } = props;
  const t = useT();
  const hoursSummary = formatWeek(f.week, (d) => t(`owner.settings.day.${d}`));
  const cards = [
    {
      title: "Business identity",
      step: 1,
      rows: [
        ["Display name", f.displayName || "—"],
        ["Description", f.desc || "—"],
        ["Phone", f.phone || "—"],
        ["Public email", f.pubEmail || "—"],
        ["Working hours", hoursSummary || "—"],
        ["Logo", props.logoUploaded ? "Uploaded" : "Missing — required"],
      ],
    },
    {
      title: "Location",
      step: 1,
      rows: [
        ["Address", f.address || "—"],
        ["City", f.city || "—"],
        ["Coordinates", f.lat || f.lng ? `${f.lat}, ${f.lng}` : "—"],
        ["Time zone", f.tz],
      ],
    },
    { title: "Business type", step: 2, rows: [["Type", props.typeName || "Not selected"], ["Display", props.typeName ? `${meta.plural} module` : "—"]] },
    { title: meta.plural, step: 3, rows: [[`${meta.plural} added`, `${props.itemCount} ${props.itemCount === 1 ? "entry" : "entries"}`]] },
    { title: "Staff", step: 4, rows: [["Invites", props.staffCount ? `${props.staffCount} of 5` : "None — add later"]] },
  ];
  return (
    <div className="flex animate-[jqIn_.3s_ease] flex-col gap-3.5">
      {missing.length > 0 && (
        <div className="rounded-2xl border border-[#EBC9BB] bg-[#F7E4DC] px-[18px] py-4">
          <div className="font-display text-sm font-bold text-[#B0563A]">Required fields missing</div>
          <div className="mt-[11px] flex flex-wrap gap-2">
            {missing.map((m) => (
              <button
                key={m.label}
                onClick={() => goStage(m.step)}
                aria-label={`Fix ${m.label} (step ${m.step})`}
                className="inline-flex items-center gap-1.5 rounded-pill border border-[#EBC9BB] bg-card px-3 py-[7px] text-[12.5px] font-semibold text-[#B0563A]"
              >
                {m.label} <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {canSubmit && (
        <div className="flex items-center gap-[11px] rounded-2xl border border-[#C9E0D1] bg-sage-soft px-[18px] py-[15px]">
          <span className="text-lg">✓</span>
          <div className="text-[13.5px] font-semibold text-ok">All required fields complete — ready to submit for verification.</div>
        </div>
      )}
      {cards.map((sec) => (
        <div key={sec.title} className={CARD}>
          <div className="flex items-center justify-between">
            <div className="font-display text-[15px] font-bold text-ink">{sec.title}</div>
            <button onClick={() => goStage(sec.step)} aria-label={`Edit ${sec.title}`} className="text-[13px] font-bold text-brand">
              Edit
            </button>
          </div>
          <div className="mt-3.5 flex flex-col gap-[9px]">
            {sec.rows.map((r, i) => (
              <div key={i} className="flex gap-3.5 text-[13.5px]">
                <span className="w-[100px] flex-none text-subtle sm:w-[140px]">{r[0]}</span>
                <span className="flex-1 font-semibold text-ink">{r[1]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- pending */

const STATUS_INFO: Record<string, { label: string; color: string; bg: string; dot: string; title: string; msg: string }> = {
  submitted: {
    label: "Pending verification", color: "#B07A1E", bg: "#FBEFD9", dot: "#E7A23E",
    title: "You’re in review",
    msg: "Your business profile has been submitted and is waiting for admin review. We’ll email you the moment it’s verified.",
  },
  changes_requested: {
    label: "Changes requested", color: "#B0563A", bg: "#F7E4DC", dot: "#C25E3C",
    title: "A few changes needed",
    msg: "The Jaqyn team reviewed your submission and asked for a small change before going live.",
  },
  completed: {
    label: "Verified · live", color: "#3F7355", bg: "#E4F0E7", dot: "#5E8B6A",
    title: "You’re verified & live",
    msg: "Your business is approved and now visible to customers in the Jaqyn app. Welcome aboard!",
  },
};

function Pending(props: {
  status?: string;
  changeNote: string;
  bizName: string;
  typeName?: string;
  glyph?: string;
  itemCount: number;
  staffCount: number;
  onRefresh: () => void;
  onMakeChanges: () => void;
  toast: string | null;
}) {
  const info = STATUS_INFO[props.status ?? "submitted"] ?? STATUS_INFO.submitted!;
  const checklist = [
    { label: "Business identity & location" },
    { label: `Business type · ${props.typeName ?? "—"}` },
    { label: `Catalog · ${props.itemCount} added` },
    { label: `Staff invites · ${props.staffCount || "none"}` },
  ];
  return (
    <div className="flex min-h-screen items-start justify-center bg-[#FBF7F0] px-4 py-10 font-sans text-ink sm:px-6 sm:py-[46px]">
      <div className="w-full max-w-[520px] animate-[jqIn_.3s_ease]">
        <div className="rounded-[22px] border border-line bg-card p-[30px] shadow-card">
          <div className="flex items-center justify-between">
            <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[18px] text-[28px]" style={{ background: info.bg }}>
              {props.glyph || "🏪"}
            </div>
            <span className="inline-flex items-center gap-[7px] rounded-pill px-3.5 py-2 text-[12.5px] font-bold" style={{ color: info.color, background: info.bg }}>
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: info.dot }} />
              {info.label}
            </span>
          </div>
          <div className="mt-5 font-display text-[23px] font-bold text-ink">{info.title}</div>
          <div className="mt-2 text-sm leading-relaxed text-subtle">{info.msg}</div>
          <div className="mt-3 text-[12.5px] text-subtle">{props.bizName}</div>

          {props.status === "changes_requested" && (
            <div className="mt-[18px] rounded-[14px] border border-[#EBC9BB] bg-[#F7E4DC] px-4 py-3.5">
              <div className="font-display text-[13px] font-bold text-[#B0563A]">Admin note</div>
              <div className="mt-1.5 text-[13px] leading-relaxed text-[#8A4632]">{props.changeNote || "Please review and update your profile."}</div>
              <button onClick={props.onMakeChanges} className="mt-3.5 rounded-xl bg-brand px-[18px] py-[11px] text-[13.5px] font-bold text-brand-fg">
                Make changes ›
              </button>
            </div>
          )}

          <div className="mt-5 border-t border-line pt-[18px]">
            <div className="text-xs font-bold uppercase tracking-[0.05em] text-subtle">Submitted</div>
            <div className="mt-3 flex flex-col gap-[11px]">
              {checklist.map((c) => (
                <div key={c.label} className="flex items-center gap-[11px]">
                  <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] bg-sage-soft text-sm text-ok">✓</span>
                  <span className="text-[13.5px] text-ink">{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          {props.status === "completed" ? (
            <div className="mt-5 flex flex-col gap-2.5">
              <Link
                href="/business/dashboard"
                className="w-full rounded-[14px] bg-brand py-3.5 text-center text-sm font-bold text-brand-fg shadow-glow"
              >
                Go to your dashboard
              </Link>
              <Link
                href="/business/loyalty"
                className="w-full rounded-[14px] border-[1.5px] border-line bg-card py-3.5 text-center text-sm font-semibold text-ink"
              >
                Create your first loyalty program ›
              </Link>
            </div>
          ) : (
            <button onClick={props.onRefresh} className="mt-5 w-full rounded-[14px] border-[1.5px] border-line bg-card py-3.5 text-sm font-semibold text-ink">
              Refresh status
            </button>
          )}
          <div className="mt-[18px] flex items-center gap-2 text-[12.5px] text-subtle">
            <span className="text-sm">✉️</span>Questions? Contact <b className="text-ink">hello@jaqyn.kg</b>
          </div>
        </div>
      </div>
      {props.toast && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-pill bg-ink px-5 py-3 text-sm font-semibold text-cream shadow-glow">{props.toast}</div>
      )}
    </div>
  );
}
