"use client";

import {
  useConfirmGroup,
  useConfirmSocial,
  useConfirmVisitUnified,
  useRedeemCampaignVoucher,
  useResolveScan,
} from "@jaqyn/api";
import type {
  CampaignScanRow,
  CampaignVoucherScanResult,
  ConfirmGroupResult,
  GroupVoucherScan,
  ScanCustomerResult,
  ScanDispatchResult,
  UnifiedCampaignLeg,
  UnifiedScanResult,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { QrScanner, parseScanned } from "../../_components/QrScanner";
import { useErrMessage } from "../../_lib/useErrMessage";
import { useStaffAuth } from "../_lib/staffAuth";
import { StaffNav } from "../_components/StaffNav";
import { SheetBackdrop, SHEET_STYLE } from "./_components/SheetBackdrop";

// ─── overlay state ──────────────────────────────────────────────────────────────

type OverlayState =
  // The "Apply loyalty" chooser — one row per program, choose one to advance.
  | { kind: "chooser"; result: ScanCustomerResult }
  // Bill-amount keypad for a spend / spend-basis-points program.
  | { kind: "amount"; result: ScanCustomerResult; row: CampaignScanRow }
  // Focused success for the single program that was just confirmed. `awarded` is
  // the points added this confirm (null for non-points programs).
  | { kind: "single_result"; leg: UnifiedCampaignLeg; customerName: string; awarded: number | null }
  | { kind: "group_eligible"; group: GroupVoucherScan }
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

// ─── sheet: loyalty chooser ("Apply loyalty" — pure choose-one) ─────────────────

// One row per program. ONE TAP on a row's action does it: visit/stamp/social and
// visit-basis points confirm immediately; spend / spend-basis points open the
// bill keypad. Eligible rows first; ineligible rows are disabled at 55% with a
// humanized reason. No apply-all, no global confirm.
function LoyaltyChooserSheet({
  result,
  onPickRow,
  onConfirmRow,
  onConfirmSocial,
  onDismiss,
  pendingCampaignId,
}: {
  result: ScanCustomerResult;
  // Spend / spend-basis points → open the keypad for this row.
  onPickRow: (row: CampaignScanRow) => void;
  // One-tap mechanics (visit / stamp / visit-basis points) → confirm now.
  onConfirmRow: (row: CampaignScanRow) => void;
  // Social → confirm the post now.
  onConfirmSocial: (row: CampaignScanRow) => void;
  onDismiss: () => void;
  // The campaign currently being confirmed (so its action shows a spinner).
  pendingCampaignId: string | null;
}) {
  const t = useT();
  const initial = (result.customer.name.trim()[0] ?? "•").toUpperCase();
  // Eligible rows first; preserve relative order within each group.
  const rows = [...result.rows].sort((a, b) => Number(b.eligible) - Number(a.eligible));

  return (
    <SheetBackdrop onDismiss={onDismiss}>
      <div style={{ ...SHEET_STYLE, paddingTop: 24, paddingRight: 22, paddingLeft: 22, paddingBottom: "calc(26px + env(safe-area-inset-bottom, 0px))" }} onClick={(e) => e.stopPropagation()}>
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

        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--soft, #8C7A6A)", marginTop: 18 }}>
          {t("staff.chooser.title")}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 11 }}>
          {rows.map((row) => (
            <ChooserRow
              key={row.campaign_id}
              row={row}
              pending={pendingCampaignId === row.campaign_id}
              onPick={onPickRow}
              onConfirm={onConfirmRow}
              onConfirmSocial={onConfirmSocial}
            />
          ))}

          {result.none_eligible && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F6F0E6", borderRadius: 13, padding: "12px 14px" }}>
              <span style={{ fontSize: 16 }}>🚫</span>
              <div style={{ fontSize: 12.5, color: "var(--soft, #8C7A6A)", lineHeight: 1.4 }}>
                {t("staff.campaign.noneEligible")}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          style={{ width: "100%", marginTop: 14, padding: 12, border: "none", borderRadius: 14, background: "none", color: "var(--soft, #8C7A6A)", font: "600 14px 'Hanken Grotesk',sans-serif", cursor: "pointer" }}
        >
          {t("common.cancel")}
        </button>
      </div>
    </SheetBackdrop>
  );
}

// Mask the middle of the phone for the chooser header (e.g. "70••••567").
function maskPhone(phone: string): string {
  const p = phone.replace(/\s/g, "");
  if (p.length <= 5) return p;
  return `${p.slice(0, 2)}••••${p.slice(-3)}`;
}

// The state line + per-mechanic action for one chooser row.
function ChooserRow({
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

  // The customer's current state for this program, by mechanic.
  let stateLine: string;
  if (row.mechanic === "stamp") {
    stateLine = t("staff.chooser.stampsState").replace("{progress}", String(row.current_count)).replace("{required}", String(row.goal));
  } else if (row.mechanic === "points") {
    stateLine = t("staff.chooser.pointsState").replace("{balance}", String(row.points_balance));
  } else if (row.mechanic === "social") {
    stateLine = row.business_name;
  } else {
    stateLine = t("staff.chooser.visitsState").replace("{progress}", String(row.current_count)).replace("{required}", String(row.goal));
  }

  // The action label + handler, by mechanic.
  let actionLabel: string;
  let onAction: () => void;
  if (row.mechanic === "stamp") {
    actionLabel = t("staff.chooser.addStamp");
    onAction = () => onConfirm(row);
  } else if (row.mechanic === "points") {
    if (row.points_per_som != null) {
      actionLabel = t("staff.chooser.enterBill");
      onAction = () => onPick(row);
    } else {
      // Visit-basis: flat per-visit award, no amount.
      actionLabel = t("staff.chooser.addPoints").replace("{n}", String(row.points_per_visit ?? 0));
      onAction = () => onConfirm(row);
    }
  } else if (row.mechanic === "social") {
    actionLabel = t("staff.chooser.confirmPost");
    onAction = () => onConfirmSocial(row);
  } else {
    actionLabel = t("staff.chooser.countVisit");
    onAction = () => onConfirm(row);
  }

  const pct = row.mechanic === "points" ? cashbackPct(row) : null;
  const disabled = !row.eligible || pending;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 11,
        width: "100%", padding: "12px 14px", borderRadius: 13,
        background: "#F8F4EC",
        opacity: row.eligible ? 1 : 0.55,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{row.name}</span>
          {pct != null && (
            <span style={{ font: "700 10.5px 'Hanken Grotesk',sans-serif", padding: "2px 7px", borderRadius: 99, background: "#E4F0E7", color: "#3F7355" }}>
              {t("staff.chooser.pctBack").replace("{pct}", String(pct))}
            </span>
          )}
        </span>
        <span style={{ display: "block", fontSize: 12, color: "var(--soft, #8C7A6A)", marginTop: 2 }}>
          {row.eligible ? stateLine : humanizeReason(t, row.reason)}
        </span>
      </span>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        style={{
          flexShrink: 0, padding: "9px 14px", border: "none", borderRadius: 11,
          background: disabled ? "#EFE3D1" : "var(--accent, #C25E3C)",
          color: disabled ? "var(--soft, #8C7A6A)" : "#fff",
          font: "700 13px 'Hanken Grotesk',sans-serif", whiteSpace: "nowrap",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {pending ? "…" : actionLabel}
      </button>
    </div>
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
    <SheetBackdrop onDismiss={onBack}>
      <div style={{ ...SHEET_STYLE, paddingTop: 22, paddingRight: 22, paddingLeft: 22, paddingBottom: "calc(26px + env(safe-area-inset-bottom, 0px))" }} onClick={(e) => e.stopPropagation()}>
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
      </div>
    </SheetBackdrop>
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
    <SheetBackdrop dim="rgba(8,6,3,.5)" onDismiss={onDismiss}>
      <Flash color={flashColor} />
      <div style={{ ...SHEET_STYLE, paddingTop: 30, paddingRight: 26, paddingLeft: 26, paddingBottom: "calc(30px + env(safe-area-inset-bottom, 0px))" }} onClick={(e) => e.stopPropagation()}>
        <CountdownBar duration={duration} onDone={onDismiss} />

        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 70, height: 70, borderRadius: "50%", background: "var(--sage, #3F7355)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 36, margin: "0 auto", animation: "jqPop .5s ease",
            boxShadow: "0 14px 30px -8px rgba(94,139,106,.6)",
          }}>✓</div>
          <div style={{ fontSize: 13.5, color: "var(--soft, #8C7A6A)", fontWeight: 600, marginTop: 14 }}>
            {customerName} · {t("cmp.staff.bothCounted")}
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
      </div>
    </SheetBackdrop>
  );
}

// ─── sheet: group eligible → confirm ────────────────────────────────────────────

function GroupEligibleSheet({
  group,
  onConfirm,
  onDismiss,
  isPending,
}: {
  group: GroupVoucherScan;
  onConfirm: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  const t = useT();
  return (
    <SheetBackdrop onDismiss={onDismiss}>
      <div style={{ ...SHEET_STYLE, paddingTop: 24, paddingRight: 22, paddingLeft: 22, paddingBottom: "calc(26px + env(safe-area-inset-bottom, 0px))" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ font: "700 17px 'Bricolage Grotesque',sans-serif", lineHeight: 1.2 }}>{group.campaign_name}</div>
            <div style={{ fontSize: 12.5, color: "var(--soft, #8C7A6A)", marginTop: 3 }}>{group.business_name}</div>
          </div>
          <span style={{ font: "700 11px 'Hanken Grotesk',sans-serif", padding: "4px 11px", borderRadius: 99, background: "#E4F0E7", color: "#3F7355" }}>
            {t("staff.campaign.eligible")}
          </span>
        </div>
        <div style={{ background: "#FBF3E6", borderRadius: 12, padding: "11px 14px", marginTop: 16, fontSize: 12.5, color: "#8A6A3A" }}>
          {t("staff.campaign.membersCheckedIn").replace("{count}", group.checked_in_label)}
        </div>
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
          {isPending ? "…" : t("staff.campaign.confirmGroup")}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          style={{ width: "100%", marginTop: 9, padding: 12, border: "none", borderRadius: 14, background: "none", color: "var(--soft, #8C7A6A)", font: "600 14px 'Hanken Grotesk',sans-serif", cursor: "pointer" }}
        >
          {t("common.cancel")}
        </button>
      </div>
    </SheetBackdrop>
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
  const rows: { label: string; value: string }[] = [
    { label: t("staff.campaign.customer"), value: result.customer_name ?? "" },
    { label: t("staff.campaign.campaign"), value: result.campaign_name ?? "" },
    { label: t("staff.campaign.expires"), value: result.expires_label ?? "" },
    { label: t("staff.campaign.code"), value: result.code ?? "" },
  ];
  return (
    <SheetBackdrop dim="rgba(8,6,3,.62)" onDismiss={onDismiss}>
      <div style={{ ...SHEET_STYLE, paddingTop: 26, paddingRight: 24, paddingLeft: 24, paddingBottom: "calc(26px + env(safe-area-inset-bottom, 0px))" }} onClick={(e) => e.stopPropagation()}>
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
      </div>
    </SheetBackdrop>
  );
}

// ─── sheet: reward / group redeemed ─────────────────────────────────────────────

function RedeemedSheet({ title, subtitle, onDismiss }: { title: string; subtitle: string; onDismiss: () => void }) {
  return (
    <SheetBackdrop dim="rgba(8,6,3,.5)" onDismiss={onDismiss}>
      <Flash color="var(--sage, #3F7355)" />
      <div style={{ ...SHEET_STYLE, paddingTop: 34, paddingRight: 26, paddingLeft: 26, paddingBottom: "calc(34px + env(safe-area-inset-bottom, 0px))", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
        <CountdownBar duration={2800} onDone={onDismiss} />
        <div style={{
          width: 78, height: 78, borderRadius: "50%", background: "var(--sage, #3F7355)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 40, margin: "0 auto", animation: "jqPop .5s ease",
          boxShadow: "0 14px 30px -8px rgba(94,139,106,.6)",
        }}>✓</div>
        <div style={{ font: "800 27px 'Bricolage Grotesque',sans-serif", marginTop: 18 }}>{title}</div>
        <div style={{ fontSize: 14, color: "var(--soft, #8C7A6A)", marginTop: 6 }}>{subtitle}</div>
      </div>
    </SheetBackdrop>
  );
}

// ─── sheet: invalid voucher ─────────────────────────────────────────────────────

function InvalidSheet({ title, reason, onDismiss }: { title: string; reason: string; onDismiss: () => void }) {
  const t = useT();
  return (
    <SheetBackdrop dim="rgba(8,6,3,.5)" onDismiss={onDismiss}>
      <div style={{ ...SHEET_STYLE, paddingTop: 26, paddingRight: 26, paddingLeft: 26, paddingBottom: "calc(32px + env(safe-area-inset-bottom, 0px))", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
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
    </SheetBackdrop>
  );
}

// ─── camera-off state ───────────────────────────────────────────────────────────

function CameraOff({ onEnable, onManual }: { onEnable: () => void; onManual: (code: string) => void }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [showManual, setShowManual] = useState(false);

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
      <div style={{ color: "#fff", font: "700 19px 'Bricolage Grotesque',sans-serif", marginTop: 18 }}>{t("staff.scan.cameraOff")}</div>
      <div style={{ color: "rgba(255,255,255,.6)", fontSize: 13.5, marginTop: 8, lineHeight: 1.5, maxWidth: 240 }}>{t("staff.scan.cameraOffHint")}</div>
      <button
        onClick={onEnable}
        style={{ marginTop: 22, padding: "15px 26px", border: "none", borderRadius: 15, background: "var(--accent, #C25E3C)", color: "#fff", font: "700 15px 'Hanken Grotesk',sans-serif", cursor: "pointer", boxShadow: "0 12px 26px -8px rgba(160,73,42,.6)" }}
      >
        {t("staff.scan.enableCamera")}
      </button>

      {showManual ? (
        <form
          style={{ marginTop: 20, width: "100%", maxWidth: 280 }}
          onSubmit={(e) => { e.preventDefault(); if (code.trim()) onManual(code.trim()); }}
        >
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
  const confirmSocial = useConfirmSocial();
  const redeemVoucher = useRedeemCampaignVoucher();
  const confirmGroup = useConfirmGroup();

  const [overlay, setOverlay] = useState<OverlayState>(null);
  // The campaign whose action is in flight (drives the per-row spinner). Cleared
  // on success/error so a failed tap re-enables the row.
  const [pendingCampaignId, setPendingCampaignId] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  // Incremented on dismiss so QrScanner remounts and auto-restarts after each scan.
  const [scanKey, setScanKey] = useState(0);
  // The token most recently scanned — needed to confirm the visit against it.
  const scannedTokenRef = useRef<string>("");
  // Guards re-entrancy: ignore new scans while a result sheet is open or a scan
  // request is in flight (a camera fires the same frame many times per second).
  const busyRef = useRef(false);

  // Scanning is a mobile (cashier-device) action — on desktop, redirect to Groups.
  const router = useRouter();
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      setIsDesktop(mq.matches);
      if (mq.matches) router.replace("/staff/groups");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [router]);

  const dismiss = () => {
    setOverlay(null);
    setPendingCampaignId(null);
    busyRef.current = false;
    setScanKey((k) => k + 1);
    resolveScan.reset();
    confirmVisit.reset();
    confirmSocial.reset();
    redeemVoucher.reset();
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

  // Desktop has no scanner — render nothing while the redirect to Groups runs.
  if (isDesktop) return null;

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
              <QrScanner key={scanKey} onResult={handleScan} autoStart fill />
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
                <span style={{ background: "rgba(255,255,255,.14)", color: "#fff", fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 99, letterSpacing: ".05em" }}>STAFF</span>
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

        {!cameraActive && <CameraOff onEnable={() => setCameraActive(true)} onManual={handleScan} />}

        {/* ── Result sheets ── */}
        {overlay?.kind === "chooser" && (
          <LoyaltyChooserSheet
            result={overlay.result}
            onPickRow={handlePickRow}
            onConfirmRow={handleConfirmRow}
            onConfirmSocial={handleConfirmSocialRow}
            onDismiss={dismiss}
            pendingCampaignId={pendingCampaignId}
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

      {/* Light bottom nav over the immersive scanner — matches the design. */}
      <StaffNav theme="light" />
    </div>
  );
}
