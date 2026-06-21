import type { Metadata } from "next";

// Business area — its own installable PWA (scope /business).
export const metadata: Metadata = {
  title: "Jaqyn — Business",
  description: "Merchant loyalty dashboard",
  manifest: "/business/manifest.json",
};

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
