"use client";

import {
  useAwardLoyaltyBatch,
  useConfirmGroup,
  useConfirmSocial,
  useConfirmVisitUnified,
  useRedeemCampaignVoucher,
  useRedeemVoucherById,
  useResolveScan,
} from "@jaqyn/api";
import type {
  ActiveVoucher,
  CampaignScanRow,
  CampaignVoucherScanResult,
  ConfirmGroupResult,
  GroupScanResult,
  LoyaltyBatchAward,
  LoyaltyBatchResult,
  ScanCustomerResult,
  ScanDispatchResult,
  UnifiedCampaignLeg,
  UnifiedScanResult,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { type ChangeEvent, type CSSProperties, useEffect, useRef, useState } from "react";
import { QrScanner, parseScanned } from "../../_components/QrScanner";
import { useErrMessage } from "../../_lib/useErrMessage";
import { useStaffAuth } from "../_lib/staffAuth";
import { StaffNav } from "../_components/StaffNav";
import { Sheet } from "@jaqyn/ui";

// ─── overlay state ──────────────────────────────────────────────────────────────

type OverlayState =
  // The "Apply loyalty" chooser — one row per program, choose one to advance.
  | { kind: "chooser"; result: ScanCustomerResult }
  // Bill-amount keypad for a spend / spend-basis-points program.
  | { kind: "amount"; result: ScanCustomerResult; row: CampaignScanRow }
  // Focused success for the single program that was just confirmed. `awarded` is
  // the points added this confirm (null for non-points programs).
  | { kind: "single_result"; leg: UnifiedCampaignLeg; customerName: string; awarded: number | null }
  // Combined-collect success: one confirm applied several loyalty legs.
  | { kind: "batch_result"; result: LoyaltyBatchResult }
  // Group session scanned — full roster for the member-checklist sheet.
  | { kind: "group_eligible"; group: GroupScanResult }
  | { kind: "reward_valid"; result: CampaignVoucherScanResult }
  | { kind: "reward_redeemed"; rewardTitle: string }
  | { kind: "group_done"; result: ConfirmGroupResult }
  | { kind: "invalid"; title: string; reason: string }
  | { kind: "error"; message: string }
  | null;

// ─── multi-form loyalty helpers ─────────────────────────────────────────────────

/** True when spend-basis points require a bill before confirmation. */
function needsAmount(row: CampaignScanRow): boolean {
  if (row.mechanic === "points") return row.points_per_som != null;
  return false;
}

/** Cashback percentage for a points program, or null when not computable.
 *  pct = round(points_per_som × cashback_per_point × 100). Both come from the
 *  business config as decimal strings; parsed here only for display. */
function cashbackPct(row: CampaignScanRow): number | null {
  if (row.points_per_som == null || row.cashback_per_point == null) return null;
  const pps = Number(row.points_per_som);
  const cpp = Number(row.cashback_per_point);
  if (!Number.isFinite(pps) || !Number.isFinite(cpp)) return null;
  return Math.round(pps * cpp * 100);
}

// ─── shared sheet primitives ────────────────────────────────────────────────────

/** A one-shot color wash over the screen, used to punctuate a success result. */
function Flash({ color }: { color: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: color, animation: "jqFlash .9s ease forwards" }}
    />
  );
}

/** Thin bar pinned to the sheet's top edge that depletes over `duration`, then
 *  auto-dismisses. Mirrors the loyalty scanner's countdown affordance. */
function CountdownBar({ duration, onDone }: { duration: number; onDone: () => void }) {
  const cb = useRef(onDone);
  cb.current = onDone;
  useEffect(() => {
    const id = setTimeout(() => cb.current(), duration);
    return () => clearTimeout(id);
  }, [duration]);
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, borderRadius: "30px 30px 0 0", overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          background: "var(--sage, #3F7355)",
          transformOrigin: "left",
          animation: `jqCountdown ${duration}ms linear forwards`,
        }}
      />
    </div>
  );
}

// ─── combined collect panel (loyalty rows — one confirm for the whole order) ───

/** Loyalty rows the collect panel drives (campaign_type "loyalty"). */
function isLoyaltyRow(row: CampaignScanRow): boolean {
  return row.campaign_type === "loyalty";
}

/** Strip the chooser's "loyalty:" prefix back to the raw program id. */
function loyaltyProgramId(row: CampaignScanRow): string {
  return row.campaign_id.replace(/^loyalty:/, "");
}

// Mirrors MAX_AWARD_QUANTITY on the backend award endpoint.
const MAX_STAMP_QUANTITY = 30;

/** Stepper for the stamp quantity: [−] n [+], 44px touch cells. 0 = skip leg. */
function QuantityStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const t = useT();
  const cell = (label: string, onTap: () => void, disabled: boolean, aria: string) => (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      aria-label={aria}
      style={{
        width: 44, height: 44, border: "none", borderRadius: 12,
        background: disabled ? "#F0EAE0" : "#F4ECDF",
        color: disabled ? "var(--soft, #8C7A6A)" : "var(--ink, #2E241D)",
        font: "700 20px 'Bricolage Grotesque',sans-serif",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {cell("−", () => onChange(value - 1), value <= 0, t("staff.collect.decrease"))}
      <span
        aria-live="polite"
        style={{ minWidth: 30, textAlign: "center", font: "800 20px 'Bricolage Grotesque',sans-serif", color: value === 0 ? "var(--soft, #8C7A6A)" : "var(--ink, #2E241D)" }}
      >
        {value}
      </span>
      {cell("+", () => onChange(value + 1), value >= MAX_STAMP_QUANTITY, t("staff.collect.increase"))}
    </div>
  );
}

/**
 * One confirm for the whole till order: a stepper per stamp card (items bought
 * = stamps), a bill field per cashback program (with the customer's status
 * rung + live "+N som" preview), and fixed "+1" legs for visit cards and
 * per-visit points. Zeroed legs are skipped; the confirm sends everything else
 * as one atomic batch.
 */
function CollectPanel({
  rows,
  onConfirm,
  isPending,
}: {
  rows: CampaignScanRow[];
  onConfirm: (awards: LoyaltyBatchAward[]) => void;
  isPending: boolean;
}) {
  const t = useT();
  const stampRows = rows.filter((r) => r.mechanic === "stamp");
  // Spend-basis points (a bill prices the award) = points rows with no flat
  // per-visit rate — flat-rate programs carry points_per_som, tier-ladder
  // programs carry pct_back only.
  const spendRows = rows.filter(
    (r) => r.mechanic === "points" && r.points_per_visit == null,
  );
  // Visit cards and per-visit points: always one fixed "+1" leg per scan.
  const fixedRows = rows.filter((r) => !stampRows.includes(r) && !spendRows.includes(r));

  // One quantity per stamp card (default 1 — the common single-item order) and
  // one bill string per cashback program. Keyed by program id.
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(stampRows.map((r) => [r.campaign_id, 1])),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const awards: LoyaltyBatchAward[] = [
    ...stampRows
      .filter((r) => (quantities[r.campaign_id] ?? 1) > 0)
      .map((r) => ({ program_id: loyaltyProgramId(r), quantity: quantities[r.campaign_id] ?? 1 })),
    ...spendRows
      .filter((r) => Number(amounts[r.campaign_id] ?? "") > 0)
      .map((r) => ({ program_id: loyaltyProgramId(r), amount: amounts[r.campaign_id]! })),
    ...fixedRows.map((r) => ({ program_id: loyaltyProgramId(r) })),
  ];
  const valid = awards.length > 0 && !isPending;

  const line: CSSProperties = {
    display: "flex", alignItems: "center", gap: 11,
    background: "#F8F4EC", borderRadius: 14, padding: "12px 14px",
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--soft, #8C7A6A)" }}>
        {t("staff.collect.title")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 10 }}>
        {stampRows.map((row) => {
          const qty = quantities[row.campaign_id] ?? 1;
          const next = row.current_count + qty;
          const done = row.goal > 0 && next >= row.goal;
          return (
            <div key={row.campaign_id} style={line}>
              <span style={{ fontSize: 20 }} aria-hidden>☕</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", font: "700 13.5px 'Hanken Grotesk',sans-serif", color: "var(--ink, #2E241D)" }}>{row.name}</span>
                <span style={{ display: "block", fontSize: 12, color: done && qty > 0 ? "#B07A1E" : "var(--soft, #8C7A6A)", marginTop: 1, fontWeight: 600 }}>
                  {qty > 0
                    ? `${row.current_count} → ${next}${row.goal ? ` / ${row.goal}` : ""}${done ? " 🎁" : ""}`
                    : `${row.current_count}${row.goal ? ` / ${row.goal}` : ""}`}
                </span>
              </span>
              <QuantityStepper
                value={qty}
                onChange={(v) => setQuantities((q) => ({ ...q, [row.campaign_id]: v }))}
              />
            </div>
          );
        })}

        {spendRows.map((row) => {
          const amount = amounts[row.campaign_id] ?? "";
          const pct = row.pct_back != null ? Number(row.pct_back) : null;
          const somBack = pct != null && Number(amount) > 0 ? Math.floor((Number(amount) * pct) / 100) : null;
          return (
            <div key={row.campaign_id} style={{ ...line, alignItems: "flex-start" }}>
              <span style={{ fontSize: 20, marginTop: 4 }} aria-hidden>⭐</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ font: "700 13.5px 'Hanken Grotesk',sans-serif", color: "var(--ink, #2E241D)" }}>{row.name}</span>
                  {pct != null && (
                    <span style={{ font: "700 10.5px 'Hanken Grotesk',sans-serif", padding: "3px 8px", borderRadius: 99, background: "#FBEFD9", color: "#B07A1E" }}>
                      {row.tier_name ? `${row.tier_name} · ` : ""}{pct}%
                    </span>
                  )}
                </span>
                <span style={{ display: "block", fontSize: 12, color: "#3F7355", fontWeight: 600, marginTop: 3, minHeight: 15 }}>
                  {somBack != null ? t("staff.collect.cashbackPreview").replace("{som}", String(somBack)) : ""}
                </span>
              </span>
              <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{t("staff.collect.bill")}</span>
                <input
                  value={amount}
                  onChange={(e) => {
                    // Whole som, digits only — same rule as the bill keypad.
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
                    setAmounts((a) => ({ ...a, [row.campaign_id]: digits }));
                  }}
                  inputMode="numeric"
                  placeholder="0"
                  style={{
                    width: 86, padding: "11px 10px", borderRadius: 12,
                    border: "1.5px solid var(--line, #EFE3D1)", background: "#fff",
                    font: "800 17px 'Bricolage Grotesque',sans-serif", color: "var(--ink, #2E241D)",
                    textAlign: "right", outline: "none",
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--soft, #8C7A6A)" }}>{t("staff.amount.som")}</span>
              </label>
            </div>
          );
        })}

        {fixedRows.map((row) => (
          <div key={row.campaign_id} style={line}>
            <span style={{ fontSize: 20 }} aria-hidden>{row.mechanic === "points" ? "⭐" : "📍"}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", font: "700 13.5px 'Hanken Grotesk',sans-serif", color: "var(--ink, #2E241D)" }}>{row.name}</span>
              <span style={{ display: "block", fontSize: 12, color: "var(--soft, #8C7A6A)", marginTop: 1 }}>
                {row.goal ? `${row.current_count} / ${row.goal}` : ""}
              </span>
            </span>
            <span style={{ font: "700 13px 'Bricolage Grotesque',sans-serif", color: "var(--accent, #C25E3C)", whiteSpace: "nowrap" }}>
              {row.mechanic === "points"
                ? t("staff.collect.plusPoints").replace("{n}", String(row.points_per_visit ?? 0))
                : t("staff.collect.plusVisit")}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => valid && onConfirm(awards)}
        disabled={!valid}
        style={{
          width: "100%", marginTop: 12, padding: 15, border: "none", borderRadius: 15,
          background: valid ? "var(--accent, #C25E3C)" : "#EFE3D1",
          color: valid ? "#fff" : "var(--soft, #8C7A6A)",
          font: "700 15.5px 'Hanken Grotesk',sans-serif",
          cursor: valid ? "pointer" : "not-allowed",
          boxShadow: valid ? "0 12px 26px -8px rgba(160,73,42,.55)" : "none",
        }}
      >
        {isPending ? "…" : t("staff.collect.confirm")}
      </button>
    </div>
  );
}

// ─── sheet: loyalty chooser ("Apply loyalty" — pure choose-one) ─────────────────

// One tap per tile/row does it: visit/stamp/social confirm immediately; spend /
// spend-basis points open the bill keypad. Eligible tiles first; ineligible at
// 55% with reason. Redeem entry is pinned at top when active_vouchers is present.
function LoyaltyChooserSheet({
  result,
  onCollect,
  collectPending,
  onPickRow,
  onConfirmRow,
  onConfirmSocial,
  onRedeemVoucher,
  onDismiss,
  pendingCampaignId,
  redeemPending,
}: {
  result: ScanCustomerResult;
  // Combined collect: one confirm for all loyalty legs (stamps + cashback).
  onCollect: (awards: LoyaltyBatchAward[]) => void;
  collectPending: boolean;
  // Spend / spend-basis points → open the keypad for this row.
  onPickRow: (row: CampaignScanRow) => void;
  // One-tap mechanics (visit / stamp / visit-basis points) → confirm now.
  onConfirmRow: (row: CampaignScanRow) => void;
  // Social → confirm the post now.
  onConfirmSocial: (row: CampaignScanRow) => void;
  // Redeem a specific voucher by id from the active_vouchers list.
  onRedeemVoucher: (v: ActiveVoucher) => void;
  onDismiss: () => void;
  // The campaign currently being confirmed (so its action shows a spinner).
  pendingCampaignId: string | null;
  redeemPending: boolean;
}) {
  const t = useT();
  const initial = (result.customer.name.trim()[0] ?? "•").toUpperCase();
  // Loyalty programs go to the combined collect panel (one confirm covers the
  // whole order); campaign rows stay as one-tap tiles, eligible first. GROUP
  // campaigns are excluded at the adapter layer (B2 spec).
  const loyaltyRows = result.rows.filter(isLoyaltyRow);
  const rows = result.rows
    .filter((row) => !isLoyaltyRow(row))
    .sort((a, b) => Number(b.eligible) - Number(a.eligible));
  const vouchers = result.active_vouchers;

  // Local picker state: when multiple vouchers exist, show a mini-list before
  // confirming. Single voucher → confirm directly on tap.
  const [pickingVoucher, setPickingVoucher] = useState(false);

  return (
    <Sheet
      open
      onOpenChange={(o) => { if (!o) onDismiss(); }}
      variant="modal"
      surface="card"
      showGrabber={false}
      ariaLabel={t("staff.chooser.title")}
    >
      {/* Customer header */}
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{
          width: 42, height: 42, borderRadius: "50%", background: "#F4ECDF",
          display: "flex", alignItems: "center", justifyContent: "center",
          font: "800 16px 'Bricolage Grotesque',sans-serif", color: "var(--accent, #C25E3C)",
        }}>{initial}</div>
        <div>
          <div style={{ font: "700 16px 'Bricolage Grotesque',sans-serif" }}>{result.customer.name}</div>
          <div style={{ fontSize: 12, color: "var(--soft, #8C7A6A)" }}>+996 {maskPhone(result.customer.phone)}</div>
        </div>
      </div>

      {/* ── Redeem entry: pinned at top when customer has active vouchers ── */}
      {vouchers.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {!pickingVoucher ? (
            <button
              type="button"
              disabled={redeemPending}
              onClick={() => {
                if (vouchers.length === 1) {
                  onRedeemVoucher(vouchers[0]!);
                } else {
                  setPickingVoucher(true);
                }
              }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "13px 15px", border: "none", borderRadius: 14,
                background: "linear-gradient(135deg, #C25E3C, #A2492A)",
                color: "#fff", cursor: redeemPending ? "wait" : "pointer",
                boxShadow: "0 8px 20px -6px rgba(160,73,42,.5)",
                opacity: redeemPending ? 0.7 : 1,
              }}
            >
              <span style={{ fontSize: 22 }}>🎁</span>
              <span style={{ flex: 1, textAlign: "left" }}>
                <span style={{ display: "block", font: "700 14.5px 'Hanken Grotesk',sans-serif" }}>
                  {redeemPending ? "…" : t("staff.chooser.redeemEntry")}
                </span>
                <span style={{ display: "block", fontSize: 12, opacity: 0.82, marginTop: 1 }}>
                  {vouchers.length === 1
                    ? vouchers[0]!.label
                    : t("staff.chooser.voucherCount").replace("{n}", String(vouchers.length))}
                </span>
              </span>
              <span style={{ fontSize: 16, opacity: 0.7 }}>›</span>
            </button>
          ) : (
            /* Multi-voucher picker list */
            <div style={{ border: "1.5px solid var(--line, #EFE3D1)", borderRadius: 14, overflow: "hidden" }}>
              {vouchers.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => { setPickingVoucher(false); onRedeemVoucher(v); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 15px", border: "none", borderBottom: "1px solid var(--line, #EFE3D1)",
                    background: "#fff", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 18 }}>🎁</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", font: "700 13.5px 'Hanken Grotesk',sans-serif", color: "var(--ink, #2E241D)" }}>{v.label}</span>
                    {v.expires_label && (
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--soft, #8C7A6A)", marginTop: 1 }}>{v.expires_label}</span>
                    )}
                  </span>
                  <span style={{ fontSize: 14, color: "var(--accent, #C25E3C)", fontWeight: 700 }}>›</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPickingVoucher(false)}
                style={{ width: "100%", padding: "10px 15px", border: "none", background: "#FAFAFA", color: "var(--soft, #8C7A6A)", font: "600 13px 'Hanken Grotesk',sans-serif", cursor: "pointer" }}
              >
                {t("common.cancel")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Combined collect: all loyalty legs, one confirm ── */}
      {loyaltyRows.length > 0 && (
        <CollectPanel rows={loyaltyRows} onConfirm={onCollect} isPending={collectPending} />
      )}

      {/* ── Program tiles (campaigns) ── */}
      {rows.length > 0 && (
        <>
          <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--soft, #8C7A6A)", marginTop: vouchers.length > 0 || loyaltyRows.length > 0 ? 18 : 16 }}>
            {t("staff.chooser.redeemPrograms")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 9, marginTop: 10 }}>
            {rows.map((row) => (
              <ProgramTile
                key={row.campaign_id}
                row={row}
                pending={pendingCampaignId === row.campaign_id}
                onPick={onPickRow}
                onConfirm={onConfirmRow}
                onConfirmSocial={onConfirmSocial}
              />
            ))}
          </div>
        </>
      )}

      {rows.length === 0 && loyaltyRows.length === 0 && vouchers.length === 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F6F0E6", borderRadius: 13, padding: "12px 14px", marginTop: 16 }}>
          <span style={{ fontSize: 16 }}>🚫</span>
          <div style={{ fontSize: 12.5, color: "var(--soft, #8C7A6A)", lineHeight: 1.4 }}>
            {t("staff.campaign.noneEligible")}
          </div>
        </div>
      )}

      {result.none_eligible && rows.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--soft, #8C7A6A)", textAlign: "center", lineHeight: 1.4 }}>
          {t("staff.campaign.noneEligible")}
        </div>
      )}

      <button
        type="button"
        onClick={onDismiss}
        style={{ width: "100%", marginTop: 14, padding: 12, border: "none", borderRadius: 14, background: "none", color: "var(--soft, #8C7A6A)", font: "600 14px 'Hanken Grotesk',sans-serif", cursor: "pointer" }}
      >
        {t("common.cancel")}
      </button>
    </Sheet>
  );
}

// Mask the middle of the phone for the chooser header (e.g. "70••••567").
function maskPhone(phone: string): string {
  const p = phone.replace(/\s/g, "");
  if (p.length <= 5) return p;
  return `${p.slice(0, 2)}••••${p.slice(-3)}`;
}

// Program tile — 2–3 columns in the chooser grid. Big mechanic icon + one word
// label + program name as the small second line. ONE TAP confirms (or opens keypad).
function ProgramTile({
  row,
  pending,
  onPick,
  onConfirm,
  onConfirmSocial,
}: {
  row: CampaignScanRow;
  pending: boolean;
  onPick: (row: CampaignScanRow) => void;
  onConfirm: (row: CampaignScanRow) => void;
  onConfirmSocial: (row: CampaignScanRow) => void;
}) {
  const t = useT();

  let icon: string;
  let word: string;
  let onAction: () => void;

  if (row.mechanic === "stamp") {
    icon = "☕"; word = t("staff.scan.progStamp"); onAction = () => onConfirm(row);
  } else if (row.mechanic === "points") {
    icon = "⭐";
    if (row.points_per_som != null) {
      word = t("staff.chooser.enterBill"); onAction = () => onPick(row);
    } else {
      word = t("staff.chooser.addPoints").replace("{n}", String(row.points_per_visit ?? 0));
      onAction = () => onConfirm(row);
    }
  } else if (row.mechanic === "social") {
    icon = "📢"; word = t("staff.chooser.confirmPost"); onAction = () => onConfirmSocial(row);
  } else {
    icon = "📍"; word = t("staff.scan.progSpend"); onAction = () => onConfirm(row);
  }

  const disabled = !row.eligible || pending;

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onAction}
      disabled={disabled}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 5, padding: "14px 8px", border: "none", borderRadius: 14,
        background: disabled ? "#F0EAE0" : "#F8F4EC",
        opacity: row.eligible ? 1 : 0.55,
        cursor: disabled ? "not-allowed" : "pointer",
        minHeight: 88,
      }}
    >
      <span style={{ fontSize: 26 }}>{pending ? "⏳" : icon}</span>
      <span style={{ font: "700 12px 'Hanken Grotesk',sans-serif", color: disabled ? "var(--soft, #8C7A6A)" : "var(--ink, #2E241D)", textAlign: "center", lineHeight: 1.2 }}>
        {word}
      </span>
      <span style={{ fontSize: 10.5, color: "var(--soft, #8C7A6A)", textAlign: "center", lineHeight: 1.2, maxWidth: "100%" }}>
        {row.eligible ? row.name : humanizeReason(t, row.reason)}
      </span>
    </button>
  );
}

// Humanize a backend reason_code into a sentence, falling back to the raw code.
// Keys live under staff.reason.*; an unknown code shows itself so it's never lost.
function humanizeReason(t: (k: string) => string, code: string | null): string {
  if (!code) return "";
  const key = `staff.reason.${code}`;
  const copy = t(key);
  return copy === key ? code : copy;
}

// ─── sheet: bill-amount keypad (spend / spend-basis points) ─────────────────────

function AmountSheet({
  row,
  onConfirm,
  onBack,
  isPending,
}: {
  row: CampaignScanRow;
  onConfirm: (amount: string) => void;
  onBack: () => void;
  isPending: boolean;
}) {
  const t = useT();
  // Whole som only — the bill amount is keyed digit by digit as a string so no
  // float is introduced; leading "0" is dropped.
  const [amount, setAmount] = useState("0");
  const amountNum = Number(amount);
  const valid = amountNum > 0 && !isPending;

  const press = (d: string) => setAmount((a) => (a === "0" ? d : a + d));
  const backspace = () => setAmount((a) => (a.length <= 1 ? "0" : a.slice(0, -1)));

  const isPoints = row.mechanic === "points";
  const pps = isPoints && row.points_per_som != null ? Number(row.points_per_som) : 0;
  const cpp = isPoints && row.cashback_per_point != null ? Number(row.cashback_per_point) : 0;
  const awardedPts = Math.floor(pps * amountNum);
  const somBack = Math.floor(pps * amountNum * cpp);

  const confirmLabel = isPoints ? t("staff.amount.award") : t("staff.amount.count");
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  return (
    <Sheet
      open
      onOpenChange={(o) => { if (!o) onBack(); }}
      variant="modal"
      surface="card"
      showGrabber={false}
      ariaLabel={t("staff.amount.enterBill")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label={t("common.back")}
          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--soft, #8C7A6A)", font: "700 18px 'Hanken Grotesk',sans-serif", padding: "2px 6px" }}
        >
          ‹
        </button>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{row.name}</div>
      </div>

      <div style={{ fontSize: 12, color: "var(--soft, #8C7A6A)", marginTop: 12 }}>
        {t("staff.amount.enterBill")}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6, marginTop: 4 }}>
        <span style={{ font: "800 44px 'Bricolage Grotesque',sans-serif", letterSpacing: "-.02em" }}>{amount}</span>
        <span style={{ fontSize: 16, color: "var(--soft, #8C7A6A)", fontWeight: 700 }}>{t("staff.amount.som")}</span>
      </div>

      {isPoints && (
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "#3F7355", fontWeight: 600, minHeight: 18 }}>
          {amountNum > 0
            ? t("staff.amount.pointsPreview")
                .replace("{pts}", String(awardedPts))
                .replace("{som}", String(somBack))
            : ""}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 9, marginTop: 16 }}>
        {keys.map((k, i) =>
          k === "" ? (
            <div key={`spacer-${i}`} />
          ) : (
            <button
              key={k}
              type="button"
              onClick={() => (k === "⌫" ? backspace() : press(k))}
              aria-label={k === "⌫" ? t("staff.amount.backspace") : k}
              style={{
                padding: "16px 0", border: "none", borderRadius: 14, background: "#F4ECDF",
                font: "700 22px 'Bricolage Grotesque',sans-serif", color: "var(--ink, #2E241D)", cursor: "pointer",
              }}
            >
              {k}
            </button>
          ),
        )}
      </div>

      <button
        type="button"
        onClick={() => onConfirm(amount)}
        disabled={!valid}
        style={{
          width: "100%", marginTop: 16, padding: 16, border: "none", borderRadius: 16,
          background: valid ? "var(--accent, #C25E3C)" : "#EFE3D1",
          color: valid ? "#fff" : "var(--soft, #8C7A6A)",
          font: "700 16px 'Hanken Grotesk',sans-serif",
          cursor: valid ? "pointer" : "not-allowed",
          boxShadow: valid ? "0 12px 26px -8px rgba(160,73,42,.55)" : "none",
        }}
      >
        {isPending ? "…" : confirmLabel}
      </button>
    </Sheet>
  );
}

// ─── sheet: single-program success (choose-one result) ──────────────────────────

// Focused success for the one program just confirmed. Shows the program name and
// its new state (stamp/visit progress, or points "+awarded → balance"); a reward
// banner appears when the program completed and a voucher was issued. `awarded`
// is the points added this confirm (null for non-points programs), computed by
// the caller from the bill amount since the leg carries only the new balance.
function SingleResultSheet({
  leg,
  customerName,
  awarded,
  onDismiss,
}: {
  leg: UnifiedCampaignLeg;
  customerName: string;
  awarded: number | null;
  onDismiss: () => void;
}) {
  const t = useT();
  const completed = leg.state === "completed";
  const isPoints = awarded != null;

  // A completion warrants the longer, amber celebratory treatment.
  const flashColor = completed ? "var(--amber, #E7A23E)" : "var(--sage, #3F7355)";
  const duration = completed ? 3200 : 2800;

  // The new-state line, by what we know about the leg.
  let stateLine: string;
  if (isPoints) {
    stateLine = t("staff.result.pointsAwarded")
      .replace("{awarded}", String(awarded))
      .replace("{balance}", String(leg.points_balance));
  } else {
    stateLine = t("cmp.staff.campaignProgress")
      .replace("{current}", String(leg.current_count))
      .replace("{goal}", String(leg.goal));
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => { if (!o) onDismiss(); }}
      variant="modal"
      surface="card"
      showGrabber={false}
      ariaLabel={t("cmp.staff.campaignTitle")}
    >
      <Flash color={flashColor} />
      <CountdownBar duration={duration} onDone={onDismiss} />

      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 70, height: 70, borderRadius: "50%", background: "var(--sage, #3F7355)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 36, margin: "0 auto", animation: "jqPop .5s ease",
          boxShadow: "0 14px 30px -8px rgba(94,139,106,.6)",
        }}>✓</div>
        <div style={{ fontSize: 13.5, color: "var(--soft, #8C7A6A)", fontWeight: 600, marginTop: 14 }}>
          {/* Leaner copy: "Saved to their rewards" on completion, else name · counted */}
          {completed ? t("staff.scan.savedToRewards") : `${customerName} · ${t("cmp.staff.bothCounted")}`}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, background: "#F8F4EC", borderRadius: 14, padding: "13px 15px" }}>
          <span style={{ fontSize: 18 }}>🎯</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--soft, #8C7A6A)" }}>{t("cmp.staff.campaignTitle")}</span>
            <span style={{ display: "block", font: "700 15px 'Bricolage Grotesque',sans-serif", marginTop: 2 }}>{leg.campaign_name}</span>
          </span>
          <span style={{ font: "700 15px 'Bricolage Grotesque',sans-serif", whiteSpace: "nowrap", color: "var(--accent, #C25E3C)" }}>
            {stateLine}
          </span>
        </div>

        {completed && (
          <div style={{ background: "#FBEFD9", borderRadius: 14, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 30, animation: "jqPop .5s ease" }}>🎉</div>
            <div style={{ display: "inline-block", background: "#fff", color: "#B07A1E", borderRadius: 11, padding: "7px 14px", marginTop: 8, font: "700 14px 'Bricolage Grotesque',sans-serif" }}>
              🎁 {t("cmp.staff.campaignComplete").replace("{reward}", leg.reward_title ?? "")}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        style={{ width: "100%", marginTop: 16, padding: 13, border: "none", borderRadius: 14, background: "#F4ECDF", color: "var(--ink, #2E241D)", font: "700 15px 'Hanken Grotesk',sans-serif", cursor: "pointer" }}
      >
        {t("staff.result.done")}
      </button>
    </Sheet>
  );
}

// ─── sheet: combined-collect success ────────────────────────────────────────────

// One line per awarded leg (stamps progress / points added), plus an amber
// celebration banner when any leg minted vouchers. Auto-dismisses like the
// single-program result so the till keeps moving.
function BatchResultSheet({
  result,
  onDismiss,
}: {
  result: LoyaltyBatchResult;
  onDismiss: () => void;
}) {
  const t = useT();
  const rewards = result.results.flatMap((row) => row.vouchers.map((v) => v.reward_title));
  const completed = rewards.length > 0;
  const flashColor = completed ? "var(--amber, #E7A23E)" : "var(--sage, #3F7355)";
  const duration = completed ? 3600 : 2800;

  const stateLine = (row: LoyaltyBatchResult["results"][number]): string => {
    if (row.type === "points") {
      return t("staff.result.pointsAwarded")
        .replace("{awarded}", String(row.points_awarded))
        .replace("{balance}", String(row.points_balance));
    }
    const count = row.type === "stamp" ? row.stamps_count : row.visits_count;
    return `${count} / ${row.required_count ?? 0}`;
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => { if (!o) onDismiss(); }}
      variant="modal"
      surface="card"
      showGrabber={false}
      ariaLabel={t("staff.collect.title")}
    >
      <Flash color={flashColor} />
      <CountdownBar duration={duration} onDone={onDismiss} />

      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 70, height: 70, borderRadius: "50%", background: "var(--sage, #3F7355)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 36, margin: "0 auto", animation: "jqPop .5s ease",
          boxShadow: "0 14px 30px -8px rgba(94,139,106,.6)",
        }}>✓</div>
        <div style={{ fontSize: 13.5, color: "var(--soft, #8C7A6A)", fontWeight: 600, marginTop: 14 }}>
          {result.customer} · {t("cmp.staff.bothCounted")}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 18 }}>
        {result.results.map((row) => (
          <div key={row.program_id} style={{ display: "flex", alignItems: "center", gap: 11, background: "#F8F4EC", borderRadius: 14, padding: "12px 15px" }}>
            <span style={{ fontSize: 18 }} aria-hidden>
              {row.type === "stamp" ? "☕" : row.type === "points" ? "⭐" : "📍"}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", font: "700 14px 'Bricolage Grotesque',sans-serif", color: "var(--ink, #2E241D)" }}>{row.name}</span>
              {row.tier_name && (
                <span style={{ display: "block", fontSize: 11.5, color: "var(--soft, #8C7A6A)", marginTop: 1, fontWeight: 600 }}>{row.tier_name}</span>
              )}
            </span>
            <span style={{ font: "700 15px 'Bricolage Grotesque',sans-serif", whiteSpace: "nowrap", color: "var(--accent, #C25E3C)" }}>
              {stateLine(row)}
            </span>
          </div>
        ))}

        {completed && (
          <div style={{ background: "#FBEFD9", borderRadius: 14, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 30, animation: "jqPop .5s ease" }}>🎉</div>
            {rewards.map((reward, i) => (
              <div key={i} style={{ display: "inline-block", background: "#fff", color: "#B07A1E", borderRadius: 11, padding: "7px 14px", marginTop: 8, marginRight: 6, font: "700 14px 'Bricolage Grotesque',sans-serif" }}>
                🎁 {t("cmp.staff.campaignComplete").replace("{reward}", reward)}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        style={{ width: "100%", marginTop: 16, padding: 13, border: "none", borderRadius: 14, background: "#F4ECDF", color: "var(--ink, #2E241D)", font: "700 15px 'Hanken Grotesk',sans-serif", cursor: "pointer" }}
      >
        {t("staff.result.done")}
      </button>
    </Sheet>
  );
}

// ─── sheet: group eligible → confirm ────────────────────────────────────────────

function GroupEligibleSheet({
  group,
  onConfirm,
  onDismiss,
  isPending,
}: {
  group: GroupScanResult;
  onConfirm: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  const t = useT();
  // Local checklist state — UI-only visual aid. A single confirm-group call is
  // the only write; no per-member API exists yet.
  // ponytail: add per-member check-in endpoint if partial-arrival tracking is needed
  const [ticked, setTicked] = useState<Set<number>>(
    () => new Set(group.members.map((m, i) => m.status === "checked_in" ? i : -1).filter(i => i >= 0))
  );

  const checkedInCount = ticked.size;
  const total = group.members.length || group.required_size;

  return (
    <Sheet
      open
      onOpenChange={(o) => { if (!o) onDismiss(); }}
      variant="modal"
      surface="card"
      showGrabber={false}
      ariaLabel={group.campaign_name}
    >
      {/* Campaign name + big check-in count */}
      <div style={{ font: "700 17px 'Bricolage Grotesque',sans-serif", lineHeight: 1.2 }}>{group.campaign_name}</div>
      <div style={{ font: "800 34px 'Bricolage Grotesque',sans-serif", color: "var(--sage, #3F7355)", marginTop: 6, lineHeight: 1 }}>
        {t("staff.groups.checkedInOf")
          .replace("{n}", String(checkedInCount))
          .replace("{total}", String(total))}
      </div>

      {/* Member roster */}
      {group.members.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 14, border: "1px solid var(--line, #EFE3D1)", borderRadius: 14, overflow: "hidden" }}>
          {group.members.map((member, i) => {
            const checked = ticked.has(i);
            return (
              <button
                key={i}
                type="button"
                aria-label={t("staff.groups.memberChecked")}
                onClick={() => setTicked((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i); else next.add(i);
                  return next;
                })}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 15px",
                  border: "none", borderBottom: i < group.members.length - 1 ? "1px solid var(--line, #EFE3D1)" : "none",
                  background: checked ? "#F0F7F2" : "#fff", cursor: "pointer", textAlign: "left",
                }}
              >
                {/* Tick circle */}
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                  background: checked ? "var(--sage, #3F7355)" : "transparent",
                  border: checked ? "none" : "2px solid var(--line, #EFE3D1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 14, fontWeight: 700,
                }}>
                  {checked ? "✓" : ""}
                </div>
                <span style={{ flex: 1, font: "600 14px 'Hanken Grotesk',sans-serif", color: "var(--ink, #2E241D)" }}>
                  {member.name}
                </span>
                {member.is_leader && (
                  <span style={{ font: "700 10.5px 'Hanken Grotesk',sans-serif", padding: "3px 8px", borderRadius: 99, background: "#FBEFD9", color: "#B07A1E" }}>
                    {t("staff.chooser.leader")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={isPending}
        style={{
          width: "100%", marginTop: 18, padding: 18, border: "none", borderRadius: 16,
          background: "var(--sage, #3F7355)", color: "#fff",
          font: "700 17px 'Hanken Grotesk',sans-serif", cursor: "pointer",
          boxShadow: "0 12px 26px -8px rgba(94,139,106,.55)", opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? "…" : t("staff.groups.redeemGroup")}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        style={{ width: "100%", marginTop: 9, padding: 12, border: "none", borderRadius: 14, background: "none", color: "var(--soft, #8C7A6A)", font: "600 14px 'Hanken Grotesk',sans-serif", cursor: "pointer" }}
      >
        {t("common.cancel")}
      </button>
    </Sheet>
  );
}

// ─── sheet: reward valid ────────────────────────────────────────────────────────

function RewardValidSheet({
  result,
  onRedeem,
  onDismiss,
  isPending,
}: {
  result: CampaignVoucherScanResult;
  onRedeem: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  const t = useT();
  // Only show rows that have a value — keeps the card lean.
  const rows: { label: string; value: string }[] = [
    { label: t("staff.campaign.customer"), value: result.customer_name ?? "" },
    { label: t("staff.campaign.campaign"), value: result.campaign_name ?? "" },
    { label: t("staff.campaign.expires"), value: result.expires_label ?? "" },
    { label: t("staff.campaign.code"), value: result.code ?? "" },
  ].filter((r) => !!r.value);
  return (
    <Sheet
      open
      onOpenChange={(o) => { if (!o) onDismiss(); }}
      variant="modal"
      surface="card"
      showGrabber={false}
      ariaLabel={t("staff.campaign.rewardValid")}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#E4F0E7", color: "#3F7355", fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 99 }}>
        ✓ {t("staff.campaign.rewardValid")}
      </div>
      <div style={{ font: "800 25px 'Bricolage Grotesque',sans-serif", marginTop: 14, letterSpacing: "-.01em" }}>
        {result.reward_title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--line, #EFE3D1)", border: "1px solid var(--line, #EFE3D1)", borderRadius: 14, overflow: "hidden", marginTop: 16 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "12px 15px", background: "#fff", fontSize: 13.5 }}>
            <span style={{ color: "var(--soft, #8C7A6A)" }}>{r.label}</span>
            <span style={{ fontWeight: r.label === t("staff.campaign.code") ? 700 : 600, letterSpacing: r.label === t("staff.campaign.code") ? ".06em" : undefined }}>{r.value}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onRedeem}
        disabled={isPending}
        style={{
          width: "100%", marginTop: 20, padding: 20, border: "none", borderRadius: 18,
          background: "var(--sage, #3F7355)", color: "#fff",
          font: "700 18px 'Hanken Grotesk',sans-serif", cursor: "pointer",
          boxShadow: "0 16px 32px -10px rgba(94,139,106,.6)", opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? "…" : t("staff.campaign.redeemReward")}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        style={{ width: "100%", marginTop: 9, padding: 12, border: "none", borderRadius: 14, background: "none", color: "var(--soft, #8C7A6A)", font: "600 14px 'Hanken Grotesk',sans-serif", cursor: "pointer" }}
      >
        {t("staff.scan.notNow")}
      </button>
    </Sheet>
  );
}

// ─── sheet: reward / group redeemed ─────────────────────────────────────────────

function RedeemedSheet({ title, subtitle, onDismiss }: { title: string; subtitle: string; onDismiss: () => void }) {
  return (
    <Sheet
      open
      onOpenChange={(o) => { if (!o) onDismiss(); }}
      variant="modal"
      surface="card"
      showGrabber={false}
      ariaLabel={title}
    >
      <Flash color="var(--sage, #3F7355)" />
      <CountdownBar duration={2800} onDone={onDismiss} />
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 78, height: 78, borderRadius: "50%", background: "var(--sage, #3F7355)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 40, margin: "0 auto", animation: "jqPop .5s ease",
          boxShadow: "0 14px 30px -8px rgba(94,139,106,.6)",
        }}>✓</div>
        <div style={{ font: "800 27px 'Bricolage Grotesque',sans-serif", marginTop: 18 }}>{title}</div>
        <div style={{ fontSize: 14, color: "var(--soft, #8C7A6A)", marginTop: 6 }}>{subtitle}</div>
      </div>
    </Sheet>
  );
}

// ─── sheet: invalid voucher ─────────────────────────────────────────────────────

function InvalidSheet({ title, reason, onDismiss }: { title: string; reason: string; onDismiss: () => void }) {
  const t = useT();
  return (
    <Sheet
      open
      onOpenChange={(o) => { if (!o) onDismiss(); }}
      variant="modal"
      surface="card"
      showGrabber={false}
      ariaLabel={title}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 66, height: 66, borderRadius: "50%", background: "#F7E4DF",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#B0563A", fontSize: 30, fontWeight: 800, margin: "0 auto",
        }}>!</div>
        <div style={{ font: "800 22px 'Bricolage Grotesque',sans-serif", marginTop: 16, color: "#A8462C" }}>{title}</div>
        <div style={{ fontSize: 14, color: "var(--soft, #8C7A6A)", marginTop: 6, lineHeight: 1.5, maxWidth: 270, marginLeft: "auto", marginRight: "auto" }}>{reason}</div>
        <button
          type="button"
          onClick={onDismiss}
          style={{ marginTop: 18, padding: "13px 28px", border: "1.5px solid var(--line, #EFE3D1)", borderRadius: 14, background: "#fff", color: "var(--ink, #2E241D)", font: "700 14px 'Hanken Grotesk',sans-serif", cursor: "pointer" }}
        >
          {t("staff.scan.dismiss")}
        </button>
      </div>
    </Sheet>
  );
}

// ─── camera-off state ───────────────────────────────────────────────────────────

type CameraReason = "permission" | "https" | "none" | null;

function CameraOff({
  onEnable,
  onManual,
  reason = null,
}: {
  onEnable: () => void;
  onManual: (code: string) => void;
  reason?: CameraReason;
}) {
  const t = useT();
  const [code, setCode] = useState("");
  // When there's a denial reason, open manual entry immediately — re-enabling
  // the camera won't recover (iOS won't re-prompt; HTTP won't become HTTPS).
  const [showManual, setShowManual] = useState(!!reason);

  // Test-only: upload a QR image and run it through the real scan flow.
  // Gated by env so it never ships to production staff devices.
  const testUpload = process.env.NEXT_PUBLIC_ENABLE_TEST_UPLOAD === "true";
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setUploadErr(null);
    setDecoding(true);
    try {
      const mod = await import("html5-qrcode");
      const Html5Qrcode = mod.Html5Qrcode as unknown as { new (id: string): { scanFile: (f: File, showImage: boolean) => Promise<string> } };
      const decoder = new Html5Qrcode("qr-file-region");
      const decoded = await decoder.scanFile(file, false);
      onManual(parseScanned(decoded)); // identical to a real camera scan
    } catch {
      setUploadErr(t("staff.scan.uploadFailed"));
    } finally {
      setDecoding(false);
    }
  }

  return (
    <div
      style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        textAlign: "center", padding: "0 40px 70px",
        background: "#14100B",
      }}
    >
      <div style={{ width: 74, height: 74, borderRadius: "50%", background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.8)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 2l20 20" />
          <path d="M9.4 4h5.2l1.4 2H21a1 1 0 0 1 1 1v10.5M7 6H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h14" />
          <path d="M9.9 9.9A3 3 0 0 0 12 15a3 3 0 0 0 2.1-.9" />
        </svg>
      </div>

      {/* Reason-specific title + hint, falling back to the generic camera-off copy. */}
      <div style={{ color: "#fff", font: "700 19px 'Bricolage Grotesque',sans-serif", marginTop: 18 }}>
        {reason === "permission" ? t("staff.scan.permDenied")
          : reason === "https" ? t("staff.scan.httpsRequired")
          : t("staff.scan.cameraOff")}
      </div>
      <div style={{ color: "rgba(255,255,255,.6)", fontSize: 13.5, marginTop: 8, lineHeight: 1.5, maxWidth: 260 }}>
        {reason === "permission" ? t("staff.scan.permHint")
          : reason === "https" ? t("staff.scan.httpsHint")
          : t("staff.scan.cameraOffHint")}
      </div>

      {/* When permission was denied or HTTPS is missing the camera button won't
          recover the session, so show it secondary. Without a reason it is the
          primary CTA. */}
      <button
        onClick={onEnable}
        style={{
          marginTop: 22,
          padding: reason ? "11px 22px" : "15px 26px",
          border: reason ? "1.5px solid rgba(255,255,255,.22)" : "none",
          borderRadius: 15,
          background: reason ? "rgba(255,255,255,.08)" : "var(--accent, #C25E3C)",
          color: reason ? "rgba(255,255,255,.7)" : "#fff",
          font: `${reason ? "600" : "700"} ${reason ? "13.5" : "15"}px 'Hanken Grotesk',sans-serif`,
          cursor: "pointer",
          boxShadow: reason ? "none" : "0 12px 26px -8px rgba(160,73,42,.6)",
        }}
      >
        {t("staff.scan.enableCamera")}
      </button>

      {/* Manual-entry form: open by default when there's a denial reason
          (camera won't recover); toggled via link otherwise. */}
      {showManual ? (
        <form
          style={{ marginTop: reason ? 22 : 20, width: "100%", maxWidth: 280 }}
          onSubmit={(e) => { e.preventDefault(); if (code.trim()) onManual(code.trim()); }}
        >
          {/* Prominent label when opened due to a denial reason */}
          {reason && (
            <div style={{ color: "rgba(255,255,255,.55)", fontSize: 12.5, marginBottom: 10, fontFamily: "'Hanken Grotesk',sans-serif", textTransform: "uppercase", letterSpacing: ".04em" }}>
              {t("staff.scan.enterCodeInstead")}
            </div>
          )}
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("staff.scan.manualPlaceholder")}
            style={{ width: "100%", padding: "13px 16px", borderRadius: 14, border: "1.5px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.08)", color: "#fff", fontSize: 15, outline: "none", fontFamily: "'Hanken Grotesk',sans-serif" }}
          />
          <button
            type="submit"
            disabled={!code.trim()}
            style={{ marginTop: 10, width: "100%", padding: "14px", borderRadius: 14, border: "none", background: code.trim() ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.07)", color: code.trim() ? "#fff" : "rgba(255,255,255,.35)", font: "700 15px 'Hanken Grotesk',sans-serif", cursor: code.trim() ? "pointer" : "not-allowed" }}
          >
            {t("staff.scan.manualSubmit")}
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowManual(true)}
          style={{ marginTop: 14, background: "none", border: "none", color: "rgba(255,255,255,.55)", fontSize: 13, fontFamily: "'Hanken Grotesk',sans-serif", cursor: "pointer", textDecoration: "underline" }}
        >
          {t("staff.scan.manualCode")}
        </button>
      )}

      {testUpload && (
        <>
          <div id="qr-file-region" style={{ display: "none" }} />
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={decoding}
            style={{ marginTop: 16, padding: "10px 18px", borderRadius: 12, border: "1px dashed rgba(255,255,255,.3)", background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.75)", font: "600 12.5px 'Hanken Grotesk',sans-serif", cursor: decoding ? "wait" : "pointer" }}
          >
            {decoding ? t("common.loading") : `🧪 ${t("staff.scan.testUpload")}`}
          </button>
          {uploadErr && <div style={{ color: "#E2A0A0", fontSize: 12, marginTop: 8 }}>{uploadErr}</div>}
        </>
      )}
    </div>
  );
}

// ─── main page ──────────────────────────────────────────────────────────────────

export default function StaffScanPage() {
  const t = useT();
  const errMessage = useErrMessage();
  const { isStaff, ready, staff } = useStaffAuth();

  const resolveScan = useResolveScan();
  const confirmVisit = useConfirmVisitUnified();
  const awardBatch = useAwardLoyaltyBatch();
  const confirmSocial = useConfirmSocial();
  const redeemVoucher = useRedeemCampaignVoucher();
  const redeemById = useRedeemVoucherById();
  const confirmGroup = useConfirmGroup();

  const [overlay, setOverlay] = useState<OverlayState>(null);
  // The campaign whose action is in flight (drives the per-row spinner). Cleared
  // on success/error so a failed tap re-enables the row.
  const [pendingCampaignId, setPendingCampaignId] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  // Last denial reason from QrScanner (permission / https / none). Cleared when
  // the staff member manually re-enables the camera. Used to drive reason-specific
  // copy in the CameraOff state.
  const [cameraReason, setCameraReason] = useState<CameraReason>(null);
  // Incremented on dismiss so QrScanner remounts and auto-restarts after each scan.
  const [scanKey, setScanKey] = useState(0);
  // The token most recently scanned — needed to confirm the visit against it.
  const scannedTokenRef = useRef<string>("");
  // Guards re-entrancy: ignore new scans while a result sheet is open or a scan
  // request is in flight (a camera fires the same frame many times per second).
  const busyRef = useRef(false);

  const dismiss = () => {
    setOverlay(null);
    setPendingCampaignId(null);
    busyRef.current = false;
    setScanKey((k) => k + 1);
    resolveScan.reset();
    confirmVisit.reset();
    awardBatch.reset();
    confirmSocial.reset();
    redeemVoucher.reset();
    redeemById.reset();
    confirmGroup.reset();
  };

  // Map a thrown ApiClientError code to the design's invalid-voucher sheet. Falls
  // back to a generic error sheet for anything not in the redeem unhappy-path set.
  const showError = (error: unknown) => {
    const message = errMessage(error);
    setOverlay({ kind: "error", message });
  };

  const handleScan = (token: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    scannedTokenRef.current = token;

    resolveScan.mutate(token, {
      onSuccess(dispatch: ScanDispatchResult) {
        if (dispatch.kind === "customer") {
          setOverlay({ kind: "chooser", result: dispatch.customer });
          return;
        }
        if (dispatch.kind === "voucher") {
          const v = dispatch.voucher;
          if (v.state === "valid") {
            // Voucher scan that carries a group session → open group sheet.
            if (v.group != null) {
              // ponytail: GroupVoucherScan has no member roster; synthesise a minimal GroupScanResult
              setOverlay({
                kind: "group_eligible",
                group: {
                  group_session_id: v.group.group_session_id,
                  campaign_name: v.group.campaign_name,
                  required_size: 0,
                  status: "active",
                  leader_name: "",
                  members: [],
                },
              });
              return;
            }
            setOverlay({ kind: "reward_valid", result: v });
            return;
          }
          setOverlay({
            kind: "invalid",
            title: t(`staff.campaign.invalid.${v.state}`),
            reason: v.reason ?? t("staff.campaign.invalid.generic"),
          });
          return;
        }
        if (dispatch.kind === "group") {
          setOverlay({ kind: "group_eligible", group: dispatch.group });
          return;
        }
        // kind === "invalid"
        setOverlay({
          kind: "invalid",
          title: t("staff.campaign.invalid.not_found"),
          reason: dispatch.reason ?? t("staff.campaign.invalid.generic"),
        });
      },
      onError(error) { showError(error); },
    });
  };

  // Build the single-program success overlay from a confirm response. The chosen
  // program is campaigns[0] (the backend advances exactly the one we named); fall
  // back to a generic counted leg if the program did not advance (e.g. capped).
  const showSingleResult = (data: UnifiedScanResult, row: CampaignScanRow, awarded: number | null) => {
    const leg: UnifiedCampaignLeg =
      data.campaigns[0] ?? {
        state: "counted",
        customer_name: data.customer.name,
        campaign_name: row.name,
        current_count: row.current_count,
        goal: row.goal,
        reward_title: row.reward_title,
        expires_label: null,
        points_balance: row.points_balance,
      };
    setOverlay({ kind: "single_result", leg, customerName: data.customer.name, awarded });
    setPendingCampaignId(null);
  };

  // Combined collect: one confirm for every loyalty leg of the till order.
  const handleCollect = (awards: LoyaltyBatchAward[]) => {
    awardBatch.mutate(
      { token: scannedTokenRef.current, awards },
      {
        onSuccess(data) {
          setOverlay({ kind: "batch_result", result: data });
        },
        onError(error) { showError(error); },
      },
    );
  };

  // One-tap mechanics (visit / stamp / visit-basis points): confirm with no amount.
  const handleConfirmRow = (row: CampaignScanRow) => {
    setPendingCampaignId(row.campaign_id);
    confirmVisit.mutate(
      { token: scannedTokenRef.current, campaignId: row.campaign_id },
      {
        onSuccess(data) {
          // Visit-basis points award a flat per-visit amount; surface it.
          const awarded = row.mechanic === "points" ? row.points_per_visit ?? 0 : null;
          showSingleResult(data, row, awarded);
        },
        onError(error) { setPendingCampaignId(null); showError(error); },
      },
    );
  };

  // Spend / spend-basis points: open the bill keypad for this row.
  const handlePickRow = (row: CampaignScanRow) => {
    if (overlay?.kind !== "chooser") return;
    setOverlay({ kind: "amount", result: overlay.result, row });
  };

  // Keypad submit: confirm the chosen program with the entered bill amount.
  const handleConfirmAmount = (amount: string) => {
    if (overlay?.kind !== "amount") return;
    const { row } = overlay;
    setPendingCampaignId(row.campaign_id);
    confirmVisit.mutate(
      { token: scannedTokenRef.current, campaignId: row.campaign_id, amount },
      {
        onSuccess(data) {
          // Points awarded this confirm = floor(points_per_som × amount); spend
          // programs award no points, so show progress instead (awarded = null).
          const awarded =
            row.mechanic === "points" && row.points_per_som != null
              ? Math.floor(Number(row.points_per_som) * Number(amount))
              : null;
          showSingleResult(data, row, awarded);
        },
        onError(error) { setPendingCampaignId(null); showError(error); },
      },
    );
  };

  // Social: confirm the post, then show the single-program success.
  const handleConfirmSocialRow = (row: CampaignScanRow) => {
    setPendingCampaignId(row.campaign_id);
    confirmSocial.mutate(
      { token: scannedTokenRef.current, campaignId: row.campaign_id },
      {
        onSuccess(leg) {
          setOverlay({
            kind: "single_result",
            leg,
            customerName: leg.customer_name,
            awarded: null,
          });
          setPendingCampaignId(null);
        },
        onError(error) { setPendingCampaignId(null); showError(error); },
      },
    );
  };

  // Redeem a voucher by id from the chooser-sheet active_vouchers list (B2).
  const handleRedeemVoucher = (v: ActiveVoucher) => {
    redeemById.mutate({ id: v.id, source: v.source }, {
      onSuccess(data) {
        setOverlay({ kind: "reward_redeemed", rewardTitle: data.reward_title || v.label });
      },
      onError(error) { showError(error); },
    });
  };

  const handleRedeem = () => {
    if (overlay?.kind !== "reward_valid" || !overlay.result.code) return;
    const rewardTitle = overlay.result.reward_title ?? "";
    redeemVoucher.mutate(overlay.result.code, {
      onSuccess(data) {
        setOverlay({ kind: "reward_redeemed", rewardTitle: data.reward_title || rewardTitle });
      },
      onError(error) { showError(error); },
    });
  };

  const handleConfirmGroup = () => {
    if (overlay?.kind !== "group_eligible") return;
    confirmGroup.mutate(overlay.group.group_session_id, {
      onSuccess(data) {
        setOverlay({ kind: "group_done", result: data });
      },
      onError(error) { showError(error); },
    });
  };

  const businessName = staff?.business_name ?? "";
  const staffName = staff?.name ?? "";
  const role = staff?.role ?? "cashier";
  const bizInitial = (businessName[0] ?? "M").toUpperCase();

  if (ready && !isStaff) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[440px] flex-col items-center justify-center bg-[#14100B] px-6">
        <p className="mb-4 text-sm text-white/60">{t("staff.login")}</p>
        <Link
          href="/staff/login"
          className="rounded-[15px] bg-[#C25E3C] px-8 py-4 font-sans font-bold text-white"
          style={{ boxShadow: "0 12px 26px -8px rgba(160,73,42,.6)" }}
        >
          {t("staff.signIn")}
        </Link>
      </div>
    );
  }

  const scanHint = t("staff.campaign.pointUnified");

  return (
    /* Responsive: phone-width column centered on wide screens */
    <div className="mx-auto flex min-h-screen max-w-[440px] flex-col" style={{ background: "#14100B" }}>
      <div className="relative flex-1 overflow-hidden">

        {cameraActive && (
          <div className="absolute inset-0" style={{ background: "#14100B" }}>
            {/* Live camera feed — fills the container; video styled via global CSS */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <QrScanner
                key={scanKey}
                onResult={handleScan}
                onError={(r) => {
                  // Camera denied or HTTPS missing — switch to CameraOff and
                  // surface the reason so staff get specific recovery guidance.
                  // CameraReason is a subset of QrScanner's Reason; unknown
                  // values (e.g. "generic") render the generic camera-off copy.
                  const known: CameraReason =
                    r === "permission" || r === "https" || r === "none" ? r : null;
                  setCameraReason(known);
                  setCameraActive(false);
                }}
                autoStart
                fill
              />
            </div>
            {/* Dim everything except the central target a touch for legibility */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 42%, transparent 0%, transparent 26%, rgba(8,6,3,.55) 70%, rgba(8,6,3,.78) 100%)" }} />

            {/* Warm corner glows */}
            <div style={{ position: "absolute", top: -40, left: -34, width: 250, height: 250, borderRadius: "50%", background: "radial-gradient(circle, rgba(231,162,62,.20), transparent 64%)", filter: "blur(7px)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: 150, right: -44, width: 230, height: 230, borderRadius: "50%", background: "radial-gradient(circle, rgba(194,94,60,.18), transparent 66%)", filter: "blur(9px)", pointerEvents: "none" }} />
            {/* Scan lines texture */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "repeating-linear-gradient(0deg, rgba(255,255,255,.015) 0 2px, transparent 2px 4px)" }} />

            {/* Top overlay: business + staff pill */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "16px 18px 30px", background: "linear-gradient(to bottom, rgba(10,7,4,.78), transparent)", zIndex: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(150deg, #C25E3C, #A2492A)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", font: "800 17px 'Bricolage Grotesque',sans-serif" }}>{bizInitial}</div>
                  <div>
                    <div style={{ color: "#fff", font: "700 15px 'Bricolage Grotesque',sans-serif" }}>{businessName}</div>
                    <div style={{ color: "rgba(255,255,255,.6)", fontSize: 11.5 }}>{staffName} · {t(`staff.role.${role}`)}</div>
                  </div>
                </div>
                <span style={{ background: "rgba(255,255,255,.14)", color: "#fff", fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 99, letterSpacing: ".05em" }}>{t("staff.badge")}</span>
              </div>
            </div>

            {/* Target frame (228×228, centered slightly above mid) */}
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -58%)", width: 228, height: 228 }}>
              <i style={{ position: "absolute", top: 0, left: 0, width: 36, height: 36, borderTop: "4px solid #fff", borderLeft: "4px solid #fff", borderRadius: "16px 0 0 0" }} />
              <i style={{ position: "absolute", top: 0, right: 0, width: 36, height: 36, borderTop: "4px solid #fff", borderRight: "4px solid #fff", borderRadius: "0 16px 0 0" }} />
              <i style={{ position: "absolute", bottom: 0, left: 0, width: 36, height: 36, borderBottom: "4px solid #fff", borderLeft: "4px solid #fff", borderRadius: "0 0 0 16px" }} />
              <i style={{ position: "absolute", bottom: 0, right: 0, width: 36, height: 36, borderBottom: "4px solid #fff", borderRight: "4px solid #fff", borderRadius: "0 0 16px 0" }} />
              <div style={{ position: "absolute", left: 12, right: 12, height: 2.5, borderRadius: 2, background: "linear-gradient(90deg, transparent, var(--amber, #E7A23E), transparent)", boxShadow: "0 0 16px 2px rgba(231,162,62,.55)", animation: "jqScanLine 2.6s ease-in-out infinite" }} />
            </div>

            {/* Caption below frame */}
            <div style={{ position: "absolute", top: "calc(50% + 126px)", left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,.8)", fontSize: 13.5, fontWeight: 600 }}>
              {scanHint}
            </div>

            {/* Camera-off button (bottom-right) */}
            <button
              onClick={() => setCameraActive(false)}
              style={{ position: "absolute", bottom: 72, right: 18, zIndex: 6, background: "none", border: "none", color: "rgba(255,255,255,.5)", font: "600 11.5px 'Hanken Grotesk',sans-serif", cursor: "pointer" }}
            >
              {t("staff.campaign.cameraOffBtn")}
            </button>
          </div>
        )}

        {!cameraActive && (
          <CameraOff
            onEnable={() => { setCameraReason(null); setCameraActive(true); }}
            onManual={handleScan}
            reason={cameraReason}
          />
        )}

        {/* ── Result sheets ── */}
        {overlay?.kind === "chooser" && (
          <LoyaltyChooserSheet
            result={overlay.result}
            onCollect={handleCollect}
            collectPending={awardBatch.isPending}
            onPickRow={handlePickRow}
            onConfirmRow={handleConfirmRow}
            onConfirmSocial={handleConfirmSocialRow}
            onRedeemVoucher={handleRedeemVoucher}
            onDismiss={dismiss}
            pendingCampaignId={pendingCampaignId}
            redeemPending={redeemById.isPending}
          />
        )}
        {overlay?.kind === "amount" && (
          <AmountSheet
            row={overlay.row}
            onConfirm={handleConfirmAmount}
            onBack={() => setOverlay({ kind: "chooser", result: overlay.result })}
            isPending={confirmVisit.isPending}
          />
        )}
        {overlay?.kind === "batch_result" && (
          <BatchResultSheet result={overlay.result} onDismiss={dismiss} />
        )}
        {overlay?.kind === "single_result" && (
          <SingleResultSheet
            leg={overlay.leg}
            customerName={overlay.customerName}
            awarded={overlay.awarded}
            onDismiss={dismiss}
          />
        )}
        {overlay?.kind === "group_eligible" && (
          <GroupEligibleSheet group={overlay.group} onConfirm={handleConfirmGroup} onDismiss={dismiss} isPending={confirmGroup.isPending} />
        )}
        {overlay?.kind === "reward_valid" && (
          <RewardValidSheet result={overlay.result} onRedeem={handleRedeem} onDismiss={dismiss} isPending={redeemVoucher.isPending} />
        )}
        {overlay?.kind === "reward_redeemed" && (
          <RedeemedSheet
            title={t("staff.campaign.rewardRedeemed")}
            subtitle={t("staff.campaign.giveCustomer").replace("{reward}", overlay.rewardTitle)}
            onDismiss={dismiss}
          />
        )}
        {overlay?.kind === "group_done" && (
          <RedeemedSheet
            title={t("staff.campaign.groupRedeemed")}
            subtitle={t("staff.campaign.groupRedeemedSub").replace("{reward}", overlay.result.reward_title).replace("{leader}", overlay.result.leader_name)}
            onDismiss={dismiss}
          />
        )}
        {overlay?.kind === "invalid" && <InvalidSheet title={overlay.title} reason={overlay.reason} onDismiss={dismiss} />}
        {overlay?.kind === "error" && (
          <InvalidSheet title={t("staff.scan.cantAdd")} reason={overlay.message} onDismiss={dismiss} />
        )}
      </div>

      {/* Light bottom nav over the immersive scanner — shown at all viewports since
          this page doesn't use StaffShell's sidebar. */}
      <StaffNav showOnDesktop />
    </div>
  );
}
