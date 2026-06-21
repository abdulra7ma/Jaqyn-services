"use client";

import { useGroupOffers, useMe, useMyGroups, type GroupDeal } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { QrScanner } from "../_components/QrScanner";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { GroupOfferCard } from "../_components/cards";
import { dealEmoji } from "../_components/groups";
import { useAuth } from "../_lib/auth";

const ACTIVE_STATUSES = ["forming", "full", "scheduled", "checking_in"];
const catLabel = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

export default function GroupOffersPage() {
  const t = useT();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const offers = useGroupOffers();
  const myGroups = useMyGroups();
  const me = useMe();
  const maxActive = me.data?.limits?.max_active_groups ?? 0;

  const [cat, setCat] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTab, setInviteTab] = useState<"paste" | "scan">("paste");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState(false);

  // Active groups, soonest visit first — the closest one leads the carousel.
  const actives: GroupDeal[] = isAuthenticated
    ? [...(myGroups.data ?? [])]
        .filter((g) => ACTIVE_STATUSES.includes(g.status))
        .sort((a, b) => new Date(a.visit_time).getTime() - new Date(b.visit_time).getTime())
    : [];

  const cats = useMemo(() => {
    const set = new Set((offers.data ?? []).map((o) => o.business.category));
    return ["all", ...set];
  }, [offers.data]);

  const navigateToGroup = (raw: string) => {
    const segments = raw.trim().split("/").filter(Boolean);
    const token = segments.pop() ?? "";
    if (token.length < 20) {
      setInviteError(true);
      return;
    }
    router.push(`/groups/${token}`);
  };

  const goJoin = () => {
    setInviteError(false);
    navigateToGroup(inviteCode);
  };

  return (
    <CustomerShell title={t("groups.deals.title")} hideChromeTitle>
      <div className="flex flex-col gap-5">
        {/* hero */}
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink sm:text-[30px]">
            {t("groups.deals.title")}
          </h1>
          <p className="mt-1 text-sm text-subtle">{t("groups.deals.subtitle")}</p>
        </div>

        {/* active-groups capacity indicator */}
        {isAuthenticated && maxActive > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">{t("groups.yourActive")}</p>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1">
                {Array.from({ length: maxActive }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 w-2 rounded-full transition-colors ${
                      i < actives.length ? "bg-brand" : "bg-line"
                    }`}
                  />
                ))}
              </div>
              <span className="rounded-pill bg-brand-muted px-2.5 py-0.5 text-xs font-bold text-brand">
                {actives.length}/{maxActive}
              </span>
            </div>
          </div>
        )}

        {/* active groups — swipeable carousel, closest visit first */}
        {actives.length > 0 && (
          <div
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none" }}
          >
            {actives.map((g, i) => (
              <Link
                key={g.id}
                href={`/groups/${g.invite_token}`}
                className={`relative flex snap-start items-center gap-3.5 overflow-hidden rounded-2xl bg-brand-gradient p-4 text-brand-fg shadow-glow transition active:scale-[.99] ${
                  actives.length > 1 ? "w-[86%] flex-none sm:w-[360px]" : "w-full"
                }`}
              >
                <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-white/15 text-2xl">
                  {dealEmoji(g.group_offer)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider opacity-85">
                    {t("groups.activeGroup")}
                    {actives.length > 1 ? ` ${i + 1}/${actives.length}` : ""}
                  </p>
                  <p className="truncate font-display font-bold">
                    {g.group_offer.business.name} · {g.members.length}/
                    {g.group_offer.min_group_size} {t("groups.joined")}
                  </p>
                </div>
                <span aria-hidden className="flex-none text-white/80">›</span>
              </Link>
            ))}
          </div>
        )}

        {/* invite-link banner */}
        <div className="rounded-2xl border border-dashed border-line bg-card/60 p-3">
          {!inviteOpen ? (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-brand"
            >
              <span aria-hidden className="text-base">🔗</span>
              {t("groups.haveInvite")}
              <span aria-hidden className="text-base">📷</span>
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              {/* tab row */}
              <div className="flex rounded-xl bg-board p-0.5">
                <button
                  type="button"
                  onClick={() => { setInviteTab("paste"); setInviteError(false); }}
                  className={`flex-1 rounded-[10px] py-1.5 text-sm font-semibold transition ${inviteTab === "paste" ? "bg-card text-ink shadow-sm" : "text-subtle"}`}
                >
                  🔗 {t("groups.linkTab")}
                </button>
                <button
                  type="button"
                  onClick={() => { setInviteTab("scan"); setInviteError(false); }}
                  className={`flex-1 rounded-[10px] py-1.5 text-sm font-semibold transition ${inviteTab === "scan" ? "bg-card text-ink shadow-sm" : "text-subtle"}`}
                >
                  📷 {t("groups.scanQr")}
                </button>
              </div>

              {inviteTab === "paste" ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); goJoin(); }}
                  className="flex flex-col gap-2"
                >
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={inviteCode}
                      onChange={(e) => { setInviteCode(e.target.value); setInviteError(false); }}
                      placeholder={t("groups.pasteInvite")}
                      className={`min-w-0 flex-1 rounded-xl border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-brand ${inviteError ? "border-danger" : "border-line"}`}
                    />
                    <button
                      type="submit"
                      disabled={!inviteCode.trim()}
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg disabled:opacity-50"
                    >
                      {t("groups.join")}
                    </button>
                  </div>
                  {inviteError && (
                    <p className="text-xs text-danger">{t("groups.invalidInvite")}</p>
                  )}
                </form>
              ) : (
                <QrScanner
                  onResult={(scanned) => navigateToGroup(scanned)}
                />
              )}
            </div>
          )}
        </div>

        {/* category chips */}
        {cats.length > 1 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`flex-none rounded-pill border px-4 py-1.5 text-sm font-semibold transition ${
                  cat === c
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-line bg-card text-subtle hover:border-brand"
                }`}
              >
                {c === "all" ? t("groups.all") : catLabel(c)}
              </button>
            ))}
          </div>
        )}

        {/* offers */}
        <QueryBoundary query={offers} isEmpty={(o) => o.length === 0} emptyMessage={t("groups.offersEmpty")}>
          {(list) => {
            const filtered = cat === "all" ? list : list.filter((o) => o.business.category === cat);
            return (
              <div className="grid gap-3 sm:grid-cols-2">
                {filtered.map((o) => (
                  <GroupOfferCard key={o.id} offer={o} />
                ))}
              </div>
            );
          }}
        </QueryBoundary>
      </div>
    </CustomerShell>
  );
}
