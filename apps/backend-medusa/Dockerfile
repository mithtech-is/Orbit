# Orbit backend — production image.
# Multi-stage build keeps the runtime image small and excludes dev dependencies.

# ---------- builder ----------
FROM node:22-alpine AS builder
WORKDIR /repo

# pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Copy workspace files needed for install resolution
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.build.json eslint.config.js ./
COPY packages ./packages
COPY apps/backend-medusa/package.json ./apps/backend-medusa/

# Install (no scripts to skip native rebuilds we don't need yet)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy backend source AFTER install so install cache is reusable
COPY apps/backend-medusa ./apps/backend-medusa

# Workspace types must compile first so node-pg-migrate sees them
RUN pnpm typecheck

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Copy installed deps + compiled source
COPY --from=builder /repo /app

# Production env defaults — actual values come from the orchestrator.
# Fixed Orbit API port 9090 (9000 is owned by the Polemarch POS backend).
ENV NODE_ENV=production
ENV PORT=9090
EXPOSE 9090

# Run the dev-server.ts runtime via tsx (the production runtime today; see
# docs/engineering/final-go-no-go-report.md for the planned medusa runtime cutover).
WORKDIR /app/apps/backend-medusa
CMD ["pnpm", "exec", "tsx", "src/dev-server.ts"]
