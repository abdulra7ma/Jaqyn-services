import { redirect } from "next/navigation";

// Groups tab was removed from the staff app (staff-app-handoff F1); any old
// links or bookmarks land on Scan instead.
export default function StaffGroupsPage(): never {
  redirect("/staff/scan");
}
