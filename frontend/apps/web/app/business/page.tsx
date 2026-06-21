import { redirect } from "next/navigation";

// The business area now uses the responsive OwnerShell dashboard. The old
// mobile-only BusinessShell dashboard lived here; /business now lands owners on
// the new design dashboard.
export default function BusinessIndexPage() {
  redirect("/business/dashboard");
}
