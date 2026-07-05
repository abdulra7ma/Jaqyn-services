// Shared catalog-module metadata + helpers, used by both catalog editors (the
// onboarding wizard and profile settings) so the module → label mapping lives in
// one place. A business's "catalog" is menu items / services / products / plans
// depending on its BusinessType.module.

import type { BusinessType } from "@jaqyn/api";

export type CatalogModule = "menu" | "services" | "products" | "plans";

// English noun/plural per module. Onboarding renders these directly (that screen
// is English-only); i18n'd surfaces (MenuSection, the customer sheet) use the
// `catalog.heading.<module>` keys instead. `plural` is a section/heading word,
// `noun` is the singular used in "Add a <noun>".
export const MODULE_META: Record<CatalogModule, { plural: string; noun: string }> = {
  menu: { plural: "Menu", noun: "menu item" },
  services: { plural: "Services", noun: "service" },
  products: { plural: "Products", noun: "product" },
  plans: { plural: "Plans", noun: "plan" },
};

// Starter section labels offered as datalist suggestions per module. These are
// only hints — the owner can type any custom label, which is stored verbatim as
// the item's `category` and shown to customers as a section title.
export const DEFAULT_LABELS: Record<CatalogModule, string[]> = {
  menu: ["Featured", "Coffee", "Kitchen", "Desserts", "Drinks"],
  services: ["Featured", "Hair", "Nails", "Treatments"],
  products: ["Featured", "New", "Sale", "General"],
  plans: ["Featured", "Monthly", "Annual"],
};

const FALLBACK_MODULE: CatalogModule = "menu";

/**
 * Resolve a business's catalog module from its BusinessType key. Falls back to
 * "menu" when the type is unknown/unset (matches the CatalogItem model default).
 */
export function resolveModule(
  businessType: string | null | undefined,
  types: readonly BusinessType[] | undefined,
): CatalogModule {
  if (!businessType || !types) return FALLBACK_MODULE;
  return types.find((t) => t.key === businessType)?.module ?? FALLBACK_MODULE;
}

/**
 * Datalist suggestions for a module: the defaults plus any labels the business is
 * already using (so labels stay consistent), de-duplicated, existing-first.
 */
export function labelSuggestions(module: CatalogModule, usedCategories: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of [...usedCategories, ...DEFAULT_LABELS[module]]) {
    const trimmed = label.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
