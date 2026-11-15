FROM node:20-alpine AS base
RUN npm install -g pnpm@9

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY packages/supabase-client/package.json ./packages/supabase-client/
COPY packages/coverage-engine/package.json ./packages/coverage-engine/
COPY packages/numbering/package.json ./packages/numbering/
COPY packages/permissions/package.json ./packages/permissions/
RUN pnpm install --frozen-lockfile --filter @careos/worker...

FROM deps AS builder
COPY apps/worker ./apps/worker
COPY packages ./packages
RUN pnpm --filter @careos/worker build

FROM node:20-alpine AS runner
RUN npm install -g pnpm@9
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/apps/worker/package.json ./
USER node
CMD ["node", "dist/index.js"]
