import { redirect } from "next/navigation";

// Business owners now sign in through the unified /login (phone+OTP or
// email+password), which routes them back to /business by role.
export default function BusinessLoginRedirect() {
  redirect("/login?return=/business");
}
