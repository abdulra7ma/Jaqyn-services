"use client";

// Settings › Account: today's staff access code + sign out. Folded in from the
// old /business/more menu so settings is self-complete.

import { useBusinessMe, useRegenerateApprovalCode, useSetOwnerStaff } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useRouter } from "next/navigation";
import { useErrMessage } from "../../../_lib/useErrMessage";
import { useAuth } from "../../../_lib/auth";
import { SectionCard } from "./parts";

export function AccountSection() {
  const t = useT();
  const router = useRouter();
  const errMessage = useErrMessage();
  const { logout } = useAuth();
  const regen = useRegenerateApprovalCode();
  const me = useBusinessMe();
  const setOwnerStaff = useSetOwnerStaff();
  const isStaff = me.data?.owner_is_staff ?? false;

  return (
    <div className="flex flex-col gap-4">
      {/* Owner works as staff — creates/deactivates the owner's own staff seat,
          which enables the "switch to staff" option in the account menu. */}
      <SectionCard title={t("owner.profile.workAsStaff")} hint={t("owner.profile.workAsStaffHint")}>
        <button
          type="button"
          role="switch"
          aria-checked={isStaff}
          aria-label={t("owner.profile.workAsStaff")}
          disabled={setOwnerStaff.isPending}
          onClick={() => setOwnerStaff.mutate(!isStaff)}
          className={`relative mt-3.5 h-7 w-[46px] flex-none rounded-pill transition disabled:opacity-60 ${isStaff ? "bg-brand" : "bg-handle"}`}
        >
          <span
            className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-all ${isStaff ? "left-[21px]" : "left-[3px]"}`}
          />
        </button>
      </SectionCard>

      <SectionCard title={t("biz.staffCode.title")} hint={t("owner.settings.accountHint")}>
        {regen.isSuccess && (
          <p className="mt-3.5 text-2xl font-bold tracking-widest text-brand">{regen.data.code}</p>
        )}
        {regen.isError && <p className="mt-3.5 text-sm text-danger">{errMessage(regen.error)}</p>}
        <button
          onClick={() => regen.mutate()}
          disabled={regen.isPending}
          className="mt-3.5 rounded-xl border-[1.5px] border-line bg-card px-4 py-2.5 text-[13px] font-bold text-ink disabled:opacity-60"
        >
          {t("biz.staffCode.regenerate")}
        </button>
      </SectionCard>

      <button
        onClick={() => {
          logout();
          router.replace("/business");
        }}
        className="rounded-[14px] border-[1.5px] border-[#E4B8AC] bg-card py-[15px] text-[14.5px] font-bold text-[#B0563A]"
      >
        {t("owner.settings.logout")}
      </button>
    </div>
  );
}
