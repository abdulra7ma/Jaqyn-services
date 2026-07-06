import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import { Providers } from "./providers";
import { SITE_URL } from "./_lib/config";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

// Hanken/Bricolage are Latin-only; Cyrillic (RU) falls back to system-ui via the
// font stack in the Tailwind preset.
const body = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// Root = customer area (public QR-scan entry). Business/staff override
// metadata (manifest, title) in their own segment layouts.
// Meta copy is Russian — primary search language of the Kyrgyz market.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Jaqyn — бонусы и акции от местных заведений",
    template: "%s — Jaqyn",
  },
  description:
    "Штампы, бонусы и награды в любимых кафе, салонах и магазинах Бишкека. Сканируйте QR — без установки приложения.",
  manifest: "/manifest.json",
  // Brand "J" favicon (public/icon.svg) on every page's browser tab.
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website",
    siteName: "Jaqyn",
    title: "Jaqyn — бонусы и акции от местных заведений",
    description:
      "Штампы, бонусы и награды в любимых заведениях Бишкека. Сканируйте QR — без установки приложения.",
    locale: "ru_RU",
  },
};

export const viewport: Viewport = {
  themeColor: "#C25E3C",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html lang="ru" className={`${display.variable} ${body.variable}`}>
      <body>
        <Providers>
          {children}
          {modal}
        </Providers>
      </body>
    </html>
  );
}
