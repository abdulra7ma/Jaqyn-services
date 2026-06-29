"use client";

import { useRouter } from "next/navigation";
import { MyQrSheet } from "../_components/MyQrSheet";
import { useRequireAuth } from "../_lib/auth";

/**
 * Standalone QR route — renders the QR bottom sheet (Vaul Drawer on mobile,
 * Radix Dialog on desktop) over the app's base background. The Sheet primitive
 * owns scrim, focus-trap, ESC, and drag-to-dismiss — no hand-rolled backdrop
 * needed here. Dismissal (scrim click / ESC / drag) calls onClose → router.back().
 */
export default function MyQrPage() {
  const router = useRouter();
  const { isAuthenticated } = useRequireAuth();

  return (
    <MyQrSheet
      isAuthenticated={isAuthenticated}
      onClose={() => router.back()}
    />
  );
}
