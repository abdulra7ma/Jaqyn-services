import type { Metadata } from "next";

// Staff area — its own installable PWA (scope /staff). Camera scanner lands in F03.
export const metadata: Metadata = {
  title: "Jaqyn — Staff",
  description: "Staff scan & redeem",
  manifest: "/staff/manifest.json",
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
