# Express API container — build from the REPO ROOT (workspace deps live there):
#   docker build -f apps/api/Dockerfile -t gameexplorer-api .
# Runtime env: PORT, CORS_ORIGIN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
#              DATABASE_URL, REDIS_URL (see apps/api/.env.example)

FROM node:22-alpine AS base
RUN corepack enable pnpm
WORKDIR /repo

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build

# Manifests first so the install layer is cached across source-only changes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/

# api + its workspace dependencies (@gameexplorer/shared)
RUN pnpm install --frozen-lockfile --filter @gameexplorer/api...

COPY packages/shared packages/shared
COPY apps/api apps/api

# prisma generate makes no DB connection but prisma.config.ts requires
# DATABASE_URL to be set, so provide a dummy value (same trick as CI).
RUN pnpm --filter @gameexplorer/shared build \
 && DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm --filter @gameexplorer/api exec prisma generate \
 && pnpm --filter @gameexplorer/api build

# ── Runtime ───────────────────────────────────────────────────────────────────
# Copies the built workspace as-is (incl. dev deps) — reliable with pnpm's
# symlinked node_modules. Optimise with `pnpm deploy --prod` later if image
# size matters; correctness first.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
