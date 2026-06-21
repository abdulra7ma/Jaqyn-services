"use client";

import { useGroup } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button } from "@jaqyn/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CustomerShell } from "../../../_components/CustomerShell";
import { QueryBoundary } from "../../../_components/QueryBoundary";
import { inviteShort, inviteUrl, useCopy } from "../../../_components/groups";

const CHANNELS = [
  { key: "whatsapp", label: "WhatsApp", glyph: "💬", bg: "#25D366", verb: "shareOn" },
  { key: "telegram", label: "Telegram", glyph: "✈️", bg: "#229ED9", verb: "shareOn" },
  { key: "instagram", label: "Instagram", glyph: "📷", bg: "#E1306C", verb: "shareTo" },
] as const;

export default function InviteFriendsPage() {
  const t = useT();
  const { token } = useParams<{ token: string }>();
  const group = useGroup(token);
  const { copied, copy } = useCopy();

  const link = inviteUrl(token);

  return (
    <CustomerShell title={t("groups.invite")} back={`/groups/${token}`} showNav={false} hideChromeTitle>
      <QueryBoundary query={group}>
        {(g) => {
          const needed = Math.max(0, g.group_offer.min_group_size - g.members.length);
          const time = new Date(g.visit_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const message = `Join my group deal at ${g.group_offer.business.name}. We need ${needed} more to unlock ${g.group_offer.reward_description} — visit ${time} today.`;
          const shareText = `${message} ${link}`;
          const href = (key: string) => {
            const enc = encodeURIComponent(shareText);
            if (key === "whatsapp") return `https://wa.me/?text=${enc}`;
            if (key === "telegram")
              return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`;
            return null; // instagram has no web share intent
          };

          return (
            <div className="flex flex-col gap-5 pb-24">
              <div>
                <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">
                  {t("groups.invite")}
                </h1>
                <p className="mt-1 text-sm text-subtle">
                  {t("groups.inviteShareLead")} {t("groups.need")} {needed} {t("groups.peopleToUnlock")}.
                </p>
              </div>

              {/* pre-written message */}
              <div className="rounded-2xl border border-line bg-card p-4 shadow-card">
                <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">
                  {t("groups.prewritten")}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink">{message}</p>
              </div>

              {/* link + copy */}
              <div className="flex items-center gap-2 rounded-2xl bg-brand-muted px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">🔗 {inviteShort(token)}</span>
                <button
                  onClick={() => copy(link)}
                  className="flex-none rounded-lg bg-brand px-3.5 py-1.5 text-sm font-semibold text-brand-fg"
                >
                  {copied ? t("common.copied") : t("common.copy")}
                </button>
              </div>

              {/* share channels */}
              <div className="flex flex-col gap-2.5">
                {CHANNELS.map((c) => {
                  const url = href(c.key);
                  const inner = (
                    <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3.5 shadow-card transition hover:border-brand">
                      <span
                        className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-lg"
                        style={{ backgroundColor: c.bg }}
                      >
                        {c.glyph}
                      </span>
                      <span className="font-semibold text-ink">
                        {t(`groups.${c.verb}`)} {c.label}
                      </span>
                    </div>
                  );
                  return url ? (
                    <a key={c.key} href={url} target="_blank" rel="noopener noreferrer">
                      {inner}
                    </a>
                  ) : (
                    <button key={c.key} type="button" onClick={() => copy(shareText)} className="text-left">
                      {inner}
                    </button>
                  );
                })}
              </div>

              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-cream/95 p-4 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
                <div className="mx-auto max-w-2xl">
                  <Link href={`/groups/${token}`}>
                    <Button className="w-full">{t("groups.backToGroup")}</Button>
                  </Link>
                </div>
              </div>
            </div>
          );
        }}
      </QueryBoundary>
    </CustomerShell>
  );
}
