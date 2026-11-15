FROM node:20-alpine AS base
RUN npm install -g pnpm@9

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY packages/supabase-client/package.json ./packages/supabase-client/
COPY packages/coverage-engine/package.json ./packages/coverage-engine/
COPY packages/numbering/package.json ./packages/numbering/
COPY packages/permissions/package.json ./packages/permissions/
RUN pnpm install --frozen-lockfile --filter @careos/api...

# ── Builder ───────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY apps/api ./apps/api
COPY packages ./packages
RUN pnpm --filter @careos/api build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN npm install -g pnpm@9
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./

EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]
