// Business-type catalog schema for onboarding setup. Extracted from the design
// canvas (Jaqyn.dc.html · obSchemaMap). Each type controls which catalog module,
// category list, and seed entries the dynamic setup step renders.

export type CatalogModule = "menu" | "services" | "products" | "plans";

export type BizTypeSchema = {
  key: string;
  label: string;
  glyph: string;
  desc: string;
  module: CatalogModule;
  noun: string;
  plural: string;
  cats: string[];
  /** seed rows: menu/products = [name, category, price]; services/plans = [name, category, duration, price] */
  seed: string[][];
};

export const BIZ_TYPES: BizTypeSchema[] = [
  {
    key: "cafe", label: "Cafe", glyph: "☕", desc: "Coffee, drinks & light bites",
    module: "menu", noun: "menu item", plural: "Menu",
    cats: ["Coffee", "Not coffee", "Kitchen", "Desserts"],
    seed: [["Cappuccino", "Coffee", "150 c"], ["Flat white", "Coffee", "170 c"], ["Avocado toast", "Kitchen", "320 c"], ["Cheesecake", "Desserts", "240 c"]],
  },
  {
    key: "restaurant", label: "Restaurant", glyph: "🍽", desc: "Full menu, dine-in & takeaway",
    module: "menu", noun: "menu item", plural: "Menu",
    cats: ["Starters", "Mains", "Sides", "Drinks", "Desserts"],
    seed: [["Lagman", "Mains", "420 c"], ["Manty · 5 pcs", "Mains", "380 c"], ["Achichuk salad", "Starters", "180 c"], ["Compote", "Drinks", "90 c"]],
  },
  {
    key: "salon", label: "Salon", glyph: "💇", desc: "Hair, beauty & spa services",
    module: "services", noun: "service", plural: "Services",
    cats: ["Hair", "Nails", "Skin", "Makeup"],
    seed: [["Haircut & style", "Hair", "45 min", "900 c"], ["Manicure", "Nails", "40 min", "600 c"], ["Facial", "Skin", "60 min", "1,200 c"]],
  },
  {
    key: "barber", label: "Barber", glyph: "💈", desc: "Cuts, beard & grooming",
    module: "services", noun: "service", plural: "Services",
    cats: ["Cuts", "Beard", "Shave", "Kids"],
    seed: [["Haircut", "Cuts", "40 min", "500 c"], ["Haircut + beard", "Cuts", "55 min", "700 c"], ["Hot-towel shave", "Shave", "30 min", "450 c"]],
  },
  {
    key: "retail", label: "Retail shop", glyph: "🛍", desc: "Products, apparel & goods",
    module: "products", noun: "product", plural: "Products",
    cats: ["New arrivals", "Apparel", "Accessories", "Footwear"],
    seed: [["Linen dress", "Apparel", "2,400 c"], ["Silk scarf", "Accessories", "900 c"], ["Leather bag", "Accessories", "3,200 c"]],
  },
  {
    key: "gym", label: "Gym / Fitness", glyph: "🏋", desc: "Memberships, classes & training",
    module: "plans", noun: "plan", plural: "Plans",
    cats: ["Membership", "Classes", "Personal"],
    seed: [["Monthly unlimited", "Membership", "1 month", "2,500 c"], ["Group class pass", "Classes", "10 classes", "1,800 c"], ["Personal training", "Personal", "60 min", "1,200 c"]],
  },
  {
    key: "clinic", label: "Clinic", glyph: "🩺", desc: "Healthcare & wellness",
    module: "services", noun: "service", plural: "Services",
    cats: ["Consultation", "Procedures", "Diagnostics"],
    seed: [["General consultation", "Consultation", "30 min", "800 c"], ["Dental cleaning", "Procedures", "45 min", "1,500 c"]],
  },
  {
    key: "carservice", label: "Car service", glyph: "🚗", desc: "Maintenance, repair & detailing",
    module: "services", noun: "service", plural: "Services",
    cats: ["Maintenance", "Repair", "Detailing"],
    seed: [["Oil change", "Maintenance", "30 min", "1,200 c"], ["Full detailing", "Detailing", "120 min", "3,500 c"]],
  },
  {
    key: "generic", label: "Other / Generic", glyph: "🏪", desc: "Flexible profile — services or products",
    module: "services", noun: "offering", plural: "Offerings",
    cats: ["Featured", "Services", "Products"],
    seed: [],
  },
  {
    key: "other", label: "Not listed", glyph: "✨", desc: "Tell us what you do",
    module: "services", noun: "offering", plural: "Offerings",
    cats: ["Featured", "Services", "Products"],
    seed: [],
  },
];

export const BIZ_TYPE_ORDER = BIZ_TYPES.map((t) => t.key);

export function schemaFor(key: string | null): BizTypeSchema {
  return BIZ_TYPES.find((t) => t.key === key) ?? BIZ_TYPES.find((t) => t.key === "generic")!;
}

export const MENU_STYLES = ["Simple list", "Card grid", "Category tabs", "Featured first", "QR menu"];

export type StaffRole = "manager" | "staff" | "viewer";

export const STAFF_ROLES: { v: StaffRole; label: string }[] = [
  { v: "manager", label: "Manager" },
  { v: "staff", label: "Staff" },
  { v: "viewer", label: "Viewer" },
];

export const ROLE_HINT: Record<StaffRole, string> = {
  manager: "Manage profile, menu, staff, campaigns & reports",
  staff: "Scan QR, validate visits & redeem rewards",
  viewer: "Read-only dashboard access",
};

export const STAFF_LIMIT = 5;

export type CatalogItem = { name: string; category: string; price: string; duration: string };
export type StaffMember = { name: string; contact: string; role: StaffRole };
export type VerificationStatus = "pending_verification" | "changes_requested" | "verified";

export const STATUS_INFO: Record<
  VerificationStatus,
  { label: string; color: string; bg: string; dot: string; title: string; msg: string }
> = {
  pending_verification: {
    label: "Pending verification", color: "#B07A1E", bg: "#FBEFD9", dot: "#E7A23E",
    title: "You’re in review",
    msg: "Your business profile has been submitted and is waiting for admin review. We’ll email you the moment it’s verified.",
  },
  changes_requested: {
    label: "Changes requested", color: "#B0563A", bg: "#F7E4DC", dot: "#C25E3C",
    title: "A few changes needed",
    msg: "The Jaqyn team reviewed your submission and asked for a small change before going live.",
  },
  verified: {
    label: "Verified · live", color: "#3F7355", bg: "#E4F0E7", dot: "#5E8B6A",
    title: "You’re verified & live",
    msg: "Manas Coffee is approved and now visible to customers in the Jaqyn app. Welcome aboard!",
  },
};
