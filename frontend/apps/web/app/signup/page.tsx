import { redirect } from "next/navigation";

// Signup is folded into the unified /login entry point — new identifiers
// (email or phone) automatically get an OTP-based signup path there.
export default function SignupPage() {
  redirect("/login");
}
