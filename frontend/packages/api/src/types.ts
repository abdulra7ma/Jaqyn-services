// Backend response envelope (see docs/conventions/CONVENTIONS.md).
export type ApiSuccess<T> = {
  success: true;
  data: T;
  message: string;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiError;

export type HealthData = {
  status: "ok" | "degraded";
  db: boolean;
  redis: boolean;
};
