from rest_framework.response import Response


def success_response(data=None, message="Operation completed successfully", status=200):
    return Response(
        {"success": True, "data": {} if data is None else data, "message": message},
        status=status,
    )


def error_response(code, message, status=400, details=None):
    payload = {"success": False, "error": {"code": code, "message": message}}
    if details is not None:
        payload["error"]["details"] = details
    return Response(payload, status=status)
