import { ApiClientError } from "./errors";
import { tokenStore } from "./tokens";
import type { ApiEnvelope } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const REFRESH_PATH = "/api/auth/token/refresh/";

export type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean; // attach access token (default true)
  retryOnAuth?: boolean; // internal: prevent infinite refresh loop
};

function buildUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function refreshAccess(): Promise<boolean> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;
  try {
    const res = await fetch(buildUrl(REFRESH_PATH), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as ApiEnvelope<{ access: string }> | { access?: string };
    const access =
      "data" in json && json.data ? json.data.access : (json as { access?: string }).access;
    if (!access) return false;
    tokenStore.set(access);
    return true;
  } catch {
    return false;
  }
}

/** Core request: serializes JSON body, attaches JWT, unwraps the envelope,
 *  refreshes once on 401, and throws ApiClientError on failure. */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, auth = true, retryOnAuth = true, headers, ...rest } = opts;

  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }
  const access = auth ? tokenStore.getAccess() : null;
  if (access) finalHeaders.set("Authorization", `Bearer ${access}`);

  const res = await fetch(buildUrl(path), {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && auth && retryOnAuth) {
    const refreshed = await refreshAccess();
    if (refreshed) {
      return request<T>(path, { ...opts, retryOnAuth: false });
    }
    tokenStore.clear();
  }

  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiClientError("VALIDATION_ERROR", `HTTP ${res.status}`, res.status);
  }

  if (!json || json.success === false) {
    const err = json && "error" in json ? json.error : undefined;
    throw new ApiClientError(
      err?.code ?? "VALIDATION_ERROR",
      err?.message ?? `HTTP ${res.status}`,
      res.status,
      err?.details,
    );
  }
  return json.data;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};

export { API_URL };
