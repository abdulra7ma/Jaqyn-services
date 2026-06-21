#!/usr/bin/env bash
# Restart backend (docker) + frontend (Next dev) + two cloudflared HTTPS tunnels,
# wiring the frontend to call the backend tunnel. Prints the phone URL.
#   ./dev-tunnel.sh         start everything
#   ./dev-tunnel.sh stop    stop tunnels + frontend dev (backend keeps running)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

stop() {
  pkill -f "cloudflared tunnel --url" 2>/dev/null || true
  lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true
}

if [ "${1:-}" = "stop" ]; then
  stop; echo "stopped tunnels + frontend dev"; exit 0
fi

echo "▸ stopping any existing tunnels / dev server…"
stop; sleep 1

if ! docker info >/dev/null 2>&1; then
  echo "▸ starting Docker Desktop…"
  open -a Docker || { echo "✗ Docker not installed / can't start"; exit 1; }
  for _ in $(seq 1 40); do docker info >/dev/null 2>&1 && break; sleep 3; done
fi

echo "▸ ensuring backend is up (reloading .env)…"
# Backend services only — the dockerized frontend would fight the host dev server for :3000.
docker compose up -d db redis >/dev/null
docker compose up -d --force-recreate --no-deps web worker beat >/dev/null

echo "▸ starting cloudflared tunnels…"
: > /tmp/cf-back.log; : > /tmp/cf-front.log
nohup cloudflared tunnel --url http://localhost:8000 >/tmp/cf-back.log 2>&1 &
nohup cloudflared tunnel --url http://localhost:3000 >/tmp/cf-front.log 2>&1 &

wait_url() {
  for _ in $(seq 1 30); do
    u=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$1" 2>/dev/null | head -1 || true)
    [ -n "${u:-}" ] && { echo "$u"; return 0; }
    sleep 1
  done
  return 1
}

BACK=$(wait_url /tmp/cf-back.log)   || { echo "✗ backend tunnel failed (see /tmp/cf-back.log)"; exit 1; }
FRONT=$(wait_url /tmp/cf-front.log) || { echo "✗ frontend tunnel failed (see /tmp/cf-front.log)"; exit 1; }

echo "▸ starting frontend dev (API → $BACK)…"
( cd frontend && NEXT_PUBLIC_API_URL="$BACK" nohup corepack pnpm --filter web dev >/tmp/jaqyn-dev.log 2>&1 & )

echo
echo "════════════════════════════════════════════════════════════"
echo "  📱 Open on phone:  $FRONT"
echo "     Backend API:    $BACK"
echo "════════════════════════════════════════════════════════════"
echo "  Logs:  /tmp/jaqyn-dev.log · /tmp/cf-front.log · /tmp/cf-back.log"
echo "  Stop:  ./dev-tunnel.sh stop"
