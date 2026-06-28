"use client";

import { useCampaignVoucher, usePresentVoucher, type CampaignVoucher } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge } from "@jaqyn/ui";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { CustomerShell } from "../../_components/CustomerShell";
import { QueryBoundary } from "../../_components/QueryBoundary";
import { VoucherItemSheet, VoucherQrBlock } from "../../_components/campaigns";
import { ListGroup, ListRow } from "../../_components/kit";
import { useRequireAuth } from "../../_lib/auth";

const STATUS_TONE = {
  active: "ok",
  redeemed: "neutral",
  expired: "danger",
  cancelled: "danger",
} as const;

function ActiveVoucher({ voucher }: { voucher: CampaignVoucher }) {
  const t = useT();
  // Customer-choice item vouchers must resolve their item before they can be
  // presented for redemption (multi-form-loyalty slice 3). Show the picker until
  // the customer has chosen; the polling query then re-renders with the QR.
  const needsItem = voucher.item_selection === "customer" && voucher.catalog_item == null;
  if (needsItem) {
    return <VoucherItemSheet campaignId={voucher.campaign.id} voucherId={voucher.id} />;
  }
  return (
    <>
      <VoucherQrBlock
        glyph={voucher.glyph}
        rewardTitle={voucher.reward_title}
        businessName={voucher.business.name}
        qrToken={voucher.qr_token}
        code={voucher.code}
      />
      <p className="mx-auto mt-2 max-w-[260px] text-center text-[13px] leading-relaxed text-subtle">
        {t("cmp.voucher.showStaff")}
      </p>

      <ListGroup>
        <ListRow label={t("cmp.voucher.campaign")} value={voucher.campaign.name} />
        {voucher.catalog_item && (
          <ListRow label={t("cmp.voucher.item")} value={voucher.catalog_item.name} />
        )}
        <ListRow label={t("cmp.voucher.validUntil")} value={voucher.expires_label} />
      </ListGroup>

      {/* waiting-for-staff pulse */}
      <div className="mx-auto mt-5 inline-flex items-center gap-2.5 rounded-pill border border-line bg-cream px-4 py-2.5 text-[13px] font-semibold text-subtle">
        <span className="relative h-2.5 w-2.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-amber/70" />
          <span className="absolute inset-[3px] rounded-full bg-amber" />
        </span>
        {t("cmp.voucher.waiting")}
      </div>
    </>
  );
}

function RedeemedVoucher({ voucher }: { voucher: CampaignVoucher }) {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
      <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-sage text-4xl text-white shadow-sage">
        ✓
      </div>
      <h2 className="font-display text-2xl font-extrabold text-ink">
        {t("cmp.voucher.redeemedTitle")}
      </h2>
      <p className="text-[15px] text-subtle">
        {voucher.reward_title} · {voucher.business.name}
      </p>
      <div className="w-full max-w-[290px] rounded-2xl border border-line bg-cream p-4 text-left">
        {voucher.redeemed_branch && (
          <div className="flex justify-between py-1.5 text-[13px]">
            <span className="text-subtle">{t("cmp.voucher.redeemedAt")}</span>
            <span className="font-semibold text-ink">{voucher.redeemed_branch}</span>
          </div>
        )}
        {voucher.redeemed_at_label && (
          <div className="flex justify-between py-1.5 text-[13px]">
            <span className="text-subtle">{t("cmp.voucher.redeemedOn")}</span>
            <span className="font-semibold text-ink">{voucher.redeemed_at_label}</span>
          </div>
        )}
        {voucher.redeemed_by && (
          <div className="flex justify-between py-1.5 text-[13px]">
            <span className="text-subtle">{t("cmp.voucher.redeemedBy")}</span>
            <span className="font-semibold text-ink">{voucher.redeemed_by}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TerminalVoucher({ voucher }: { voucher: CampaignVoucher }) {
  const t = useT();
  const title =
    voucher.status === "cancelled" ? t("cmp.voucher.cancelledTitle") : t("cmp.voucher.expiredTitle");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center opacity-80">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted text-3xl font-extrabold text-danger">
        !
      </div>
      <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
      <p className="text-[14px] text-subtle">
        {voucher.reward_title} · {voucher.business.name}
      </p>
    </div>
  );
}

export default function CampaignVoucherPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useRequireAuth();
  // Poll so a staff-side redemption flips active → redeemed without a manual refresh.
  const voucher = useCampaignVoucher(id, { refetchInterval: 3000 });

  // Presenting marks the voucher "waiting for staff" (backend records presented_at).
  const present = usePresentVoucher();
  const presented = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || presented.current) return;
    presented.current = true;
    // Best-effort: only meaningful while the voucher is active; ignore failures.
    present.mutate(id);
  }, [isAuthenticated, id, present]);

  return (
    <CustomerShell title={t("cmp.wallet.title")} back="/campaign-wallet" showNav={false} hideChromeTitle>
      {!isAuthenticated ? null : (
        <QueryBoundary query={voucher}>
          {(v) => (
            <div className="flex min-h-[78dvh] flex-col">
              <div className="flex justify-end">
                <Badge tone={STATUS_TONE[v.status]}>{t(`cmp.status.${v.status}`)}</Badge>
              </div>
              {v.status === "active" ? (
                <div className="mt-2">
                  <ActiveVoucher voucher={v} />
                </div>
              ) : v.status === "redeemed" ? (
                <RedeemedVoucher voucher={v} />
              ) : (
                <TerminalVoucher voucher={v} />
              )}
            </div>
          )}
        </QueryBoundary>
      )}
    </CustomerShell>
  );
}
