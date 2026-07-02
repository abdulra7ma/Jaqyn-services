# Single frontend container. One Next.js app (apps/web) routes all three areas
# (customer at /, business at /business, staff at /staff). Multi-stage standalone.
# Build: docker build -t jaqyn-web ./frontend

# ---- deps: install the whole workspace once ----
FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile || pnpm install

# ---- builder: build the app (standalone output) ----
FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app ./
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* is baked at build time. Empty = browser calls /api/* same-origin
# and next.config rewrites proxy to API_PROXY_TARGET (set at runtime). Override
# with --build-arg NEXT_PUBLIC_API_URL=https://api... for direct/CORS mode.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# next.config rewrites() bake the proxy target at BUILD time. Must be present
# during `pnpm build` or it defaults to http://localhost:8000 and the deployed
# proxy points at nothing. Railway passes the service var as a build arg.
ARG API_PROXY_TARGET="http://localhost:8000"
ENV API_PROXY_TARGET=$API_PROXY_TARGET
# Remaining NEXT_PUBLIC_* are baked into the client bundle at build time too.
# Each MUST be declared as an ARG here or `next build` sees undefined regardless
# of the Railway service var — Docker does not inherit host env at build time.
# Empty defaults are safe: an unset var behaves exactly as before.
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=""
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_DGIS_MAPGL_KEY=""
ENV NEXT_PUBLIC_DGIS_MAPGL_KEY=$NEXT_PUBLIC_DGIS_MAPGL_KEY
ARG NEXT_PUBLIC_MAP_PROVIDER=""
ENV NEXT_PUBLIC_MAP_PROVIDER=$NEXT_PUBLIC_MAP_PROVIDER
ARG NEXT_PUBLIC_LANDING_URL=""
ENV NEXT_PUBLIC_LANDING_URL=$NEXT_PUBLIC_LANDING_URL
ARG NEXT_PUBLIC_DEMO_MODE=""
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ARG NEXT_PUBLIC_ENABLE_TEST_UPLOAD=""
ENV NEXT_PUBLIC_ENABLE_TEST_UPLOAD=$NEXT_PUBLIC_ENABLE_TEST_UPLOAD
RUN pnpm --filter web build

# ---- dev: hot-reload target (bind-mount source over it) ----
FROM node:20-alpine AS dev
RUN corepack enable
WORKDIR /app
COPY --from=deps /app ./
CMD ["pnpm", "--filter", "web", "dev"]

# ---- runner: minimal standalone runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
