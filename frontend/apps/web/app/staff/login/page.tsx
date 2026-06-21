import { redirect } from "next/navigation";

// Staff now sign in through the unified /login (phone+OTP or email+password),
// which routes them back to /staff by role.
export default function StaffLoginRedirect() {
  redirect("/login?return=/staff");
}
