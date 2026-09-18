#!/bin/bash
# ───────────────────────────────────────────────────────
# Setup: Migrate from `db push` to `prisma migrate deploy`
# ───────────────────────────────────────────────────────
# Run this ONCE on your production server to baseline the
# existing database schema as the initial migration.
#
# After running this script, all future deploys will use
# `prisma migrate deploy` (safe, no data loss).
# ───────────────────────────────────────────────────────

set -e

echo "🔍 Checking DATABASE_URL..."
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set. Export it first:"
  echo "   export DATABASE_URL='postgresql://user:***@host:5432/db'"
  exit 1
fi

echo "📦 Generating Prisma client..."
npx prisma generate

echo ""
echo "🔧 Marking existing migrations as applied..."
echo "   (This tells Prisma the DB already has these changes)"
echo ""

# Mark the baseline migration as applied
npx prisma migrate resolve --applied 20260616000000_init 2>/dev/null && \
  echo "   ✅ 20260616000000_init — marked as applied" || \
  echo "   ⚠️  20260616000000_init — already applied or not found"

# Mark incremental migrations as applied
for m in \
  20260101000001_add_payout_platform_fields \
  20260101000002_add_trx_date \
  20260101000003_add_ads_wallet_fields \
  20260101000004_add_app_settings \
  20260101000005_add_sku_mappings; do
  npx prisma migrate resolve --applied "$m" 2>/dev/null && \
    echo "   ✅ $m — marked as applied" || \
    echo "   ⚠️  $m — already applied or not found"
done

echo ""
echo "🎉 Done! From now on, use 'prisma migrate deploy' for production."
echo "   To create new migrations: 'prisma migrate dev --name your_migration_name'"
echo ""
echo "Verify with: npx prisma migrate status"
