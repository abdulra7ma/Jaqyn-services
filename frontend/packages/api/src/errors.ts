import type { Locale } from "@jaqyn/i18n";

// Localized fallbacks for backend error `code` strings. The backend message is
// used when a code is unmapped, so this only needs the user-facing common ones.
const ERROR_MESSAGES: Record<string, Record<Locale, string>> = {
  INVALID_OTP: { ru: "Неверный код", en: "Invalid code", ky: "Код туура эмес" },
  OTP_EXPIRED: { ru: "Код истёк", en: "Code expired", ky: "Код мөөнөтү өттү" },
  BUSINESS_NOT_ACTIVE: { ru: "Бизнес не активен", en: "Business is not active", ky: "Бизнес активдүү эмес" },
  INVALID_QR_TOKEN: { ru: "Недействительный QR-код", en: "Invalid QR code", ky: "QR-код жараксыз" },
  QR_TOKEN_EXPIRED: { ru: "QR-код истёк", en: "QR code expired", ky: "QR-код мөөнөтү өттү" },
  INVALID_APPROVAL_CODE: { ru: "Неверный код подтверждения", en: "Invalid approval code", ky: "Ырастоо коду туура эмес" },
  SCAN_LIMIT_REACHED: { ru: "Лимит достигнут", en: "Limit reached", ky: "Чек жетти" },
  REWARD_ALREADY_REDEEMED: { ru: "Награда уже получена", en: "Reward already redeemed", ky: "Сыйлык алынган" },
  REWARD_EXPIRED: { ru: "Награда истекла", en: "Reward expired", ky: "Сыйлыктын мөөнөтү өттү" },
  GROUP_FULL: { ru: "Группа заполнена", en: "Group is full", ky: "Топ толук" },
  MAX_ACTIVE_GROUPS: {
    ru: "Достигнут лимит активных групп",
    en: "You've reached the active-group limit",
    ky: "Активдүү топтордун чеги жетти",
  },
  PERMISSION_DENIED: { ru: "Доступ запрещён", en: "Permission denied", ky: "Кирүүгө тыюу салынган" },
  RATE_LIMITED: { ru: "Слишком много попыток", en: "Too many attempts", ky: "Өтө көп аракет" },
  VALIDATION_ERROR: { ru: "Проверьте введённые данные", en: "Check your input", ky: "Киргизилген маалыматтарды текшериңиз" },
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
