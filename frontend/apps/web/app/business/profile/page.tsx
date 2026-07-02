"use client";

// Business settings — sectioned layout. A sticky sub-nav (vertical rail on
// desktop, chips on mobile) switches between focused sections instead of the
// old single endless scroll. Each section owns its own state and Save; the menu,
// gallery, and image uploads persist through their own mutations.

import { useState } from "react";
import { useT } from "@jaqyn/i18n";
import { OwnerShell } from "../_components/OwnerShell";
import {
  FlagIcon,
  GridIcon,
  ImageIcon,
  ListIcon,
  PinIcon,
  SettingsIcon,
  TicketIcon,
  UserIcon,
} from "../../_components/icons";
import { SettingsNav, type SectionDef } from "./_components/SettingsNav";
import { CompletionBanner } from "./_components/CompletionBanner";
import { OverviewSection } from "./_components/OverviewSection";
import { ProfileSection } from "./_components/ProfileSection";
import { ContactSection } from "./_components/ContactSection";
import { BrandSection } from "./_components/BrandSection";
import { WalletSection } from "./_components/WalletSection";
import { MenuSection } from "./_components/MenuSection";
import { GallerySection } from "./_components/GallerySection";
import { AccountSection } from "./_components/AccountSection";

const SECTIONS: readonly SectionDef[] = [
  { key: "overview", labelKey: "owner.settings.nav.overview", icon: GridIcon },
  { key: "profile", labelKey: "owner.settings.nav.profile", icon: UserIcon },
  { key: "contact", labelKey: "owner.settings.nav.contact", icon: PinIcon },
  { key: "brand", labelKey: "owner.settings.nav.brand", icon: FlagIcon },
  { key: "wallet", labelKey: "owner.settings.nav.wallet", icon: TicketIcon },
  { key: "menu", labelKey: "owner.settings.nav.menu", icon: ListIcon },
  { key: "gallery", labelKey: "owner.settings.nav.gallery", icon: ImageIcon },
  { key: "account", labelKey: "owner.settings.nav.account", icon: SettingsIcon },
] as const;

export default function BusinessSettingsPage() {
  const t = useT();
  const [active, setActive] = useState("overview");
  const [saved, setSaved] = useState<string | null>(null);

  function notify(message: string) {
    setSaved(message);
    setTimeout(() => setSaved(null), 2200);
  }

  return (
    <OwnerShell title={t("owner.profile.title")}>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-5">
        {/* Completion status is pinned above every section. */}
        <CompletionBanner goTo={setActive} />

        <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
          <SettingsNav sections={SECTIONS} active={active} onSelect={setActive} />

          {/* All sections stay mounted (toggled with `hidden`) so typed-but-unsaved
              edits survive switching sections. Mount cost matches the old single-
              scroll page, which rendered every field at once anyway. */}
          <div className="min-w-0 flex-1">
            <div hidden={active !== "overview"}><OverviewSection notify={notify} /></div>
          <div hidden={active !== "profile"}><ProfileSection notify={notify} /></div>
          <div hidden={active !== "contact"}><ContactSection notify={notify} /></div>
          <div hidden={active !== "brand"}><BrandSection notify={notify} /></div>
          <div hidden={active !== "wallet"}><WalletSection notify={notify} /></div>
          <div hidden={active !== "menu"}><MenuSection notify={notify} /></div>
          <div hidden={active !== "gallery"}><GallerySection notify={notify} /></div>
          <div hidden={active !== "account"}><AccountSection /></div>
          </div>
        </div>
      </div>

      {saved && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-pill bg-ink px-5 py-3 text-sm font-semibold text-cream shadow-glow">
          {saved}
        </div>
      )}
    </OwnerShell>
  );
}
