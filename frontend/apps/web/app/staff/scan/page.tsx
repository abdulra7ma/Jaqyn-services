"use client";

import {
  useConfirmGroup,
  useConfirmVisitUnified,
  useRedeemCampaignVoucher,
  useScanCampaignVoucher,
  useScanCustomerForCampaigns,
  useStaffRedeem,
} from "@jaqyn/api";
import type {
  CampaignScanRow,
  CampaignVoucherScanResult,
  ConfirmGroupResult,
  GroupVoucherScan,
  ScanCustomerResult,
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

// ─── modes & overlay state ──────────────────────────────────────────────────────

// The two scan modes from the design's STAFF section: count a campaign visit, or
// redeem a campaign reward voucher. Drives which staff endpoint a scan hits.
type ScanMode = "visit" | "redeem";

type OverlayState =
  | { kind: "visit_eligibility"; result: ScanCustomerResult }
  | { kind: "visit_unified"; result: UnifiedScanResult }
  | { kind: "group_eligible"; group: GroupVoucherScan }
  | { kind: "reward_valid"; result: CampaignVoucherScanResult }
  | { kind: "reward_redeemed"; rewardTitle: string }
  | { kind: "group_done"; result: ConfirmGroupResult }
  | { kind: "invalid"; title: string; reason: string }
  | { kind: "error"; message: string }
  | null;

// ─── shared sheet primitives ────────────────────────────────────────────────────

/** Full-screen dim + bottom sheet. Tapping the backdrop dismisses. */
function SheetBackdrop({
  dim = "rgba(8,6,3,.55)",
  onDismiss,
  children,
}: {
  dim?: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 z-[45] flex flex-col justify-end"
      style={{ background: dim }}
      onClick={onDismiss}
    >
      {children}
    </div>
  );
}

/** A one-shot color wash over the screen, used to punctuate a success result. */
function Flash({ color }: { color: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: color, animation: "jqFlash .9s ease forwards" }}
    />
  );
}

const SHEET_STYLE: React.CSSProperties = {
  position: "relative",
  background: "#fff",
  borderRadius: "30px 30px 0 0",
  animation: "jqRise .32s cubic-bezier(.22,1,.36,1)",
};

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

// ─── sheet: visit eligibility (tap campaigns to count) ──────────────────────────

function VisitEligibilitySheet({
  result,
  selectedId,
  onSelect,
  onConfirm,
  onDismiss,
  isPending,
}: {
  result: ScanCustomerResult;
  selectedId: string | null;
  onSelect: (row: CampaignScanRow) => void;
  onConfirm: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  const t = useT();
  const initial = (result.customer.name.trim()[0] ?? "•").toUpperCase();
  // Confirm is always allowed: even with no campaign tapped, the unified confirm
  // still advances the loyalty card (and the backend auto-picks a campaign).
  const canConfirm = !isPending;

  return (
    <SheetBackdrop onDismiss={onDismiss}>
      <div style={{ ...SHEET_STYLE, padding: "24px 22px 26px" }} onClick={(e) => e.stopPropagation()}>
        {/* Customer header */}
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{
            width: 42, height: 42, borderRadius: "50%", background: "#F4ECDF",
            display: "flex", alignItems: "center", justifyContent: "center",
            font: "800 16px 'Bricolage Grotesque',sans-serif", color: "var(--accent, #C25E3C)",
          }}>{initial}</div>
          <div>
            <div style={{ font: "700 16px 'Bricolage Grotesque',sans-serif" }}>{result.customer.name}</div>
            <div style={{ fontSize: 12, color: "var(--soft, #8C7A6A)" }}>+996 {result.customer.phone}</div>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--soft, #8C7A6A)", marginTop: 18 }}>
          {t("staff.campaign.eligibleTap")}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 11 }}>
          {result.rows.map((row) => {
            const selected = row.campaign_id === selectedId;
            return (
              <button
                key={row.campaign_id}
                type="button"
                disabled={!row.eligible}
                aria-pressed={selected}
                onClick={() => row.eligible && onSelect(row)}
                style={{
                  display: "flex", alignItems: "center", gap: 11, textAlign: "left",
                  width: "100%", padding: "12px 14px", borderRadius: 13,
                  cursor: row.eligible ? "pointer" : "not-allowed",
                  background: selected ? "#FBF3E6" : "#F8F4EC",
                  border: selected ? "1.5px solid var(--accent, #C25E3C)" : "1.5px solid transparent",
                  opacity: row.eligible ? 1 : 0.55,
                }}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: 7, flex: "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 800,
                  background: selected ? "var(--accent, #C25E3C)" : "#EFE3D1",
                  color: selected ? "#fff" : "var(--soft, #8C7A6A)",
                }}>{selected ? "✓" : ""}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>{row.name}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--soft, #8C7A6A)", marginTop: 1 }}>
                    {row.eligible ? row.sub : row.reason ?? row.sub}
                  </span>
                </span>
                <span style={{
                  font: "700 14px 'Bricolage Grotesque',sans-serif",
                  whiteSpace: "nowrap",
                  color: row.eligible ? "var(--accent, #C25E3C)" : "var(--soft, #8C7A6A)",
                }}>
                  {row.current_count}→{row.next_count}/{row.goal}
                </span>
              </button>
            );
          })}

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
          onClick={onConfirm}
          disabled={!canConfirm}
          style={{
            width: "100%", marginTop: 18, padding: 16, border: "none", borderRadius: 16,
            background: canConfirm ? "var(--accent, #C25E3C)" : "#EFE3D1",
            color: canConfirm ? "#fff" : "var(--soft, #8C7A6A)",
            font: "700 16px 'Hanken Grotesk',sans-serif",
            cursor: canConfirm ? "pointer" : "not-allowed",
            boxShadow: canConfirm ? "0 12px 26px -8px rgba(160,73,42,.55)" : "none",
          }}
        >
          {isPending ? "…" : t("staff.campaign.confirmVisit")}
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

// ─── sheet: combined visit (loyalty + campaign in one confirm) ──────────────────

// One confirm advances both the regular loyalty card and the prioritized
// campaign. Each leg renders its own row; a null leg shows a muted skipped line.
// A completed campaign gets the celebratory amber/gift treatment (mirrors the
// former visit_complete sheet); the green success flash + countdown are kept.
function VisitUnifiedSheet({
  result,
  onDismiss,
  onGiveReward,
  isGivingReward,
}: {
  result: UnifiedScanResult;
  onDismiss: () => void;
  onGiveReward?: (code: string, rewardTitle: string) => void;
  isGivingReward?: boolean;
}) {
  const t = useT();
  const { loyalty, campaign } = result;
  const campaignComplete = campaign?.state === "completed";
  const rewardReady = loyalty?.state === "reward_ready";

  // A completed campaign warrants the longer, amber celebratory treatment.
  const flashColor = campaignComplete ? "var(--amber, #E7A23E)" : "var(--sage, #3F7355)";
  const duration = campaignComplete ? 3200 : 2800;

  return (
    <SheetBackdrop dim="rgba(8,6,3,.5)" onDismiss={onDismiss}>
      <Flash color={flashColor} />
      <div style={{ ...SHEET_STYLE, padding: "30px 26px 30px" }} onClick={(e) => e.stopPropagation()}>
        {/* Only auto-dismiss when no reward action is pending */}
        {!rewardReady && <CountdownBar duration={duration} onDone={onDismiss} />}

        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 70, height: 70, borderRadius: "50%", background: "var(--sage, #3F7355)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 36, margin: "0 auto", animation: "jqPop .5s ease",
            boxShadow: "0 14px 30px -8px rgba(94,139,106,.6)",
          }}>✓</div>
          <div style={{ fontSize: 13.5, color: "var(--soft, #8C7A6A)", fontWeight: 600, marginTop: 14 }}>
            {result.customer.name} · {t("cmp.staff.bothCounted")}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          {/* Loyalty leg */}
          <VisitLegRow
            icon="🎟️"
            title={t("cmp.staff.loyaltyTitle")}
            heading={loyalty?.program.title ?? ""}
            value={
              loyalty
                ? loyalty.state === "reward_ready"
                  ? t("cmp.staff.rewardReady")
                  : t("cmp.staff.stampAdded")
                      .replace("{current}", String(loyalty.progress?.current_count ?? 0))
                      .replace("{target}", String(loyalty.progress?.target_count ?? loyalty.program.required_count ?? 0))
                : null
            }
            muted={
              loyalty
                ? null
                : result.loyalty_skipped
                  ? t("cmp.staff.noStampReason").replace("{reason}", result.loyalty_skipped)
                  : t("cmp.staff.noStamp")
            }
          />

          {/* Campaign leg */}
          {campaignComplete && campaign ? (
            <div style={{
              background: "#FBEFD9", borderRadius: 14, padding: "14px 16px", textAlign: "center",
            }}>
              <div style={{ fontSize: 30, animation: "jqPop .5s ease" }}>🎉</div>
              <div style={{ font: "800 18px 'Bricolage Grotesque',sans-serif", color: "#B07A1E", marginTop: 4 }}>
                {campaign.campaign_name}
              </div>
              <div style={{
                display: "inline-block", background: "#fff", color: "#B07A1E",
                borderRadius: 11, padding: "7px 14px", marginTop: 8,
                font: "700 14px 'Bricolage Grotesque',sans-serif",
              }}>
                🎁 {t("cmp.staff.campaignComplete").replace("{reward}", campaign.reward_title ?? "")}
              </div>
            </div>
          ) : (
            <VisitLegRow
              icon="🎯"
              title={t("cmp.staff.campaignTitle")}
              heading={campaign?.campaign_name ?? ""}
              value={
                campaign
                  ? t("cmp.staff.campaignProgress")
                      .replace("{current}", String(campaign.current_count))
                      .replace("{goal}", String(campaign.goal))
                  : null
              }
              muted={
                campaign
                  ? null
                  : result.campaign_skipped
                    ? t("cmp.staff.noCampaignReason").replace("{reason}", result.campaign_skipped)
                    : t("cmp.staff.noCampaign")
              }
            />
          )}
        </div>

        {/* Give Reward button — only when loyalty reward is ready to hand out */}
        {rewardReady && loyalty?.redemption?.code && (
          <button
            type="button"
            onClick={() => onGiveReward?.(loyalty.redemption!.code, loyalty.reward?.title ?? "")}
            disabled={isGivingReward}
            style={{
              width: "100%", marginTop: 18, padding: 18, border: "none", borderRadius: 16,
              background: "var(--accent, #C25E3C)", color: "#fff",
              font: "700 17px 'Hanken Grotesk',sans-serif", cursor: "pointer",
              boxShadow: "0 12px 26px -8px rgba(160,73,42,.55)", opacity: isGivingReward ? 0.6 : 1,
            }}
          >
            {isGivingReward ? "…" : t("staff.scan.confirmGive")}
          </button>
        )}
      </div>
    </SheetBackdrop>
  );
}

// One leg (loyalty or campaign) of the combined visit sheet. Either a live row
// (title + heading + progress value) or a muted skipped line when the leg is null.
function VisitLegRow({
  icon,
  title,
  heading,
  value,
  muted,
}: {
  icon: string;
  title: string;
  heading: string;
  value: string | null;
  muted: string | null;
}) {
  if (muted) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 11, background: "#F6F0E6", borderRadius: 14, padding: "13px 15px" }}>
        <span style={{ fontSize: 18, opacity: 0.5 }}>{icon}</span>
        <span style={{ fontSize: 12.5, color: "var(--soft, #8C7A6A)", lineHeight: 1.4 }}>{muted}</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, background: "#F8F4EC", borderRadius: 14, padding: "13px 15px" }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--soft, #8C7A6A)" }}>{title}</span>
        <span style={{ display: "block", font: "700 15px 'Bricolage Grotesque',sans-serif", marginTop: 2 }}>{heading}</span>
      </span>
      <span style={{ font: "700 15px 'Bricolage Grotesque',sans-serif", whiteSpace: "nowrap", color: "var(--accent, #C25E3C)" }}>
        {value}
      </span>
    </div>
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
      <div style={{ ...SHEET_STYLE, padding: "24px 22px 26px" }} onClick={(e) => e.stopPropagation()}>
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
      <div style={{ ...SHEET_STYLE, padding: "26px 24px 26px" }} onClick={(e) => e.stopPropagation()}>
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
      <div style={{ ...SHEET_STYLE, padding: "34px 26px 34px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
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
      <div style={{ ...SHEET_STYLE, padding: "26px 26px 32px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
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

// ─── mode toggle ────────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: ScanMode; onChange: (m: ScanMode) => void }) {
  const t = useT();
  const btn = (m: ScanMode, label: string) => (
    <button
      type="button"
      onClick={() => onChange(m)}
      aria-pressed={mode === m}
      style={{
        flex: 1, padding: "9px 12px", border: "none", borderRadius: 9, cursor: "pointer",
        font: "700 13px 'Hanken Grotesk',sans-serif",
        background: mode === m ? "#fff" : "transparent",
        color: mode === m ? "var(--ink, #2E241D)" : "rgba(255,255,255,.7)",
        transition: "background .15s, color .15s",
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", gap: 3, background: "rgba(0,0,0,.32)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, padding: 3, marginTop: 14 }}>
      {btn("visit", t("staff.campaign.modeVisit"))}
      {btn("redeem", t("staff.campaign.modeRedeem"))}
    </div>
  );
}

// ─── main page ──────────────────────────────────────────────────────────────────

export default function StaffScanPage() {
  const t = useT();
  const errMessage = useErrMessage();
  const { isStaff, ready, staff } = useStaffAuth();

  const scanCustomer = useScanCustomerForCampaigns();
  const confirmVisit = useConfirmVisitUnified();
  const scanVoucher = useScanCampaignVoucher();
  const redeemVoucher = useRedeemCampaignVoucher();
  const redeemLoyalty = useStaffRedeem();
  const confirmGroup = useConfirmGroup();

  const [mode, setMode] = useState<ScanMode>("visit");
  const [overlay, setOverlay] = useState<OverlayState>(null);
  const [cameraActive, setCameraActive] = useState(false);
  // Incremented on dismiss so QrScanner remounts and auto-restarts after each scan.
  const [scanKey, setScanKey] = useState(0);
  // The campaign the staff tapped to count in the eligibility sheet.
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
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
    setSelectedCampaignId(null);
    busyRef.current = false;
    setScanKey((k) => k + 1);
    scanCustomer.reset();
    confirmVisit.reset();
    scanVoucher.reset();
    redeemVoucher.reset();
    redeemLoyalty.reset();
    confirmGroup.reset();
  };

  const handleGiveReward = (code: string, rewardTitle: string) => {
    redeemLoyalty.mutate({ code }, {
      onSuccess() {
        setOverlay({ kind: "reward_redeemed", rewardTitle });
      },
      onError(error) { showError(error); },
    });
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

    if (mode === "visit") {
      scanCustomer.mutate(token, {
        onSuccess(data) {
          setOverlay({ kind: "visit_eligibility", result: data });
        },
        onError(error) { showError(error); },
      });
      return;
    }

    // Redeem-reward mode.
    scanVoucher.mutate(token, {
      onSuccess(data) {
        // A group check-in token routes to the group-confirm sheet (plan Q4).
        if (data.group) {
          setOverlay({ kind: "group_eligible", group: data.group });
          return;
        }
        if (data.state === "valid") {
          setOverlay({ kind: "reward_valid", result: data });
          return;
        }
        // not_found / redeemed / expired / cancelled → invalid sheet with reason.
        setOverlay({
          kind: "invalid",
          title: t(`staff.campaign.invalid.${data.state}`),
          reason: data.reason ?? t("staff.campaign.invalid.generic"),
        });
      },
      onError(error) { showError(error); },
    });
  };

  const handleConfirmVisit = () => {
    if (overlay?.kind !== "visit_eligibility") return;
    // Pass the campaign the staff tapped, or omit to let the backend auto-pick.
    // One confirm advances both the loyalty card and the prioritized campaign.
    confirmVisit.mutate(
      { token: scannedTokenRef.current, campaignId: selectedCampaignId ?? undefined },
      {
        onSuccess(data) {
          setOverlay({ kind: "visit_unified", result: data });
        },
        onError(error) { showError(error); },
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

  const scanHint = mode === "visit" ? t("staff.campaign.pointVisit") : t("staff.campaign.pointVoucher");

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

            {/* Top overlay: business + staff pill + mode toggle */}
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

              {/* Confirm visit / Redeem reward toggle */}
              <ModeToggle mode={mode} onChange={(m) => { setMode(m); }} />
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
        {overlay?.kind === "visit_eligibility" && (
          <VisitEligibilitySheet
            result={overlay.result}
            selectedId={selectedCampaignId}
            onSelect={(row) => setSelectedCampaignId(row.campaign_id)}
            onConfirm={handleConfirmVisit}
            onDismiss={dismiss}
            isPending={confirmVisit.isPending}
          />
        )}
        {overlay?.kind === "visit_unified" && (
          <VisitUnifiedSheet
            result={overlay.result}
            onDismiss={dismiss}
            onGiveReward={handleGiveReward}
            isGivingReward={redeemLoyalty.isPending}
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
