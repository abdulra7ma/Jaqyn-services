"use client";

import { useRouter } from "next/navigation";
import { MyQrSheet } from "../_components/MyQrSheet";
import { useRequireAuth } from "../_lib/auth";

/**
 * Standalone QR route — renders the draggable floating QR card over the app's
 * base background. Accessed from the bottom-nav scan button, profile, etc.
 * Navigating from the nearby business page skips this route entirely and renders
 * the sheet inline so the live business page is visible behind it.
 */
export default function MyQrPage() {
  const router = useRouter();
  const { isAuthenticated } = useRequireAuth();

  return (
    <div className="fixed inset-0 z-[60]" onClick={() => router.back()}>
      <MyQrSheet
        isAuthenticated={isAuthenticated}
        onClose={() => router.back()}
      />
    </div>
  );
}
