"use client";

import { useParams, useRouter } from "next/navigation";
import { BusinessSheet } from "../../_components/BusinessSheet";

/**
 * Standalone `/nearby/[id]` route — renders the business details as a
 * draggable bottom sheet over the app's base background. When accessed
 * from the nearby list the sheet renders inline (no navigation) so the
 * map + list remain live behind it; this route handles direct URLs and
 * deep-links where there is no live parent page.
 */
export default function BusinessProfilePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  return (
    <div className="fixed inset-0 z-[50]">
      <BusinessSheet businessId={id} onClose={() => router.back()} />
    </div>
  );
}
