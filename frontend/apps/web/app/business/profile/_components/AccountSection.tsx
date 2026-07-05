"use client";

// Settings › Account: work-as-staff toggle + sign out. Folded in from the old
// /business/more menu so settings is self-complete.

import { useBusinessMe, useSetOwnerStaff } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../_lib/auth";
import { SectionCard } from "./parts";

export function AccountSection() {
  const t = useT();
  const router = useRouter();
  const { logout } = useAuth();
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
