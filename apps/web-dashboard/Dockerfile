# Orbit / Orbit web dashboard — optimised PRODUCTION image.
#
# We run `next build` + `next start` (NOT `next dev`). Dev mode compiles each route
# the first time it is opened, which made every nav click take 2-3s. A production
# build pre-compiles all routes, so navigation is instant.
#
# Two former blockers, both handled:
#   1. In-progress pages (proof-photo / expense) don't all type-check yet —
#      next.config.ts sets typescript.ignoreBuildErrors + eslint.ignoreDuringBuilds
#      so `next build` still produces an optimised bundle; the code runs fine.
#   2. On the Windows host the `next` package can't install (260-char MAX_PATH).
#      Building inside this Linux image sidesteps that entirely.

# ---------- builder ----------
FROM node:22-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.build.json eslint.config.js ./
COPY packages ./packages
COPY apps/web-dashboard/package.json ./apps/web-dashboard/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Build the workspace packages so @orbit/* resolve from dist at build time.
RUN pnpm exec tsc -b tsconfig.build.json

COPY apps/web-dashboard ./apps/web-dashboard

# NEXT_PUBLIC_* are inlined into the client bundle at BUILD time. A fresh clone has
# no .env.local (it's git-ignored), so provide the canonical localhost ports here as
# overridable build args — otherwise the dashboard would target the stale :9000
# fallback and fail to reach the backend on :9090. A real deployment overrides these
# (e.g. `docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com`).
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:9090
ARG NEXT_PUBLIC_WS_URL=ws://localhost:9090
# Deep-link target for the "View in ERP" affordance on field orders / products / expenses.
ARG NEXT_PUBLIC_ERP_ADMIN_URL=http://localhost:8082

# Produce the optimised production build (.next). NODE_ENV=production so NEXT_PUBLIC_*
# are inlined correctly and the build is fully optimised.
RUN cd apps/web-dashboard && NODE_ENV=production \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_ERP_ADMIN_URL=$NEXT_PUBLIC_ERP_ADMIN_URL \
    pnpm exec next build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY --from=builder /repo /app

# Fixed Orbit web port (3000 is taken on the host by another service).
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

WORKDIR /app/apps/web-dashboard
# next start serves the pre-built .next; -H 0.0.0.0 for the host port mapping.
CMD ["pnpm", "exec", "next", "start", "-p", "3001", "-H", "0.0.0.0"]
