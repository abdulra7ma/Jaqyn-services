"use client";

// Social Post Studio (design SOCIAL POST STUDIO). Modal that turns a campaign into
// a copy-ready, downloadable/shareable social post. Left = live PNG-able preview
// (campaign image + gradient overlay + reward chip / headline / subtext / QR-CTA),
// right = platform tabs, editable post text, auto-join link, per-platform caption,
// and download/share actions. Server state (the composed payload) comes from
// useCampaignSocialPost; everything the user edits is co-located UI state seeded
// from that payload. All copy goes through @jaqyn/i18n.

import { useCampaignSocialPost, type SocialPlatform } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";

const PLATFORMS: SocialPlatform[] = ["instagram", "tiktok", "facebook", "whatsapp"];

// Aspect ratios per format (design format tabs). value = width/height for the
// preview box; the rendered PNG keeps the same ratio.
type Format = "story" | "portrait" | "square" | "landscape";
const FORMAT_RATIO: Record<Format, number> = {
  story: 9 / 16,
  portrait: 4 / 5,
  square: 1,
  landscape: 16 / 9,
};
const FORMATS: Format[] = ["story", "portrait", "square", "landscape"];

type Position = "top" | "center" | "bottom";
const POSITION_JUSTIFY: Record<Position, string> = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
};

// Resolve a possibly-relative /media url to an absolute, same-origin one so the
// browser (and html-to-image) can load it. Backend returns relative /media/...
function mediaSrc(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (typeof window === "undefined") return url;
  return `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
}

// Web-composer / deep-link fallbacks when the Web Share API is unavailable.
function composerUrl(platform: SocialPlatform, link: string): string {
  const enc = encodeURIComponent(link);
  switch (platform) {
    case "whatsapp":
      return `https://wa.me/?text=${enc}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${enc}`;
    case "tiktok":
      return "https://www.tiktok.com/upload";
    case "instagram":
    default:
      return "https://www.instagram.com/";
  }
}

export function SocialPostStudio({
  campaignId,
  campaignName,
  businessName,
  onClose,
}: {
  campaignId: string;
  campaignName: string;
  businessName: string;
  onClose: () => void;
}) {
  const t = useT();
  const query = useCampaignSocialPost(campaignId);
  const previewRef = useRef<HTMLDivElement>(null);

  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [format, setFormat] = useState<Format>("story");
  const [position, setPosition] = useState<Position>("bottom");
  const [editOpen, setEditOpen] = useState(false);

  // Editable post fields — seeded from the server payload once it loads.
  const [headline, setHeadline] = useState("");
  const [reward, setReward] = useState("");
  const [subtext, setSubtext] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [extra, setExtra] = useState("");
  const [caption, setCaption] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const data = query.data;
  const link = data?.auto_join_url ?? "";

  // Seed editable text when the payload arrives (server → UI state, once).
  useEffect(() => {
    if (!data) return;
    setHeadline(data.headline);
    setReward(data.reward_title);
    setSubtext(data.subtext);
    setButtonText(data.button_text);
  }, [data]);

  // Caption follows the selected platform's prefilled text.
  useEffect(() => {
    if (data) setCaption(data.captions[platform] ?? "");
  }, [data, platform]);

  const imgSrc = useMemo(() => mediaSrc(data?.image_url ?? null), [data?.image_url]);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(t("cmp.social.copied"));
    } catch {
      flash(t("cmp.social.copied"));
    }
  }

  // Render the preview node to a PNG blob (shared by download + share).
  async function renderPng(): Promise<Blob | null> {
    if (!previewRef.current) return null;
    const url = await toPng(previewRef.current, { cacheBust: true, pixelRatio: 2 });
    const res = await fetch(url);
    return res.blob();
  }

  async function onDownload() {
    setBusy(true);
    try {
      const blob = await renderPng();
      if (!blob) return;
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${campaignName.replace(/\s+/g, "-").toLowerCase() || "post"}.png`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      flash(t("cmp.social.downloadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    setBusy(true);
    try {
      const blob = await renderPng();
      const file = blob
        ? new File([blob], "post.png", { type: "image/png" })
        : null;
      const shareData: ShareData = { text: caption, url: link };
      if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ ...shareData, files: [file] });
        return;
      }
      // No file-share support — copy the caption and open the platform composer.
      await navigator.clipboard.writeText(caption).catch(() => undefined);
      window.open(composerUrl(platform, link), "_blank", "noopener,noreferrer");
      flash(t("cmp.social.shareFailed"));
    } catch {
      flash(t("cmp.social.shareFailed"));
    } finally {
      setBusy(false);
    }
  }

  const ratio = FORMAT_RATIO[format];
  // Fit the preview inside the panel: cap height at ~420px, derive width.
  const maxH = 420;
  const previewW = Math.min(366, maxH * ratio);
  const previewH = previewW / ratio;

  const platformLabel = t(`cmp.social.platform.${platform}`);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/[0.62] p-4 sm:p-7"
      role="dialog"
      aria-modal
      aria-label={t("cmp.social.title")}
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-[940px] flex-col overflow-hidden rounded-[24px] border border-line bg-card shadow-2xl md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- Preview panel ---- */}
        <div className="flex flex-none flex-col items-center bg-[linear-gradient(165deg,#2E241D,#3C2E22)] p-6 md:w-[430px]">
          <div className="flex w-full items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-white/55">
              {t("cmp.social.preview")}
            </span>
            <span className="text-[11.5px] text-white/55">{t(`cmp.social.format.${format}`)}</span>
          </div>

          <div className="my-3.5 flex w-full flex-1 items-center justify-center">
            <div
              ref={previewRef}
              className="relative overflow-hidden rounded-2xl shadow-2xl"
              style={{ width: previewW, height: previewH, background: "#3C2E22" }}
            >
              {imgSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- rendered to canvas by html-to-image; next/image can't be captured
                <img
                  src={imgSrc}
                  alt=""
                  crossOrigin="anonymous"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg,rgba(124,53,32,.34) 0%,rgba(46,36,29,.5) 46%,rgba(124,53,32,.93) 100%)",
                }}
              />
              <div className="pointer-events-none relative flex h-full flex-col justify-between p-[18px] text-white">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-[7px]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-white font-display text-sm font-extrabold text-brand">
                      J
                    </span>
                    <span className="font-display text-sm font-extrabold">Jaqyn</span>
                  </span>
                  <span className="text-[11px] font-semibold opacity-85">{businessName}</span>
                </div>

                <div
                  className="flex flex-1 flex-col py-3"
                  style={{ justifyContent: POSITION_JUSTIFY[position] }}
                >
                  {reward ? (
                    <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold">
                      🎁 {reward}
                    </div>
                  ) : null}
                  <div className="mt-2.5 font-display text-[22px] font-extrabold leading-[1.05] tracking-[-0.01em] text-balance">
                    {headline}
                  </div>
                  {subtext ? (
                    <div className="mt-1.5 line-clamp-3 text-xs leading-snug opacity-90">
                      {subtext}
                    </div>
                  ) : null}
                  {extra ? (
                    <div className="mt-2.5 inline-flex items-center self-start rounded-lg bg-amber px-2.5 py-1.5 font-display text-xs font-extrabold text-[#3a2a12]">
                      {extra}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2.5 rounded-[13px] bg-white p-2.5">
                  <div className="h-[52px] w-[52px] flex-none">
                    {link ? (
                      <QRCode value={link} size={52} style={{ height: 52, width: 52 }} />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="font-display text-[13px] font-extrabold text-ink">
                      {buttonText}
                    </div>
                    <div className="truncate text-[11.5px] font-bold text-brand">{link}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-wrap gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                aria-pressed={format === f}
                className={`flex-1 rounded-lg px-2 py-2 text-[11px] font-bold transition ${
                  format === f ? "bg-white text-ink" : "bg-white/10 text-white/70"
                }`}
              >
                {t(`cmp.social.format.${f}`)}
              </button>
            ))}
          </div>
        </div>

        {/* ---- Controls panel ---- */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="flex items-start justify-between gap-3 px-6 pt-6">
            <div>
              <div className="font-display text-xl font-bold tracking-[-0.01em] text-ink">
                {t("cmp.social.title")}
              </div>
              <div className="mt-0.5 text-[13px] text-subtle">{campaignName}</div>
            </div>
            <button
              onClick={onClose}
              aria-label={t("common.cancel")}
              className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-line bg-card text-[17px] text-subtle"
            >
              ✕
            </button>
          </div>

          {query.isLoading ? (
            <div className="px-6 py-10 text-center text-sm text-subtle">{t("common.loading")}</div>
          ) : query.isError ? (
            <div className="px-6 py-10 text-center text-sm text-danger">{t("common.error")}</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-3.5 px-6 pt-4">
                <span className="text-xs font-semibold text-subtle">
                  {t("cmp.social.feature.feed")}
                </span>
                <span className="text-xs font-semibold text-subtle">
                  {t("cmp.social.feature.story")}
                </span>
                <span className="text-xs font-semibold text-subtle">
                  {t("cmp.social.feature.caption")}
                </span>
              </div>

              {/* platform tabs */}
              <div className="px-6 pt-5">
                <div className="text-xs font-bold uppercase tracking-[0.04em] text-subtle">
                  {t("cmp.social.platform")}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      aria-pressed={platform === p}
                      className={`rounded-xl border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition ${
                        platform === p
                          ? "border-brand bg-brand-muted text-brand-deep"
                          : "border-line bg-card text-subtle"
                      }`}
                    >
                      {t(`cmp.social.platform.${p}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* post text editor (collapsible) */}
              <div className="px-6 pt-5">
                <button
                  onClick={() => setEditOpen((o) => !o)}
                  aria-expanded={editOpen}
                  className="flex w-full items-center justify-between"
                >
                  <span className="text-xs font-bold uppercase tracking-[0.04em] text-subtle">
                    {t("cmp.social.postText")}{" "}
                    <span className="font-medium normal-case tracking-normal">
                      {t("cmp.social.postTextHint")}
                    </span>
                  </span>
                  <span className="text-[15px] font-extrabold text-brand">
                    {editOpen ? "▾" : "▸"}
                  </span>
                </button>
                {editOpen && (
                  <div className="mt-3 flex flex-col gap-2.5">
                    <div className="flex gap-2.5">
                      <StudioField
                        label={t("cmp.social.field.headline")}
                        value={headline}
                        onChange={setHeadline}
                        flex="1.4"
                      />
                      <StudioField
                        label={t("cmp.social.field.reward")}
                        value={reward}
                        onChange={setReward}
                      />
                    </div>
                    <StudioField
                      label={t("cmp.social.field.subtext")}
                      value={subtext}
                      onChange={setSubtext}
                    />
                    <div className="flex gap-2.5">
                      <StudioField
                        label={t("cmp.social.field.button")}
                        value={buttonText}
                        onChange={setButtonText}
                      />
                      <StudioField
                        label={`${t("cmp.social.field.extra")} ${t("cmp.social.field.extraOptional")}`}
                        value={extra}
                        onChange={setExtra}
                        placeholder={t("cmp.social.field.extraPlaceholder")}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="whitespace-nowrap text-[11px] font-bold text-subtle">
                        {t("cmp.social.position")}
                      </span>
                      <div className="flex flex-1 gap-1.5">
                        {(["top", "center", "bottom"] as Position[]).map((p) => (
                          <button
                            key={p}
                            onClick={() => setPosition(p)}
                            aria-pressed={position === p}
                            className={`flex-1 rounded-lg border-[1.5px] px-2 py-2 text-xs font-semibold transition ${
                              position === p
                                ? "border-brand bg-brand-muted text-brand-deep"
                                : "border-line bg-card text-subtle"
                            }`}
                          >
                            {t(`cmp.social.position.${p}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* auto-join link */}
              <div className="px-6 pt-5">
                <div className="text-xs font-bold uppercase tracking-[0.04em] text-subtle">
                  {t("cmp.social.link")}
                </div>
                <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5">
                  <span aria-hidden>🔗</span>
                  <span className="flex-1 truncate font-mono text-[13.5px] font-semibold text-ink">
                    {link}
                  </span>
                  <button
                    onClick={() => copy(link)}
                    className="flex-none rounded-lg bg-brand-muted px-3 py-1.5 font-display text-[12.5px] font-bold text-brand"
                  >
                    {t("common.copy")}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-snug text-subtle">{t("cmp.social.linkHint")}</p>
              </div>

              {/* caption */}
              <div className="px-6 pt-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-[0.04em] text-subtle">
                    {t("cmp.social.caption")} · {platformLabel}
                  </span>
                  <button
                    onClick={() => copy(caption)}
                    className="font-display text-[12.5px] font-bold text-brand"
                  >
                    {t("cmp.social.copyCaption")}
                  </button>
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={5}
                  className="mt-2.5 w-full resize-none whitespace-pre-wrap rounded-[13px] border-[1.5px] border-line bg-card p-3.5 text-[13.5px] leading-relaxed text-ink outline-none focus:border-brand"
                />
              </div>

              {/* actions */}
              <div className="flex gap-2.5 px-6 py-6">
                <button
                  onClick={onDownload}
                  disabled={busy}
                  className="flex-none rounded-[13px] border-[1.5px] border-line bg-card px-4 py-3.5 font-display text-[13.5px] font-bold text-ink disabled:opacity-60"
                >
                  {t("cmp.social.download")}
                </button>
                <button
                  onClick={onShare}
                  disabled={busy}
                  className="flex-1 rounded-[13px] bg-brand py-3.5 font-display text-sm font-bold text-brand-fg shadow-glow disabled:opacity-60"
                >
                  {t("cmp.social.share").replace("{platform}", platformLabel)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-7 left-1/2 z-[90] -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function StudioField({
  label,
  value,
  onChange,
  placeholder,
  flex,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  flex?: string;
}) {
  return (
    <label className="block" style={{ flex: flex ?? "1" }}>
      <span className="text-[11px] font-bold text-subtle">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-[10px] border-[1.5px] border-line bg-card px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-brand"
      />
    </label>
  );
}
