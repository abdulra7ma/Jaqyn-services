import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// next/navigation is not available outside the Next runtime — stub the hooks the
// screens use so they render under jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

// next/link → a plain anchor so role/href queries work in RTL.
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (require("react") as typeof import("react")).createElement("a", { href, ...rest }, children),
}));

// @jaqyn/i18n → identity translator that returns the key, so assertions can target
// stable keys without depending on the EN/RU copy.
vi.mock("@jaqyn/i18n", () => ({
  useT: () => (key: string) => key,
  useI18n: () => ({ locale: "en", setLocale: vi.fn() }),
  LanguageSwitch: () => null,
}));
