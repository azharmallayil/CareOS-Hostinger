# ==============================================================================
# CareOS Background Worker — Production ARM64 & Multi-Arch Dockerfile
# ==============================================================================
# Target: Oracle Cloud Infrastructure (OCI) Always Free Ampere A1 (ARM64)
# Compatible with both linux/arm64 and linux/amd64 platforms
# ==============================================================================

FROM --platform=$TARGETPLATFORM node:20-alpine AS base
RUN npm install -g pnpm@9

# ── Dependencies Stage ────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

# Copy root workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc* ./

# Copy package manifests for workspace resolution
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY packages/supabase-client/package.json ./packages/supabase-client/
COPY packages/coverage-engine/package.json ./packages/coverage-engine/
COPY packages/numbering/package.json ./packages/numbering/
COPY packages/permissions/package.json ./packages/permissions/
COPY packages/integration-contracts/package.json ./packages/integration-contracts/

RUN pnpm install --frozen-lockfile --filter @careos/worker...

# ── Build Stage ───────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY apps/worker ./apps/worker
COPY packages ./packages

RUN pnpm --filter @careos/worker build

# ── Production Runtime Stage ──────────────────────────────────────────────────
FROM --platform=$TARGETPLATFORM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install curl for internal container health checks
RUN apk add --no-cache curl

# Create non-root user and directories
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/apps/worker/package.json ./package.json

USER node

# Health check to ensure worker process is active
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ps aux | grep "node dist/index.js" | grep -v grep || exit 1

CMD ["node", "dist/index.js"]
