import { redirect } from "next/navigation";

// Email signup is folded into the unified /login entry point — typing an
// unknown email there sends an OTP and creates the account passwordlessly.
export default function SignupEmailPage() {
  redirect("/login");
}
