FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"
COPY requirements/ ./requirements/
RUN pip install --upgrade pip \
    && pip install -r requirements/prod.txt

FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/venv/bin:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 netcat-openbsd \
    && rm -rf /var/lib/apt/lists/* \
    && adduser --disabled-password --gecos "" appuser

WORKDIR /app
COPY --from=builder /venv /venv
COPY . /app
RUN chmod +x /app/entrypoint.sh \
    && chown -R appuser:appuser /app

USER appuser
ENTRYPOINT ["/app/entrypoint.sh"]

FROM runtime AS dev
USER root
RUN pip install -r requirements/dev.txt
USER appuser

# ---- prod: lean default build target ----
# Alias of `runtime` (no dev deps). Last stage = default, so `docker build`
# and Railway (which builds the final stage) get this slim image. docker-compose
# still pins `target: dev` by name, so local dev is unaffected.
FROM runtime AS prod
