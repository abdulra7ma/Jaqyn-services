import type { Locale } from "@jaqyn/i18n";

// Localized fallbacks for backend error `code` strings. The backend message is
// used when a code is unmapped, so this only needs the user-facing common ones.
const ERROR_MESSAGES: Record<string, Record<Locale, string>> = {
  INVALID_OTP: { ru: "Неверный код", en: "Invalid code" },
  OTP_EXPIRED: { ru: "Код истёк", en: "Code expired" },
  BUSINESS_NOT_ACTIVE: { ru: "Бизнес не активен", en: "Business is not active" },
  INVALID_QR_TOKEN: { ru: "Недействительный QR-код", en: "Invalid QR code" },
  QR_TOKEN_EXPIRED: { ru: "QR-код истёк", en: "QR code expired" },
  INVALID_APPROVAL_CODE: { ru: "Неверный код подтверждения", en: "Invalid approval code" },
  SCAN_LIMIT_REACHED: { ru: "Лимит достигнут", en: "Limit reached" },
  REWARD_ALREADY_REDEEMED: { ru: "Награда уже получена", en: "Reward already redeemed" },
  REWARD_EXPIRED: { ru: "Награда истекла", en: "Reward expired" },
  GROUP_FULL: { ru: "Группа заполнена", en: "Group is full" },
  MAX_ACTIVE_GROUPS: {
    ru: "Достигнут лимит активных групп",
    en: "You've reached the active-group limit",
  },
  PERMISSION_DENIED: { ru: "Доступ запрещён", en: "Permission denied" },
  RATE_LIMITED: { ru: "Слишком много попыток", en: "Too many attempts" },
  VALIDATION_ERROR: { ru: "Проверьте введённые данные", en: "Check your input" },
};

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  localized(locale: Locale): string {
    return ERROR_MESSAGES[this.code]?.[locale] ?? this.message;
  }
}
