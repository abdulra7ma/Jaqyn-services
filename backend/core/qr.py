import base64
from io import BytesIO
import secrets

import qrcode


def generate_token():
    return secrets.token_urlsafe(24)


def render_png_data_url(value):
    image = qrcode.make(value)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"
