"use client";

// Business campaigns — detail (campaigns-restructure design §5). Gradient hero,
// lifecycle controls, and the tabbed payload (overview/participants/groups/
// reward_usage/analytics/settings) — Groups only for GROUP campaigns. Fed from the
// single tabbed detail response; mutations invalidate the relevant keys.

import {
  useBusinessCampaign,
  useBusinessMe,
  useCampaignAction,
  useCancelCampaignVoucher,
  useDuplicateCampaign,
  useUpdateCampaign,
  useUploadCampaignImage,
  type CampaignDetailTabs,
  type CampaignLifecycleAction,
  type CampaignPayload,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge } from "@jaqyn/ui";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { OwnerShell } from "../../_components/OwnerShell";
import { SocialPostStudio } from "../../_components/SocialPostStudio";
import { StatusPill, TYPE_GLYPH, TypeBadge, VoucherStatusPill } from "../../_components/campaigns";
import { QueryBoundary } from "../../../_components/QueryBoundary";
import { useErrMessage } from "../../../_lib/useErrMessage";
import { ruleLinesFor } from "./rules";

// Groups tab only appears for GROUP campaigns (campaigns-restructure design §5).
type Tab = "overview" | "participants" | "groups" | "rewardUsage" | "analytics" | "settings";

const PANEL = "rounded-[18px] border border-line bg-card p-5";

export default function CampaignDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const detail = useBusinessCampaign(id);

  return (
    <OwnerShell title={t("cmp.biz.title")}>
      <QueryBoundary query={detail}>{(d) => <Detail id={id} tabs={d} />}</QueryBoundary>
    </OwnerShell>
  );
}

function Detail({ id, tabs }: { id: string; tabs: CampaignDetailTabs }) {
  const t = useT();
  const router = useRouter();
  const errMessage = useErrMessage();
  const c = tabs.overview;
  const isGroup = c.type === "group";

  const tabList: Tab[] = [
    "overview",
    "participants",
    ...(isGroup ? (["groups"] as const) : []),
    "rewardUsage",
    "analytics",
    "settings",
  ];
  const [tab, setTab] = useState<Tab>("overview");

  const action = useCampaignAction();
  const duplicate = useDuplicateCampaign();
  const me = useBusinessMe();
  const uploadImage = useUploadCampaignImage(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [studioOpen, setStudioOpen] = useState(false);

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadImage.mutate(file);
  }

  const controls: { action: CampaignLifecycleAction; labelKey: string }[] = [];
  if (c.status === "draft" || c.status === "scheduled")
    controls.push({ action: "publish", labelKey: "cmp.biz.ctrl.publish" });
  if (c.status === "active") controls.push({ action: "pause", labelKey: "cmp.biz.ctrl.pause" });
  if (c.status === "paused") controls.push({ action: "resume", labelKey: "cmp.biz.ctrl.resume" });
  if (c.status === "active" || c.status === "paused" || c.status === "scheduled")
    controls.push({ action: "end", labelKey: "cmp.biz.ctrl.end" });
  if (c.status === "draft" || c.status === "scheduled")
    controls.push({ action: "cancel", labelKey: "cmp.biz.ctrl.cancel" });

  const busy = action.isPending || duplicate.isPending;

  return (
    <div className="max-w-[920px] animate-[jqIn_.3s_ease]">
      <button
        onClick={() => router.push("/business/campaigns")}
        className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-subtle"
      >
        {t("cmp.biz.back")}
      </button>

      {/* gradient hero */}
      <div className="relative flex items-center gap-4 overflow-hidden rounded-[20px] bg-[linear-gradient(120deg,#3C2E22,#5A4330)] p-6 text-white">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber/15" aria-hidden />
        {c.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote R2 media, plain load (no canvas/crossOrigin)
          <img
            src={c.image}
            alt=""
            className="h-16 w-16 flex-none rounded-2xl object-cover"
            aria-hidden
          />
        ) : (
          <div
            className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl bg-white/15 text-3xl"
            aria-hidden
          >
            {c.glyph || TYPE_GLYPH[c.type]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[22px] font-bold">{c.name}</h1>
            <StatusPill status={c.status} />
          </div>
          <p className="mt-1 text-[13px] opacity-85">
            {t(`cmp.biz.type.${c.type}`)}
            {c.start_label || c.end_label ? ` · ${c.start_label} – ${c.end_label}` : ""}
          </p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploadImage.isPending}
          className="absolute right-4 top-4 rounded-xl bg-white/15 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-white/25 disabled:opacity-60"
        >
          {uploadImage.isPending ? t("cmp.social.uploading") : t("cmp.social.changePhoto")}
        </button>
      </div>
      {uploadImage.isError && (
        <p className="mt-2 text-[12.5px] font-semibold text-danger">{t("common.error")}</p>
      )}

      {/* controls */}
      <div className="mt-4 flex flex-wrap gap-2.5">
        <button
          onClick={() => setStudioOpen(true)}
          className="rounded-xl border-[1.5px] border-brand bg-brand-muted px-4 py-2.5 text-[13px] font-semibold text-brand-deep transition active:scale-[.99]"
        >
          {t("cmp.social.open")}
        </button>
        {controls.map((ctrl) => (
          <button
            key={ctrl.action}
            onClick={() => action.mutate({ id, action: ctrl.action })}
            disabled={busy}
            className="rounded-xl border-[1.5px] border-line bg-card px-4 py-2.5 text-[13px] font-semibold text-ink transition active:scale-[.99] disabled:opacity-60"
          >
            {t(ctrl.labelKey)}
          </button>
        ))}
        <button
          onClick={() =>
            duplicate.mutate(id, {
              onSuccess: (copy) => router.push(`/business/campaigns/${copy.id}`),
            })
          }
          disabled={busy}
          className="rounded-xl border-[1.5px] border-line bg-card px-4 py-2.5 text-[13px] font-semibold text-ink transition active:scale-[.99] disabled:opacity-60"
        >
          {t("cmp.biz.ctrl.duplicate")}
        </button>
      </div>
      {(action.isError || duplicate.isError) && (
        <p className="mt-2 text-[12.5px] font-semibold text-danger">
          {errMessage(action.error ?? duplicate.error)}
        </p>
      )}

      {/* tabs */}
      <div className="mt-[22px] flex gap-1 overflow-x-auto border-b border-line">
        {tabList.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            aria-current={tab === tb}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[13.5px] font-semibold transition ${
              tab === tb ? "border-brand text-brand-deep" : "border-transparent text-subtle"
            }`}
          >
            {t(`cmp.biz.tab.${tb}`)}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab tabs={tabs} />}
      {tab === "participants" && <ParticipantsTab tabs={tabs} />}
      {tab === "groups" && <GroupsTab tabs={tabs} />}
      {tab === "rewardUsage" && <RewardUsageTab id={id} tabs={tabs} />}
      {tab === "analytics" && <AnalyticsTab tabs={tabs} />}
      {tab === "settings" && <SettingsTab id={id} tabs={tabs} />}

      {studioOpen && (
        <SocialPostStudio
          campaignId={id}
          campaignName={c.name}
          businessName={me.data?.display_name || me.data?.name || ""}
          onClose={() => setStudioOpen(false)}
        />
      )}
    </div>
  );
}

// ---- Overview --------------------------------------------------------------

function OverviewTab({ tabs }: { tabs: CampaignDetailTabs }) {
  const t = useT();
  const c = tabs.overview;
  return (
    <div className="mt-[22px] grid gap-4 lg:grid-cols-2">
      <div className={PANEL}>
        <h3 className="font-display text-[15px] font-bold text-ink">{t("cmp.biz.overview.reward")}</h3>
        <div className="mt-3 flex items-center gap-3">
          <div
            className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl bg-brand-muted text-xl"
            aria-hidden
          >
            🎁
          </div>
          <div className="min-w-0">
            <div className="text-[14.5px] font-bold text-ink">{c.reward.title}</div>
            <div className="mt-0.5 truncate text-[12.5px] text-subtle">{c.reward.description}</div>
          </div>
        </div>
      </div>
      <div className={PANEL}>
        <h3 className="font-display text-[15px] font-bold text-ink">{t("cmp.biz.overview.rules")}</h3>
        <ul className="mt-3 flex flex-col gap-2">
          {ruleLinesFor(t, c).map((line, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-subtle">
              <span className="font-bold text-brand" aria-hidden>
                ·
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---- Participants ----------------------------------------------------------

const PART_COLS = "grid grid-cols-[2fr_1fr_1.3fr_1.3fr_1.2fr] items-center";

function ParticipantsTab({ tabs }: { tabs: CampaignDetailTabs }) {
  const t = useT();
  const rows = tabs.participants;
  if (rows.length === 0)
    return <p className="mt-[22px] text-sm text-subtle">{t("cmp.biz.part.empty")}</p>;
  return (
    <div className="mt-[22px] overflow-x-auto rounded-[18px] border border-line bg-card">
      <div className="min-w-[640px]">
        <div
          className={`${PART_COLS} border-b border-line px-[22px] py-3.5 text-[11.5px] font-bold uppercase tracking-[0.04em] text-subtle`}
        >
          <span>{t("cmp.biz.part.col.customer")}</span>
          <span>{t("cmp.biz.part.col.progress")}</span>
          <span>{t("cmp.biz.part.col.status")}</span>
          <span>{t("cmp.biz.part.col.last")}</span>
          <span>{t("cmp.biz.part.col.reward")}</span>
        </div>
        {rows.map((p) => (
          <div key={p.id} className={`${PART_COLS} border-b border-[#F4ECDF] px-[22px] py-4`}>
            <span className="text-[13.5px] font-semibold text-ink">{p.name}</span>
            <span className="text-[13.5px] font-bold text-ink">
              {p.progress}
              {p.goal != null ? ` / ${p.goal}` : ""}
            </span>
            <span>
              <Badge tone={p.status === "completed" || p.status === "redeemed" ? "ok" : "warn"}>
                {t(`cmp.biz.part.status.${p.status}`)}
              </Badge>
            </span>
            <span className="text-[13px] text-subtle">{p.last_visit_label}</span>
            <span className="text-[13px] text-subtle">{p.reward_label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Groups (GROUP campaigns only) -----------------------------------------

function GroupsTab({ tabs }: { tabs: CampaignDetailTabs }) {
  const t = useT();
  const groups = tabs.groups;
  if (groups.length === 0)
    return <p className="mt-[22px] text-sm text-subtle">{t("cmp.biz.groups.empty")}</p>;
  return (
    <div className="mt-[22px] grid gap-3 sm:grid-cols-2">
      {groups.map((g) => (
        <div key={g.id} className={PANEL}>
          <div className="flex items-center justify-between">
            <Badge tone="brand">{t(`cmp.status.${statusKey(g.status)}`)}</Badge>
            <span className="text-[13px] font-bold text-ink">
              {g.members.length} {t("cmp.biz.groups.size").replace("{size}", String(g.required_size))}
            </span>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {g.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-[13px] text-subtle">
                <span className="truncate">{m.customer.slice(0, 8)}</span>
                <span>{m.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Group status strings reuse the campaign status pill copy where they overlap;
// unknown values fall back to "active" so the i18n lookup never misses.
function statusKey(s: string): "active" | "ended" | "cancelled" {
  if (s === "completed") return "ended";
  if (s === "cancelled" || s === "expired") return "cancelled";
  return "active";
}

// ---- Reward Usage ----------------------------------------------------------

const VOUCH_COLS = "grid grid-cols-[1.2fr_1.6fr_1fr_1fr_1fr_1.1fr] items-center";

function RewardUsageTab({ id, tabs }: { id: string; tabs: CampaignDetailTabs }) {
  const t = useT();
  const rows = tabs.reward_usage;
  const cancel = useCancelCampaignVoucher();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (rows.length === 0)
    return <p className="mt-[22px] text-sm text-subtle">{t("cmp.biz.vouch.empty")}</p>;

  return (
    <div className="mt-[22px] overflow-x-auto rounded-[18px] border border-line bg-card">
      <div className="min-w-[680px]">
        <div
          className={`${VOUCH_COLS} border-b border-line px-[22px] py-3.5 text-[11.5px] font-bold uppercase tracking-[0.04em] text-subtle`}
        >
          <span>{t("cmp.biz.vouch.col.voucher")}</span>
          <span>{t("cmp.biz.vouch.col.customer")}</span>
          <span>{t("cmp.biz.vouch.col.status")}</span>
          <span>{t("cmp.biz.vouch.col.issued")}</span>
          <span>{t("cmp.biz.vouch.col.expires")}</span>
          <span>{t("cmp.biz.vouch.col.redeemedBy")}</span>
        </div>
        {rows.map((v) => (
          <div key={v.id} className={`${VOUCH_COLS} border-b border-[#F4ECDF] px-[22px] py-4`}>
            <span className="font-mono text-[13px] font-bold tracking-[0.04em] text-ink">{v.code}</span>
            <span className="text-[13.5px] text-ink">{v.customer}</span>
            <span>
              <VoucherStatusPill status={v.status} />
            </span>
            <span className="text-[13px] text-subtle">{v.issued_label}</span>
            <span className="text-[13px] text-subtle">{v.expires_label}</span>
            <span className="flex items-center justify-between gap-2 text-[13px] text-subtle">
              <span>{v.redeemed_by}</span>
              {v.status === "active" && (
                <button
                  onClick={() => {
                    setCancelId(v.id);
                    setReason("");
                  }}
                  className="text-[12px] font-semibold text-danger"
                >
                  {t("cmp.biz.vouch.cancel")}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {cancelId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
          role="dialog"
          aria-modal
          onClick={() => setCancelId(null)}
        >
          <div
            className="w-full max-w-sm rounded-[18px] border border-line bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-[16px] font-bold text-ink">{t("cmp.biz.vouch.cancelConfirm")}</h3>
            <label className="mt-3 block">
              <span className="text-[12px] font-bold text-subtle">{t("cmp.biz.vouch.cancelReason")}</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
                className="mt-1.5 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-sm font-semibold text-ink outline-none focus:border-brand"
              />
            </label>
            {cancel.isError && (
              <p className="mt-2 text-[12.5px] font-semibold text-danger">{t("common.error")}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setCancelId(null)}
                className="rounded-xl border-[1.5px] border-line bg-card px-4 py-3 text-sm font-semibold text-ink"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() =>
                  cancel.mutate({ id: cancelId, reason: reason.trim() }, { onSuccess: () => setCancelId(null) })
                }
                disabled={!reason.trim() || cancel.isPending}
                className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-brand-fg shadow-glow disabled:opacity-60"
              >
                {t("cmp.biz.vouch.cancelConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* `id` retained for invalidation symmetry with the list route */}
      <span hidden data-campaign-id={id} />
    </div>
  );
}

// ---- Analytics -------------------------------------------------------------

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="text-xs font-semibold text-subtle">{label}</div>
      <div className="mt-2 font-display text-2xl font-extrabold leading-none text-ink">{value}</div>
    </div>
  );
}

function AnalyticsTab({ tabs }: { tabs: CampaignDetailTabs }) {
  const t = useT();
  const a = tabs.analytics;
  const ts = a.type_stats;
  return (
    <>
      <div className="mt-[22px] grid grid-cols-3 gap-3.5">
        <Metric label={ts.stat_a.label} value={String(ts.stat_a.value)} />
        <Metric label={ts.stat_b.label} value={String(ts.stat_b.value)} />
        <Metric label={ts.stat_c.label} value={String(ts.stat_c.value)} />
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Metric label={t("cmp.biz.metric.joined")} value={String(a.joined)} />
        <Metric label={t("cmp.biz.metric.completed")} value={String(a.completed)} />
        <Metric label={t("cmp.biz.metric.issued")} value={String(a.issued)} />
        <Metric label={t("cmp.biz.metric.redeemed")} value={String(a.redeemed)} />
        <Metric
          label={t("cmp.biz.metric.redemptionRate")}
          value={`${Math.round(a.redemption_rate * 100)}%`}
        />
        <Metric label={t("cmp.biz.metric.estCost")} value={a.estimated_cost} />
      </div>
    </>
  );
}

// ---- Settings --------------------------------------------------------------

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 bg-card px-4 py-3.5 text-[13.5px]">
      <span className="text-subtle">{label}</span>
      <span className="text-right font-semibold text-ink">{value}</span>
    </div>
  );
}

const SET_LABEL = "text-[12px] font-bold text-subtle";
const SET_FIELD =
  "mt-1.5 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-sm font-semibold text-ink outline-none focus:border-brand";

function SettingsField({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="mt-4 block first:mt-0">
      <span className={SET_LABEL}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        className={SET_FIELD}
      />
    </label>
  );
}

// Backend freezes a running campaign's terms; only draft/scheduled are editable
// (CampaignService._EDITABLE_STATUSES). Mirror that here so the form is only
// shown when the PUT would actually succeed.
const EDITABLE_STATUSES = new Set(["draft", "scheduled"]);

// rule.group_checkin_window is adapted to a "N min" string; pull the integer
// back out for the numeric field (empty when unset).
function parseMinutes(s: string | null): string {
  const m = s?.match(/\d+/);
  return m ? m[0] : "";
}

function SettingsReadOnly({ c }: { c: CampaignDetailTabs["settings"] }): JSX.Element {
  const t = useT();
  return (
    <div className="flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
      <SettingsRow label={t("cmp.biz.form.name")} value={c.name} />
      <SettingsRow label={t("cmp.biz.form.reward")} value={c.reward.title || "—"} />
      <SettingsRow
        label={t("cmp.biz.form.maxParticipants")}
        value={c.max_participants == null ? "∞" : String(c.max_participants)}
      />
      <SettingsRow
        label={t("cmp.biz.form.repeat")}
        value={t(c.repeat_policy === "repeatable" ? "cmp.rule.repeatable" : "cmp.rule.repeatOnce")}
      />
      {c.type === "social" && c.instagram_handle && (
        <SettingsRow label={t("cmp.biz.form.instagram")} value={c.instagram_handle} />
      )}
    </div>
  );
}

function SettingsTab({ id, tabs }: { id: string; tabs: CampaignDetailTabs }) {
  const t = useT();
  const errMessage = useErrMessage();
  const c = tabs.settings;
  const update = useUpdateCampaign();
  const editable = EDITABLE_STATUSES.has(c.status);

  const [name, setName] = useState(c.name);
  const [rewardTitle, setRewardTitle] = useState(c.reward.title);
  const [maxP, setMaxP] = useState(c.max_participants == null ? "" : String(c.max_participants));
  const [repeatable, setRepeatable] = useState(c.repeat_policy === "repeatable");
  const [requiredCount, setRequiredCount] = useState(
    c.rule.required_count == null ? "" : String(c.rule.required_count),
  );
  const [groupSize, setGroupSize] = useState(
    c.rule.required_group_size == null ? "" : String(c.rule.required_group_size),
  );
  const [checkin, setCheckin] = useState(parseMinutes(c.rule.group_checkin_window));

  const invalid = !name.trim() || !rewardTitle.trim();

  function toNum(s: string): number | null {
    const n = Number(s);
    return s.trim() === "" || !Number.isFinite(n) ? null : n;
  }

  function onSave() {
    if (invalid || update.isPending) return;
    const patch: Partial<CampaignPayload> = {
      // `type` steers toCampaignWritePayload to the right rule branch; the
      // backend ignores type changes on an existing campaign.
      type: c.type,
      name: name.trim(),
      reward_title: rewardTitle.trim(),
      max_participants: toNum(maxP),
      repeat_policy: repeatable ? "repeatable" : "once",
    };
    if (c.type === "individual") {
      patch.mechanic = c.rule.mechanic ?? "visit";
      const rc = toNum(requiredCount);
      if (rc != null) patch.required_count = rc;
    } else if (c.type === "group") {
      const gs = toNum(groupSize);
      const cw = toNum(checkin);
      if (gs != null) patch.required_group_size = gs;
      if (cw != null) patch.group_checkin_window_minutes = cw;
    }
    update.mutate({ id, patch });
  }

  return (
    <div className="mt-[22px] max-w-md">
      <div className="mb-3 flex items-center gap-2">
        <TypeBadge type={c.type} />
        <StatusPill status={c.status} />
      </div>

      {!editable ? (
        <>
          <p className="mb-3 text-[12.5px] font-semibold text-subtle">{t("cmp.biz.settings.frozen")}</p>
          <SettingsReadOnly c={c} />
        </>
      ) : (
        <div className="rounded-2xl border border-line bg-card p-5">
          <SettingsField label={t("cmp.biz.form.name")} value={name} onChange={setName} />
          <SettingsField
            label={t("cmp.biz.form.rewardTitle")}
            value={rewardTitle}
            onChange={setRewardTitle}
          />
          {c.type === "individual" && (
            <SettingsField
              label={t("cmp.biz.form.requiredVisits")}
              value={requiredCount}
              onChange={setRequiredCount}
              inputMode="numeric"
            />
          )}
          {c.type === "group" && (
            <div className="mt-4 flex gap-3.5">
              <div className="flex-1">
                <SettingsField
                  label={t("cmp.biz.form.groupSize")}
                  value={groupSize}
                  onChange={setGroupSize}
                  inputMode="numeric"
                />
              </div>
              <div className="flex-1">
                <SettingsField
                  label={t("cmp.biz.form.checkinWindow")}
                  value={checkin}
                  onChange={setCheckin}
                  inputMode="numeric"
                />
              </div>
            </div>
          )}
          <SettingsField
            label={t("cmp.biz.form.maxParticipants")}
            value={maxP}
            onChange={setMaxP}
            inputMode="numeric"
          />
          <button
            type="button"
            onClick={() => setRepeatable((r) => !r)}
            aria-pressed={repeatable}
            className="mt-4 flex w-full items-center gap-2.5 rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-left"
          >
            <span
              className={`flex h-6 w-6 flex-none items-center justify-center rounded-md text-xs font-bold ${
                repeatable ? "bg-brand text-brand-fg" : "border border-line text-transparent"
              }`}
              aria-hidden
            >
              ✓
            </span>
            <span className="text-[13.5px] font-semibold text-ink">{t("cmp.biz.form.repeat")}</span>
          </button>

          {update.isError && (
            <p className="mt-3 text-[12.5px] font-semibold text-danger">{errMessage(update.error)}</p>
          )}
          {update.isSuccess && !update.isPending && (
            <p className="mt-3 text-[12.5px] font-semibold text-brand-deep">{t("cmp.biz.settings.saved")}</p>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={invalid || update.isPending}
            className="mt-4 w-full rounded-xl bg-brand py-3.5 text-[14.5px] font-bold text-brand-fg shadow-glow transition active:scale-[.99] disabled:opacity-60"
          >
            {update.isPending ? t("cmp.biz.settings.saving") : t("cmp.biz.settings.save")}
          </button>
        </div>
      )}
    </div>
  );
}
