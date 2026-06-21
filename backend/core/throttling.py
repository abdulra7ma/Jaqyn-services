from rest_framework.throttling import AnonRateThrottle


class OTPThrottle(AnonRateThrottle):
    scope = "otp"
