"use client";

// Business campaigns — Detail (plan §2.4, design BUSINESS · detail). Gradient hero,
// lifecycle controls (pause / resume / end / duplicate / publish), and three tabs:
// Overview (metrics + reward + rules), Participants, Vouchers. Wired to the business
// campaign hooks; mutations invalidate the relevant keys (handled in the hooks).

import {
  useBusinessCampaign,
  useBusinessMe,
  useCampaignAction,
  useCampaignParticipants,
  useCampaignVouchers,
  useCancelCampaignVoucher,
  useDuplicateCampaign,
  useUploadCampaignImage,
  type BusinessCampaign,
  type CampaignLifecycleAction,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge } from "@jaqyn/ui";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { OwnerShell } from "../../_components/OwnerShell";
import { SocialPostStudio } from "../../_components/SocialPostStudio";
import { StatusPill, TYPE_GLYPH, VoucherStatusPill, ruleSummary } from "../../_components/campaigns";
import { QueryBoundary } from "../../../_components/QueryBoundary";
import { useErrMessage } from "../../../_lib/useErrMessage";
import { useRequireAuth } from "../../../_lib/auth";
import { ruleLinesFor } from "./rules";

type Tab = "overview" | "participants" | "vouchers";

const PANEL = "rounded-[18px] border border-line bg-card p-5";

export default function CampaignDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, ready } = useRequireAuth();
  const campaign = useBusinessCampaign(id);

  return (
    <OwnerShell title={t("cmp.biz.title")}>
      {!ready || !isAuthenticated ? null : (
        <QueryBoundary query={campaign}>{(c) => <Detail campaign={c} />}</QueryBoundary>
      )}
    </OwnerShell>
  );
}

function Detail({ campaign: c }: { campaign: BusinessCampaign }) {
  const t = useT();
  const router = useRouter();
  const errMessage = useErrMessage();
  const [tab, setTab] = useState<Tab>("overview");

  const action = useCampaignAction();
  const duplicate = useDuplicateCampaign();
  const me = useBusinessMe();
  const uploadImage = useUploadCampaignImage(c.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [studioOpen, setStudioOpen] = useState(false);

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (file) uploadImage.mutate(file);
  }

  // Available lifecycle controls per status (plan §1.3 / design controls).
  const controls: { action: CampaignLifecycleAction; labelKey: string }[] = [];
  if (c.status === "draft" || c.status === "scheduled")
    controls.push({ action: "publish", labelKey: "cmp.biz.ctrl.publish" });
  if (c.status === "active") controls.push({ action: "pause", labelKey: "cmp.biz.ctrl.pause" });
  if (c.status === "paused") controls.push({ action: "resume", labelKey: "cmp.biz.ctrl.resume" });
  if (c.status === "active" || c.status === "paused" || c.status === "scheduled")
    controls.push({ action: "end", labelKey: "cmp.biz.ctrl.end" });

  const tabs: Tab[] = ["overview", "participants", "vouchers"];
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
        <div
          className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl bg-white/15 text-3xl"
          aria-hidden
        >
          {c.glyph || TYPE_GLYPH[c.type]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[22px] font-bold">{c.name}</h1>
            <StatusPill status={c.status} />
          </div>
          <p className="mt-1 text-[13px] opacity-85">
            {t(`cmp.type.${c.type}`)} · {c.start_label} – {c.end_label} ·{" "}
            {ruleSummary(t, c.type, {
              type: c.type,
              name: c.name,
              required_count: c.rule.required_count,
              required_group_size: c.rule.required_group_size,
              window_before_time: c.rule.window_before_time,
            })}
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPickPhoto}
          className="hidden"
        />
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
            onClick={() => action.mutate({ id: c.id, action: ctrl.action })}
            disabled={busy}
            className="rounded-xl border-[1.5px] border-line bg-card px-4 py-2.5 text-[13px] font-semibold text-ink transition active:scale-[.99] disabled:opacity-60"
          >
            {t(ctrl.labelKey)}
          </button>
        ))}
        <button
          onClick={() =>
            duplicate.mutate(c.id, {
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
      <div className="mt-[22px] flex gap-1 border-b border-line">
        {tabs.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            aria-current={tab === tb}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[13.5px] font-semibold transition ${
              tab === tb ? "border-brand text-brand-deep" : "border-transparent text-subtle"
            }`}
          >
            {t(`cmp.biz.tab.${tb}`)}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab campaign={c} />}
      {tab === "participants" && <ParticipantsTab id={c.id} />}
      {tab === "vouchers" && <VouchersTab id={c.id} />}

      {studioOpen && (
        <SocialPostStudio
          campaignId={c.id}
          campaignName={c.name}
          businessName={me.data?.display_name || me.data?.name || ""}
          onClose={() => setStudioOpen(false)}
        />
      )}
    </div>
  );
}

// ---- Overview --------------------------------------------------------------

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="text-xs font-semibold text-subtle">{label}</div>
      <div className="mt-2 font-display text-2xl font-extrabold leading-none text-ink">{value}</div>
    </div>
  );
}

function OverviewTab({ campaign: c }: { campaign: BusinessCampaign }) {
  const t = useT();
  const a = c.analytics;
  return (
    <>
      <div className="mt-[22px] grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Metric label={t("cmp.biz.metric.views")} value={String(a.views)} />
        <Metric label={t("cmp.biz.metric.joined")} value={String(a.joined)} />
        <Metric label={t("cmp.biz.metric.active")} value={String(a.active)} />
        <Metric label={t("cmp.biz.metric.completed")} value={String(a.completed)} />
        <Metric label={t("cmp.biz.metric.issued")} value={String(a.issued)} />
        <Metric label={t("cmp.biz.metric.redeemed")} value={String(a.redeemed)} />
        <Metric
          label={t("cmp.biz.metric.redemptionRate")}
          value={`${Math.round(a.redemption_rate * 100)}%`}
        />
        <Metric label={t("cmp.biz.metric.estCost")} value={a.estimated_cost} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className={PANEL}>
          <h3 className="font-display text-[15px] font-bold text-ink">
            {t("cmp.biz.overview.reward")}
          </h3>
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
          <p className="mt-3.5 text-[12.5px] leading-relaxed text-subtle">
            {t("cmp.biz.overview.rewardMeta")
              .replace("{days}", String(c.reward.expiry_days_after_unlock))
              .replace("{max}", c.reward.max_redemptions == null ? "∞" : String(c.reward.max_redemptions))
              .replace("{type}", t(`cmp.biz.wiz.rewardType.${rewardTypeKey(c.reward.type)}`))}
          </p>
        </div>

        <div className={PANEL}>
          <h3 className="font-display text-[15px] font-bold text-ink">
            {t("cmp.biz.overview.rules")}
          </h3>
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
    </>
  );
}

// Reward type may arrive as a backend code we don't have a label for; fall back to
// "custom" so the i18n lookup never misses.
function rewardTypeKey(type: string): "free_item" | "discount" | "upgrade" | "custom" {
  return type === "free_item" || type === "discount" || type === "upgrade" ? type : "custom";
}

// ---- Participants ----------------------------------------------------------

const PART_COLS = "grid grid-cols-[2fr_1fr_1.3fr_1.3fr_1.2fr] items-center";

function ParticipantsTab({ id }: { id: string }) {
  const t = useT();
  const q = useCampaignParticipants(id);
  return (
    <QueryBoundary query={q} isEmpty={(rows) => rows.length === 0} emptyMessage={t("cmp.biz.part.empty")}>
      {(rows) => (
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
      )}
    </QueryBoundary>
  );
}

// ---- Vouchers --------------------------------------------------------------

const VOUCH_COLS = "grid grid-cols-[1.2fr_1.6fr_1fr_1fr_1fr_1.1fr] items-center";

function VouchersTab({ id }: { id: string }) {
  const t = useT();
  const q = useCampaignVouchers(id);
  const cancel = useCancelCampaignVoucher();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  return (
    <QueryBoundary query={q} isEmpty={(rows) => rows.length === 0} emptyMessage={t("cmp.biz.vouch.empty")}>
      {(rows) => (
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
                <span className="font-mono text-[13px] font-bold tracking-[0.04em] text-ink">
                  {v.code}
                </span>
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

          {/* cancel-voucher modal (manager-only; requires a reason — plan §1.2) */}
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
                <h3 className="font-display text-[16px] font-bold text-ink">
                  {t("cmp.biz.vouch.cancelConfirm")}
                </h3>
                <label className="mt-3 block">
                  <span className="text-[12px] font-bold text-subtle">
                    {t("cmp.biz.vouch.cancelReason")}
                  </span>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    autoFocus
                    className="mt-1.5 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-sm font-semibold text-ink outline-none focus:border-brand"
                  />
                </label>
                {cancel.isError && (
                  <p className="mt-2 text-[12.5px] font-semibold text-danger">
                    {t("common.error")}
                  </p>
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
                      cancel.mutate(
                        { id: cancelId, reason: reason.trim() },
                        { onSuccess: () => setCancelId(null) },
                      )
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
        </div>
      )}
    </QueryBoundary>
  );
}
