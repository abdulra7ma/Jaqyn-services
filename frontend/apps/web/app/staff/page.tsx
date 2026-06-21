import { redirect } from "next/navigation";

// /staff → /staff/scan (per deck nav: Scan is the primary tab)
export default function StaffRootPage() {
  redirect("/staff/scan");
}
