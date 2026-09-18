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

# Prisma CLI + client
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Production: sync schema with db push, then start the app.
# WHY NOT migrate deploy: legacy migrations 20260101000001..05 are ALTER TABLE on
# tables that don't exist yet, and they sort BEFORE 20260616000000_init which has
# CREATE TABLE IF NOT EXISTS. migrate deploy fails when the chain breaks.
# db push directly syncs Prisma schema to the database — reliable for first deploy.
# --accept-data-loss: allows destructive changes (safe on fresh DB).
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --accept-data-loss 2>&1; node server.js"]
