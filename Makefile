BACKEND_DIR=backend

.PHONY: up down migrate test lint shell makemigrations dev dev-stop dev-https dev-https-stop dev-lan phone-ca

# HTTPS for phone (camera/mic need a secure origin — plain http://LAN-IP is blocked).
# Uses cloudflared to give a real-cert https URL the phone trusts.
dev-https:
	./dev-tunnel.sh

dev-https-stop:
	./dev-tunnel.sh stop

# Fast LAN HTTPS — local mkcert cert, no Cloudflare round-trip. Phone hits
# https://IP:3000 directly; Next proxies /api/* to the backend (single origin,
# no mixed content). Camera/mic work because the origin is secure + trusted.
# One-time: `mkcert -install` on this Mac, and install the root CA on the phone
# (run `make phone-ca` to find/AirDrop it).
dev-lan:
	@IP=$$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null); \
	if [ -z "$$IP" ]; then echo "✗ could not detect LAN IP (en0/en1)"; exit 1; fi; \
	if [ ! -f certs/lan.pem ]; then \
	  echo "▸ generating LAN cert for $$IP…"; mkdir -p certs; \
	  mkcert -cert-file certs/lan.pem -key-file certs/lan-key.pem localhost 127.0.0.1 ::1 "$$IP" >/dev/null 2>&1; \
	fi; \
	grep -q "$$IP" .env || { \
	  echo "▸ adding $$IP to .env allowed hosts + CORS"; \
	  sed -i '' "s/^DJANGO_ALLOWED_HOSTS=.*/&,$$IP/" .env; \
	  sed -i '' "s|^DJANGO_CORS_ALLOWED_ORIGINS=.*|&,https://$$IP:3000|" .env; \
	}; \
	echo "▸ starting backend (db redis web worker beat)…"; \
	docker compose up -d --force-recreate db redis web worker beat >/dev/null; \
	echo; \
	echo "════════════════════════════════════════════════════════════"; \
	echo "  📱 Open on phone:  https://$$IP:3000"; \
	echo "     On this Mac:    https://localhost:3000"; \
	echo "════════════════════════════════════════════════════════════"; \
	echo; \
	echo "▸ starting frontend (HTTPS, API proxied to localhost:8000)…"; \
	cd frontend && API_PROXY_TARGET="http://localhost:8000" NEXT_PUBLIC_API_URL="" \
	  corepack pnpm --filter web exec next dev -p 3000 -H 0.0.0.0 \
	  --experimental-https --experimental-https-key ../certs/lan-key.pem --experimental-https-cert ../certs/lan.pem

# Reveal the mkcert root CA to install on your phone (AirDrop / email it, then
# install the profile + enable full trust in iOS Settings).
phone-ca:
	@echo "Root CA: $$(mkcert -CAROOT)/rootCA.pem"
	@open "$$(mkcert -CAROOT)" 2>/dev/null || true

# Run backend (docker) + frontend (Next dev) together, reachable from your phone
# over the LAN. Detects your Mac's LAN IP, points the frontend at the backend on
# that IP, and binds Next to 0.0.0.0 so the phone can connect. Ctrl+C stops the
# frontend; backend keeps running (use `make dev-stop` to stop it).
dev:
	@IP=$$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null); \
	if [ -z "$$IP" ]; then echo "✗ could not detect LAN IP (en0/en1)"; exit 1; fi; \
	grep -q "$$IP" .env || { \
	  echo "▸ adding $$IP to .env allowed hosts + CORS"; \
	  sed -i '' "s/^DJANGO_ALLOWED_HOSTS=.*/&,$$IP/" .env; \
	  sed -i '' "s|^DJANGO_CORS_ALLOWED_ORIGINS=.*|&,http://$$IP:3000|" .env; \
	}; \
	echo "▸ starting backend (db redis web worker beat)…"; \
	docker compose up -d --force-recreate db redis web worker beat >/dev/null; \
	echo; \
	echo "════════════════════════════════════════════════════════════"; \
	echo "  📱 Open on phone:  http://$$IP:3000"; \
	echo "     Backend API:    http://$$IP:8000"; \
	echo "     On this Mac:    http://localhost:3000"; \
	echo "════════════════════════════════════════════════════════════"; \
	echo; \
	echo "▸ starting frontend dev (API → http://$$IP:8000)…"; \
	cd frontend && NEXT_PUBLIC_API_URL="http://$$IP:8000" corepack pnpm --filter web exec next dev -p 3000 -H 0.0.0.0

dev-stop:
	docker compose stop web worker beat db redis
	@lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true

up:
	docker compose up --build

down:
	docker compose down

migrate:
	cd $(BACKEND_DIR) && python manage.py migrate

makemigrations:
	cd $(BACKEND_DIR) && python manage.py makemigrations

test:
	cd $(BACKEND_DIR) && pytest

lint:
	cd $(BACKEND_DIR) && python manage.py check

shell:
	cd $(BACKEND_DIR) && python manage.py shell
