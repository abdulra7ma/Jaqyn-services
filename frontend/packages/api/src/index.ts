export { api, request, API_URL } from "./client";
export type { RequestOptions } from "./client";
export { ApiClientError } from "./errors";
export { tokenStore, AUTH_EVENT } from "./tokens";
export { ApiProvider } from "./provider";
export { useHealth } from "./hooks";
export type { ApiEnvelope, ApiSuccess, ApiError, HealthData } from "./types";

// ---- customer API layer ----
export { customerApi, type CustomerApi } from "./customer/api";
export * from "./customer/hooks";
export type * from "./customer/types";
export { postAuthRoute } from "./customer/postAuthRoute";

// ---- business API layer ----
export { businessApi, type BusinessApi } from "./business/api";
export * from "./business/hooks";
export type * from "./business/types";

// ---- staff API layer ----
export { staffApi, type StaffApi } from "./staff/api";
export * from "./staff/hooks";
export type * from "./staff/types";
