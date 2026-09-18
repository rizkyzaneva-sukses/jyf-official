# ── Stage 1: deps ─────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 2: builder ───────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG DATABASE_URL
ARG SESSION_SECRET
ARG NEXT_PUBLIC_APP_NAME
ENV DATABASE_URL=${DATABASE_URL}
ENV SESSION_SECRET=${SESSION_SECRET}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}

RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: runner ────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl tzdata
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Jakarta
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# FIX: tambah --chown di semua folder prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Production: bootstrap migrations for a FRESH database, then start the app.
# WHY: migrations 20260101000001..20260101000005 were authored for an ALREADY-EXISTING
# database (raw ALTER TABLE on pre-created tables). They sort BEFORE 20260616000000_init,
# which holds the full baseline schema. On an empty DB they run first and fail
# ("relation payouts does not exist"), aborting the chain so the container exits.
# FIX: mark those legacy January migrations as already-applied (their schema is folded
# into _init), then run `migrate deploy` so _init + every later migration apply for real.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate resolve --applied 20260101000001_add_payout_platform_fields || true; node node_modules/prisma/build/index.js migrate resolve --applied 20260101000002_add_trx_date || true; node node_modules/prisma/build/index.js migrate resolve --applied 20260101000003_add_ads_wallet_fields || true; node node_modules/prisma/build/index.js migrate resolve --applied 20260101000004_add_app_settings || true; node node_modules/prisma/build/index.js migrate resolve --applied 20260101000005_add_sku_mappings || true; node node_modules/prisma/build/index.js migrate deploy && node server.js"]
