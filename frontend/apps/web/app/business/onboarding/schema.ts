// Static onboarding options for the business wizard. Business types + catalog
// modules now come from the backend (useBusinessTypes); the constants below are
// the wizard's client-only choices that have no backend representation yet.

export const MENU_STYLES = ["Simple list", "Card grid", "Category tabs", "Featured first", "QR menu"];

export type StaffRole = "manager" | "cashier";

export const STAFF_ROLES: { v: StaffRole; label: string }[] = [
  { v: "manager", label: "Manager" },
  { v: "cashier", label: "Cashier" },
];

export const ROLE_HINT: Record<StaffRole, string> = {
  manager: "Manage profile, menu, staff, campaigns & reports",
  cashier: "Scan QR, validate visits & redeem rewards",
};

// Max staff invites per business during onboarding. Business rule mirrors the
// server-side STAFF_LIMIT (apps/businesses/onboarding_services.py).
export const STAFF_LIMIT = 5;
