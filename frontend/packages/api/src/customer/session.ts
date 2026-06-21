// Tracks the current user's id so adapters can compute per-user flags
// (is_member / is_leader / checked_in) that the backend returns relative to
// the authenticated request rather than as explicit fields.
const USER_ID_KEY = "jaqyn.uid";
const hasWindow = () => typeof window !== "undefined";

export const session = {
  getUserId(): string | null {
    return hasWindow() ? window.localStorage.getItem(USER_ID_KEY) : null;
  },
  setUserId(id: string) {
    if (hasWindow()) window.localStorage.setItem(USER_ID_KEY, id);
  },
  clear() {
    if (hasWindow()) window.localStorage.removeItem(USER_ID_KEY);
  },
};
