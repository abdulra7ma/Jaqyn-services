from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler

from core.response import error_response


ERROR_MESSAGES = {
    "INVALID_OTP": "The OTP code is invalid",
    "OTP_EXPIRED": "The OTP code has expired",
    "BUSINESS_NOT_ACTIVE": "The business is not active",
    "INVALID_QR_TOKEN": "The QR token is invalid",
    "QR_TOKEN_EXPIRED": "The QR token has expired",
    "INVALID_APPROVAL_CODE": "The approval code is invalid or expired",
    "SCAN_LIMIT_REACHED": "Scan limit reached",
    "REWARD_ALREADY_REDEEMED": "Reward has already been redeemed",
    "REWARD_EXPIRED": "Reward has expired",
    "PERMISSION_DENIED": "You do not have permission to perform this action",
    "RATE_LIMITED": "Too many attempts. Please try again later",
    "VALIDATION_ERROR": "Validation error",
    # --- Campaign rewards (apps.campaigns) ---
    "WRONG_BUSINESS": "This belongs to another business",
    "CAMPAIGN_NOT_FOUND": "The campaign does not exist",
    "CAMPAIGN_NOT_ELIGIBLE": "You are not eligible for this campaign right now",
    "CAMPAIGN_NOT_ACTIVE": "The campaign is not active",
    "CAMPAIGN_OUTSIDE_WINDOW": "The campaign is not active at this time",
    "CAMPAIGN_FULL": "The campaign has reached its participant limit",
    "CAMPAIGN_REWARD_LIMIT_REACHED": "The campaign has issued all of its rewards",
    "CAMPAIGN_DAILY_LIMIT_REACHED": "The daily limit for this campaign has been reached",
    "CAMPAIGN_MIN_GAP": "Not enough time has passed since the last visit",
    "CAMPAIGN_ALREADY_COMPLETED": "You have already completed this campaign",
    "CAMPAIGN_INVALID_STATE": "The campaign cannot transition to that state",
    "CAMPAIGN_NOT_PUBLISHABLE": "The campaign is missing details required to publish",
    "VOUCHER_NOT_FOUND": "The voucher does not exist",
    "VOUCHER_EXPIRED": "The voucher has expired",
    "VOUCHER_ALREADY_REDEEMED": "The voucher has already been redeemed",
    "VOUCHER_CANCELLED": "The voucher has been cancelled",
    "VOUCHER_NOT_ACTIVE": "The voucher is not active",
    "GROUP_SESSION_NOT_FOUND": "The group session does not exist",
    "GROUP_SESSION_INVALID_STATE": "The group session is not in a valid state",
    "GROUP_SESSION_FULL": "The group session is already full",
}


class JaqynAPIException(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "VALIDATION_ERROR"
    default_detail = "Validation error"

    def __init__(self, code=None, message=None, status_code=None, details=None):
        self.code = code or self.default_code
        self.detail = message or ERROR_MESSAGES.get(self.code, self.default_detail)
        self.details = details
        if status_code is not None:
            self.status_code = status_code


def envelope_exception_handler(exc, context):
    if isinstance(exc, JaqynAPIException):
        return error_response(exc.code, str(exc.detail), exc.status_code, exc.details)

    response = exception_handler(exc, context)
    if response is None:
        return None

    code = "VALIDATION_ERROR"
    if response.status_code == status.HTTP_401_UNAUTHORIZED:
        code = "PERMISSION_DENIED"
    elif response.status_code == status.HTTP_403_FORBIDDEN:
        code = "PERMISSION_DENIED"
    elif response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        code = "RATE_LIMITED"

    detail = response.data.get("detail", response.data) if isinstance(response.data, dict) else response.data
    return error_response(code, ERROR_MESSAGES.get(code, "Request failed"), response.status_code, detail)
