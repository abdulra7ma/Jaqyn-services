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
