"use client";

import {
  useStaffCollect,
  useStaffPrograms,
  useStaffRedeem,
} from "@jaqyn/api";
import type { StaffCollectResult, StaffProgram } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { QrScanner, parseScanned } from "../../_components/QrScanner";
import { useErrMessage } from "../../_lib/useErrMessage";
import { useStaffAuth } from "../_lib/staffAuth";
import { StaffNav } from "../_components/StaffNav";

// ─── types ────────────────────────────────────────────────────────────────────

type ProgramMode = "stamp" | "spend";

type OverlayState =
  | { kind: "awarded"; result: StaffCollectResult }
  | { kind: "needs_amount"; token: string; result: StaffCollectResult }
  | { kind: "reward_ready"; result: StaffCollectResult }
  | { kind: "already_counted"; result: StaffCollectResult }
  | { kind: "error"; message: string }
  | { kind: "redeemed"; result: StaffCollectResult }
  | null;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Build stamp-dot array: filled up to progress, last filled = amber pop, rest dashed. */
function buildStampDots(current: number, target: number) {
  const dots: { label: string; filled: boolean; isLast: boolean }[] = [];
  for (let i = 0; i < target; i++) {
    const filled = i < current;
    dots.push({ label: filled ? "★" : String(i + 1), filled, isLast: filled && i === current - 1 });
  }
  return dots;
}

/** Spend progress % clamped 0-100. */
function spendPct(currentSpend: string, requiredSpend: string | null): number {
  if (!requiredSpend) return 0;
  const cur = parseFloat(currentSpend) || 0;
  const req = parseFloat(requiredSpend) || 1;
  return Math.min(100, Math.round((cur / req) * 100));
}

/** Derive the program label pill text from a StaffProgram. */
function programLabel(p: StaffProgram): string {
  if (p.type === "stamp") {
    const n = p.required_count ?? "?";
    return `Stamp · Buy ${n} get 1 free`;
  }
  if (p.type === "spend") {
    const amt = p.required_spend ?? "?";
    return `Spend · ${amt} SAR reward`;
  }
  return p.title;
}

// ─── overlay: Awarded ─────────────────────────────────────────────────────────

/** Thin bar pinned to the sheet's top edge that depletes over `duration`, then
 *  auto-dismisses. Gives a visible countdown for transient result overlays. */
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

function AwardedOverlay({
  result,
  onDismiss,
}: {
  result: StaffCollectResult;
  onDismiss: () => void;
}) {
  const t = useT();
  const isStamp = result.program.type === "stamp";
  const isSpend = result.program.type === "spend";
  const progress = result.progress;

  const headline = isStamp ? t("staff.scan.stampAdded") : t("staff.scan.paymentAdded");

  // Stamp dots
  const dots =
    isStamp && progress && progress.target_count
      ? buildStampDots(progress.current_count, progress.target_count)
      : [];

  // Spend display
  const spendText =
    isSpend && progress
      ? `${progress.current_spend} of ${progress.required_spend ?? "?"} SAR`
      : "";
  const pct =
    isSpend && progress
      ? spendPct(progress.current_spend, progress.required_spend)
      : 0;

  const countText =
    isStamp && progress && progress.target_count
      ? `${progress.current_count} of ${progress.target_count}`
      : "";

  return (
    /* Backdrop: dims + sage flash */
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end"
      style={{ background: "rgba(8,6,3,.5)" }}
      onClick={onDismiss}
    >
      {/* Sage flash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--sage, #3F7355)", animation: "jqFlash .9s ease forwards" }}
      />
      {/* Sheet */}
      <div
        className="relative"
        style={{
          background: "#fff",
          borderRadius: "30px 30px 0 0",
          padding: "30px 26px 34px",
          textAlign: "center",
          animation: "jqRise .32s cubic-bezier(.22,1,.36,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CountdownBar duration={2800} onDone={onDismiss} />
        {/* ✓ circle */}
        <div
          style={{
            width: 78, height: 78, borderRadius: "50%",
            background: "var(--sage, #3F7355)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 40, margin: "0 auto",
            animation: "jqPop .5s ease",
            boxShadow: "0 14px 30px -8px rgba(94,139,106,.6)",
          }}
        >✓</div>

        <div style={{ fontSize: 13.5, color: "var(--soft, #8C7A6A)", fontWeight: 600, marginTop: 18 }}>
          {result.customer.name}
        </div>
        <div style={{ font: "800 28px 'Bricolage Grotesque',sans-serif", marginTop: 3, letterSpacing: "-.01em" }}>
          {headline}
        </div>

        {/* Stamp track */}
        {isStamp && dots.length > 0 && (
          <>
            <div style={{ font: "700 17px 'Bricolage Grotesque',sans-serif", color: "var(--accent, #C25E3C)", marginTop: 6 }}>
              {countText}
            </div>
            <div style={{ display: "flex", gap: 7, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
              {dots.map((d, i) => (
                <span
                  key={i}
                  style={{
                    width: 30, height: 30, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700,
                    ...(d.filled
                      ? {
                          background: "var(--amber, #E7A23E)", color: "#fff",
                          ...(d.isLast ? { animation: "jqPop .5s ease" } : {}),
                        }
                      : { border: "2px dashed #DCC9AE", color: "#C7B193" }),
                  }}
                >
                  {d.label}
                </span>
              ))}
            </div>
          </>
        )}

        {/* Spend bar */}
        {isSpend && (
          <>
            <div style={{ font: "700 17px 'Bricolage Grotesque',sans-serif", color: "var(--accent, #C25E3C)", marginTop: 6 }}>
              {spendText}
            </div>
            <div style={{ height: 9, background: "#FBF6EE", borderRadius: 99, marginTop: 16, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`,
                background: "linear-gradient(90deg, var(--amber, #E7A23E), var(--accent, #C25E3C))",
                borderRadius: 99,
              }} />
            </div>
          </>
        )}

        {/* Banking rewards: reward earned line */}
        {result.rewards_earned != null && result.rewards_earned > 0 && (
          <div style={{ marginTop: 14, fontSize: 14, fontWeight: 700, color: "var(--ink, #2E241D)" }}>
            🎁 {t("staff.scan.rewardEarned")}{result.rewards_earned > 1 ? ` ×${result.rewards_earned}` : ""}
          </div>
        )}

        {/* Banking rewards: bank full notice */}
        {result.bank_full && (
          <div style={{
            marginTop: 10, padding: "9px 14px",
            background: "#FFFBEB", border: "1px solid #F5D97A",
            borderRadius: 12, fontSize: 13, color: "#92660C",
          }}>
            {t("staff.scan.bankFull")}
          </div>
        )}

        {/* Confirmed row */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 18, fontSize: 12, color: "var(--soft, #8C7A6A)" }}>
          <span style={{ position: "relative", width: 10, height: 10, display: "inline-block" }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--sage, #3F7355)", animation: "jqRipple 1.5s ease-out infinite" }} />
            <span style={{ position: "absolute", inset: 3, borderRadius: "50%", background: "var(--sage, #3F7355)" }} />
          </span>
          {t("staff.scan.confirmedNext")}
        </div>
      </div>
    </div>
  );
}

// ─── overlay: Purchase amount keypad ─────────────────────────────────────────

const KEYPAD_KEYS = ["1","2","3","4","5","6","7","8","9","C","0","⌫"] as const;

function AmountOverlay({
  token,
  result,
  programId,
  onSubmit,
  onDismiss,
  isPending,
}: {
  token: string;
  result: StaffCollectResult;
  programId: string | undefined;
  onSubmit: (token: string, amount: number, programId: string | undefined) => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  const t = useT();
  const [raw, setRaw] = useState("0");

  const tap = (key: string) => {
    setRaw((prev) => {
      if (key === "C") return "0";
      if (key === "⌫") {
        const next = prev.slice(0, -1);
        return next === "" || next === "-" ? "0" : next;
      }
      if (prev === "0" && key !== ".") return key;
      if (key === "." && prev.includes(".")) return prev;
      return prev + key;
    });
  };

  const numVal = parseFloat(raw) || 0;
  const canAdd = numVal > 0 && !isPending;
  const required = result.program.required_spend ?? "?";

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end"
      style={{ background: "rgba(8,6,3,.58)" }}
    >
      <div
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: "30px 30px 0 0",
          padding: "22px 22px 26px",
          animation: "jqRise .32s cubic-bezier(.22,1,.36,1)",
        }}
      >
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ font: "700 18px 'Bricolage Grotesque',sans-serif" }}>
              {t("staff.scan.purchaseAmount")}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--soft, #8C7A6A)", marginTop: 2 }}>
              {result.customer.name} · {t("staff.scan.spendHint").replace("{amount}", required)}
            </div>
          </div>
          <button
            onClick={onDismiss}
            style={{
              width: 38, height: 38, borderRadius: 11,
              border: "1px solid var(--line, #EFE3D1)", background: "#fff",
              fontSize: 16, color: "var(--soft, #8C7A6A)", cursor: "pointer", flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Amount display */}
        <div style={{
          background: "#FBF6EE",
          border: "1.5px solid var(--line, #EFE3D1)",
          borderRadius: 18, padding: "16px", marginTop: 15,
          display: "flex", alignItems: "baseline", justifyContent: "center", gap: 9,
        }}>
          <span style={{ font: "700 17px 'Hanken Grotesk',sans-serif", color: "var(--soft, #8C7A6A)" }}>SAR</span>
          <span style={{
            font: "800 38px 'Bricolage Grotesque',sans-serif",
            letterSpacing: "-.01em",
            color: numVal > 0 ? "var(--ink, #2E241D)" : "var(--soft, #8C7A6A)",
          }}>{raw}</span>
        </div>

        {/* Keypad */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9, marginTop: 15 }}>
          {KEYPAD_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => tap(k)}
              style={{
                padding: "16px 0",
                borderRadius: 14,
                border: "1.5px solid var(--line, #EFE3D1)",
                background: k === "C" ? "#FBF6EE" : "#fff",
                font: "700 18px 'Bricolage Grotesque',sans-serif",
                color: k === "C" ? "var(--accent, #C25E3C)" : "var(--ink, #2E241D)",
                cursor: "pointer",
              }}
            >{k}</button>
          ))}
        </div>

        {/* Add button */}
        <button
          onClick={() => canAdd && onSubmit(token, numVal, programId)}
          disabled={!canAdd}
          style={{
            width: "100%", marginTop: 15, padding: "19px",
            border: "none", borderRadius: 18,
            background: canAdd ? "var(--accent, #C25E3C)" : "#EFE3D1",
            color: canAdd ? "#fff" : "var(--soft, #8C7A6A)",
            font: "700 17px 'Hanken Grotesk',sans-serif",
            cursor: canAdd ? "pointer" : "not-allowed",
            boxShadow: canAdd ? "0 12px 26px -8px rgba(160,73,42,.5)" : "none",
            transition: "background .15s",
          }}
        >
          {isPending ? "…" : t("staff.collect.add")}
        </button>
      </div>
    </div>
  );
}

// ─── overlay: Reward ready ────────────────────────────────────────────────────

function RewardReadyOverlay({
  result,
  onConfirm,
  onDismiss,
  isPending,
}: {
  result: StaffCollectResult;
  onConfirm: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  const t = useT();
  const rewardTitle = result.reward?.reward_description ?? result.reward?.title ?? "";

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end"
      style={{ background: "rgba(8,6,3,.62)" }}
    >
      <div
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: "30px 30px 0 0",
          padding: "28px 24px 26px",
          animation: "jqRise .32s cubic-bezier(.22,1,.36,1)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 42, animation: "jqPop .5s ease" }}>🎁</div>
          <div style={{ fontSize: 13.5, color: "var(--soft, #8C7A6A)", fontWeight: 600, marginTop: 8 }}>
            {result.customer.name}
          </div>
          <div style={{ font: "800 26px 'Bricolage Grotesque',sans-serif", marginTop: 3, letterSpacing: "-.01em" }}>
            {t("staff.scan.rewardUnlocked")}
          </div>
          {rewardTitle && (
            <div style={{
              display: "inline-block",
              background: "#FBEFD9", color: "#B07A1E",
              borderRadius: 14, padding: "11px 20px", marginTop: 14,
              font: "700 19px 'Bricolage Grotesque',sans-serif",
            }}>{rewardTitle}</div>
          )}
          <div style={{ fontSize: 13, color: "var(--soft, #8C7A6A)", marginTop: 14, lineHeight: 1.5 }}>
            {t("staff.scan.rewardHandHint")}
          </div>
        </div>
        <button
          onClick={onConfirm}
          disabled={isPending}
          style={{
            width: "100%", marginTop: 20, padding: 20,
            border: "none", borderRadius: 18,
            background: "var(--sage, #3F7355)", color: "#fff",
            font: "700 18px 'Hanken Grotesk',sans-serif",
            cursor: "pointer",
            boxShadow: "0 16px 32px -10px rgba(94,139,106,.6)",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? "…" : t("staff.scan.confirmGive")}
        </button>
        <button
          onClick={onDismiss}
          style={{
            width: "100%", marginTop: 9, padding: 13,
            border: "none", borderRadius: 14,
            background: "none", color: "var(--soft, #8C7A6A)",
            font: "600 14px 'Hanken Grotesk',sans-serif",
            cursor: "pointer",
          }}
        >
          {t("staff.scan.notNow")}
        </button>
      </div>
    </div>
  );
}

// ─── overlay: Redeemed ────────────────────────────────────────────────────────

function RedeemedOverlay({
  result,
  onDismiss,
}: {
  result: StaffCollectResult;
  onDismiss: () => void;
}) {
  const t = useT();
  const rewardTitle = result.reward?.reward_description ?? result.reward?.title ?? "";

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end"
      style={{ background: "rgba(8,6,3,.5)" }}
      onClick={onDismiss}
    >
      {/* Sage flash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--sage, #3F7355)", animation: "jqFlash .9s ease forwards" }}
      />
      <div
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: "30px 30px 0 0",
          padding: "34px 26px 34px",
          textAlign: "center",
          animation: "jqRise .32s cubic-bezier(.22,1,.36,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          width: 78, height: 78, borderRadius: "50%",
          background: "var(--sage, #3F7355)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 40, margin: "0 auto",
          animation: "jqPop .5s ease",
          boxShadow: "0 14px 30px -8px rgba(94,139,106,.6)",
        }}>✓</div>
        <CountdownBar duration={2800} onDone={onDismiss} />
        <div style={{ font: "800 27px 'Bricolage Grotesque',sans-serif", marginTop: 18 }}>
          {t("staff.scan.redeemed")}
        </div>
        <div style={{ fontSize: 14, color: "var(--soft, #8C7A6A)", marginTop: 6 }}>
          {rewardTitle && `${rewardTitle} · `}{result.customer.name}
        </div>
      </div>
    </div>
  );
}

// ─── overlay: Already added ───────────────────────────────────────────────────

function AlreadyAddedOverlay({
  result,
  onDismiss,
}: {
  result: StaffCollectResult;
  onDismiss: () => void;
}) {
  const t = useT();

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end"
      style={{ background: "rgba(8,6,3,.45)" }}
      onClick={onDismiss}
    >
      <div
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: "30px 30px 0 0",
          padding: "26px 26px 32px",
          textAlign: "center",
          animation: "jqRise .32s cubic-bezier(.22,1,.36,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CountdownBar duration={2600} onDone={onDismiss} />
        <div style={{
          width: 66, height: 66, borderRadius: "50%",
          background: "#FBEFD9",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#B07A1E", fontSize: 30, margin: "0 auto",
        }}>↺</div>
        <div style={{ font: "800 23px 'Bricolage Grotesque',sans-serif", marginTop: 16 }}>
          {t("staff.scan.alreadyAdded")}
        </div>
        <div style={{ fontSize: 14, color: "var(--soft, #8C7A6A)", marginTop: 6, lineHeight: 1.5 }}>
          {result.customer.name} {t("staff.scan.alreadyBody")}
        </div>
        <button
          onClick={onDismiss}
          style={{
            marginTop: 18, padding: "13px 28px",
            border: "1.5px solid var(--line, #EFE3D1)", borderRadius: 14,
            background: "#fff", color: "var(--ink, #2E241D)",
            font: "700 14px 'Hanken Grotesk',sans-serif", cursor: "pointer",
          }}
        >
          {t("staff.scan.gotIt")}
        </button>
      </div>
    </div>
  );
}

// ─── overlay: Error ───────────────────────────────────────────────────────────

function ErrorOverlay({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const t = useT();

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end"
      style={{ background: "rgba(8,6,3,.5)" }}
      onClick={onDismiss}
    >
      <div
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: "30px 30px 0 0",
          padding: "26px 26px 32px",
          textAlign: "center",
          animation: "jqRise .32s cubic-bezier(.22,1,.36,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CountdownBar duration={3500} onDone={onDismiss} />
        <div style={{
          width: 66, height: 66, borderRadius: "50%",
          background: "#F7E4DF",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#B0563A", fontSize: 30, fontWeight: 800, margin: "0 auto",
        }}>!</div>
        <div style={{ font: "800 22px 'Bricolage Grotesque',sans-serif", marginTop: 16, color: "#A8462C" }}>
          {t("staff.scan.cantAdd")}
        </div>
        <div style={{ fontSize: 14, color: "var(--soft, #8C7A6A)", marginTop: 6, lineHeight: 1.5 }}>
          {message || t("staff.scan.errorBody")}
        </div>
        <button
          onClick={onDismiss}
          style={{
            marginTop: 18, padding: "13px 28px",
            border: "1.5px solid var(--line, #EFE3D1)", borderRadius: 14,
            background: "#fff", color: "var(--ink, #2E241D)",
            font: "700 14px 'Hanken Grotesk',sans-serif", cursor: "pointer",
          }}
        >
          {t("staff.scan.dismiss")}
        </button>
      </div>
    </div>
  );
}

// ─── camera-off state ─────────────────────────────────────────────────────────

function CameraOff({
  onEnable,
  onManual,
}: {
  onEnable: () => void;
  onManual: (code: string) => void;
}) {
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
      {/* Camera-off icon */}
      <div style={{
        width: 74, height: 74, borderRadius: "50%",
        background: "rgba(255,255,255,.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,.8)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 2l20 20"/>
          <path d="M9.4 4h5.2l1.4 2H21a1 1 0 0 1 1 1v10.5M7 6H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h14"/>
          <path d="M9.9 9.9A3 3 0 0 0 12 15a3 3 0 0 0 2.1-.9"/>
        </svg>
      </div>
      <div style={{ color: "#fff", font: "700 19px 'Bricolage Grotesque',sans-serif", marginTop: 18 }}>
        {t("staff.scan.cameraOff")}
      </div>
      <div style={{ color: "rgba(255,255,255,.6)", fontSize: 13.5, marginTop: 8, lineHeight: 1.5, maxWidth: 240 }}>
        {t("staff.scan.cameraOffHint")}
      </div>
      <button
        onClick={onEnable}
        style={{
          marginTop: 22, padding: "15px 26px",
          border: "none", borderRadius: 15,
          background: "var(--accent, #C25E3C)", color: "#fff",
          font: "700 15px 'Hanken Grotesk',sans-serif", cursor: "pointer",
          boxShadow: "0 12px 26px -8px rgba(160,73,42,.6)",
        }}
      >
        {t("staff.scan.enableCamera")}
      </button>

      {/* Manual code entry fallback */}
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
            style={{
              width: "100%", padding: "13px 16px", borderRadius: 14,
              border: "1.5px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.08)",
              color: "#fff", fontSize: 15, outline: "none",
              fontFamily: "'Hanken Grotesk',sans-serif",
            }}
          />
          <button
            type="submit"
            disabled={!code.trim()}
            style={{
              marginTop: 10, width: "100%", padding: "14px",
              borderRadius: 14, border: "none",
              background: code.trim() ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.07)",
              color: code.trim() ? "#fff" : "rgba(255,255,255,.35)",
              font: "700 15px 'Hanken Grotesk',sans-serif", cursor: code.trim() ? "pointer" : "not-allowed",
            }}
          >
            {t("staff.scan.manualSubmit")}
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowManual(true)}
          style={{
            marginTop: 14, background: "none", border: "none",
            color: "rgba(255,255,255,.55)", fontSize: 13,
            fontFamily: "'Hanken Grotesk',sans-serif", cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {t("staff.scan.manualCode")}
        </button>
      )}

      {/* Test-only: upload a QR image → runs the real collect flow. Env-gated. */}
      {testUpload && (
        <>
          <div id="qr-file-region" style={{ display: "none" }} />
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={decoding}
            style={{
              marginTop: 16, padding: "10px 18px",
              borderRadius: 12, border: "1px dashed rgba(255,255,255,.3)",
              background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.75)",
              font: "600 12.5px 'Hanken Grotesk',sans-serif",
              cursor: decoding ? "wait" : "pointer",
            }}
          >
            {decoding ? t("common.loading") : `🧪 ${t("staff.scan.testUpload")}`}
          </button>
          {uploadErr && (
            <div style={{ color: "#E2A0A0", fontSize: 12, marginTop: 8 }}>{uploadErr}</div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Program pill + toggle ─────────────────────────────────────────────────────

function ProgramBar({
  programs,
  mode,
  onToggle,
}: {
  programs: StaffProgram[];
  mode: ProgramMode;
  onToggle: (m: ProgramMode) => void;
}) {
  const t = useT();
  const stampProg = programs.find((p) => p.type === "stamp");
  const spendProg = programs.find((p) => p.type === "spend");
  const current = mode === "stamp" ? stampProg : spendProg;
  const label = current ? programLabel(current) : "";

  const hasStamp = !!stampProg;
  const hasSpend = !!spendProg;
  const showToggle = hasStamp && hasSpend;

  const btnBase: React.CSSProperties = {
    padding: "7px 13px", border: "none", borderRadius: 8, cursor: "pointer",
    fontSize: 12.5, fontWeight: 600,
    fontFamily: "'Hanken Grotesk',sans-serif",
    transition: "background .15s, color .15s",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 14 }}>
      {/* Program pill */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        background: "rgba(255,255,255,.1)",
        border: "1px solid rgba(255,255,255,.14)",
        borderRadius: 99, padding: "6px 12px",
        maxWidth: "60%",
      }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--sage, #3F7355)", flexShrink: 0 }} />
        <span style={{ color: "#fff", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {label}
        </span>
      </div>

      {/* Segmented toggle — only when both program types exist */}
      {showToggle && (
        <div style={{
          display: "flex", gap: 3,
          background: "rgba(0,0,0,.32)",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 11, padding: 3, flexShrink: 0,
        }}>
          <button
            onClick={() => onToggle("stamp")}
            style={{
              ...btnBase,
              background: mode === "stamp" ? "#fff" : "transparent",
              color: mode === "stamp" ? "var(--ink, #2E241D)" : "rgba(255,255,255,.7)",
            }}
          >
            {t("staff.scan.progStamp")}
          </button>
          <button
            onClick={() => onToggle("spend")}
            style={{
              ...btnBase,
              background: mode === "spend" ? "#fff" : "transparent",
              color: mode === "spend" ? "var(--ink, #2E241D)" : "rgba(255,255,255,.7)",
            }}
          >
            {t("staff.scan.progSpend")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function StaffScanPage() {
  const t = useT();
  const errMessage = useErrMessage();
  const { isStaff, ready, staff } = useStaffAuth();

  const collect = useStaffCollect();
  const redeem = useStaffRedeem();
  const programsQuery = useStaffPrograms(isStaff);

  const programs: StaffProgram[] = programsQuery.data?.programs ?? [];
  const stampProg = programs.find((p) => p.type === "stamp");
  const spendProg = programs.find((p) => p.type === "spend");

  // Default to stamp if available, else spend, else stamp
  const defaultMode: ProgramMode = stampProg ? "stamp" : spendProg ? "spend" : "stamp";
  const [mode, setMode] = useState<ProgramMode>(defaultMode);

  // When programs load, snap to a valid mode
  const modeRef = useRef(mode);
  if (programs.length > 0) {
    const hasMode = programs.some((p) => p.type === mode);
    if (!hasMode) {
      const next: ProgramMode = programs[0]?.type === "spend" ? "spend" : "stamp";
      if (modeRef.current !== next) {
        modeRef.current = next;
        // setState in render is deferred via effect — use ref guard to avoid loop
      }
    }
  }

  const selectedProgram = programs.find((p) => p.type === mode);

  const [overlay, setOverlay] = useState<OverlayState>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const overlayOpenRef = useRef(false);

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
    overlayOpenRef.current = false;
    collect.reset();
    redeem.reset();
  };

  const handleScan = (token: string) => {
    if (overlayOpenRef.current || collect.isPending) return;
    overlayOpenRef.current = true;
    collect.mutate(
      { token, program_id: selectedProgram?.id },
      {
        onSuccess(data) {
          switch (data.state) {
            case "awarded":
              setOverlay({ kind: "awarded", result: data });
              break;
            case "needs_amount":
              setOverlay({ kind: "needs_amount", token, result: data });
              break;
            case "reward_ready":
              setOverlay({ kind: "reward_ready", result: data });
              break;
            case "already_counted":
              setOverlay({ kind: "already_counted", result: data });
              break;
            default:
              overlayOpenRef.current = false;
          }
        },
        onError(error) {
          setOverlay({ kind: "error", message: errMessage(error) });
        },
      },
    );
  };

  const handleAmountSubmit = (token: string, amount: number, programId: string | undefined) => {
    collect.mutate(
      { token, amount, program_id: programId },
      {
        onSuccess(data) {
          switch (data.state) {
            case "awarded":
              setOverlay({ kind: "awarded", result: data });
              break;
            case "reward_ready":
              setOverlay({ kind: "reward_ready", result: data });
              break;
            case "already_counted":
              setOverlay({ kind: "already_counted", result: data });
              break;
            default:
              dismiss();
          }
        },
        onError(error) {
          setOverlay({ kind: "error", message: errMessage(error) });
        },
      },
    );
  };

  const handleConfirmGive = () => {
    if (overlay?.kind !== "reward_ready") return;
    const code = overlay.result.redemption?.code;
    if (!code) return;
    redeem.mutate(
      { code },
      {
        onSuccess() {
          if (overlay?.kind === "reward_ready") {
            setOverlay({ kind: "redeemed", result: overlay.result });
          }
        },
        onError(error) {
          setOverlay({ kind: "error", message: errMessage(error) });
        },
      },
    );
  };

  const businessName = staff?.business_name ?? "";
  const staffName = staff?.name ?? "";
  const role = staff?.role ?? "cashier";
  const bizInitial = (businessName[0] ?? "M").toUpperCase();

  // Desktop has no scanner — render nothing while the redirect to Groups runs.
  if (isDesktop) return null;

  // Not authenticated — show minimal sign-in prompt
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

  return (
    /* Responsive: phone-width column centered on wide screens */
    <div className="mx-auto flex min-h-screen max-w-[440px] flex-col" style={{ background: "#14100B" }}>
      {/* Camera area — fills remaining height */}
      <div className="relative flex-1 overflow-hidden">

        {/* ── Camera ON: dark gradient bg, top overlay, frame, scanner ── */}
        {cameraActive && (
          <div className="absolute inset-0">
            {/* Dark radial bg */}
            <div style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(125% 80% at 68% 16%, #3c3024 0%, #221a12 46%, #14100B 100%)",
            }} />
            {/* Warm corner glows */}
            <div style={{
              position: "absolute", top: -40, left: -34, width: 250, height: 250, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(231,162,62,.20), transparent 64%)", filter: "blur(7px)",
            }} />
            <div style={{
              position: "absolute", bottom: 150, right: -44, width: 230, height: 230, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(194,94,60,.18), transparent 66%)", filter: "blur(9px)",
            }} />
            {/* Scan lines texture */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "repeating-linear-gradient(0deg, rgba(255,255,255,.015) 0 2px, transparent 2px 4px)",
            }} />

            {/* Real QrScanner (hidden beneath UI — scans the full viewport) */}
            <div className="absolute inset-0 opacity-0 pointer-events-none">
              <QrScanner onResult={handleScan} />
            </div>

            {/* Top overlay: business + staff pill + program bar */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0,
              padding: "16px 18px 30px",
              background: "linear-gradient(to bottom, rgba(10,7,4,.78), transparent)",
              zIndex: 6,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Business avatar */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 11,
                    background: "linear-gradient(150deg, #C25E3C, #A2492A)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", font: "800 17px 'Bricolage Grotesque',sans-serif",
                  }}>{bizInitial}</div>
                  <div>
                    <div style={{ color: "#fff", font: "700 15px 'Bricolage Grotesque',sans-serif" }}>
                      {businessName}
                    </div>
                    <div style={{ color: "rgba(255,255,255,.6)", fontSize: 11.5 }}>
                      {staffName} · {t(`staff.role.${role}`)}
                    </div>
                  </div>
                </div>
                {/* STAFF pill */}
                <span style={{
                  background: "rgba(255,255,255,.14)", color: "#fff",
                  fontSize: 10.5, fontWeight: 700,
                  padding: "5px 10px", borderRadius: 99, letterSpacing: ".05em",
                }}>STAFF</span>
              </div>

              {/* Program pill + Stamp/Spend toggle */}
              {programs.length > 0 && (
                <ProgramBar programs={programs} mode={mode} onToggle={setMode} />
              )}
            </div>

            {/* Target frame (228×228, centered slightly above mid) */}
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -58%)",
              width: 228, height: 228,
            }}>
              {/* Corner brackets */}
              <i style={{ position: "absolute", top: 0, left: 0, width: 36, height: 36, borderTop: "4px solid #fff", borderLeft: "4px solid #fff", borderRadius: "16px 0 0 0" }} />
              <i style={{ position: "absolute", top: 0, right: 0, width: 36, height: 36, borderTop: "4px solid #fff", borderRight: "4px solid #fff", borderRadius: "0 16px 0 0" }} />
              <i style={{ position: "absolute", bottom: 0, left: 0, width: 36, height: 36, borderBottom: "4px solid #fff", borderLeft: "4px solid #fff", borderRadius: "0 0 0 16px" }} />
              <i style={{ position: "absolute", bottom: 0, right: 0, width: 36, height: 36, borderBottom: "4px solid #fff", borderRight: "4px solid #fff", borderRadius: "0 0 16px 0" }} />
              {/* Animated amber scan line */}
              <div style={{
                position: "absolute", left: 12, right: 12, height: 2.5, borderRadius: 2,
                background: "linear-gradient(90deg, transparent, var(--amber, #E7A23E), transparent)",
                boxShadow: "0 0 16px 2px rgba(231,162,62,.55)",
                animation: "jqScanLine 2.6s ease-in-out infinite",
              }} />
            </div>

            {/* Caption below frame */}
            <div style={{
              position: "absolute",
              top: "calc(50% + 126px)",
              left: 0, right: 0,
              textAlign: "center",
              color: "rgba(255,255,255,.8)",
              fontSize: 13.5, fontWeight: 600,
            }}>
              {t("staff.scan.pointQr")}
            </div>

            {/* Camera-off button (bottom-right) */}
            <button
              onClick={() => setCameraActive(false)}
              style={{
                position: "absolute", bottom: 72, right: 18, zIndex: 6,
                background: "none", border: "none",
                color: "rgba(255,255,255,.5)",
                font: "600 11.5px 'Hanken Grotesk',sans-serif",
                cursor: "pointer",
              }}
            >
              Camera off
            </button>
          </div>
        )}

        {/* ── Camera OFF ── */}
        {!cameraActive && (
          <CameraOff
            onEnable={() => setCameraActive(true)}
            onManual={handleScan}
          />
        )}

        {/* ── Result Overlays (mounted on top of camera area) ── */}
        {overlay?.kind === "awarded" && (
          <AwardedOverlay result={overlay.result} onDismiss={dismiss} />
        )}
        {overlay?.kind === "needs_amount" && (
          <AmountOverlay
            token={overlay.token}
            result={overlay.result}
            programId={selectedProgram?.id}
            onSubmit={handleAmountSubmit}
            onDismiss={dismiss}
            isPending={collect.isPending}
          />
        )}
        {overlay?.kind === "reward_ready" && (
          <RewardReadyOverlay
            result={overlay.result}
            onConfirm={handleConfirmGive}
            onDismiss={dismiss}
            isPending={redeem.isPending}
          />
        )}
        {overlay?.kind === "redeemed" && (
          <RedeemedOverlay result={overlay.result} onDismiss={dismiss} />
        )}
        {overlay?.kind === "already_counted" && (
          <AlreadyAddedOverlay result={overlay.result} onDismiss={dismiss} />
        )}
        {overlay?.kind === "error" && (
          <ErrorOverlay message={overlay.message} onDismiss={dismiss} />
        )}
      </div>

      {/* ── Bottom nav — dark theme for the immersive scanner ── */}
      <StaffNav theme="light" />
    </div>
  );
}
