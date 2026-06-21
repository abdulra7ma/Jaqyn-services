// JWT storage. localStorage for MVP; swap for cookie store later if needed.
const ACCESS_KEY = "jaqyn.access";
const REFRESH_KEY = "jaqyn.refresh";
export const AUTH_EVENT = "jaqyn-auth";

const hasWindow = () => typeof window !== "undefined";

function emit() {
  if (hasWindow()) window.dispatchEvent(new Event(AUTH_EVENT));
}

export const tokenStore = {
  getAccess(): string | null {
    return hasWindow() ? window.localStorage.getItem(ACCESS_KEY) : null;
  },
  getRefresh(): string | null {
    return hasWindow() ? window.localStorage.getItem(REFRESH_KEY) : null;
  },
  isAuthenticated(): boolean {
    return !!this.getAccess();
  },
  set(access: string, refresh?: string) {
    if (!hasWindow()) return;
    window.localStorage.setItem(ACCESS_KEY, access);
    if (refresh) window.localStorage.setItem(REFRESH_KEY, refresh);
    emit();
  },
  clear() {
    if (!hasWindow()) return;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    emit();
  },
};
