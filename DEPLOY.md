# Deploying Jaqyn — all on Railway

Everything runs on **Railway**: backend, workers, datastores, **and** the frontend. No Vercel, no custom domain — each service gets a free Railway-generated `*.up.railway.app` URL.

| Service | What runs | Root Directory |
|---------|-----------|----------------|
| **web** | Django API (gunicorn) | `backend` |
| **worker** | Celery worker + beat (one process) | `backend` |
| **frontend** | Next.js `apps/web` (standalone) | `frontend` |
| **landing** | Vite static site (optional) | `landing` |
| **Postgres** | managed DB plugin | — |
| **Redis** | managed broker/cache plugin | — |

Cost: usage-based, scales toward zero when idle. MVP traffic ≈ **$8–15/mo** (3 small containers + Postgres + Redis). Media on Cloudflare R2 is free (10 GB).

```
 Browser ──https──► frontend.up.railway.app  (Next.js)
                      │  /api/* and /media/* → next.config rewrites
                      ▼  (API_PROXY_TARGET)        same origin → no CORS
                    web.up.railway.app (Django) ──► Postgres
                    worker (celery -B)          ──► Redis
                                                    Cloudflare R2 (media)
```

---

## 0. One-time prep

1. Push this repo to GitHub.
2. Generate a Django secret key:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(64))"
   ```
3. Skim `.env.prod.example` — it lists every variable each service needs.

---

## 1. Create the project + datastores

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pick this repo. (This creates the first service — make it the **web** service in step 2.)
2. **+ New** → **Database** → **Add PostgreSQL**.
3. **+ New** → **Database** → **Add Redis**.

You'll add the frontend (and landing) as more services from the same repo later.

---

## 2. Backend — web service

On the service from step 1: **Settings → Root Directory = `backend`** (finds `backend/Dockerfile` + `backend/railway.json`).

**Variables** (Railway *reference variables* auto-wire the datastores):
```
DJANGO_SETTINGS_MODULE=config.settings.prod
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<generated in step 0>
DB_ENGINE=postgres
POSTGRES_HOST=${{Postgres.PGHOST}}
POSTGRES_PORT=${{Postgres.PGPORT}}
POSTGRES_DB=${{Postgres.PGDATABASE}}
POSTGRES_USER=${{Postgres.PGUSER}}
POSTGRES_PASSWORD=${{Postgres.PGPASSWORD}}
REDIS_URL=${{Redis.REDIS_URL}}
CELERY_BROKER_URL=${{Redis.REDIS_URL}}
CELERY_RESULT_BACKEND=${{Redis.REDIS_URL}}
RUN_MIGRATIONS=true
DJANGO_COLLECTSTATIC=true
USE_S3=true               # plus the AWS_* / R2 vars (step 5)
SEED_TEST_USERS=false
DEV_LOGIN_OTP=
EMAIL_BACKEND=anymail.backends.resend.EmailBackend
RESEND_API_KEY=<from Resend dashboard → API Keys>
DEFAULT_FROM_EMAIL=Jaqyn <noreply@mail.jaqyn.kg>
```
Email confirmation / password reset send via [Resend](https://resend.com) (`django-anymail`), not SMTP — `mail.jaqyn.kg` is verified there (SPF/DKIM/DMARC DNS records added at the registrar). Email-sending tasks run in the **worker** service (`apps/accounts/tasks.py`, `apps/businesses/tasks.py`), so these three vars must also be set on the worker service in step 3, not just web.

Now generate this service's URL: **Settings → Networking → Generate Domain** → e.g. `jaqyn-web-production.up.railway.app`. Then add the host-dependent vars (you finally know the host):
```
DJANGO_ALLOWED_HOSTS=jaqyn-web-production.up.railway.app
DJANGO_CSRF_TRUSTED_ORIGINS=https://jaqyn-web-production.up.railway.app
```
`railway.json` already sets the gunicorn start command, the `/api/health/` healthcheck, and restart policy. `entrypoint.sh` runs migrate + collectstatic before gunicorn (those two flags). Redeploy after editing vars.

---

## 3. Backend — worker + beat service

1. **+ New** → **GitHub Repo** → same repo → **Root Directory = `backend`**.
2. **Variables**: same as the web service **except**:
   ```
   RUN_MIGRATIONS=false
   DJANGO_COLLECTSTATIC=false
   ```
   (Only **web** migrates — stops two services racing on the DB.)
3. **Settings → Config-as-code → Railway Config File = `railway.worker.json`**.
   This file sets the start command:
   ```
   celery -A config worker -B -l info
   ```
   `-B` runs **beat inside the worker** → one process, lower cost. The file has
   **no `healthcheckPath`**, so Railway won't health-check this service.
4. This service is not an HTTP server: **don't** generate a domain.

---

## 4. Frontend — Next.js service

1. **+ New** → **GitHub Repo** → same repo → **Root Directory = `frontend`**.
2. Railway builds `frontend/Dockerfile`; its last stage `runner` is the standalone Next server and reads Railway's injected `$PORT` automatically.
3. **Variables**:
   ```
   NODE_ENV=production
   API_PROXY_TARGET=https://jaqyn-web-production.up.railway.app   # the web service URL from step 2
   ```
   `NEXT_PUBLIC_API_URL` stays empty (the Dockerfile bakes it empty by default) → the browser calls `/api/*` on the frontend's own origin and `next.config.js` proxies to `API_PROXY_TARGET`. **One origin, zero CORS.**
4. **Settings → Networking → Generate Domain** → e.g. `jaqyn-frontend-production.up.railway.app`.
5. Put that frontend URL into the **web** and **worker** services' `FRONTEND_URL` var (QR codes encode it):
   ```
   FRONTEND_URL=https://jaqyn-frontend-production.up.railway.app
   ```
   Redeploy the backend services so the new value takes effect.

---

## 5. Media storage — Cloudflare R2 (no custom domain needed)

Railway containers are **ephemeral** — uploads vanish on every redeploy. Push media to R2 (S3-compatible, 10 GB free, no egress fees). R2's built-in public URL means **you don't need a domain**.

1. Cloudflare → **R2** → **Create bucket** `jaqyn-media`.
2. Bucket → **Settings → Public access → Allow** → Cloudflare gives a public **`https://pub-<hash>.r2.dev`** URL. Copy that host.
3. **Manage R2 API Tokens** → create a token (Object Read & Write) → note Access Key ID + Secret + your Account ID.
4. Add to **both** backend services (web + worker):
   ```
   USE_S3=true
   AWS_ACCESS_KEY_ID=<key>
   AWS_SECRET_ACCESS_KEY=<secret>
   AWS_STORAGE_BUCKET_NAME=jaqyn-media
   AWS_S3_ENDPOINT_URL=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   AWS_S3_CUSTOM_DOMAIN=pub-<hash>.r2.dev      # the public host from step 2 (no https://)
   AWS_S3_REGION_NAME=auto
   ```
The `USE_S3` branch in `backend/config/settings/base.py` wires this; media URLs become `https://pub-<hash>.r2.dev/...`.

5. **CORS on the bucket — required, not optional.** Media URLs are cross-origin
   to the app (`pub-<hash>.r2.dev` ≠ `app.jaqyn.kg`). The app loads some images
   with `crossOrigin="anonymous"` and renders them to a canvas (`html-to-image`)
   for the social-share **download/export**. Without a CORS policy the browser
   blocks both the image load and the canvas export (`No 'Access-Control-Allow-Origin'
   header`). Bucket → **Settings → CORS Policy → Add**, paste:
   ```json
   [
     {
       "AllowedOrigins": ["https://app.jaqyn.kg"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Add any other origins that render media (e.g. `https://jaqyn.kg` landing) to
   `AllowedOrigins`. The r2.dev public domain honors this bucket policy.

> **r2.dev is Cloudflare's rate-limited *dev* domain.** Fine for launch; for
> production traffic bind a **custom R2 domain** (Bucket → Settings → Custom
> Domains) and set `AWS_S3_CUSTOM_DOMAIN` to it — same CORS policy applies. A
> custom domain also removes the r2.dev rate cap on downloads.

> Throwaway demo only? Skip R2 and attach a Railway **Volume** at `/app/media` on the web service. But a volume pins the service to one instance and blocks zero-downtime deploys.

---

## 6. Landing page (optional)

The Vite landing is a static build. Either:
- **Railway**: **+ New** → repo → Root Directory `landing`, build `npm run build`, serve `dist` (Railway static). Generate a domain.
- Or skip it for now — the Next.js app already covers the product.

> **Must set before building**: `VITE_APP_URL` = the deployed frontend host (mirrors backend `FRONTEND_URL`), `VITE_API_URL` = the backend host (or empty if same-origin). Vite bakes these in at `npm run build` — they're compiled into the static bundle, not read at runtime. Missing `VITE_APP_URL` silently falls back to `http://localhost:3000` (see `landing/.env.example`), so CTAs like "Explore Deals" point at localhost in prod. Adding the var to Railway after the fact does nothing until you trigger a redeploy.

---

## 7. CI/CD

- **`.github/workflows/ci.yml`** gates every PR: backend `pytest` + `makemigrations --check`; frontend `lint`/`typecheck`/`build`. Mark it a required check on `main`.
- **Deploys are automatic**: Railway redeploys each service on every push to `main`.
- **Migrations** run automatically in `entrypoint.sh` on the web service at boot.

---

## 8. Go-live checklist

- [ ] `DJANGO_DEBUG=false`, real `DJANGO_SECRET_KEY`
- [ ] `SEED_TEST_USERS=false`, `DEV_LOGIN_OTP=` empty
- [ ] `DJANGO_ALLOWED_HOSTS` + `DJANGO_CSRF_TRUSTED_ORIGINS` = the web service's `*.up.railway.app` host
- [ ] `API_PROXY_TARGET` (frontend) = web service URL; `FRONTEND_URL` (backend) = frontend service URL
- [ ] `USE_S3=true` and a test upload lands in R2 (URL is `pub-...r2.dev`, not local)
- [ ] R2 bucket **CORS policy** allows `https://app.jaqyn.kg` GET (else share-card image + download break — see §5.5)
- [ ] `/api/health/` returns 200 (web healthcheck green)
- [ ] worker log shows Celery + beat started
- [ ] superuser: web service → **Shell** → `python manage.py createsuperuser`
- [ ] a QR code scans to the frontend `*.up.railway.app` URL, not localhost

---

## Adding a custom domain later

When you buy one: add it under each service's **Settings → Networking → Custom Domain**, point DNS as Railway instructs, then update `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `FRONTEND_URL`, and `API_PROXY_TARGET` to the new hostnames. Nothing else changes.

## Cheaper / alternative hosts

- **Self-host VPS** — your existing `docker-compose.prod.yml` + `nginx` on a ~$5 Hetzner box. Cheapest raw $, but you own SSL, backups, monitoring.
- **Render** — `render.yaml` Blueprint, predictable fixed pricing (~$30–50/mo always-on).
